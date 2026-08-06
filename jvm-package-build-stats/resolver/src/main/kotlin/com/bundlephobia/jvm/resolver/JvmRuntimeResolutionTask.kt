package com.bundlephobia.jvm.resolver

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.DependencyEdge
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.JvmResolutionResult
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.ResolvedComponent
import com.bundlephobia.jvm.model.ResolvedVariant
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.RetryClassification
import com.bundlephobia.jvm.model.TargetProfile
import org.gradle.api.DefaultTask
import org.gradle.api.Named
import org.gradle.api.artifacts.Configuration
import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.artifacts.result.DependencyResult
import org.gradle.api.artifacts.result.ResolvedArtifactResult
import org.gradle.api.artifacts.result.ResolvedComponentResult
import org.gradle.api.artifacts.result.ResolvedDependencyResult
import org.gradle.api.artifacts.result.ResolvedVariantResult
import org.gradle.api.artifacts.result.UnresolvedDependencyResult
import org.gradle.api.attributes.Attribute
import org.gradle.api.attributes.AttributeContainer
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.TaskAction
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.HexFormat
import java.util.Locale
import java.util.TreeMap

/** Resolves one exact coordinate with Gradle's variant-aware JVM runtime engine. */
public abstract class JvmRuntimeResolutionTask : DefaultTask() {
    /** Exact `groupId:artifactId:version` coordinate to resolve. */
    @get:Input
    @get:Optional
    public abstract val coordinate: Property<String>

    /** Consumer Java feature version used for Gradle variant selection. */
    @get:Input
    public abstract val javaVersion: Property<Int>

    /** Consumer ecosystem used for Gradle variant and artifact selection. */
    @get:Input
    public abstract val target: Property<String>

    /** Project repositories observed after the settings plugin sealed repository resolution. */
    @get:Input
    public abstract val forbiddenRepositories: ListProperty<String>

    /** Normalized JSON evidence consumed by the library in the next milestone. */
    @get:OutputFile
    public abstract val outputFile: RegularFileProperty

    /** Gradle configuration prepared by the settings plugin before task execution. */
    @get:Internal
    public lateinit var resolutionConfiguration: Configuration

    init {
        group = "verification"
        description = "Resolves one exact JVM runtime coordinate to normalized JSON"
        notCompatibleWithConfigurationCache(
            "Gradle's public ResolutionResult and ArtifactView graph objects are execution-time state",
        )
    }

    @TaskAction
    public fun resolve() {
        val requested = parseRequestedCoordinate() ?: return
        val forbidden = forbiddenRepositories.getOrElse(emptyList()).distinct().sorted()
        if (forbidden.isNotEmpty()) {
            write(
                failed(
                    requested,
                    "FORBIDDEN_REPOSITORY_DECLARATION",
                    "Project repositories are forbidden: ${forbidden.joinToString()}",
                ),
            )
            return
        }

        val result =
            try {
                resolveWithGradle(requested)
            } catch (_: Exception) {
                failed(
                    requested,
                    "GRADLE_RESOLUTION_FAILED",
                    "Gradle could not resolve ${requested.notation}",
                    retry = RetryClassification.UNKNOWN,
                )
            }
        write(result)
    }

    private fun parseRequestedCoordinate(): MavenCoordinate? {
        val value = coordinate.orNull
        val parsed =
            try {
                value?.let(MavenCoordinate::parse)
            } catch (error: IllegalArgumentException) {
                null
            }
        if (parsed == null) {
            val fallback = MavenCoordinate.parse("invalid:coordinate:0")
            write(failed(fallback, "INVALID_COORDINATE", "An exact Maven coordinate is required"))
        }
        return parsed
    }

