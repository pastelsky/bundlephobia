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

    @SerialName("android-runtime")
    ANDROID_RUNTIME,
    ;

    public val serializedValue: String
        get() =
            when (this) {
                JVM_RUNTIME -> "jvm-runtime"
                ANDROID_RUNTIME -> "android-runtime"
            }

    public companion object {
        @JvmStatic
        public fun parse(value: String): TargetProfile =
            when (value) {
                "jvm-runtime" -> JVM_RUNTIME
                "android-runtime" -> ANDROID_RUNTIME
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

    @SerialName("android-preflight")
    ANDROID_PREFLIGHT,

    @SerialName("toolchain-provisioning")
    TOOLCHAIN_PROVISIONING,

    @SerialName("dex-analysis")
    DEX_ANALYSIS,

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
        /** Consumer Java feature version used for variant and multi-release JAR selection. */
        public val javaVersion: Int = 21,
    ) {
        init {
            require(javaVersion >= 8) { "javaVersion must be at least 8" }
        }
    }

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
public enum class AndroidSdkChannel {
    @SerialName("stable")
    STABLE,

    @SerialName("preview")
    PREVIEW,
}

/** One immutable Android build environment supported by the analyzer. */
@Serializable
public data class AndroidToolchainProfile
    @JvmOverloads
    constructor(
        public val id: String,
        public val compileSdk: Int,
        public val targetSdk: Int,
        public val buildToolsVersion: String,
        public val agpVersion: String,
        public val gradleVersion: String,
        public val compileSdkExtension: Int = 0,
        public val compileSdkPreview: String? = null,
        public val jdkVersion: Int = 17,
        public val channel: AndroidSdkChannel = AndroidSdkChannel.STABLE,
    ) {
        init {
            require(id.isNotBlank()) { "Android profile id must not be blank" }
            require(compileSdk > 0) { "compileSdk must be positive" }
            require(compileSdkExtension >= 0) { "compileSdkExtension must not be negative" }
            require(compileSdkPreview == null || compileSdkPreview.matches(Regex("[A-Za-z][A-Za-z0-9_]*"))) {
                "compileSdkPreview is invalid"
            }
            require(targetSdk > 0) { "targetSdk must be positive" }
            require(buildToolsVersion.matches(Regex("\\d+\\.\\d+\\.\\d+"))) { "Build Tools version must be numeric" }
            require(agpVersion.matches(Regex("\\d+(?:\\.\\d+)+(?:[-.][A-Za-z0-9]+)*"))) { "AGP version is invalid" }
            require(gradleVersion.matches(Regex("\\d+(?:\\.\\d+)+(?:[-.][A-Za-z0-9]+)*"))) { "Gradle version is invalid" }
            require(jdkVersion >= 17) { "Android toolchains require JDK 17 or newer" }
        }
    }

@Serializable
public enum class AndroidRequirementConfidence {
    @SerialName("declared")
    DECLARED,

    @SerialName("inferred")
    INFERRED,

    @SerialName("unknown")
    UNKNOWN,
}

@Serializable
public enum class AndroidToolingStatus {
    @SerialName("ready")
    READY,

    @SerialName("missing")
    MISSING,

    @SerialName("installed")
    INSTALLED,

    @SerialName("unsupported")
    UNSUPPORTED,
}

/** Bounded compatibility evidence from one selected Android runtime artifact. */
@Serializable
public data class AndroidArtifactRequirement(
    public val coordinate: MavenCoordinate,
    public val fileName: String,
    public val minSdk: Int? = null,
    public val minCompileSdk: Int? = null,
    public val minCompileSdkExtension: Int? = null,
    public val compileSdkPreview: String? = null,
    public val minAgpVersion: String? = null,
    public val metadataDeclared: Boolean = false,
)

/** Requirements calculated before any Android compilation, D8, or R8 work starts. */
@Serializable
public data class AndroidPreflightStats(
    public val requiredMinSdk: Int,
    public val requiredCompileSdk: Int,
    public val requiredCompileSdkExtension: Int = 0,
    public val requiredCompileSdkPreview: String? = null,
    public val requiredAgpVersion: String? = null,
    public val confidence: AndroidRequirementConfidence,
    public val selectedProfile: AndroidToolchainProfile? = null,
    public val effectiveMinSdk: Int = requiredMinSdk,
    public val toolingStatus: AndroidToolingStatus,
    public val missingToolingPackages: List<String> = emptyList(),
    public val artifactRequirements: List<AndroidArtifactRequirement> = emptyList(),
    public val artifactRequirementCount: Int = artifactRequirements.size,
    public val artifactRequirementsTruncated: Boolean = false,
)

@Serializable
public enum class AndroidDexStatus {
    @SerialName("complete")
    COMPLETE,

    @SerialName("skipped")
    SKIPPED,

    @SerialName("failed")
    FAILED,
}

/** Whole-runtime-closure D8 output. Counts are unshrunk and summed across generated DEX files. */
@Serializable
public data class AndroidDexStats(
    public val status: AndroidDexStatus,
    public val dexBytes: Long? = null,
    public val dexFiles: Int = 0,
    public val referencedMethods: Long? = null,
    public val maxReferencedMethodsPerDex: Long? = null,
    public val referencedFields: Long? = null,
    public val definedClasses: Long? = null,
    public val multidex: Boolean = dexFiles > 1,
    public val minSdk: Int,
    public val buildToolsVersion: String,
) {
    init {
        require(dexFiles >= 0) { "dexFiles must not be negative" }
        require(listOfNotNull(dexBytes, referencedMethods, maxReferencedMethodsPerDex, referencedFields, definedClasses).all { it >= 0 }) {
            "DEX measurements must not be negative"
        }
        require(multidex == (dexFiles > 1)) { "multidex must match dexFiles" }
        require(minSdk > 0) { "DEX minSdk must be positive" }
        require(buildToolsVersion.isNotBlank()) { "DEX Build Tools version must not be blank" }
        if (status == AndroidDexStatus.COMPLETE) {
            require(dexFiles > 0) { "Complete DEX statistics require at least one DEX file" }
            requireNotNull(dexBytes) { "Complete DEX statistics require dexBytes" }
            requireNotNull(referencedMethods) { "Complete DEX statistics require referencedMethods" }
            requireNotNull(maxReferencedMethodsPerDex) { "Complete DEX statistics require maxReferencedMethodsPerDex" }
            requireNotNull(referencedFields) { "Complete DEX statistics require referencedFields" }
            requireNotNull(definedClasses) { "Complete DEX statistics require definedClasses" }
        }
    }
}

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
    public val classesWithStaticInitializers: Int = 0,
    public val nativeMethodClasses: Int = 0,
    public val unsupportedBytecodeVersions: List<Int> = emptyList(),
)

