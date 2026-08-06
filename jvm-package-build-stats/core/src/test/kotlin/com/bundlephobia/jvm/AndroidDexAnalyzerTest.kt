package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AndroidDexStatus
import com.bundlephobia.jvm.model.AndroidPreflightStats
import com.bundlephobia.jvm.model.AndroidRequirementConfidence
import com.bundlephobia.jvm.model.AndroidToolingStatus
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolvedArtifact
import org.junit.jupiter.api.io.TempDir
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AndroidDexAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `reports bounded aggregate counts from D8 output`() {
        val sdkRoot = fakeSdk()
        val profile = PackageBuildStatsConfig.DEFAULT_ANDROID_PROFILES.first()
        val result =
            AndroidDexAnalyzer(PackageBuildStatsConfig(androidSdkRoot = sdkRoot)).analyze(
                resolution = resolution(aar()),
                preflight =
                    AndroidPreflightStats(
                        requiredMinSdk = 23,
                        requiredCompileSdk = 36,
                        confidence = AndroidRequirementConfidence.DECLARED,
                        selectedProfile = profile,
                        toolingStatus = AndroidToolingStatus.READY,
                    ),
                cancellation = AnalysisCancellation.NONE,
            )

        assertEquals(AndroidDexStatus.COMPLETE, result.stats.status)
        assertEquals(224L, result.stats.dexBytes)
        assertEquals(2, result.stats.dexFiles)
        assertEquals(1_734L, result.stats.referencedMethods)
        assertEquals(1_234L, result.stats.maxReferencedMethodsPerDex)
        assertEquals(334L, result.stats.referencedFields)
        assertEquals(66L, result.stats.definedClasses)
        assertTrue(result.stats.multidex)
        assertTrue(result.diagnostics.isEmpty())
    }

    @Test
    fun `retains only bounded D8 failure output`() {
        val sdkRoot = fakeSdk()
        val d8 = sdkRoot.resolve("build-tools/36.0.0/d8")
        Files.writeString(
            d8,
            "#!/bin/sh\ni=0\nwhile [ \"${'$'}i\" -lt 200 ]; do echo 'discarded diagnostic line'; i=${'$'}((i + 1)); done\n" +
                "echo 'final useful detail'\nexit 7\n",
        )
        executable(d8)
        val profile = PackageBuildStatsConfig.DEFAULT_ANDROID_PROFILES.first()
        val result =
            AndroidDexAnalyzer(
                PackageBuildStatsConfig(
                    androidSdkRoot = sdkRoot,
                    diagnosticOutputLimitBytes = 64,
                ),
            ).analyze(
                resolution = resolution(aar()),
                preflight =
                    AndroidPreflightStats(
                        requiredMinSdk = 23,
                        requiredCompileSdk = 36,
                        confidence = AndroidRequirementConfidence.DECLARED,
                        selectedProfile = profile,
                        toolingStatus = AndroidToolingStatus.READY,
                    ),
                cancellation = AnalysisCancellation.NONE,
            )

        assertEquals(AndroidDexStatus.FAILED, result.stats.status)
        assertTrue(
            result.diagnostics
                .single()
                .summary
                .contains("final useful detail"),
        )
        assertTrue(
            result.diagnostics
                .single()
                .summary.length < 160,
        )
    }

    private fun fakeSdk(): Path {
        val sdkRoot = tempDir.resolve("sdk")
        val platform = sdkRoot.resolve("platforms/android-36")
        val buildTools = sdkRoot.resolve("build-tools/36.0.0")
        Files.createDirectories(platform)
        Files.createDirectories(buildTools)
        Files.write(platform.resolve("android.jar"), byteArrayOf())
        val primaryDex = dex("primary.dex", methods = 1_234, fields = 234, classes = 56)
        val secondaryDex = dex("secondary.dex", methods = 500, fields = 100, classes = 10)
        val d8 = buildTools.resolve("d8")
        Files.writeString(
            d8,
            "#!/bin/sh\n" +
                "while [ \"${'$'}#\" -gt 0 ]; do\n" +
                "  if [ \"${'$'}1\" = \"--output\" ]; then shift; " +
                "cp '$primaryDex' \"${'$'}1/classes.dex\"; cp '$secondaryDex' \"${'$'}1/classes2.dex\"; exit 0; fi\n" +
                "  shift\n" +
                "done\nexit 1\n",
        )
        executable(d8)
        return sdkRoot
    }

    private fun executable(path: Path) {
        Files.setPosixFilePermissions(
            path,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
    }

    private fun dex(
        name: String,
        methods: Int,
        fields: Int,
        classes: Int,
    ): Path {
        val path = tempDir.resolve(name)
        val header = ByteBuffer.allocate(112).order(ByteOrder.LITTLE_ENDIAN)
        header.put("dex\n035\u0000".toByteArray())
        header.putInt(32, 112)
        header.putInt(80, fields)
        header.putInt(88, methods)
        header.putInt(96, classes)
        Files.write(path, header.array())
        return path
    }

    private fun resolution(archive: Path): ResolutionStats {
        val coordinate = MavenCoordinate.parse("androidx.example:dex-fixture:1.0")
        return ResolutionStats(
            requested = coordinate,
            artifacts =
                listOf(
                    ResolvedArtifact(
                        coordinate = coordinate,
                        fileName = archive.fileName.toString(),
                        path = archive.toString(),
                        extension = "aar",
                        variant = "releaseRuntimeElements",
                        digest = ArtifactDigest(value = "fixture"),
                    ),
                ),
        )
    }

    private fun aar(): Path {
        val archive = tempDir.resolve("fixture.aar")
        val classes = tempDir.resolve("classes.jar")
        ZipOutputStream(Files.newOutputStream(classes)).use { output ->
            output.putNextEntry(ZipEntry("fixture.txt"))
            output.write(byteArrayOf(1))
            output.closeEntry()
        }
        ZipOutputStream(Files.newOutputStream(archive)).use { output ->
            output.putNextEntry(ZipEntry("classes.jar"))
            output.write(Files.readAllBytes(classes))
            output.closeEntry()
        }
        return archive
    }
}
