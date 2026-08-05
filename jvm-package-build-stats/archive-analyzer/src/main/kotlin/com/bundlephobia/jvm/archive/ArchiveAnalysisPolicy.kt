package com.bundlephobia.jvm.archive

public data class ArchiveAnalysisPolicy
    @JvmOverloads
    constructor(
        public val maxArchiveBytes: Long = 1L shl 30,
        public val maxEntries: Int = 100_000,
        public val maxCompressedEntryBytes: Long = 512L shl 20,
        public val maxExpandedEntryBytes: Long = 1L shl 30,
        public val maxTotalCompressedEntryBytes: Long = 1L shl 30,
        public val maxTotalExpandedBytes: Long = 4L shl 30,
        public val maxCompressionRatio: Double = 1_000.0,
        public val maxPathDepth: Int = 64,
        public val maxPathLength: Int = 4_096,
        public val maxDuplicatePaths: Int = 0,
        public val maxNestedArchives: Int = 64,
    ) {
        init {
            require(maxArchiveBytes >= 0)
            require(maxEntries >= 0)
            require(maxCompressedEntryBytes >= 0)
            require(maxExpandedEntryBytes >= 0)
            require(maxTotalCompressedEntryBytes >= 0)
            require(maxTotalExpandedBytes >= 0)
            require(maxCompressionRatio >= 1.0)
            require(maxPathDepth >= 1)
            require(maxPathLength >= 1)
            require(maxDuplicatePaths >= 0)
            require(maxNestedArchives >= 0)
        }
    }