    private fun resolveWithGradle(requested: MavenCoordinate): JvmResolutionResult {
        val targetProfile = TargetProfile.parse(target.get())
        val configuration = resolutionConfiguration
        val resolution = configuration.incoming.resolutionResult
        val artifactCollection = configuration.incoming.artifactView { it.lenient(true) }.artifacts
        val directIds =
            resolution.root.dependencies
                .filterIsInstance<ResolvedDependencyResult>()
                .mapTo(mutableSetOf()) { it.selected.id }

        val components =
            resolution.allComponents
                .mapNotNull { component -> component.toModel(component.id in directIds) }
                .sortedBy { it.coordinate.notation }
        val edges =
            resolution.allDependencies
                .mapNotNull { dependency -> dependency.toModel(requested) }
                .sortedWith(compareBy({ it.from.notation }, DependencyEdge::requested, { it.selected?.notation ?: "" }))
        val artifacts =
            artifactCollection.artifacts
                .mapNotNull { artifact -> artifact.toModel() }
                .sortedWith(compareBy({ it.coordinate.notation }, ResolvedArtifact::fileName, ResolvedArtifact::path))
        val diagnostics = mutableListOf<Diagnostic>()
        edges.filter { it.failure != null }.forEach { edge ->
            diagnostics +=
                diagnostic(
                    "UNRESOLVED_DEPENDENCY",
                    "Could not resolve ${edge.requested}",
                    retry = RetryClassification.UNKNOWN,
                )
        }
        if (artifactCollection.failures.isNotEmpty() && edges.none { it.failure != null }) {
            diagnostics +=
                diagnostic(
                    "UNRESOLVED_ARTIFACT",
                    "Gradle could not retrieve ${artifactCollection.failures.size} selected runtime artifact(s)",
                    retry = RetryClassification.UNKNOWN,
                )
        }
        artifacts.filterNot { targetProfile.supports(it.extension) }.forEach { artifact ->
            diagnostics +=
                diagnostic(
                    "UNSUPPORTED_RUNTIME_ARTIFACT",
                    "${artifact.coordinate.notation} selected unsupported .${artifact.extension} artifact ${artifact.fileName}",
                )
        }

        return JvmResolutionResult(
            status = if (diagnostics.isEmpty()) ResultStatus.COMPLETE else ResultStatus.FAILED,
            target = targetProfile,
            javaVersion = javaVersion.get(),
            resolution =
                ResolutionStats(
                    requested = requested,
                    components = components,
                    edges = edges,
                    artifacts = artifacts,
                    repositories = REPOSITORY_IDS,
                ),
            diagnostics = diagnostics.distinctBy { it.code to it.summary }.sortedWith(compareBy(Diagnostic::code, Diagnostic::summary)),
        )
    }

    private fun ResolvedComponentResult.toModel(requested: Boolean): ResolvedComponent? {
        val identifier = id as? ModuleComponentIdentifier ?: return null
        val coordinate = MavenCoordinate.parse("${identifier.group}:${identifier.module}:${identifier.version}")
        val normalizedVariants = variants.map { variant -> variant.toModel() }.sortedBy(ResolvedVariant::name)
        return ResolvedComponent(
            coordinate = coordinate,
            variant = normalizedVariants.singleOrNull()?.name,
            requested = requested,
            variants = normalizedVariants,
            selectionReasons =
                selectionReason.descriptions
                    .map { "${it.cause.name.lowercase(Locale.ROOT)}:${it.description}" }
                    .distinct()
                    .sorted(),
        )
    }

    private fun DependencyResult.toModel(requestedCoordinate: MavenCoordinate): DependencyEdge? {
        val fromCoordinate = (from.id as? ModuleComponentIdentifier)?.toCoordinate()
        return when (this) {
            is ResolvedDependencyResult -> {
                if (fromCoordinate == null) return null
                DependencyEdge(
                    from = fromCoordinate,
                    requested = requested.displayName,
                    selected = (selected.id as? ModuleComponentIdentifier)?.toCoordinate(),
                    variant = resolvedVariant.displayName,
                    attributes = attributes(resolvedVariant.attributes),
                )
            }

            is UnresolvedDependencyResult -> {
                DependencyEdge(
                    from = fromCoordinate ?: requestedCoordinate,
                    requested = attempted.displayName,
                    failure = "unresolved",
                )
            }

            else -> {
                null
            }
        }
    }

