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
        assertTrue(encoded.contains("\"schemaVersion\":2"))
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

    @Test
    fun `round trips Android DEX statistics`() {
        val result =
            fixtureResult().copy(
                target = TargetProfile.ANDROID_RUNTIME,
                androidDex =
                    AndroidDexStats(
                        status = AndroidDexStatus.COMPLETE,
                        dexBytes = 4_096,
                        dexFiles = 2,
                        referencedMethods = 70_000,
                        maxReferencedMethodsPerDex = 60_000,
                        referencedFields = 12_000,
                        definedClasses = 800,
                        minSdk = 23,
                        buildToolsVersion = "36.0.0",
                    ),
            )

        assertEquals(result, ResultJson.decodeResult(ResultJson.encode(result)))
        assertTrue(ResultJson.encode(result).contains("\"referencedMethods\":70000"))
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
            resolution = ResolutionSummary(coordinate),
            runtimeClosure = RuntimeClosureStats(archiveBytes = 1_024),
        )
    }
}
