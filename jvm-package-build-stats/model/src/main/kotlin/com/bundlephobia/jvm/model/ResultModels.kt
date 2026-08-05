package com.bundlephobia.jvm.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
public enum class ResultStatus {
    @SerialName("complete")
    COMPLETE,

    @SerialName("partial")
    PARTIAL,

    @SerialName("failed")
    FAILED,
}

@Serializable
public enum class TargetProfile {
    @SerialName("jvm-runtime")
    JVM_RUNTIME,
    ;

    public companion object {
        @JvmStatic
        public fun parse(value: String): TargetProfile =
            when (value) {
                "jvm-runtime" -> JVM_RUNTIME
                else -> throw IllegalArgumentException("Unsupported target profile: $value")
            }
    }
}

@Serializable
public enum class DiagnosticSeverity {
    @SerialName("info")
    INFO,

    @SerialName("warning")
    WARNING,

    @SerialName("error")
    ERROR,
}

@Serializable
public enum class AnalysisStage {
    @SerialName("input")
    INPUT,

    @SerialName("resolution")
    RESOLUTION,

    @SerialName("archive-analysis")
    ARCHIVE_ANALYSIS,

    @SerialName("classfile-analysis")
    CLASSFILE_ANALYSIS,

    @SerialName("assembly")
    ASSEMBLY,
}

@Serializable
public enum class RetryClassification {
    @SerialName("never")
    NEVER,

    @SerialName("retryable")
    RETRYABLE,

    @SerialName("unknown")
    UNKNOWN,
}

@Serializable
public data class Diagnostic
    @JvmOverloads
    constructor(
        public val code: String,
        public val summary: String,
        public val stage: AnalysisStage,
        public val severity: DiagnosticSeverity = DiagnosticSeverity.ERROR,
        public val retry: RetryClassification = RetryClassification.NEVER,
        public val correlationId: String? = null,
    )

@Serializable
public data class AnalyzeRequest
    @JvmOverloads
    constructor(
        public val coordinate: MavenCoordinate,
        public val target: TargetProfile = TargetProfile.JVM_RUNTIME,
    )

@Serializable
public data class ToolchainManifest(
    public val generation: String,
    public val analyzerVersion: String,
    public val jdkVersion: String,
    public val jdkVendor: String,
    public val kotlinVersion: String,
    public val gradleVersion: String,
)

@Serializable
public data class ArtifactDigest(
    public val algorithm: String = "sha256",
    public val value: String,
)

@Serializable
public data class PayloadCategoryStats(
    public val category: String,
    public val compressedBytes: Long,
    public val expandedBytes: Long,
    public val entries: Int,
)

/** Per-package classfile measurements derived from JVM internal class names. */
@Serializable
public data class NamespaceStats(
    public val name: String,
    public val classBytes: Long,
    public val classes: Int,
    public val publicTypes: Int,
    public val publicMembers: Int,
    public val protectedTypes: Int = 0,
    public val protectedMembers: Int = 0,
    public val implementationClasses: Int = 0,
)

/**
 * Static measurements collected from the effective classfiles in a JAR.
 *
 * Indicator counts are evidence of relevant bytecode references, not proof that the behavior runs.
 * Multi-release versions list every declared version while class counts reflect the configured runtime view.
 */
@Serializable
public data class ClassfileStats(
    public val analyzedClasses: Int = 0,
    public val implementationClasses: Int = 0,
    public val publicTypes: Int = 0,
    public val protectedTypes: Int = 0,
    public val publicMembers: Int = 0,
    public val protectedMembers: Int = 0,
    public val moduleInfoPresent: Boolean = false,
    public val moduleNames: List<String> = emptyList(),
    public val moduleExports: List<String> = emptyList(),
    public val multiReleaseVersions: List<Int> = emptyList(),
    public val kotlinMetadataClasses: Int = 0,
    public val reflectionIndicatorClasses: Int = 0,
    public val serviceLoaderIndicatorClasses: Int = 0,
    public val jniIndicatorClasses: Int = 0,
    public val unsupportedBytecodeVersions: List<Int> = emptyList(),
)