    private fun ModuleComponentIdentifier.toCoordinate(): MavenCoordinate = MavenCoordinate.parse("$group:$module:$version")

    private fun ResolvedVariantResult.toModel(): ResolvedVariant =
        ResolvedVariant(
            name = displayName,
            attributes = attributes(attributes),
            capabilities =
                capabilities
                    .map { capability ->
                        listOfNotNull(capability.group, capability.name, capability.version).joinToString(":")
                    }.distinct()
                    .sorted(),
        )

    private fun ResolvedArtifactResult.toModel(): ResolvedArtifact? {
        val id = id.componentIdentifier as? ModuleComponentIdentifier ?: return null
        val artifactCoordinate = MavenCoordinate.parse("${id.group}:${id.module}:${id.version}")
        val extension = file.extension.lowercase(Locale.ROOT)
        return ResolvedArtifact(
            coordinate = artifactCoordinate,
            fileName = file.name,
            path =
                file
                    .toPath()
                    .toAbsolutePath()
                    .normalize()
                    .toString(),
            extension = extension,
            variant = variant.displayName,
            attributes = attributes(variant.attributes),
            digest = ArtifactDigest(value = sha256(file.toPath())),
        )
    }

    private fun attributes(container: AttributeContainer): Map<String, String> {
        val result = TreeMap<String, String>()
        container.keySet().forEach { attribute -> result[attribute.name] = attributeValue(container, attribute) }
        return result
    }

    @Suppress("UNCHECKED_CAST")
    private fun attributeValue(
        container: AttributeContainer,
        attribute: Attribute<*>,
    ): String {
        val value = container.getAttribute(attribute as Attribute<Any>)
        return if (value is Named) value.name else value.toString()
    }

    private fun sha256(path: Path): String {
        val digest = MessageDigest.getInstance("SHA-256")
        Files.newInputStream(path).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return HexFormat.of().formatHex(digest.digest())
    }

    private fun failed(
        requested: MavenCoordinate,
        code: String,
        summary: String,
        retry: RetryClassification = RetryClassification.NEVER,
    ): JvmResolutionResult =
        JvmResolutionResult(
            status = ResultStatus.FAILED,
            target = target.orNull?.let(TargetProfile::parse) ?: TargetProfile.JVM_RUNTIME,
            javaVersion = javaVersion.getOrElse(21),
            resolution = ResolutionStats(requested = requested, repositories = REPOSITORY_IDS),
            diagnostics = listOf(diagnostic(code, summary, retry)),
        )

    private fun diagnostic(
        code: String,
        summary: String,
        retry: RetryClassification = RetryClassification.NEVER,
    ): Diagnostic =
        Diagnostic(
            code = code,
            summary = summary,
            stage = AnalysisStage.RESOLUTION,
            retry = retry,
        )

    private fun write(result: JvmResolutionResult) {
        val path = outputFile.get().asFile.toPath()
        Files.createDirectories(path.parent)
        Files.writeString(path, ResultJson.encode(result))
    }

    private companion object {
        const val JAR_EXTENSION: String = "jar"
        const val AAR_EXTENSION: String = "aar"

        fun TargetProfile.supports(extension: String): Boolean =
            extension == JAR_EXTENSION || (this == TargetProfile.ANDROID_RUNTIME && extension == AAR_EXTENSION)

        val REPOSITORY_IDS: List<String> =
            listOf(
                JvmRuntimeResolverPlugin.MAVEN_CENTRAL_ID,
                JvmRuntimeResolverPlugin.GOOGLE_MAVEN_ID,
            )
    }
}
