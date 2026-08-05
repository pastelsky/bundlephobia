package com.bundlephobia.jvm.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

public object ResultJson {
    private val json =
        Json {
            encodeDefaults = true
            explicitNulls = true
            ignoreUnknownKeys = false
            prettyPrint = false
        }

    @JvmStatic
    public fun encode(result: PackageBuildStatsResult): String = json.encodeToString(result)

    @JvmStatic
    public fun encode(analysis: ArtifactAnalysis): String = json.encodeToString(analysis)

    @JvmStatic
    public fun decodeResult(value: String): PackageBuildStatsResult = json.decodeFromString(value)

    @JvmStatic
    public fun decodeArtifactAnalysis(value: String): ArtifactAnalysis = json.decodeFromString(value)
}
