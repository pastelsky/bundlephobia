package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.JvmResolutionResult
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.RetryClassification
import com.bundlephobia.jvm.resolver.ResolverPluginClasspathAnchor
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import java.nio.file.Files
import java.nio.file.Path
import java.util.Comparator
import java.util.concurrent.TimeUnit

internal fun interface ResolverClient {
    fun resolve(coordinate: MavenCoordinate): JvmResolutionResult
}

/** Runs the owned resolver plugin in an empty build whose repositories and tasks are sealed. */
internal class GradleResolverClient(
    private val config: PackageBuildStatsConfig,
) : ResolverClient {
    override fun resolve(coordinate: MavenCoordinate): JvmResolutionResult {
        val directory = Files.createTempDirectory("jvm-package-build-stats-")
        return try {
            writeBuild(directory)
            runGradle(directory, coordinate)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            failure(coordinate, "RESOLUTION_CANCELLED", "Resolution was cancelled", RetryClassification.RETRYABLE)
        } catch (_: Exception) {
            failure(
                coordinate,
                "RESOLVER_PROCESS_FAILED",
                "The sealed Gradle resolver could not start or return a result",
                RetryClassification.UNKNOWN,
            )
        } finally {
            deleteRecursively(directory)
        }
    }

    private fun writeBuild(directory: Path) {
        writeBundledWrapper(directory)
        val classpath =
            listOf(
                ResolverPluginClasspathAnchor::class.java,
                ResultJson::class.java,
                Json::class.java,
                KSerializer::class.java,
                Unit::class.java,
            ).mapNotNull { type ->
                type.protectionDomain
                    ?.codeSource
                    ?.location
                    ?.toURI()
                    ?.let(Path::of)
            }.map { it.toAbsolutePath().normalize() }
                .distinct()

        val files = classpath.joinToString(",\n") { path -> "            \"${path.escapeKotlinString()}\"" }
        Files.writeString(
            directory.resolve("settings.gradle.kts"),
            """
            buildscript {
                dependencies {
                    classpath(files(
            $files
                    ))
                }
            }

            pluginManager.apply(${ResolverPluginClasspathAnchor.PLUGIN_CLASS}::class.java)
            rootProject.name = "jvm-package-build-stats-resolution"
            """.trimIndent() + "\n",
        )
        Files.writeString(
            directory.resolve("build.gradle.kts"),
            "// Intentionally empty: package build logic and plugins are never evaluated.\n",
        )
        Files.writeString(
            directory.resolve("gradle.properties"),
            "org.gradle.daemon=false\norg.gradle.configuration-cache=false\norg.gradle.caching=false\n",
        )
    }

    private fun runGradle(
        directory: Path,
        coordinate: MavenCoordinate,
    ): JvmResolutionResult {
        val process =
            ProcessBuilder(
                gradleCommand(directory),
                "--no-daemon",
                "--console=plain",
                ResolverPluginClasspathAnchor.RESOLVE_TASK_NAME,
                "-P${ResolverPluginClasspathAnchor.COORDINATE_PROPERTY}=${coordinate.notation}",
            ).directory(directory.toFile())
                .redirectOutput(directory.resolve("gradle.stdout").toFile())
                .redirectError(directory.resolve("gradle.stderr").toFile())
                .start()

        val completed =
            try {
                process.waitFor(config.resolutionTimeoutMilliseconds, TimeUnit.MILLISECONDS)
            } catch (error: InterruptedException) {
                stop(process)
                throw error
            }
        if (!completed) {
            stop(process)
            return failure(
                coordinate,
                "RESOLUTION_TIMEOUT",
                "Resolution exceeded ${config.resolutionTimeoutMilliseconds} ms",
                RetryClassification.RETRYABLE,
            )
        }

        val resultFile = directory.resolve("build/jvm-resolver/result.json")
        if (Files.isRegularFile(resultFile)) return ResultJson.decodeResolution(Files.readString(resultFile))
        return failure(
            coordinate,
            "RESOLVER_PROCESS_FAILED",
            "The sealed Gradle resolver exited with status ${process.exitValue()} without a result",
            RetryClassification.UNKNOWN,
        )
    }

    private fun gradleCommand(directory: Path): String {
        config.gradleExecutable?.let { return it.toAbsolutePath().normalize().toString() }
        val executable = if (isWindows()) directory.resolve("gradlew.bat") else directory.resolve("gradlew")
        return executable.toString()
    }

    private fun writeBundledWrapper(directory: Path) {
        BUNDLED_WRAPPER_FILES.forEach { resource ->
            val target = directory.resolve(resource.removePrefix("bundled-gradle/"))
            Files.createDirectories(target.parent)
            val input = requireNotNull(javaClass.classLoader.getResourceAsStream(resource)) { "Missing $resource" }
            input.use { Files.copy(it, target) }
        }
        if (!isWindows()) check(directory.resolve("gradlew").toFile().setExecutable(true)) { "Could not make Gradle wrapper executable" }
    }

    private fun failure(
        coordinate: MavenCoordinate,
        code: String,
        summary: String,
        retry: RetryClassification,
    ): JvmResolutionResult =
        JvmResolutionResult(
            status = ResultStatus.FAILED,
            resolution = ResolutionStats(coordinate),
            diagnostics =
                listOf(
                    Diagnostic(
                        code = code,
                        summary = summary,
                        stage = AnalysisStage.RESOLUTION,
                        retry = retry,
                    ),
                ),
        )

    private fun deleteRecursively(directory: Path) {
        if (!Files.exists(directory)) return
        Files.walk(directory).use { paths ->
            paths.sorted(Comparator.reverseOrder()).forEach { path -> runCatching { Files.deleteIfExists(path) } }
        }
    }

    private fun stop(process: Process) {
        process.destroy()
        if (!process.waitFor(PROCESS_SHUTDOWN_SECONDS, TimeUnit.SECONDS)) process.destroyForcibly()
    }

    private fun Path.escapeKotlinString(): String = toString().replace("\\", "\\\\").replace("\"", "\\\"")

    private companion object {
        private const val PROCESS_SHUTDOWN_SECONDS = 5L
        private val BUNDLED_WRAPPER_FILES =
            listOf(
                "bundled-gradle/gradlew",
                "bundled-gradle/gradlew.bat",
                "bundled-gradle/gradle/wrapper/gradle-wrapper.jar",
                "bundled-gradle/gradle/wrapper/gradle-wrapper.properties",
            )

        private fun isWindows(): Boolean = System.getProperty("os.name").startsWith("Windows", ignoreCase = true)
    }
}
