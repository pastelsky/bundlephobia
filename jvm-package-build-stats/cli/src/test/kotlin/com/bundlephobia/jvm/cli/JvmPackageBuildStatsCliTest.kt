package com.bundlephobia.jvm.cli

import com.bundlephobia.jvm.PackageBuildStatsAnalyzer
import com.bundlephobia.jvm.PackageBuildStatsConfig
import com.bundlephobia.jvm.model.AndroidDexStats
import com.bundlephobia.jvm.model.AndroidDexStatus
import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.ClassfileStats
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.PackageBuildStatsResult
import com.bundlephobia.jvm.model.ResolutionSummary
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TargetProfile
import com.bundlephobia.jvm.model.ToolchainManifest
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
        val execution = execute("stats", "com.google.code.gson:gson:2.14.0")

        assertEquals(ExitCode.SUCCESS, execution.exitCode, execution.stdout)
        assertEquals("", execution.stderr)
        val result = ResultJson.decodeResult(execution.stdout.trim())
        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals("com.google.code.gson:gson:2.14.0", result.coordinate.notation)
        assertTrue(result.runtimeClosure.archiveBytes > 0)
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
        val jar = fixtureJar()

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
    fun `interactive output is a concise colored report`() {
        val execution = executeInteractive("inspect", fixtureJar().toString())

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertTrue(execution.stdout.contains("JVM ARTIFACT STATS"))
        assertTrue(execution.stdout.contains("Published JAR"))
        assertTrue(execution.stdout.contains("CONTENTS"))
        assertTrue(!execution.stdout.trimStart().startsWith("{"))
    }

    @Test
    fun `terminal renderer supports ANSI colors`() {
        val result = PackageBuildStatsAnalyzer().inspect(fixtureJar())

        assertTrue(TerminalRenderer(color = true).render(result).contains("\u001B["))
    }

    @Test
    fun `Android pretty output includes unshrunk DEX statistics`() {
        val coordinate = MavenCoordinate.parse("androidx.example:fixture:1.0")
        val result =
            PackageBuildStatsResult(
                status = ResultStatus.COMPLETE,
                coordinate = coordinate,
                target = TargetProfile.ANDROID_RUNTIME,
                toolchain =
                    ToolchainManifest(
                        generation = "test",
                        analyzerVersion = "test",
                        jdkVersion = "21",
                        jdkVendor = "test",
                        kotlinVersion = "test",
                        gradleVersion = "9.5.1",
                    ),
                resolution = ResolutionSummary(coordinate),
                directArtifact =
                    ArtifactAnalysis(
                        status = ResultStatus.COMPLETE,
                        displayName = "fixture.aar",
                        classfiles =
                            ClassfileStats(
                                analyzedClasses = 120,
                                definedMethods = 1_200,
                                definedFields = 240,
                                classfileBytes = 524_288,
                            ),
                    ),
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

        val output = TerminalRenderer(color = false).render(result)

        assertTrue(output.contains("DIRECT LIBRARY CODE"))
        assertTrue(output.contains("Defined methods        1200"))
        assertTrue(output.contains("DEX · D8 UNSHRUNK"))
        assertTrue(output.contains("Method references      70000"))
        assertTrue(output.contains("DEX files              2"))
    }

    @Test
    fun `json overrides interactive terminal output`() {
        val execution = executeInteractive("inspect", fixtureJar().toString(), "--json")

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertEquals(ResultStatus.COMPLETE, ResultJson.decodeArtifactAnalysis(execution.stdout.trim()).status)
    }

    @Test
    fun `pretty output can be forced without ANSI colors`() {
        val execution = execute("inspect", fixtureJar().toString(), "--pretty", "--no-color")

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertTrue(execution.stdout.contains("JVM ARTIFACT STATS"))
        assertTrue(!execution.stdout.contains("\u001B["))
    }

    @Test
    fun `json and pretty modes are mutually exclusive`() {
        val execution = execute("inspect", fixtureJar().toString(), "--json", "--pretty")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertTrue(execution.stderr.contains("cannot be used together"))
    }

    @Test
    fun `invalid coordinates are usage errors and never emit JSON`() {
        val execution = execute("analyze", "g:a:1-SNAPSHOT")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertEquals("", execution.stdout)
        assertTrue(execution.stderr.contains("immutable published release"))
    }

    @Test
    fun `analyze remains an alias for stats`() {
        val execution = execute("analyze", "g:a:1-SNAPSHOT")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertTrue(execution.stderr.contains("immutable published release"))
    }

    @Test
    fun `unknown targets are rejected`() {
        val execution = execute("analyze", "g:a:1", "--target", "android-release")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertEquals("", execution.stdout)
        assertTrue(execution.stderr.contains("Unsupported target profile"))
    }

    @Test
    fun `Android tooling options require the Android target`() {
        val execution = execute("analyze", "g:a:1", "--android-sdk-root", tempDir.toString())

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertEquals("", execution.stdout)
        assertTrue(execution.stderr.contains("require --target android-runtime"))
    }

    @Test
    fun `Java versions below eight are usage errors`() {
        val execution = execute("analyze", "g:a:1", "--java-version", "7")

        assertEquals(ExitCode.USAGE, execution.exitCode)
        assertEquals("", execution.stdout)
        assertTrue(execution.stderr.contains("Java version must be at least 8"))
    }

    @Test
    fun `help is successful`() {
        val execution = execute("--help")

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertTrue(execution.stdout.contains("stats"))
        assertTrue(execution.stdout.contains("inspect"))
        assertEquals("", execution.stderr)
    }

    @Test
    fun `version follows the published implementation version`() {
        val execution = execute("--version")

        assertEquals(ExitCode.SUCCESS, execution.exitCode)
        assertTrue(execution.stdout.matches(Regex("jvm-package-stats \\d+\\.\\d+\\.\\d+.*\\R")))
        assertEquals("", execution.stderr)
    }

    private fun fixtureJar(): Path {
        val jar = tempDir.resolve("fixture.jar")
        ZipOutputStream(Files.newOutputStream(jar)).use { output ->
            output.putNextEntry(ZipEntry("example/resource.txt"))
            output.write(byteArrayOf(1, 2, 3))
            output.closeEntry()
        }
        return jar
    }

    private fun execute(vararg args: String): Execution = executeWithMode(interactiveOutput = false, args)

    private fun executeInteractive(vararg args: String): Execution = executeWithMode(interactiveOutput = true, args)

    private fun executeWithMode(
        interactiveOutput: Boolean,
        args: Array<out String>,
    ): Execution {
        val stdout = StringWriter()
        val stderr = StringWriter()
        val exitCode =
            JvmPackageBuildStatsCli(
                PackageBuildStatsAnalyzer(
                    PackageBuildStatsConfig(),
                ),
            ).execute(
                args = arrayOf(*args),
                out = PrintWriter(stdout, true),
                err = PrintWriter(stderr, true),
                interactiveOutput = interactiveOutput,
            )
        return Execution(exitCode, stdout.toString(), stderr.toString())
    }

    private data class Execution(
        val exitCode: Int,
        val stdout: String,
        val stderr: String,
    )
}