@Serializable
public enum class ModuleKind {
    @SerialName("explicit")
    EXPLICIT,

    @SerialName("automatic")
    AUTOMATIC,

    @SerialName("unnamed")
    UNNAMED,
}

@Serializable
public data class ModuleRequirement(
    public val name: String,
    public val transitive: Boolean = false,
    public val static: Boolean = false,
    public val version: String? = null,
)

@Serializable
public data class ModuleExport(
    public val packageName: String,
    public val targets: List<String> = emptyList(),
)

@Serializable
public data class ModuleOpen(
    public val packageName: String,
    public val targets: List<String> = emptyList(),
)

@Serializable
public data class ModuleProvider(
    public val service: String,
    public val implementations: List<String>,
)

/** Effective Java module metadata for the selected runtime view of one artifact. */
@Serializable
public data class ModuleStats(
    public val kind: ModuleKind,
    public val name: String? = null,
    public val version: String? = null,
    public val mainClass: String? = null,
    public val requires: List<ModuleRequirement> = emptyList(),
    public val exports: List<ModuleExport> = emptyList(),
    public val opens: List<ModuleOpen> = emptyList(),
    public val uses: List<String> = emptyList(),
    public val provides: List<ModuleProvider> = emptyList(),
)

/** One externally visible JVM type and its physical classfile contribution. */
@Serializable
public data class ApiTypeStats(
    public val name: String,
    public val packageName: String,
    public val language: String,
    public val visibility: String,
    public val classfileBytes: Long,
    public val publicMembers: Int,
    public val protectedMembers: Int,
)

