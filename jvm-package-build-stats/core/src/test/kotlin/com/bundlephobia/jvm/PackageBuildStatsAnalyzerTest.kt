package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.DependencyEdge
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.JvmResolutionResult
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.ResolvedComponent
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TimingStats
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission
import java.security.MessageDigest
import java.util.HexFormat
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PackageBuildStatsAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `aggregates the unique runtime closure and deterministic shortest paths`() {
        val root = MavenCoordinate.parse("example:root:1.0")
        val middle = MavenCoordinate.parse("example:middle:1.0")
        val leaf = MavenCoordinate.parse("example:leaf:1.0")
        val baseResolution =
            resolution(
                requested = root,
                coordinates = listOf(root, middle, leaf),
                edges =
                    listOf(
                        DependencyEdge(root, middle.notation, middle),
                        DependencyEdge(middle, leaf.notation, leaf),
                    ),
            )
        val resolution =
            baseResolution.copy(
                resolution =
                    baseResolution.resolution.copy(
                        components =
                            baseResolution.resolution.components.map { component ->
                                if (component.coordinate == middle) {
                                    component.copy(selectionReasons = listOf("conflict_resolution:selected by rule"))
                                } else {
                                    component
                                }
                            },
                    ),
            )
        val analyzer = analyzer(resolution)

        val result = analyzer.analyze(AnalyzeRequest(root))

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(3, result.runtimeClosure.artifacts)
        assertEquals(3, result.runtimeClosure.components)
        assertEquals(2, result.runtimeClosure.dependencyDepth)
        assertEquals(
            listOf(root, middle, leaf),
            result.runtimeClosure.shortestPaths
                .last()
                .path,
        )
        assertEquals(
            result.runtimeClosure.archiveBytes,
            result.runtimeClosure.directArtifactBytes + result.runtimeClosure.transitiveArtifactBytes,
        )
        assertEquals(result.runtimeClosure.archiveBytes, result.sizes.runtimeArchiveBytes)
        assertEquals(result.runtimeClosure.expandedBytes, result.sizes.runtimeExpandedBytes)
        assertEquals(3, result.dependencySizes.size)
        assertEquals(root, result.dependencySizes.single { it.requested }.coordinate)
        assertEquals(1, result.dependencySizes.single { it.coordinate == middle }.depth)
        assertTrue(result.dependencySizes.single { it.coordinate == middle }.direct)
        assertEquals(2, result.dependencySizes.single { it.coordinate == leaf }.depth)
        assertEquals(2, result.runtimeClosure.largestTransitiveArtifacts.size)
        assertEquals(
            1,
            result.resolution.components
                .single { it.coordinate == root }
                .artifacts.size,
        )
        assertTrue(result.diagnostics.any { diagnostic -> diagnostic.code == "DEPENDENCY_CONFLICT_SELECTED" })
    }

    @Test
    fun `repeated analysis uses immutable caches and returns identical normalized evidence`() {
        val coordinate = MavenCoordinate.parse("example:cached:1.0")
        val resolution = resolution(coordinate, listOf(coordinate))
        val analyzer = analyzer(resolution)

        val first = analyzer.analyze(AnalyzeRequest(coordinate))
        resolution.resolution.artifacts.forEach { Files.delete(Path.of(it.path)) }
        val second = analyzer.analyze(AnalyzeRequest(coordinate))

        assertEquals(ResultStatus.COMPLETE, second.status)
        assertEquals(first.copy(timings = TimingStats()), second.copy(timings = TimingStats()))
        assertTrue(Files.walk(tempDir.resolve("cache/analysis")).use { paths -> paths.anyMatch(Files::isRegularFile) })
    }

    @Test
    fun `resolution failures preserve completed static evidence`() {
        val coordinate = MavenCoordinate.parse("example:partial:1.0")
        val complete = resolution(coordinate, listOf(coordinate))
        val failed =
            complete.copy(
                status = ResultStatus.FAILED,
                diagnostics =
                    listOf(
                        Diagnostic(
                            code = "UNRESOLVED_DEPENDENCY",
                            summary = "A transitive dependency was unavailable",
                            stage = com.bundlephobia.jvm.model.AnalysisStage.RESOLUTION,
                        ),
                    ),
            )

        val result = analyzer(failed).analyze(AnalyzeRequest(coordinate))

        assertEquals(ResultStatus.PARTIAL, result.status)
        assertEquals(1, result.artifacts.size)
        assertEquals(ResultStatus.COMPLETE, result.directArtifact?.status)
        assertEquals("UNRESOLVED_DEPENDENCY", result.diagnostics.single().code)
    }

    @Test
    fun `oversized dependency graphs are bounded and preserve direct evidence`() {
        val coordinates = (0..10_000).map { index -> MavenCoordinate.parse("example:node$index:1.0") }
        val directPath = jar("root.jar", 1)
        val resolution =
            JvmResolutionResult(
                status = ResultStatus.COMPLETE,
                resolution =
                    ResolutionStats(
                        requested = coordinates.first(),
                        components =
                            coordinates.mapIndexed { index, coordinate ->
                                ResolvedComponent(coordinate, requested = index == 0)
                            },
                        edges =
                            coordinates.zipWithNext { from, selected ->
                                DependencyEdge(from, selected.notation, selected)
                            },
                        artifacts =
                            listOf(
                                ResolvedArtifact(
                                    coordinate = coordinates.first(),
                                    fileName = directPath.fileName.toString(),
                                    path = directPath.toString(),
                                    extension = "jar",
                                    variant = "runtime",
                                    digest = ArtifactDigest(value = sha256(directPath)),
                                ),
                            ),
                    ),
            )

        val result = analyzer(resolution).analyze(AnalyzeRequest(coordinates.first()))

        assertEquals(ResultStatus.PARTIAL, result.status)
        assertEquals(ResultStatus.COMPLETE, result.directArtifact?.status)
        assertTrue(result.runtimeClosure.shortestPaths.isEmpty())
        assertTrue(result.diagnostics.any { diagnostic -> diagnostic.code == "DEPENDENCY_GRAPH_LIMIT_EXCEEDED" })
    }

    @Test
    fun `resolver timeouts are retryable structured failures`() {
        val executable = tempDir.resolve("slow-gradle")
        Files.writeString(executable, "#!/bin/sh\nsleep 2\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val coordinate = MavenCoordinate.parse("example:timeout:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    cacheDirectory = tempDir.resolve("cache"),
                    gradleExecutable = executable,
                    resolutionTimeoutMilliseconds = 25,
                ),
            ).resolve(coordinate, 21, AnalysisCancellation.NONE)

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("RESOLUTION_TIMEOUT", result.diagnostics.single().code)
        assertEquals(com.bundlephobia.jvm.model.RetryClassification.RETRYABLE, result.diagnostics.single().retry)
    }

    @Test
    fun `cancellation stops a running resolver process`() {
        val executable = tempDir.resolve("cancelled-gradle")
        Files.writeString(executable, "#!/bin/sh\nsleep 2\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val started = System.nanoTime()
        val coordinate = MavenCoordinate.parse("example:cancelled:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    cacheDirectory = tempDir.resolve("cache"),
                    gradleExecutable = executable,
                ),
            ).resolve(coordinate, 21, AnalysisCancellation { System.nanoTime() - started > 50_000_000 })

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("RESOLUTION_CANCELLED", result.diagnostics.single().code)
    }

    @Test
    fun `resolver failures retain bounded stderr and clean their configured temporary directory`() {
        val executable = tempDir.resolve("failing-gradle")
        Files.writeString(executable, "#!/bin/sh\necho 'fixture resolution detail' >&2\nexit 7\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val temporaryDirectory = tempDir.resolve("resolver-temporary")
        val coordinate = MavenCoordinate.parse("example:failed:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    cacheDirectory = tempDir.resolve("cache"),
                    gradleExecutable = executable,
                    temporaryDirectory = temporaryDirectory,
                    diagnosticOutputLimitBytes = 128,
                ),
            ).resolve(coordinate, 21, AnalysisCancellation.NONE)

        assertEquals(ResultStatus.FAILED, result.status)
        assertTrue(
            result.diagnostics
                .single()
                .summary
                .contains("fixture resolution detail"),
        )
        assertTrue(Files.list(temporaryDirectory).use { paths -> paths.findAny().isEmpty })
    }

    @Test
    fun `returns a structured input failure for a missing local jar`() {
        val result = PackageBuildStatsAnalyzer().inspect(Path.of("example.jar"))

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("example.jar", result.displayName)
        assertEquals("ARCHIVE_NOT_REGULAR_FILE", result.diagnostics.single().code)
    }

    @Test
    fun `combines archive and classfile analysis for local jars`() {
        val resourceName = PackageBuildStatsAnalyzerTest::class.java.name.replace('.', '/') + ".class"
        val classBytes = requireNotNull(javaClass.classLoader.getResourceAsStream(resourceName)).use { it.readAllBytes() }
        val jar = tempDir.resolve("fixture.jar")
        ZipOutputStream(Files.newOutputStream(jar)).use { output ->
            output.putNextEntry(ZipEntry(resourceName))
            output.write(classBytes)
            output.closeEntry()
        }

        val result = PackageBuildStatsAnalyzer().inspect(jar)

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(1, result.classfiles?.analyzedClasses)
        assertEquals("com.bundlephobia.jvm", result.namespaces.single().name)
        assertEquals(classBytes.size.toLong(), result.namespaces.single().classBytes)
    }

    private fun analyzer(resolution: JvmResolutionResult): PackageBuildStatsAnalyzer =
        PackageBuildStatsAnalyzer(
            config = PackageBuildStatsConfig(cacheDirectory = tempDir.resolve("cache")),
            resolverClient = ResolverClient { _, _, _ -> resolution },
        )

    private fun resolution(
        requested: MavenCoordinate,
        coordinates: List<MavenCoordinate>,
        edges: List<DependencyEdge> = emptyList(),
    ): JvmResolutionResult {
        val artifacts =
            coordinates.mapIndexed { index, coordinate ->
                val path = jar("${coordinate.artifactId}.jar", index + 1)
                ResolvedArtifact(
                    coordinate = coordinate,
                    fileName = path.fileName.toString(),
                    path = path.toString(),
                    extension = "jar",
                    variant = "runtime",
                    digest = ArtifactDigest(value = sha256(path)),
                )
            }
        return JvmResolutionResult(
            status = ResultStatus.COMPLETE,
            resolution =
                ResolutionStats(
                    requested = requested,
                    components = coordinates.map { coordinate -> ResolvedComponent(coordinate, requested = coordinate == requested) },
                    edges = edges,
                    artifacts = artifacts,
                    repositories = listOf("maven-central", "google-maven"),
                ),
        )
    }

    private fun jar(
        name: String,
        size: Int,
    ): Path {
        val jar = tempDir.resolve(name)
        ZipOutputStream(Files.newOutputStream(jar)).use { output ->
            output.putNextEntry(ZipEntry("example/resource-$size.txt"))
            output.write(ByteArray(size) { size.toByte() })
            output.closeEntry()
        }
        return jar
    }

    private fun sha256(path: Path): String = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)))
}
