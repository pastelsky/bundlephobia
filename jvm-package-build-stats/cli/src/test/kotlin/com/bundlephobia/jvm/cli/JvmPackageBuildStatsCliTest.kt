package com.bundlephobia.jvm.cli

import com.bundlephobia.jvm.PackageBuildStatsAnalyzer
import com.bundlephobia.jvm.PackageBuildStatsConfig
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import org.junit.jupiter.api.io.TempDir
import java.io.PrintWriter
import java.io.StringWriter
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JvmPackageBuildStatsCliTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `analyze resolves the coordinate and writes only JSON to stdout`() {
        val execution = execute("analyze", "com.google.code.gson:gson:2.14.0")

        assertEquals(ExitCode.SUCCESS, execution.exitCode, execution.stdout)
        assertEquals("", execution.stderr)
        val result = ResultJson.decodeResult(execution.stdout.trim())
        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals("com.google.code.gson:gson:2.14.0", result.coordinate.notation)
        assertTrue(result.runtimeClosure.compressedBytes > 0)
        assertTrue(result.artifacts.isNotEmpty())
        assertEquals("gson-2.14.0.jar", result.directArtifact?.displayName)
    }

    @Test
    fun `inspect emits a structured input failure for a missing file`() {
        val execution = execute("inspect", "missing.jar")

        assertEquals(ExitCode.ANALYSIS_FAILED, execution.exitCode)
        assertEquals("", execution.stderr)
        val result = ResultJson.decodeArtifactAnalysis(execution.stdout.trim())
        assertEquals("missing.jar", result.displayName)
        assertEquals("ARCHIVE_NOT_REGULAR_FILE", result.diagnostics.single().code)
    }

    @Test
    fun `inspect streams a local jar and writes complete JSON`() {
        val jar = tempDir.resolve("fixture.jar")
        ZipOutputStream(Files.newOutputStream(jar)).use { output ->
            output.putNextEntry(ZipEntry("example/resource.txt"))
            output.write(byteArrayOf(1, 2, 3))
            output.closeEntry()
        }

        val execution = execute("inspect", jar.toString())

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertEquals("", execution.stderr)
        val result = ResultJson.decodeArtifactAnalysis(execution.stdout.trim())
        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(3, result.expandedBytes)
        assertEquals("other", result.payload.single().category)
        assertEquals(0, result.classfiles?.analyzedClasses)
    }

    @Test
    fun `invalid coordinates are usage errors and never emit JSON`() {
        val execution = execute("analyze", "g:a:1-SNAPSHOT")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertEquals("", execution.stdout)
        assertTrue(execution.stderr.contains("immutable published release"))
    }

    @Test
    fun `Android targets are rejected`() {
        val execution = execute("analyze", "g:a:1", "--target", "android-release")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertEquals("", execution.stdout)
        assertTrue(execution.stderr.contains("Unsupported target profile"))
    }

    @Test
    fun `help is successful`() {
        val execution = execute("--help")

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertTrue(execution.stdout.contains("analyze"))
        assertTrue(execution.stdout.contains("inspect"))
        assertEquals("", execution.stderr)
    }

    private fun execute(vararg args: String): Execution {
        val stdout = StringWriter()
        val stderr = StringWriter()
        val exitCode =
            JvmPackageBuildStatsCli(
                PackageBuildStatsAnalyzer(
                    PackageBuildStatsConfig(
                        cacheDirectory = tempDir.resolve("cache"),
                    ),
                ),
            ).execute(
                args = arrayOf(*args),
                out = PrintWriter(stdout, true),
                err = PrintWriter(stderr, true),
            )
        return Execution(exitCode, stdout.toString(), stderr.toString())
    }

    private data class Execution(
        val exitCode: Int,
        val stdout: String,
        val stderr: String,
    )
}
