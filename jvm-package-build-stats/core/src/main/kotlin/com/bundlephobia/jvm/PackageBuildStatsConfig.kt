package com.bundlephobia.jvm

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
    ) {
        init {
            require(resolutionTimeoutMilliseconds > 0) { "resolutionTimeoutMilliseconds must be positive" }
            require(diagnosticOutputLimitBytes >= 0) { "diagnosticOutputLimitBytes must not be negative" }
        }
    }
