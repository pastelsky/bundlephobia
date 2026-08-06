package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AndroidSdkChannel
import com.bundlephobia.jvm.model.AndroidToolingStatus
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolvedArtifact
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AndroidPreflightAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `selects preview only when declared metadata exceeds stable profile`() {
        val result = analyze(aar(minSdk = 26, minCompileSdk = 37, minAgp = "8.9.0"))

        assertEquals(26, result.stats.requiredMinSdk)
        assertEquals(37, result.stats.requiredCompileSdk)
        assertEquals("android-37-preview", result.stats.selectedProfile?.id)
        assertEquals(AndroidSdkChannel.PREVIEW, result.stats.selectedProfile?.channel)
        assertEquals(AndroidToolingStatus.MISSING, result.stats.toolingStatus)
        assertEquals(listOf("platforms;android-37", "build-tools;36.0.0"), result.stats.missingToolingPackages)
    }

    @Test
    fun `reports unsupported requirements before Android tooling runs`() {
        val result = analyze(aar(minSdk = 21, minCompileSdk = 38, minAgp = "10.0.0"))

        assertNull(result.stats.selectedProfile)
        assertEquals(AndroidToolingStatus.UNSUPPORTED, result.stats.toolingStatus)
        assertTrue(result.diagnostics.any { it.code == "ANDROID_PROFILE_UNSUPPORTED" })
    }

    @Test
    fun `provisions only selected immutable sdk packages`() {
        val sdkRoot = tempDir.resolve("sdk")
        val sdkManager = tempDir.resolve("sdkmanager")
        Files.writeString(
            sdkManager,
            "#!/bin/sh\nmkdir -p '${sdkRoot.resolve("platforms/android-36")}' '${sdkRoot.resolve("build-tools/36.0.0")}'\n" +
                "touch '${sdkRoot.resolve("platforms/android-36/android.jar")}' '${sdkRoot.resolve("build-tools/36.0.0/d8")}'\n",
        )
        Files.setPosixFilePermissions(
            sdkManager,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val result =
            AndroidPreflightAnalyzer(
                PackageBuildStatsConfig(
                    androidSdkRoot = sdkRoot,
                    androidSdkManagerExecutable = sdkManager,
                    installMissingAndroidTooling = true,
                ),
            ).analyze(resolution(aar(minSdk = 24, minCompileSdk = 35, minAgp = "8.0.0")), AnalysisCancellation.NONE)

        assertEquals(AndroidToolingStatus.INSTALLED, result.stats.toolingStatus)
        assertTrue(result.stats.missingToolingPackages.isEmpty())
        assertTrue(Files.isRegularFile(sdkRoot.resolve("platforms/android-36/android.jar")))
        assertTrue(Files.isRegularFile(sdkRoot.resolve("build-tools/36.0.0/d8")))
    }

    private fun analyze(path: Path): AndroidPreflightResult =
        AndroidPreflightAnalyzer(PackageBuildStatsConfig()).analyze(resolution(path), AnalysisCancellation.NONE)

    private fun resolution(path: Path): ResolutionStats {
        val coordinate = MavenCoordinate.parse("androidx.example:fixture:1.0")
        return ResolutionStats(
            requested = coordinate,
            artifacts =
                listOf(
                    ResolvedArtifact(
                        coordinate = coordinate,
                        fileName = path.fileName.toString(),
                        path = path.toString(),
                        extension = "aar",
                        variant = "releaseRuntimeElements",
                        digest = ArtifactDigest(value = "fixture"),
                    ),
                ),
        )
    }

    private fun aar(
        minSdk: Int,
        minCompileSdk: Int,
        minAgp: String,
    ): Path {
        val path = tempDir.resolve("fixture-$minCompileSdk.aar")
        ZipOutputStream(Files.newOutputStream(path)).use { output ->
            output.putNextEntry(ZipEntry("AndroidManifest.xml"))
            output.write(
                """<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-sdk android:minSdkVersion="$minSdk" /></manifest>"""
                    .toByteArray(),
            )
            output.closeEntry()
            output.putNextEntry(ZipEntry("META-INF/com/android/build/gradle/aar-metadata.properties"))
            output.write(
                "minCompileSdk=$minCompileSdk\nminCompileSdkExtension=0\nminAndroidGradlePluginVersion=$minAgp\n"
                    .toByteArray(),
            )
            output.closeEntry()
        }
        return path
    }
}