@Serializable
public data class ArtifactAnalysis(
    public val schemaVersion: Int = 1,
    public val status: ResultStatus,
    public val displayName: String,
    public val digest: ArtifactDigest? = null,
    public val archiveBytes: Long? = null,
    public val expandedBytes: Long? = null,
    public val payload: List<PayloadCategoryStats> = emptyList(),
    public val namespaces: List<NamespaceStats> = emptyList(),
    /** Classfile measurements, or `null` when classfile analysis did not run. */
    public val classfiles: ClassfileStats? = null,
    public val diagnostics: List<Diagnostic> = emptyList(),
)

/** A selected Gradle variant with normalized attribute values and capabilities. */
@Serializable
public data class ResolvedVariant(
    public val name: String,
    public val attributes: Map<String, String> = emptyMap(),
    public val capabilities: List<String> = emptyList(),
)

/** A Gradle-selected component and the JVM runtime variants that participated in resolution. */
@Serializable
public data class ResolvedComponent
    @JvmOverloads
    constructor(
        public val coordinate: MavenCoordinate,
        public val variant: String? = null,
        public val direct: Boolean,
        public val artifacts: List<ArtifactAnalysis> = emptyList(),
        public val variants: List<ResolvedVariant> = emptyList(),
        public val selectionReasons: List<String> = emptyList(),
    )

/** One requested dependency edge. A `null` selection represents an unresolved edge. */
@Serializable
public data class DependencyEdge
    @JvmOverloads
    constructor(
        public val from: MavenCoordinate,
        public val requested: String,
        public val selected: MavenCoordinate? = null,
        public val variant: String? = null,
        public val attributes: Map<String, String> = emptyMap(),
        public val failure: String? = null,
    )

/**
 * A resolved runtime artifact together with its immutable digest and selected variant.
 *
 * @property path normalized absolute path used by the later analysis stage; callers should omit it when comparing hosts.
 * @property extension lowercase artifact extension used to reject non-JAR runtime artifacts.
 */
@Serializable
public data class ResolvedArtifact(
    public val coordinate: MavenCoordinate,
    public val fileName: String,
    public val path: String,
    public val extension: String,
    public val variant: String,
    public val attributes: Map<String, String> = emptyMap(),
    public val digest: ArtifactDigest,
)

/**
 * Deterministic evidence returned by Gradle for one exact JVM runtime coordinate.
 *
 * [repositories] is the complete ordered allowlist; Gradle does not expose reliable per-artifact provenance.
 */
@Serializable
public data class ResolutionStats
    @JvmOverloads
    constructor(
        public val requested: MavenCoordinate,
        public val components: List<ResolvedComponent> = emptyList(),
        public val edges: List<DependencyEdge> = emptyList(),
        public val artifacts: List<ResolvedArtifact> = emptyList(),
        public val repositories: List<String> = emptyList(),
    )

/** Standalone schema-versioned resolver output written by the sealed Gradle resolution build. */
@Serializable
public data class JvmResolutionResult(
    public val schemaVersion: Int = 1,
    public val status: ResultStatus,
    public val target: TargetProfile = TargetProfile.JVM_RUNTIME,
    public val resolution: ResolutionStats,
    public val diagnostics: List<Diagnostic> = emptyList(),
)

@Serializable
public data class RuntimeClosureStats(
    public val compressedBytes: Long = 0,
    public val expandedBytes: Long = 0,
    public val directArtifactBytes: Long = 0,
    public val transitiveArtifactBytes: Long = 0,
    public val components: Int = 0,
    public val artifacts: Int = 0,
    public val dependencyDepth: Int = 0,
)

@Serializable
public data class TimingStats(
    public val totalMilliseconds: Long = 0,
    public val stagesMilliseconds: Map<String, Long> = emptyMap(),
)

@Serializable
public data class PackageBuildStatsResult(
    public val schemaVersion: Int = 1,
    public val status: ResultStatus,
    public val coordinate: MavenCoordinate,
    public val target: TargetProfile,
    public val toolchain: ToolchainManifest,
    public val resolution: ResolutionStats,
    public val artifacts: List<ArtifactAnalysis> = emptyList(),
    public val directArtifact: ArtifactAnalysis? = null,
    public val runtimeClosure: RuntimeClosureStats = RuntimeClosureStats(),
    public val diagnostics: List<Diagnostic> = emptyList(),
    public val timings: TimingStats = TimingStats(),
)
