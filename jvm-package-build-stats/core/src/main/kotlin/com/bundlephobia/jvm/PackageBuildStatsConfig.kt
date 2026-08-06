package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AndroidSdkChannel
import com.bundlephobia.jvm.model.AndroidToolchainProfile
import java.nio.file.Path

/** Runtime controls for coordinate resolution. Result caching belongs to the calling service. */
public data class PackageBuildStatsConfig
    @JvmOverloads
    constructor(
        /** Gradle executable or wrapper. When absent, the analyzer uses its bundled pinned wrapper. */
        public val gradleExecutable: Path? = null,
        /** Hard wall-clock limit for the sealed Gradle resolution process. */
        public val resolutionTimeoutMilliseconds: Long = 120_000,
        /** Parent for isolated resolver builds. Defaults to the host temporary-file policy. */
        public val temporaryDirectory: Path? = null,
        /** Maximum resolver stderr included in a structured failure diagnostic. */
        public val diagnosticOutputLimitBytes: Int = 4_096,
        /** Android profiles available for metadata-driven selection, ordered only for display. */
        public val androidProfiles: List<AndroidToolchainProfile> = DEFAULT_ANDROID_PROFILES,
        /** Comparable Android floor; dependencies may raise this value during preflight. */
        public val androidBaselineMinSdk: Int = 23,
        /** Existing Android SDK root used to check or provision selected packages. */
        public val androidSdkRoot: Path? = null,
        /** Official Android CLI executable. Required only when installation is enabled and tooling is missing. */
        public val androidSdkManagerExecutable: Path? = null,
        /** Opt-in installation of missing allowlisted SDK platform and Build Tools packages. */
        public val installMissingAndroidTooling: Boolean = false,
        /** Hard wall-clock limit for one Android CLI SDK installation. */
        public val androidToolingInstallTimeoutMilliseconds: Long = 180_000,
    ) {
        init {
            require(resolutionTimeoutMilliseconds > 0) { "resolutionTimeoutMilliseconds must be positive" }
            require(diagnosticOutputLimitBytes >= 0) { "diagnosticOutputLimitBytes must not be negative" }
            require(androidProfiles.isNotEmpty()) { "At least one Android profile is required" }
            require(androidProfiles.map(AndroidToolchainProfile::id).distinct().size == androidProfiles.size) {
                "Android profile ids must be unique"
            }
            require(androidBaselineMinSdk > 0) { "Android baseline minSdk must be positive" }
            require(androidToolingInstallTimeoutMilliseconds > 0) {
                "Android tooling install timeout must be positive"
            }
            require(!installMissingAndroidTooling || androidSdkRoot != null) {
                "androidSdkRoot is required when Android tooling installation is enabled"
            }
            require(!installMissingAndroidTooling || androidSdkManagerExecutable != null) {
                "androidSdkManagerExecutable is required when Android tooling installation is enabled"
            }
        }

        public companion object {
            @JvmField
            public val DEFAULT_ANDROID_PROFILES: List<AndroidToolchainProfile> =
                listOf(
                    AndroidToolchainProfile(
                        id = "android-36-stable",
                        compileSdk = 36,
                        targetSdk = 36,
                        buildToolsVersion = "36.0.0",
                        agpVersion = "9.3.1",
                        gradleVersion = "9.5.0",
                    ),
                    AndroidToolchainProfile(
                        id = "android-37-preview",
                        compileSdk = 37,
                        targetSdk = 36,
                        buildToolsVersion = "36.0.0",
                        agpVersion = "9.3.1",
                        gradleVersion = "9.5.0",
                        channel = AndroidSdkChannel.PREVIEW,
                    ),
                )
        }
    }
