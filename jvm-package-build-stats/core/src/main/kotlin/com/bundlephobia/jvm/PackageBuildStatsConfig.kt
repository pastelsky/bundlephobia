package com.bundlephobia.jvm

import java.nio.file.Path

/** Runtime controls for coordinate resolution and immutable analysis caching. */
public data class PackageBuildStatsConfig
    @JvmOverloads
    constructor(
        /** Persistent cache root. Callers running in workers should provide an explicit directory. */
        public val cacheDirectory: Path = defaultCacheDirectory(),
        /** Gradle executable or wrapper. When absent, the analyzer uses its bundled pinned wrapper. */
        public val gradleExecutable: Path? = null,
        /** Hard wall-clock limit for the sealed Gradle resolution process. */
        public val resolutionTimeoutMilliseconds: Long = 120_000,
    ) {
        init {
            require(resolutionTimeoutMilliseconds > 0) { "resolutionTimeoutMilliseconds must be positive" }
        }

        public companion object {
            @JvmStatic
            public fun defaultCacheDirectory(): Path =
                Path.of(System.getProperty("user.home"), ".cache", "bundlephobia", "jvm-package-build-stats")
        }
    }
