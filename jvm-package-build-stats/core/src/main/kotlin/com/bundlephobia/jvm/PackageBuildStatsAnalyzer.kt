package com.bundlephobia.jvm

import com.bundlephobia.jvm.archive.JarArchiveAnalyzer
import com.bundlephobia.jvm.classfile.JarClassfileAnalyzer
import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.DependencyPath
import com.bundlephobia.jvm.model.DependencySizeStats
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.DiagnosticSeverity
import com.bundlephobia.jvm.model.JvmResolutionResult
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.PackageBuildStatsResult
import com.bundlephobia.jvm.model.PackageSizeStats
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolutionSummary
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.ResolvedArtifactSummary
import com.bundlephobia.jvm.model.ResolvedComponent
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.RetryClassification
import com.bundlephobia.jvm.model.RuntimeArtifactSummary
import com.bundlephobia.jvm.model.RuntimeClosureStats
import com.bundlephobia.jvm.model.TimingStats
import com.bundlephobia.jvm.model.ToolchainManifest
import java.nio.file.Path
import java.util.ArrayDeque
import kotlin.time.measureTimedValue

/** Stable entry point for local JAR inspection and exact Maven coordinate analysis. */
public class PackageBuildStatsAnalyzer
    @JvmOverloads
    constructor(
        public val config: PackageBuildStatsConfig = PackageBuildStatsConfig(),
    ) {
        private val archiveAnalyzer = JarArchiveAnalyzer()
        private var resolverClient: ResolverClient = GradleResolverClient(config)

        internal constructor(
            config: PackageBuildStatsConfig,
            resolverClient: ResolverClient,
        ) : this(config) {
            this.resolverClient = resolverClient
        }

        /** Resolves and statically analyzes one exact JVM runtime dependency closure. */
        public fun analyze(request: AnalyzeRequest): PackageBuildStatsResult = analyze(request, AnalysisCancellation.NONE)

        /** Resolves and analyzes a package while cooperatively observing [cancellation]. */
        public fun analyze(
            request: AnalyzeRequest,
            cancellation: AnalysisCancellation,
        ): PackageBuildStatsResult {
            val totalStart = System.nanoTime()
            val stageTimings = linkedMapOf<String, Long>()
            val diagnostics = mutableListOf<Diagnostic>()

            val resolutionTimed = measureTimedValue { resolverClient.resolve(request.coordinate, request.javaVersion, cancellation) }
            stageTimings["resolution"] = resolutionTimed.duration.inWholeMilliseconds
            val resolverResult = resolutionTimed.value
            diagnostics += resolverResult.diagnostics

            val evidence = mutableListOf<ArtifactEvidence>()
            val analysisTimed =
                measureTimedValue {
                    resolverResult.resolution.artifacts
                        .asSequence()
                        .filter { artifact -> artifact.extension == "jar" }
                        .distinctBy { artifact -> artifact.digest.value }
                        .sortedBy { artifact -> artifact.digest.value }
                        .forEach { artifact ->
                            if (cancellation.isCancelled()) {
                                diagnostics += cancellationDiagnostic()
                                return@measureTimedValue
                            }
                            analyzeArtifact(artifact, request.javaVersion, diagnostics)?.let(evidence::add)
                        }
                }
            stageTimings["artifact-analysis"] = analysisTimed.duration.inWholeMilliseconds

            val assemblyTimed =
                measureTimedValue {
                    assemble(
                        request = request,
                        resolverResult = resolverResult,
                        evidence = evidence,
                        diagnostics = diagnostics,
                    )
                }
            stageTimings["assembly"] = assemblyTimed.duration.inWholeMilliseconds
            return assemblyTimed.value.copy(
                timings =
                    TimingStats(
                        totalMilliseconds = elapsedMilliseconds(totalStart),
                        stagesMilliseconds = stageTimings,
                    ),
            )
        }

        private fun cancellationDiagnostic(): Diagnostic =
            Diagnostic(
                code = "ANALYSIS_CANCELLED",
                summary = "Analysis was cancelled before all selected artifacts were inspected",
                stage = AnalysisStage.ARCHIVE_ANALYSIS,
                retry = RetryClassification.RETRYABLE,
            )

        /** Inspects a local JAR without resolving dependencies or loading any classes. */
        public fun inspect(path: Path): ArtifactAnalysis = inspect(path, DEFAULT_JAVA_VERSION)

        /** Inspects a local JAR using the effective multi-release view for [javaVersion]. */
        public fun inspect(
            path: Path,
            javaVersion: Int,
        ): ArtifactAnalysis {
            require(javaVersion >= 8) { "javaVersion must be at least 8" }
            val archive = archiveAnalyzer.analyze(path)
            if (archive.status != ResultStatus.COMPLETE) return archive

            val classfiles = JarClassfileAnalyzer(javaVersion).analyze(path)
            return archive.copy(
                status = if (classfiles.diagnostics.isEmpty()) ResultStatus.COMPLETE else ResultStatus.PARTIAL,
                namespaces = classfiles.namespaces,
                classfiles = classfiles.stats,
                module = classfiles.module,
                apiSurface = classfiles.apiSurface,
                diagnostics = classfiles.diagnostics,
            )
        }

        private fun analyzeArtifact(
            artifact: ResolvedArtifact,
            javaVersion: Int,
            diagnostics: MutableList<Diagnostic>,
        ): ArtifactEvidence? =
            try {
                val analysis = inspect(Path.of(artifact.path), javaVersion).copy(displayName = artifact.fileName)
                check(analysis.digest == null || analysis.digest == artifact.digest) {
                    "Artifact digest changed after resolution"
                }
                diagnostics += analysis.diagnostics
                ArtifactEvidence(artifact, analysis)
            } catch (_: Exception) {
                diagnostics +=
                    Diagnostic(
                        code = "ARTIFACT_ANALYSIS_FAILED",
                        summary = "Could not analyze ${artifact.coordinate.notation} (${artifact.fileName})",
                        stage = AnalysisStage.ARCHIVE_ANALYSIS,
                        retry = RetryClassification.UNKNOWN,
                    )
                null
            }

        private fun assemble(
            request: AnalyzeRequest,
            resolverResult: JvmResolutionResult,
            evidence: List<ArtifactEvidence>,
            diagnostics: MutableList<Diagnostic>,
        ): PackageBuildStatsResult {
            diagnostics += conflictDiagnostics(resolverResult.resolution)
            diagnostics += graphLimitDiagnostics(resolverResult.resolution)
            val uniqueAnalyses = evidence.map { it.analysis }.sortedBy { it.digest?.value ?: "" }
            val contributionCoordinates = contributionCoordinates(request.coordinate, resolverResult.resolution, evidence)
            val directArtifact =
                evidence
                    .filter { item -> item.artifact.coordinate in contributionCoordinates }
                    .minByOrNull { item -> item.artifact.fileName }
                    ?.analysis
            if (contributionCoordinates.isEmpty()) {
                diagnostics +=
                    Diagnostic(
                        code = "REQUESTED_ARTIFACT_NOT_ANALYZED",
                        summary = "No analyzable JVM JAR was selected for ${request.coordinate.notation}",
                        stage = AnalysisStage.ASSEMBLY,
                        severity = DiagnosticSeverity.ERROR,
                    )
            } else if (request.coordinate !in contributionCoordinates) {
                diagnostics +=
                    Diagnostic(
                        code = "REQUESTED_VARIANT_REDIRECTED",
                        summary =
                            "${request.coordinate.notation} contributes through " +
                                contributionCoordinates.sortedBy(MavenCoordinate::notation).joinToString { it.notation },
                        stage = AnalysisStage.ASSEMBLY,
                        severity = DiagnosticSeverity.INFO,
                    )
            }
            val status = finalStatus(resolverResult, uniqueAnalyses, directArtifact, diagnostics)
            val closure = closureStats(request.coordinate, contributionCoordinates, resolverResult.resolution, evidence)
            val allDependencySizes = dependencySizes(request.coordinate, contributionCoordinates, resolverResult.resolution, evidence)
            val dependencySizes =
                allDependencySizes
                    .sortedWith(
                        compareByDescending<DependencySizeStats> { it.requested }
                            .thenByDescending(DependencySizeStats::archiveBytes)
                            .thenBy { it.coordinate.notation },
                    ).take(DEPENDENCY_SIZE_LIMIT)
            val compactArtifacts =
                evidence
                    .sortedWith(
                        compareByDescending<ArtifactEvidence> { it.artifact.coordinate in contributionCoordinates }
                            .thenByDescending { it.analysis.archiveBytes ?: 0 }
                            .thenBy { it.artifact.coordinate.notation }
                            .thenBy { it.artifact.fileName },
                    ).take(ARTIFACT_ANALYSIS_LIMIT)
                    .map(ArtifactEvidence::analysis)
            val distinctDiagnostics =
                diagnostics.distinctBy { it.code to it.summary }.sortedWith(compareBy(Diagnostic::code, Diagnostic::summary))
            val compactDiagnostics = distinctDiagnostics.take(DIAGNOSTIC_LIMIT)

            return PackageBuildStatsResult(
                status = status,
                coordinate = request.coordinate,
                target = request.target,
                javaVersion = request.javaVersion,
                toolchain = currentToolchain(),
                resolution = resolutionSummary(resolverResult.resolution),
                sizes =
                    PackageSizeStats(
                        runtimeArchiveBytes = closure.archiveBytes,
                        runtimeExpandedBytes = closure.expandedBytes,
                        directArtifactArchiveBytes = closure.directArtifactBytes,
                        transitiveArtifactArchiveBytes = closure.transitiveArtifactBytes,
                    ),
                dependencySizes = dependencySizes,
                dependencyCount = allDependencySizes.size,
                dependencySizesTruncated = allDependencySizes.size > dependencySizes.size,
                artifacts = compactArtifacts,
                artifactCount = uniqueAnalyses.size,
                artifactsTruncated = uniqueAnalyses.size > compactArtifacts.size,
                directArtifact = directArtifact,
                runtimeClosure = closure,
                diagnostics = compactDiagnostics,
                diagnosticCount = distinctDiagnostics.size,
                diagnosticsTruncated = distinctDiagnostics.size > compactDiagnostics.size,
            )
        }

        private fun finalStatus(
            resolverResult: JvmResolutionResult,
            analyses: List<ArtifactAnalysis>,
            directArtifact: ArtifactAnalysis?,
            diagnostics: List<Diagnostic>,
        ): ResultStatus {
            if (analyses.isEmpty() || directArtifact == null) return ResultStatus.FAILED
            val allStaticComplete = analyses.all { analysis -> analysis.status == ResultStatus.COMPLETE }
            val noBlockingDiagnostics = diagnostics.none { diagnostic -> diagnostic.severity == DiagnosticSeverity.ERROR }
            return if (resolverResult.status == ResultStatus.COMPLETE && allStaticComplete && noBlockingDiagnostics) {
                ResultStatus.COMPLETE
            } else {
                ResultStatus.PARTIAL
            }
        }

        private fun closureStats(
            requested: MavenCoordinate,
            contributionCoordinates: Set<MavenCoordinate>,
            resolution: ResolutionStats,
            evidence: List<ArtifactEvidence>,
        ): RuntimeClosureStats {
            val directBytes =
                evidence.filter { item -> item.artifact.coordinate in contributionCoordinates }.sumOf { item ->
                    item.analysis.archiveBytes
                        ?: 0
                }
            val transitiveBytes =
                evidence.filter { item -> item.artifact.coordinate !in contributionCoordinates }.sumOf { item ->
                    item.analysis.archiveBytes
                        ?: 0
                }
            val allPaths =
                if (withinGraphLimits(resolution)) {
                    shortestPaths(requested, resolution)
                } else {
                    emptyList()
                }
            val paths = allPaths.take(SHORTEST_PATH_LIMIT)
            val largest =
                evidence
                    .filter { item -> item.artifact.coordinate !in contributionCoordinates }
                    .map { item ->
                        RuntimeArtifactSummary(
                            coordinate = item.artifact.coordinate,
                            fileName = item.artifact.fileName,
                            digest = item.artifact.digest,
                            archiveBytes = item.analysis.archiveBytes ?: 0,
                            expandedBytes = item.analysis.expandedBytes ?: 0,
                        )
                    }.sortedWith(compareByDescending(RuntimeArtifactSummary::archiveBytes).thenBy { it.coordinate.notation })
                    .take(LARGEST_ARTIFACT_LIMIT)

            return RuntimeClosureStats(
                archiveBytes = directBytes + transitiveBytes,
                expandedBytes = evidence.sumOf { item -> item.analysis.expandedBytes ?: 0 },
                directArtifactBytes = directBytes,
                transitiveArtifactBytes = transitiveBytes,
                components =
                    resolution.components
                        .map { it.coordinate }
                        .distinct()
                        .size,
                artifacts = evidence.size,
                dependencyDepth = allPaths.maxOfOrNull(DependencyPath::depth) ?: 0,
                shortestPaths = paths,
                shortestPathCount = allPaths.size,
                shortestPathsTruncated = allPaths.size > paths.size,
                largestTransitiveArtifacts = largest,
            )
        }

        private fun dependencySizes(
            requested: MavenCoordinate,
            contributionCoordinates: Set<MavenCoordinate>,
            resolution: ResolutionStats,
            evidence: List<ArtifactEvidence>,
        ): List<DependencySizeStats> {
            val paths = shortestPaths(requested, resolution).associateBy(DependencyPath::coordinate)
            return evidence
                .groupBy { item -> item.artifact.coordinate }
                .map { (coordinate, items) ->
                    val dependencyPath = paths[coordinate]
                    val depth = dependencyPath?.depth ?: if (coordinate == requested) 0 else -1
                    DependencySizeStats(
                        coordinate = coordinate,
                        archiveBytes = items.sumOf { item -> item.analysis.archiveBytes ?: 0 },
                        expandedBytes = items.sumOf { item -> item.analysis.expandedBytes ?: 0 },
                        artifactCount = items.size,
                        depth = depth,
                        requested = coordinate in contributionCoordinates,
                        direct = depth == 1 && coordinate !in contributionCoordinates,
                        path = dependencyPath?.path.orEmpty(),
                    )
                }.sortedWith(compareBy(DependencySizeStats::depth, { it.coordinate.notation }))
        }

        private fun contributionCoordinates(
            requested: MavenCoordinate,
            resolution: ResolutionStats,
            evidence: List<ArtifactEvidence>,
        ): Set<MavenCoordinate> {
            if (evidence.any { item -> item.artifact.coordinate == requested }) return setOf(requested)
            val depths = shortestPaths(requested, resolution).associate { path -> path.coordinate to path.depth }
            val nearestDepth =
                evidence
                    .mapNotNull { item -> depths[item.artifact.coordinate] }
                    .filter { depth -> depth > 0 }
                    .minOrNull() ?: return emptySet()
            return evidence
                .map { item -> item.artifact.coordinate }
                .filterTo(linkedSetOf()) { coordinate -> depths[coordinate] == nearestDepth }
        }

        private fun resolutionSummary(resolution: ResolutionStats): ResolutionSummary {
            val components =
                resolution.components
                    .sortedWith(
                        compareByDescending<ResolvedComponent> { it.requested }
                            .thenBy { it.coordinate.notation },
                    ).take(RESOLUTION_COMPONENT_LIMIT)
            val edges = resolution.edges.take(RESOLUTION_EDGE_LIMIT)
            val artifacts =
                resolution.artifacts
                    .sortedWith(compareBy<ResolvedArtifact>({ it.coordinate.notation }, ResolvedArtifact::fileName))
                    .take(RESOLUTION_ARTIFACT_LIMIT)
                    .map { artifact ->
                        ResolvedArtifactSummary(
                            coordinate = artifact.coordinate,
                            fileName = artifact.fileName,
                            extension = artifact.extension,
                            variant = artifact.variant,
                            attributes = artifact.attributes,
                            digest = artifact.digest,
                        )
                    }
            return ResolutionSummary(
                requested = resolution.requested,
                components = components,
                componentCount = resolution.components.size,
                edges = edges,
                edgeCount = resolution.edges.size,
                artifacts = artifacts,
                artifactCount = resolution.artifacts.size,
                repositories = resolution.repositories,
                truncated =
                    components.size < resolution.components.size ||
                        edges.size < resolution.edges.size ||
                        artifacts.size < resolution.artifacts.size,
            )
        }

        private fun shortestPaths(
            requested: MavenCoordinate,
            resolution: ResolutionStats,
        ): List<DependencyPath> {
            if (resolution.components.none { component -> component.coordinate == requested }) return emptyList()
            val adjacency =
                resolution.edges
                    .filter { edge -> edge.selected != null }
                    .groupBy({ edge -> edge.from }, { edge -> requireNotNull(edge.selected) })
                    .mapValues { (_, coordinates) -> coordinates.distinct().sortedBy(MavenCoordinate::notation) }
            val paths = linkedMapOf(requested to listOf(requested))
            val queue = ArrayDeque<MavenCoordinate>().apply { add(requested) }
            while (queue.isNotEmpty()) {
                val from = queue.removeFirst()
                adjacency[from].orEmpty().forEach { selected ->
                    if (selected !in paths) {
                        paths[selected] = requireNotNull(paths[from]) + selected
                        queue.add(selected)
                    }
                }
            }
            return paths
                .map { (coordinate, path) -> DependencyPath(coordinate, path.size - 1, path) }
                .sortedWith(compareBy(DependencyPath::depth, { it.coordinate.notation }))
        }

        private fun conflictDiagnostics(resolution: ResolutionStats): List<Diagnostic> =
            resolution.components
                .filter { component -> component.selectionReasons.any { reason -> reason.startsWith("conflict_resolution:") } }
                .map { component ->
                    Diagnostic(
                        code = "DEPENDENCY_CONFLICT_SELECTED",
                        summary = "Gradle selected ${component.coordinate.notation} after dependency conflict resolution",
                        stage = AnalysisStage.RESOLUTION,
                        severity = DiagnosticSeverity.INFO,
                    )
                }

        private fun graphLimitDiagnostics(resolution: ResolutionStats): List<Diagnostic> =
            if (withinGraphLimits(resolution)) {
                emptyList()
            } else {
                listOf(
                    Diagnostic(
                        code = "DEPENDENCY_GRAPH_LIMIT_EXCEEDED",
                        summary =
                            "Selected graph has ${resolution.components.size} components and ${resolution.edges.size} edges; " +
                                "limits are $MAX_GRAPH_COMPONENTS components and $MAX_GRAPH_EDGES edges",
                        stage = AnalysisStage.ASSEMBLY,
                    ),
                )
            }

        private fun withinGraphLimits(resolution: ResolutionStats): Boolean =
            resolution.components.size <= MAX_GRAPH_COMPONENTS && resolution.edges.size <= MAX_GRAPH_EDGES

        private fun currentToolchain(): ToolchainManifest =
            ToolchainManifest(
                generation = "jvm-2026-08-g1",
                analyzerVersion = "${implementationVersion()}+$STATIC_ANALYZER_VERSION",
                jdkVersion = System.getProperty("java.version"),
                jdkVendor = System.getProperty("java.vendor"),
                kotlinVersion = "2.4.10",
                gradleVersion = "9.5.1",
            )

        private fun elapsedMilliseconds(start: Long): Long = (System.nanoTime() - start) / NANOS_PER_MILLISECOND

        private fun implementationVersion(): String =
            PackageBuildStatsAnalyzer::class.java.`package`.implementationVersion ?: "0.1.0-SNAPSHOT"

        private data class ArtifactEvidence(
            val artifact: ResolvedArtifact,
            val analysis: ArtifactAnalysis,
        )

        private companion object {
            private const val STATIC_ANALYZER_VERSION = "static-v1"
            private const val LARGEST_ARTIFACT_LIMIT = 10
            private const val ARTIFACT_ANALYSIS_LIMIT = 25
            private const val DEPENDENCY_SIZE_LIMIT = 50
            private const val SHORTEST_PATH_LIMIT = 50
            private const val RESOLUTION_COMPONENT_LIMIT = 100
            private const val RESOLUTION_EDGE_LIMIT = 200
            private const val RESOLUTION_ARTIFACT_LIMIT = 100
            private const val DIAGNOSTIC_LIMIT = 100
            private const val NANOS_PER_MILLISECOND = 1_000_000
            private const val MAX_GRAPH_COMPONENTS = 10_000
            private const val MAX_GRAPH_EDGES = 50_000
            private const val DEFAULT_JAVA_VERSION = 21
        }
    }
