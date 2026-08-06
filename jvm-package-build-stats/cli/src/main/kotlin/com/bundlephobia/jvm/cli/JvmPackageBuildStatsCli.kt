package com.bundlephobia.jvm.cli

import com.bundlephobia.jvm.PackageBuildStatsAnalyzer
import com.bundlephobia.jvm.PackageBuildStatsConfig
import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.InvalidCoordinateException
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TargetProfile
import picocli.CommandLine
import picocli.CommandLine.Command
import picocli.CommandLine.IVersionProvider
import picocli.CommandLine.Model.CommandSpec
import picocli.CommandLine.Option
import picocli.CommandLine.Parameters
import picocli.CommandLine.Spec
import java.io.PrintWriter
import java.nio.file.Path
import java.util.concurrent.Callable

public class JvmPackageBuildStatsCli(
    private val analyzer: PackageBuildStatsAnalyzer? = null,
) {
    public fun execute(
        args: Array<String>,
        out: PrintWriter = PrintWriter(System.out, true),
        err: PrintWriter = PrintWriter(System.err, true),
    ): Int {
        val commandLine =
            CommandLine(RootCommand())
                .addSubcommand("stats", AnalyzeCommand(analyzer))
                .addSubcommand("inspect", InspectCommand(analyzer))
                .setOut(out)
                .setErr(err)
        return commandLine.execute(*args)
    }
}

@Command(
    name = "jvm-package-stats",
    description = ["Analyze published JVM package size and dependency statistics."],
    mixinStandardHelpOptions = true,
    versionProvider = CliVersionProvider::class,
)
private class RootCommand : Runnable {
    @Spec private lateinit var spec: CommandSpec

    override fun run() {
        spec.commandLine().usage(spec.commandLine().out)
    }
}

private class CliVersionProvider : IVersionProvider {
    override fun getVersion(): Array<String> {
        val version = JvmPackageBuildStatsCli::class.java.`package`.implementationVersion ?: "0.1.0-SNAPSHOT"
        return arrayOf("jvm-package-stats $version")
    }
}

@Command(
    name = "stats",
    aliases = ["analyze"],
    description = ["Analyze one exact Maven coordinate."],
    mixinStandardHelpOptions = true,
)
private class AnalyzeCommand(
    private val analyzer: PackageBuildStatsAnalyzer?,
) : Callable<Int> {
    @Spec private lateinit var spec: CommandSpec

    @Parameters(index = "0", paramLabel = "GROUP:ARTIFACT:VERSION")
    private lateinit var coordinateValue: String

    @Option(names = ["--target"], defaultValue = "jvm-runtime", paramLabel = "TARGET")
    private lateinit var targetValue: String

    @Option(
        names = ["--java-version"],
        defaultValue = "21",
        paramLabel = "VERSION",
        description = ["Consumer Java feature version used for variant and multi-release JAR selection."],
    )
    private var javaVersion: Int = 21

    @Option(names = ["--cache-dir"], paramLabel = "DIRECTORY", description = ["Persistent analysis cache directory."])
    private var cacheDirectory: Path? = null

    @Option(names = ["--gradle-executable"], paramLabel = "FILE", description = ["Gradle executable or wrapper to use for resolution."])
    private var gradleExecutable: Path? = null

    @Option(names = ["--resolution-timeout"], paramLabel = "MILLISECONDS", description = ["Resolution timeout in milliseconds."])
    private var resolutionTimeoutMilliseconds: Long? = null

    override fun call(): Int {
        val coordinate = parseCoordinate(coordinateValue)
        val target = parseTarget(targetValue)
        if (javaVersion < 8) {
            throw CommandLine.ParameterException(spec.commandLine(), "Java version must be at least 8")
        }
        val result = configuredAnalyzer().analyze(AnalyzeRequest(coordinate, target, javaVersion))
        spec.commandLine().out.println(ResultJson.encode(result))
        return if (result.status == ResultStatus.FAILED) ExitCode.ANALYSIS_FAILED else ExitCode.SUCCESS
    }

    private fun parseCoordinate(value: String): MavenCoordinate =
        try {
            MavenCoordinate.parse(value)
        } catch (error: InvalidCoordinateException) {
            throw CommandLine.ParameterException(spec.commandLine(), error.message, error)
        }

    private fun parseTarget(value: String): TargetProfile =
        try {
            TargetProfile.parse(value)
        } catch (error: IllegalArgumentException) {
            throw CommandLine.ParameterException(spec.commandLine(), error.message, error)
        }

    private fun configuredAnalyzer(): PackageBuildStatsAnalyzer {
        if (cacheDirectory == null && gradleExecutable == null && resolutionTimeoutMilliseconds == null) {
            return analyzer ?: PackageBuildStatsAnalyzer()
        }
        val defaults = PackageBuildStatsConfig()
        val timeout = resolutionTimeoutMilliseconds ?: defaults.resolutionTimeoutMilliseconds
        if (timeout <= 0) {
            throw CommandLine.ParameterException(spec.commandLine(), "Resolution timeout must be positive")
        }
        return PackageBuildStatsAnalyzer(
            PackageBuildStatsConfig(
                cacheDirectory = cacheDirectory ?: defaults.cacheDirectory,
                gradleExecutable = gradleExecutable,
                resolutionTimeoutMilliseconds = timeout,
            ),
        )
    }
}

@Command(
    name = "inspect",
    description = ["Inspect one local JAR without executing its contents."],
    mixinStandardHelpOptions = true,
)
private class InspectCommand(
    private val analyzer: PackageBuildStatsAnalyzer?,
) : Callable<Int> {
    @Spec private lateinit var spec: CommandSpec

    @Parameters(index = "0", paramLabel = "FILE.jar")
    private lateinit var path: Path

    @Option(
        names = ["--java-version"],
        defaultValue = "21",
        paramLabel = "VERSION",
        description = ["Java feature version used for the effective multi-release JAR view."],
    )
    private var javaVersion: Int = 21

    override fun call(): Int {
        if (javaVersion < 8) {
            throw CommandLine.ParameterException(spec.commandLine(), "Java version must be at least 8")
        }
        val result = (analyzer ?: PackageBuildStatsAnalyzer()).inspect(path, javaVersion)
        spec.commandLine().out.println(ResultJson.encode(result))
        return if (result.status == ResultStatus.FAILED) ExitCode.ANALYSIS_FAILED else ExitCode.SUCCESS
    }
}

public object ExitCode {
    public const val SUCCESS: Int = 0
    public const val INTERNAL_ERROR: Int = 1
    public const val USAGE: Int = 2
    public const val ANALYSIS_FAILED: Int = 3
}
