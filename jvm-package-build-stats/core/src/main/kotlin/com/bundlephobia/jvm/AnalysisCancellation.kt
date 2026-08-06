package com.bundlephobia.jvm

/** Cooperative cancellation checked during resolution and between artifact analyses. */
public fun interface AnalysisCancellation {
    public fun isCancelled(): Boolean

    public companion object {
        @JvmField public val NONE: AnalysisCancellation = AnalysisCancellation { false }
    }
}
