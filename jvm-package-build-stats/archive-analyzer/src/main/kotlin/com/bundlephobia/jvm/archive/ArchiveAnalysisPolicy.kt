package com.bundlephobia.jvm.archive

public data class ArchiveAnalysisPolicy
    @JvmOverloads
    constructor(
        public val maxArchiveBytes: Long = 1L shl 30,
        public val maxEntries: Int = 100_000,
        public val maxCompressedEntryBytes: Long = 512L shl 20,
        public val maxExpandedEntryBytes: Long = 1L shl 30,
        public val maxTotalExpandedBytes: Long = 4L shl 30,
        public val maxCompressionRatio: Double = 1_000.0,
    ) {
        init {
            require(maxArchiveBytes >= 0)
            require(maxEntries >= 0)
            require(maxCompressedEntryBytes >= 0)
            require(maxExpandedEntryBytes >= 0)
            require(maxTotalExpandedBytes >= 0)
            require(maxCompressionRatio >= 1.0)
        }
    }
