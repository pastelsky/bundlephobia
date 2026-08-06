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
        /** Parent for isolated resolver builds. Defaults to the host temporary-file policy. */
        public val temporaryDirectory: Path? = null,
        /** Maximum resolver stderr included in a structured failure diagnostic. */
        public val diagnosticOutputLimitBytes: Int = 4_096,
    ) {
        init {
            require(resolutionTimeoutMilliseconds > 0) { "resolutionTimeoutMilliseconds must be positive" }
            require(diagnosticOutputLimitBytes >= 0) { "diagnosticOutputLimitBytes must not be negative" }
        }

        public companion object {
            @JvmStatic
            public fun defaultCacheDirectory(): Path {
                environmentPath("BUNDLEPHOBIA_JVM_CACHE_DIR")?.let { return it }
                environmentPath("XDG_CACHE_HOME")?.let { return it.resolve("bundlephobia/jvm-package-build-stats") }

                val userHome = Path.of(System.getProperty("user.home"))
                val os = System.getProperty("os.name").lowercase()
                return when {
                    os.contains("mac") -> {
                        userHome.resolve("Library/Caches/bundlephobia/jvm-package-build-stats")
                    }

                    os.contains("win") -> {
                        environmentPath("LOCALAPPDATA")
                            ?.resolve("Bundlephobia/jvm-package-build-stats")
                            ?: userHome.resolve("AppData/Local/Bundlephobia/jvm-package-build-stats")
                    }

                    else -> {
                        userHome.resolve(".cache/bundlephobia/jvm-package-build-stats")
                    }
                }
            }

            private fun environmentPath(name: String): Path? =
                System
                    .getenv(name)
                    ?.takeIf(String::isNotBlank)
                    ?.let(Path::of)
        }
    }