/** Compact public and protected type surface for an artifact's effective runtime view. */
@Serializable
public data class ApiSurfaceStats(
    public val publicTypes: Int = 0,
    public val protectedTypes: Int = 0,
    public val publicMembers: Int = 0,
    public val protectedMembers: Int = 0,
    public val classfileBytes: Long = 0,
    /** Largest externally visible types, bounded by the analyzer for compact results. */
    public val largestTypes: List<ApiTypeStats> = emptyList(),
    public val reportedTypes: Int = largestTypes.size,
    public val truncated: Boolean = false,
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
    public val module: ModuleStats? = null,
    public val apiSurface: ApiSurfaceStats? = null,
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
        /** Whether this is the coordinate explicitly requested by the caller. */
        public val requested: Boolean,
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

/** Path-free selected artifact reference used in public package results. */
@Serializable
public data class ResolvedArtifactSummary(
    public val coordinate: MavenCoordinate,
    public val fileName: String,
    public val extension: String,
    public val variant: String,
    public val attributes: Map<String, String> = emptyMap(),
    public val digest: ArtifactDigest,
)

/** Compact, bounded resolution evidence suitable for API and CLI output. */
@Serializable
public data class ResolutionSummary(
    public val requested: MavenCoordinate,
    public val components: List<ResolvedComponent> = emptyList(),
    public val componentCount: Int = components.size,
    public val edges: List<DependencyEdge> = emptyList(),
    public val edgeCount: Int = edges.size,
    public val artifacts: List<ResolvedArtifactSummary> = emptyList(),
    public val artifactCount: Int = artifacts.size,
    public val repositories: List<String> = emptyList(),
    public val truncated: Boolean = false,
)

/** Standalone schema-versioned resolver output written by the sealed Gradle resolution build. */
@Serializable
public data class JvmResolutionResult(
    public val schemaVersion: Int = 1,
    public val status: ResultStatus,
    public val target: TargetProfile = TargetProfile.JVM_RUNTIME,
    public val javaVersion: Int = 21,
    public val resolution: ResolutionStats,
    public val diagnostics: List<Diagnostic> = emptyList(),
)

@Serializable
public data class RuntimeClosureStats(
    /** Bytes occupied by every unique runtime archive, including the requested artifact. */
    public val archiveBytes: Long = 0,
    /** Sum of uncompressed entry bytes across every unique runtime archive. */
    public val expandedBytes: Long = 0,
    /** Archive bytes belonging to the requested component. */
    public val directArtifactBytes: Long = 0,
    /** Archive bytes belonging to selected transitive components. */
    public val transitiveArtifactBytes: Long = 0,
    public val components: Int = 0,
    public val artifacts: Int = 0,
    /** Maximum shortest-path distance from the requested component. */
    public val dependencyDepth: Int = 0,
    /** A bounded deterministic sample of shortest selected-dependency paths. */
    public val shortestPaths: List<DependencyPath> = emptyList(),
    public val shortestPathCount: Int = shortestPaths.size,
    public val shortestPathsTruncated: Boolean = false,
    /** Up to ten largest transitive runtime archives, ordered by archive bytes. */
    public val largestTransitiveArtifacts: List<RuntimeArtifactSummary> = emptyList(),
)

/** Headline package-size measurements for the selected JVM runtime closure. */
@Serializable
public data class PackageSizeStats(
    /** Complete bytes of every unique selected runtime archive. */
    public val runtimeArchiveBytes: Long = 0,
    /** Sum of uncompressed entry bytes across every unique selected runtime archive. */
    public val runtimeExpandedBytes: Long = 0,
    /** Complete archive bytes belonging to the requested coordinate. */
    public val directArtifactArchiveBytes: Long = 0,
    /** Complete archive bytes belonging to selected transitive coordinates. */
    public val transitiveArtifactArchiveBytes: Long = 0,
)

/** Exact selected-artifact contribution for one component in the runtime closure. */
@Serializable
public data class DependencySizeStats(
    public val coordinate: MavenCoordinate,
    public val archiveBytes: Long,
    public val expandedBytes: Long,
    public val artifactCount: Int,
    public val depth: Int,
    public val requested: Boolean,
    /** True for dependencies selected one edge away from the requested coordinate. */
    public val direct: Boolean,
    public val path: List<MavenCoordinate>,
)

/** A shortest selected-dependency path beginning at the requested component. */
@Serializable
public data class DependencyPath(
    public val coordinate: MavenCoordinate,
    public val depth: Int,
    public val path: List<MavenCoordinate>,
)

/** Size summary for a runtime artifact without exposing a machine-local path. */
@Serializable
public data class RuntimeArtifactSummary(
    public val coordinate: MavenCoordinate,
    public val fileName: String,
    public val digest: ArtifactDigest,
    public val archiveBytes: Long,
    public val expandedBytes: Long,
)

@Serializable
public data class TimingStats(
    public val totalMilliseconds: Long = 0,
    public val stagesMilliseconds: Map<String, Long> = emptyMap(),
)

@Serializable
public data class PackageBuildStatsResult(
    public val schemaVersion: Int = 2,
    public val status: ResultStatus,
    public val coordinate: MavenCoordinate,
    public val target: TargetProfile,
    public val javaVersion: Int = 21,
    public val toolchain: ToolchainManifest,
    public val resolution: ResolutionSummary,
    public val sizes: PackageSizeStats = PackageSizeStats(),
    public val dependencySizes: List<DependencySizeStats> = emptyList(),
    public val dependencyCount: Int = dependencySizes.size,
    public val dependencySizesTruncated: Boolean = false,
    public val artifacts: List<ArtifactAnalysis> = emptyList(),
    public val artifactCount: Int = artifacts.size,
    public val artifactsTruncated: Boolean = false,
    public val directArtifact: ArtifactAnalysis? = null,
    public val runtimeClosure: RuntimeClosureStats = RuntimeClosureStats(),
    public val androidPreflight: AndroidPreflightStats? = null,
    public val androidDex: AndroidDexStats? = null,
    public val diagnostics: List<Diagnostic> = emptyList(),
    public val diagnosticCount: Int = diagnostics.size,
    public val diagnosticsTruncated: Boolean = false,
    public val timings: TimingStats = TimingStats(),
)
