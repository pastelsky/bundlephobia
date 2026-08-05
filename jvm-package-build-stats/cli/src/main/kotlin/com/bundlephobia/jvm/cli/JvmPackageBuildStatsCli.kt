package com.bundlephobia.jvm.cli

import com.bundlephobia.jvm.PackageBuildStatsAnalyzer
import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.InvalidCoordinateException
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TargetProfile
import picocli.CommandLine
import picocli.CommandLine.Command
import picocli.CommandLine.Model.CommandSpec
import picocli.CommandLine.Option
import picocli.CommandLine.Parameters
import picocli.CommandLine.Spec
import java.io.PrintWriter
import java.nio.file.Path
import java.util.concurrent.Callable

public class JvmPackageBuildStatsCli(
    private val analyzer: PackageBuildStatsAnalyzer = PackageBuildStatsAnalyzer(),
) {
    public fun execute(
        args: Array<String>,
        out: PrintWriter = PrintWriter(System.out, true),
        err: PrintWriter = PrintWriter(System.err, true),
    ): Int {
        val commandLine =
            CommandLine(RootCommand())
                .addSubcommand("analyze", AnalyzeCommand(analyzer))
                .addSubcommand("inspect", InspectCommand(analyzer))
                .setOut(out)
                .setErr(err)
        return commandLine.execute(*args)
    }
}

@Command(
    name = "jvm-package-build-stats",
    description = ["Analyze published JVM package size and dependency statistics."],
    mixinStandardHelpOptions = true,
    version = ["jvm-package-build-stats 0.0.0-SNAPSHOT"],
)
private class RootCommand : Runnable {
    @Spec private lateinit var spec: CommandSpec

    override fun run() {
        spec.commandLine().usage(spec.commandLine().out)
    }
}

@Command(
    name = "analyze",
    description = ["Analyze one exact Maven coordinate."],
    mixinStandardHelpOptions = true,
)
private class AnalyzeCommand(
    private val analyzer: PackageBuildStatsAnalyzer,
) : Callable<Int> {
    @Spec private lateinit var spec: CommandSpec

    @Parameters(index = "0", paramLabel = "GROUP:ARTIFACT:VERSION")
    private lateinit var coordinateValue: String

    @Option(names = ["--target"], defaultValue = "jvm-runtime", paramLabel = "TARGET")
    private lateinit var targetValue: String

    override fun call(): Int {
        val coordinate = parseCoordinate(coordinateValue)
        val target = parseTarget(targetValue)
        val result = analyzer.analyze(AnalyzeRequest(coordinate, target))
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
}

@Command(
    name = "inspect",
    description = ["Inspect one local JAR without executing its contents."],
    mixinStandardHelpOptions = true,
)
private class InspectCommand(
    private val analyzer: PackageBuildStatsAnalyzer,
) : Callable<Int> {
    @Spec private lateinit var spec: CommandSpec

    @Parameters(index = "0", paramLabel = "FILE.jar")
    private lateinit var path: Path

    override fun call(): Int {
        val result = analyzer.inspect(path)
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
