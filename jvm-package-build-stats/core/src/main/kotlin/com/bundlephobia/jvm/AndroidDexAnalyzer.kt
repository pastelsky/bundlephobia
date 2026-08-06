package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.AndroidDexStats
import com.bundlephobia.jvm.model.AndroidDexStatus
import com.bundlephobia.jvm.model.AndroidPreflightStats
import com.bundlephobia.jvm.model.AndroidToolchainProfile
import com.bundlephobia.jvm.model.AndroidToolingStatus
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.DiagnosticSeverity
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.RetryClassification
import java.io.IOException
import java.io.InputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.file.Files
import java.nio.file.Path
import java.util.Comparator
import java.util.concurrent.TimeUnit
import java.util.zip.ZipFile

internal data class AndroidDexResult(
    val stats: AndroidDexStats,
    val diagnostics: List<Diagnostic> = emptyList(),
)

/** Runs pinned D8 over the selected runtime closure and reads only aggregate DEX header counts. */
internal class AndroidDexAnalyzer(
    private val config: PackageBuildStatsConfig,
) {
    fun analyze(
        resolution: ResolutionStats,
        preflight: AndroidPreflightStats,
        cancellation: AnalysisCancellation,
    ): AndroidDexResult {
        val profile = preflight.selectedProfile ?: return skipped(preflight)
        if (preflight.toolingStatus !in setOf(AndroidToolingStatus.READY, AndroidToolingStatus.INSTALLED)) {
            return skipped(preflight, profile)
        }
        val sdkRoot = config.androidSdkRoot ?: return skipped(preflight, profile)
        val workDirectory =
            config.temporaryDirectory?.let { parent ->
                Files.createDirectories(parent)
                Files.createTempDirectory(parent, "jvm-android-dex-")
            } ?: Files.createTempDirectory("jvm-android-dex-")
        return try {
            analyze(workDirectory, sdkRoot, profile, preflight, resolution, cancellation)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            failed(preflight, profile, "DEX analysis was cancelled", RetryClassification.RETRYABLE)
        } catch (_: Exception) {
            failed(preflight, profile, "D8 could not measure the selected Android runtime closure")
        } finally {
            deleteRecursively(workDirectory)
        }
    }

    private fun analyze(
        workDirectory: Path,
        sdkRoot: Path,
        profile: AndroidToolchainProfile,
        preflight: AndroidPreflightStats,
        resolution: ResolutionStats,
        cancellation: AnalysisCancellation,
    ): AndroidDexResult {
        val d8 = d8Executable(sdkRoot, profile)
        val androidJar = sdkRoot.resolve("platforms/android-${profile.platformName}/android.jar")
        check(Files.isRegularFile(d8)) { "D8 executable is missing" }
        check(Files.isRegularFile(androidJar)) { "Android platform is missing" }
        val inputs = prepareInputs(workDirectory.resolve("inputs"), resolution)
        check(inputs.isNotEmpty()) { "No JVM bytecode was selected" }
        if (cancellation.isCancelled()) {
            return failed(preflight, profile, "DEX analysis was cancelled", RetryClassification.RETRYABLE)
        }

        val output = workDirectory.resolve("output")
        Files.createDirectories(output)
        val command =
            buildList {
                add(d8.toAbsolutePath().normalize().toString())
                add("--release")
                add("--min-api")
                add(preflight.effectiveMinSdk.toString())
                add("--lib")
                add(androidJar.toAbsolutePath().normalize().toString())
                add("--output")
                add(output.toAbsolutePath().normalize().toString())
                inputs.forEach { add(it.toAbsolutePath().normalize().toString()) }
            }
        val processBuilder =
            ProcessBuilder(command)
                .directory(workDirectory.toFile())
                .redirectErrorStream(true)
        processBuilder.environment()["JAVA_HOME"] =
            Path
                .of(System.getProperty("java.home"))
                .toAbsolutePath()
                .normalize()
                .toString()
        val process = processBuilder.start()
        val processOutput = BoundedProcessOutput(process.inputStream, config.diagnosticOutputLimitBytes)
        val outputThread =
            Thread(processOutput, "jvm-android-d8-output").apply {
                isDaemon = true
                start()
            }
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(config.androidDexTimeoutMilliseconds)
        while (process.isAlive && System.nanoTime() < deadline && !cancellation.isCancelled()) {
            process.waitFor(PROCESS_POLL_MILLISECONDS, TimeUnit.MILLISECONDS)
        }
        val timedOut = process.isAlive && System.nanoTime() >= deadline
        if (process.isAlive) stop(process)
        outputThread.join(PROCESS_OUTPUT_JOIN_MILLISECONDS)
        if (cancellation.isCancelled()) {
            return failed(preflight, profile, "DEX analysis was cancelled", RetryClassification.RETRYABLE)
        }
        if (timedOut) {
            return failed(
                preflight,
                profile,
                "DEX analysis exceeded ${config.androidDexTimeoutMilliseconds} ms",
                RetryClassification.RETRYABLE,
            )
        }
        if (process.exitValue() != 0) {
            val boundedOutput = if (outputThread.isAlive) "" else processOutput.text()
            val detail =
                boundedOutput
                    .takeIf(String::isNotEmpty)
                    ?.let { ": $it" }
                    .orEmpty()
            return failed(preflight, profile, "D8 exited with status ${process.exitValue()}$detail")
        }
        return complete(preflight, profile, readDexFiles(output))
    }

    private fun prepareInputs(
        directory: Path,
        resolution: ResolutionStats,
    ): List<Path> {
        Files.createDirectories(directory)
        val result = mutableListOf<Path>()
        var extractedBytes = 0L
        resolution.artifacts
            .distinctBy { it.digest.value }
            .sortedBy { it.digest.value }
            .forEachIndexed { artifactIndex, artifact ->
                val path = Path.of(artifact.path)
                when (artifact.extension) {
                    "jar" -> {
                        result.add(path)
                    }

                    "aar" -> {
                        ZipFile(path.toFile()).use { archive ->
                            val nestedJars =
                                archive
                                    .entries()
                                    .asSequence()
                                    .filter { entry ->
                                        !entry.isDirectory &&
                                            (
                                                entry.name == "classes.jar" ||
                                                    (entry.name.startsWith("libs/") && entry.name.endsWith(".jar"))
                                            )
                                    }.sortedBy { it.name }
                                    .take(MAX_NESTED_JARS_PER_AAR + 1)
                                    .toList()
                            check(nestedJars.size <= MAX_NESTED_JARS_PER_AAR) { "AAR contains too many nested JARs" }
                            nestedJars.forEachIndexed { nestedIndex, entry ->
                                val target = directory.resolve("$artifactIndex-$nestedIndex.jar")
                                archive.getInputStream(entry).use { input ->
                                    Files.newOutputStream(target).use { output ->
                                        extractedBytes += copyBounded(input, output)
                                    }
                                }
                                check(extractedBytes <= MAX_TOTAL_EXTRACTED_JAR_BYTES) {
                                    "Extracted AAR bytecode exceeds D8 input limit"
                                }
                                result.add(target)
                            }
                        }
                    }
                }
                check(result.size <= MAX_DEX_INPUTS) { "Runtime closure contains too many D8 inputs" }
            }
        return result
    }

    private fun copyBounded(
        input: java.io.InputStream,
        output: java.io.OutputStream,
    ): Long {
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            check(total <= MAX_NESTED_JAR_BYTES) { "Nested JAR exceeds D8 input limit" }
            output.write(buffer, 0, read)
        }
        return total
    }

    private fun readDexFiles(directory: Path): List<DexHeaderStats> {
        val paths =
            Files.list(directory).use { stream ->
                stream
                    .filter { path -> path.fileName.toString().matches(DEX_FILE_PATTERN) }
                    .sorted()
                    .limit(MAX_DEX_FILES.toLong() + 1)
                    .toList()
            }
        check(paths.isNotEmpty()) { "D8 produced no DEX files" }
        check(paths.size <= MAX_DEX_FILES) { "D8 produced too many DEX files" }
        return paths.map(::readDexHeader)
    }

    private fun readDexHeader(path: Path): DexHeaderStats {
        val fileBytes = Files.size(path)
        check(fileBytes >= DEX_HEADER_BYTES) { "DEX header is truncated" }
        val bytes = Files.newInputStream(path).use { it.readNBytes(DEX_HEADER_BYTES) }
        check(bytes.copyOfRange(0, DEX_MAGIC_PREFIX.size).contentEquals(DEX_MAGIC_PREFIX)) { "DEX magic is invalid" }
        val header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        val declaredBytes = Integer.toUnsignedLong(header.getInt(FILE_SIZE_OFFSET))
        check(declaredBytes == fileBytes) { "DEX file size does not match its header" }
        return DexHeaderStats(
            bytes = fileBytes,
            methods = Integer.toUnsignedLong(header.getInt(METHOD_IDS_SIZE_OFFSET)),
            fields = Integer.toUnsignedLong(header.getInt(FIELD_IDS_SIZE_OFFSET)),
            classes = Integer.toUnsignedLong(header.getInt(CLASS_DEFS_SIZE_OFFSET)),
        )
    }

    private fun complete(
        preflight: AndroidPreflightStats,
        profile: AndroidToolchainProfile,
        files: List<DexHeaderStats>,
    ): AndroidDexResult =
        AndroidDexResult(
            AndroidDexStats(
                status = AndroidDexStatus.COMPLETE,
                dexBytes = files.sumOf(DexHeaderStats::bytes),
                dexFiles = files.size,
                referencedMethods = files.sumOf(DexHeaderStats::methods),
                maxReferencedMethodsPerDex = files.maxOf(DexHeaderStats::methods),
                referencedFields = files.sumOf(DexHeaderStats::fields),
                definedClasses = files.sumOf(DexHeaderStats::classes),
                minSdk = preflight.effectiveMinSdk,
                buildToolsVersion = profile.buildToolsVersion,
            ),
        )

    private fun skipped(
        preflight: AndroidPreflightStats,
        profile: AndroidToolchainProfile? = preflight.selectedProfile,
    ): AndroidDexResult =
        AndroidDexResult(
            AndroidDexStats(
                status = AndroidDexStatus.SKIPPED,
                minSdk = preflight.effectiveMinSdk,
                buildToolsVersion = profile?.buildToolsVersion ?: "unavailable",
            ),
        )

    private fun failed(
        preflight: AndroidPreflightStats,
        profile: AndroidToolchainProfile,
        summary: String,
        retry: RetryClassification = RetryClassification.UNKNOWN,
    ): AndroidDexResult =
        AndroidDexResult(
            stats =
                AndroidDexStats(
                    status = AndroidDexStatus.FAILED,
                    minSdk = preflight.effectiveMinSdk,
                    buildToolsVersion = profile.buildToolsVersion,
                ),
            diagnostics =
                listOf(
                    Diagnostic(
                        code = "ANDROID_DEX_ANALYSIS_FAILED",
                        summary = summary,
                        stage = AnalysisStage.DEX_ANALYSIS,
                        severity = DiagnosticSeverity.ERROR,
                        retry = retry,
                    ),
                ),
        )

    private fun d8Executable(
        sdkRoot: Path,
        profile: AndroidToolchainProfile,
    ): Path {
        val directory = sdkRoot.resolve("build-tools/${profile.buildToolsVersion}")
        val executable = directory.resolve("d8")
        return if (Files.isRegularFile(executable)) executable else directory.resolve("d8.bat")
    }

    private fun stop(process: Process) {
        process.destroy()
        if (!process.waitFor(PROCESS_SHUTDOWN_SECONDS, TimeUnit.SECONDS)) {
            process.destroyForcibly()
            process.waitFor()
        }
    }

    private fun deleteRecursively(directory: Path) {
        if (!Files.exists(directory)) return
        try {
            Files.walk(directory).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach { path -> Files.deleteIfExists(path) }
            }
        } catch (_: IOException) {
            // Temporary evidence is best-effort cleanup and is never returned to callers.
        }
    }

    private data class DexHeaderStats(
        val bytes: Long,
        val methods: Long,
        val fields: Long,
        val classes: Long,
    )

    private class BoundedProcessOutput(
        private val input: InputStream,
        limit: Int,
    ) : Runnable {
        private val tail = ByteArray(limit)
        private var totalBytes = 0L

        override fun run() {
            try {
                input.use { stream ->
                    val chunk = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = stream.read(chunk)
                        if (read < 0) break
                        repeat(read) { index ->
                            if (tail.isNotEmpty()) tail[(totalBytes % tail.size).toInt()] = chunk[index]
                            totalBytes++
                        }
                    }
                }
            } catch (_: IOException) {
                // Process termination may close the pipe while the collector is draining it.
            }
        }

        fun text(): String {
            if (tail.isEmpty() || totalBytes == 0L) return ""
            val size = minOf(totalBytes, tail.size.toLong()).toInt()
            val bytes = ByteArray(size)
            val start = if (totalBytes <= tail.size.toLong()) 0 else (totalBytes % tail.size).toInt()
            repeat(size) { index -> bytes[index] = tail[(start + index) % tail.size] }
            return bytes
                .toString(Charsets.UTF_8)
                .lineSequence()
                .map(String::trim)
                .filter(String::isNotEmpty)
                .joinToString(" | ")
        }
    }

    private companion object {
        const val PROCESS_POLL_MILLISECONDS = 100L
        const val PROCESS_SHUTDOWN_SECONDS = 5L
        const val PROCESS_OUTPUT_JOIN_MILLISECONDS = 1_000L
        const val DEX_HEADER_BYTES = 112
        const val FILE_SIZE_OFFSET = 32
        const val FIELD_IDS_SIZE_OFFSET = 80
        const val METHOD_IDS_SIZE_OFFSET = 88
        const val CLASS_DEFS_SIZE_OFFSET = 96
        const val MAX_NESTED_JARS_PER_AAR = 32
        const val MAX_NESTED_JAR_BYTES = 256L * 1024 * 1024
        const val MAX_TOTAL_EXTRACTED_JAR_BYTES = 512L * 1024 * 1024
        const val MAX_DEX_INPUTS = 1_024
        const val MAX_DEX_FILES = 1_024
        val DEX_MAGIC_PREFIX = byteArrayOf('d'.code.toByte(), 'e'.code.toByte(), 'x'.code.toByte(), '\n'.code.toByte())
        val DEX_FILE_PATTERN = Regex("classes(?:\\d+)?\\.dex")
    }
}

private val AndroidToolchainProfile.platformName: String
    get() = compileSdkPreview ?: compileSdk.toString()
