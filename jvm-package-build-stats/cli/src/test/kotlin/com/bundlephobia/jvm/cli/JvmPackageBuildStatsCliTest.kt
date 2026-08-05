package com.bundlephobia.jvm.cli

import com.bundlephobia.jvm.model.ResultJson
import java.io.PrintWriter
import java.io.StringWriter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JvmPackageBuildStatsCliTest {
    @Test
    fun `analyze validates the coordinate and writes only JSON to stdout`() {
        val execution = execute("analyze", "com.google.code.gson:gson:2.13.1")

        assertEquals(ExitCode.ANALYSIS_FAILED, execution.exitCode)
        assertEquals("", execution.stderr)
        assertEquals(
            "ANALYSIS_NOT_IMPLEMENTED",
            ResultJson
                .decodeResult(execution.stdout.trim())
                .diagnostics
                .single()
                .code,
        )
    }

    @Test
    fun `inspect exposes the command contract without reading the file`() {
        val execution = execute("inspect", "missing.jar")

        assertEquals(ExitCode.ANALYSIS_FAILED, execution.exitCode)
        assertEquals("", execution.stderr)
        assertEquals(
            "missing.jar",
            ResultJson.decodeArtifactAnalysis(execution.stdout.trim()).displayName,
        )
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
            JvmPackageBuildStatsCli()
                .execute(
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
