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

@Serializable
public data class NamespaceStats(
    public val name: String,
    public val classBytes: Long,
    public val classes: Int,
    public val publicTypes: Int,
    public val publicMembers: Int,
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
    public val diagnostics: List<Diagnostic> = emptyList(),
)

@Serializable
public data class ResolvedComponent(
    public val coordinate: MavenCoordinate,
    public val variant: String? = null,
    public val direct: Boolean,
    public val artifacts: List<ArtifactAnalysis> = emptyList(),
)

@Serializable
public data class DependencyEdge(
    public val from: MavenCoordinate,
    public val requested: String,
    public val selected: MavenCoordinate? = null,
)

@Serializable
public data class ResolutionStats(
    public val requested: MavenCoordinate,
    public val components: List<ResolvedComponent> = emptyList(),
    public val edges: List<DependencyEdge> = emptyList(),
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
