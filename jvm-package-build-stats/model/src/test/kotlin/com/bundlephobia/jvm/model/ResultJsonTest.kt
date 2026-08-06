package com.bundlephobia.jvm.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ResultJsonTest {
    @Test
    fun `decoders ignore fields introduced by newer schemas`() {
        val result = fixtureResult()
        val encoded = ResultJson.encode(result).replaceFirst("{", "{\"futureField\":true,")

        assertEquals(result, ResultJson.decodeResult(encoded))
    }

    @Test
    fun `round trips the stable result contract`() {
        val result = fixtureResult()

        val encoded = ResultJson.encode(result)
        val decoded = ResultJson.decodeResult(encoded)

        assertEquals(result, decoded)
        assertTrue(encoded.contains("\"schemaVersion\":1"))
        assertTrue(encoded.contains("\"target\":\"jvm-runtime\""))
        assertTrue(encoded.contains("\"archiveBytes\":1024"))
        assertTrue(encoded.contains("\"directArtifact\":null"))
    }

    @Test
    fun `round trips standalone resolution evidence`() {
        val coordinate = MavenCoordinate.parse("com.google.code.gson:gson:2.14.0")
        val result =
            JvmResolutionResult(
                status = ResultStatus.COMPLETE,
                resolution =
                    ResolutionStats(
                        requested = coordinate,
                        repositories = listOf("maven-central", "google-maven"),
                    ),
            )

        assertEquals(result, ResultJson.decodeResolution(ResultJson.encode(result)))
    }

    private fun fixtureResult(): PackageBuildStatsResult {
        val coordinate = MavenCoordinate.parse("com.google.code.gson:gson:2.13.1")
        return PackageBuildStatsResult(
            status = ResultStatus.PARTIAL,
            coordinate = coordinate,
            target = TargetProfile.JVM_RUNTIME,
            toolchain =
                ToolchainManifest(
                    generation = "jvm-test-g1",
                    analyzerVersion = "0.0.0-test",
                    jdkVersion = "21.0.11",
                    jdkVendor = "Temurin",
                    kotlinVersion = "2.4.10",
                    gradleVersion = "9.5.1",
                ),
            resolution = ResolutionStats(coordinate),
            runtimeClosure = RuntimeClosureStats(archiveBytes = 1_024),
        )
    }
}
