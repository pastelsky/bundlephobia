package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.AndroidArtifactRequirement
import com.bundlephobia.jvm.model.AndroidPreflightStats
import com.bundlephobia.jvm.model.AndroidRequirementConfidence
import com.bundlephobia.jvm.model.AndroidSdkChannel
import com.bundlephobia.jvm.model.AndroidToolchainProfile
import com.bundlephobia.jvm.model.AndroidToolingStatus
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.DiagnosticSeverity
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.RetryClassification
import java.io.ByteArrayInputStream
import java.nio.channels.FileChannel
import java.nio.channels.FileLock
import java.nio.channels.OverlappingFileLockException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.util.Properties
import java.util.concurrent.TimeUnit
import java.util.zip.ZipFile

internal data class AndroidPreflightResult(
    val stats: AndroidPreflightStats,
    val diagnostics: List<Diagnostic>,
)

/** Reads bounded AAR metadata before any Android compiler, D8, or R8 process starts. */
internal class AndroidPreflightAnalyzer(
    private val config: PackageBuildStatsConfig,
) {
    fun analyze(
        resolution: ResolutionStats,
        cancellation: AnalysisCancellation,
    ): AndroidPreflightResult {
        val aarArtifacts = resolution.artifacts.filter { it.extension == AAR_EXTENSION }
        val requirements = aarArtifacts.mapNotNull(::inspect)
        val baselineCompileSdk =
            config.androidProfiles
                .filter { it.channel == AndroidSdkChannel.STABLE }
                .minOfOrNull(AndroidToolchainProfile::compileSdk)
                ?: config.androidProfiles.minOf(AndroidToolchainProfile::compileSdk)
        val requiredMinSdk = maxOf(config.androidBaselineMinSdk, requirements.mapNotNull { it.minSdk }.maxOrNull() ?: 0)
        val requiredCompileSdk = maxOf(baselineCompileSdk, requirements.mapNotNull { it.minCompileSdk }.maxOrNull() ?: 0)
        val requiredExtension = requirements.mapNotNull { it.minCompileSdkExtension }.maxOrNull() ?: 0
        val requiredPreviews = requirements.mapNotNull { it.compileSdkPreview }.distinct().sorted()
        val requiredPreview = requiredPreviews.singleOrNull()
        val requiredAgp = requirements.mapNotNull { it.minAgpVersion }.maxWithOrNull(::compareVersions)
        val selected =
            config.androidProfiles
                .sortedWith(compareBy<AndroidToolchainProfile>({ it.channel }, { it.compileSdk }, { it.compileSdkExtension }))
                .firstOrNull { profile ->
                    profile.compileSdk >= requiredCompileSdk &&
                        profile.compileSdkExtension >= requiredExtension &&
                        (requiredPreview == null || profile.compileSdkPreview == requiredPreview) &&
                        (requiredPreview != null || profile.compileSdkPreview == null) &&
                        requiredPreviews.size <= 1 &&
                        (requiredAgp == null || compareVersions(profile.agpVersion, requiredAgp) >= 0)
                }

        val diagnostics = mutableListOf<Diagnostic>()
        val tooling =
            if (selected == null) {
                ToolingResult(AndroidToolingStatus.UNSUPPORTED)
            } else {
                AndroidToolchainProvisioner(config).ensure(selected, cancellation)
            }
        diagnostics += tooling.diagnostics
        if (selected == null) {
            diagnostics +=
                Diagnostic(
                    code = "ANDROID_PROFILE_UNSUPPORTED",
                    summary =
                        "No configured Android profile satisfies compileSdk $requiredCompileSdk" +
                            (if (requiredExtension > 0) " extension $requiredExtension" else "") +
                            (requiredPreviews.takeIf { it.isNotEmpty() }?.joinToString(prefix = " preview ") ?: "") +
                            (requiredAgp?.let { " and AGP $it" } ?: ""),
                    stage = AnalysisStage.ANDROID_PREFLIGHT,
                )
        }
        val inspectedCount = requirements.size
        if (inspectedCount < aarArtifacts.size) {
            diagnostics +=
                Diagnostic(
                    code = "ANDROID_METADATA_UNREADABLE",
                    summary = "Could not inspect compatibility metadata in ${aarArtifacts.size - inspectedCount} AAR artifact(s)",
                    stage = AnalysisStage.ANDROID_PREFLIGHT,
                    severity = DiagnosticSeverity.WARNING,
                    retry = RetryClassification.UNKNOWN,
                )
        }
        val compact = requirements.sortedBy { it.coordinate.notation }.take(ARTIFACT_REQUIREMENT_LIMIT)
        return AndroidPreflightResult(
            stats =
                AndroidPreflightStats(
                    requiredMinSdk = requiredMinSdk,
                    requiredCompileSdk = requiredCompileSdk,
                    requiredCompileSdkExtension = requiredExtension,
                    requiredCompileSdkPreview = requiredPreview,
                    requiredAgpVersion = requiredAgp,
                    confidence = confidence(aarArtifacts, requirements),
                    selectedProfile = selected,
                    effectiveMinSdk = requiredMinSdk,
                    toolingStatus = tooling.status,
                    missingToolingPackages = tooling.missingPackages,
                    artifactRequirements = compact,
                    artifactRequirementCount = requirements.size,
                    artifactRequirementsTruncated = requirements.size > compact.size,
                ),
            diagnostics = diagnostics,
        )
    }

    private fun inspect(artifact: ResolvedArtifact): AndroidArtifactRequirement? =
        runCatching {
            ZipFile(Path.of(artifact.path).toFile()).use { archive ->
                val metadataEntry = archive.getEntry(AAR_METADATA_PATH)
                val metadata =
                    metadataEntry?.let { entry ->
                        val bytes = archive.getInputStream(entry).use { it.readNBytes(MAX_METADATA_BYTES + 1) }
                        check(bytes.size <= MAX_METADATA_BYTES) { "AAR metadata exceeds limit" }
                        Properties().apply { load(ByteArrayInputStream(bytes)) }
                    }
                val manifestEntry = archive.getEntry(ANDROID_MANIFEST_PATH)
                val minSdk =
                    manifestEntry?.let { entry ->
                        val bytes = archive.getInputStream(entry).use { it.readNBytes(MAX_MANIFEST_BYTES + 1) }
                        check(bytes.size <= MAX_MANIFEST_BYTES) { "Android manifest exceeds limit" }
                        MIN_SDK_PATTERN
                            .find(bytes.toString(Charsets.UTF_8))
                            ?.groupValues
                            ?.get(1)
                            ?.toIntOrNull()
                    }
                AndroidArtifactRequirement(
                    coordinate = artifact.coordinate,
                    fileName = artifact.fileName,
                    minSdk = minSdk,
                    minCompileSdk = metadata?.getProperty("minCompileSdk")?.toIntOrNull(),
                    minCompileSdkExtension = metadata?.getProperty("minCompileSdkExtension")?.toIntOrNull(),
                    compileSdkPreview = metadata?.getProperty("forceCompileSdkPreview")?.takeIf(String::isNotBlank),
                    minAgpVersion = metadata?.getProperty("minAndroidGradlePluginVersion")?.takeIf(String::isNotBlank),
                    metadataDeclared = metadata != null,
                )
            }
        }.getOrNull()

    private fun confidence(
        artifacts: List<ResolvedArtifact>,
        requirements: List<AndroidArtifactRequirement>,
    ): AndroidRequirementConfidence =
        when {
            artifacts.isEmpty() -> {
                AndroidRequirementConfidence.INFERRED
            }

            requirements.size == artifacts.size && requirements.all(AndroidArtifactRequirement::metadataDeclared) -> {
                AndroidRequirementConfidence.DECLARED
            }

            requirements.isNotEmpty() -> {
                AndroidRequirementConfidence.INFERRED
            }

            else -> {
                AndroidRequirementConfidence.UNKNOWN
            }
        }

    private companion object {
        const val AAR_EXTENSION = "aar"
        const val AAR_METADATA_PATH = "META-INF/com/android/build/gradle/aar-metadata.properties"
        const val ANDROID_MANIFEST_PATH = "AndroidManifest.xml"
        const val MAX_METADATA_BYTES = 64 * 1024
        const val MAX_MANIFEST_BYTES = 1024 * 1024
        const val ARTIFACT_REQUIREMENT_LIMIT = 20
        val MIN_SDK_PATTERN = Regex("""minSdkVersion\s*=\s*[\"'](\d+)[\"']""")
    }
}

internal data class ToolingResult(
    val status: AndroidToolingStatus,
    val missingPackages: List<String> = emptyList(),
    val diagnostics: List<Diagnostic> = emptyList(),
)

/** Installs only the two immutable SDK packages selected by an allowlisted profile. */
internal class AndroidToolchainProvisioner(
    private val config: PackageBuildStatsConfig,
) {
    fun ensure(
        profile: AndroidToolchainProfile,
        cancellation: AnalysisCancellation,
    ): ToolingResult =
        try {
            ensureInstalled(profile, cancellation)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            cancelled(packageIds(profile))
        } catch (_: Exception) {
            failure(packageIds(profile), "Could not inspect or provision the selected Android SDK packages")
        }

    private fun ensureInstalled(
        profile: AndroidToolchainProfile,
        cancellation: AnalysisCancellation,
    ): ToolingResult {
        val packages = packageIds(profile)
        val sdkRoot =
            config.androidSdkRoot
                ?: return missing(packages, "Android SDK root is not configured")
        var missing = missingPackages(sdkRoot, profile)
        if (missing.isEmpty()) return ToolingResult(AndroidToolingStatus.READY)
        if (!config.installMissingAndroidTooling) return missing(missing, "Selected Android SDK packages are not installed")
        val sdkManager =
            config.androidSdkManagerExecutable
                ?: return missing(missing, "sdkmanager executable is not configured")
        if (!Files.isRegularFile(sdkManager)) return missing(missing, "Configured sdkmanager executable does not exist")

        Files.createDirectories(sdkRoot)
        val lockDirectory = sdkRoot.resolve(".bundlephobia")
        Files.createDirectories(lockDirectory)
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(config.androidToolingInstallTimeoutMilliseconds)
        FileChannel
            .open(
                lockDirectory.resolve("sdk-install.lock"),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE,
            ).use { channel ->
                var installLock: FileLock? = null
                while (installLock == null && !cancellation.isCancelled() && System.nanoTime() < deadline) {
                    installLock =
                        try {
                            channel.tryLock()
                        } catch (_: OverlappingFileLockException) {
                            null
                        }
                    if (installLock == null) {
                        try {
                            Thread.sleep(PROCESS_POLL_MILLISECONDS)
                        } catch (_: InterruptedException) {
                            Thread.currentThread().interrupt()
                            return cancelled(missing)
                        }
                    }
                }
                if (installLock == null) {
                    return if (cancellation.isCancelled()) {
                        cancelled(missing)
                    } else {
                        failure(missing, "Timed out waiting for the SDK install lock")
                    }
                }
                installLock.use {
                    missing = missingPackages(sdkRoot, profile)
                    if (missing.isEmpty()) return ToolingResult(AndroidToolingStatus.READY)
                    if (cancellation.isCancelled()) return cancelled(missing)
                    val process =
                        ProcessBuilder(
                            listOf(
                                sdkManager.toAbsolutePath().normalize().toString(),
                                "--sdk_root=${sdkRoot.toAbsolutePath().normalize()}",
                            ) + missing,
                        ).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                            .redirectError(ProcessBuilder.Redirect.DISCARD)
                            .start()
                    while (process.isAlive && System.nanoTime() < deadline && !cancellation.isCancelled()) {
                        process.waitFor(PROCESS_POLL_MILLISECONDS, TimeUnit.MILLISECONDS)
                    }
                    if (process.isAlive) {
                        process.destroy()
                        if (!process.waitFor(PROCESS_SHUTDOWN_SECONDS, TimeUnit.SECONDS)) {
                            process.destroyForcibly()
                            process.waitFor()
                        }
                    }
                    if (cancellation.isCancelled()) return cancelled(missing)
                    missing = missingPackages(sdkRoot, profile)
                    if (process.exitValue() != 0 || missing.isNotEmpty()) {
                        return failure(missing.ifEmpty { packages }, "sdkmanager could not install the selected Android SDK packages")
                    }
                }
            }
        return ToolingResult(AndroidToolingStatus.INSTALLED)
    }

    private fun packageIds(profile: AndroidToolchainProfile): List<String> =
        listOf("platforms;android-${profile.platformName}", "build-tools;${profile.buildToolsVersion}")

    private fun missingPackages(
        root: Path,
        profile: AndroidToolchainProfile,
    ): List<String> =
        buildList {
            if (!Files.isRegularFile(root.resolve("platforms/android-${profile.platformName}/android.jar"))) {
                add("platforms;android-${profile.platformName}")
            }
            val buildTools = root.resolve("build-tools/${profile.buildToolsVersion}")
            if (!Files.isRegularFile(buildTools.resolve("d8")) && !Files.isRegularFile(buildTools.resolve("d8.bat"))) {
                add("build-tools;${profile.buildToolsVersion}")
            }
        }

    private fun missing(
        packages: List<String>,
        summary: String,
    ): ToolingResult =
        ToolingResult(
            status = AndroidToolingStatus.MISSING,
            missingPackages = packages,
            diagnostics = listOf(diagnostic("ANDROID_TOOLING_MISSING", summary, DiagnosticSeverity.WARNING)),
        )

    private fun failure(
        packages: List<String>,
        summary: String,
    ): ToolingResult =
        ToolingResult(
            status = AndroidToolingStatus.MISSING,
            missingPackages = packages,
            diagnostics = listOf(diagnostic("ANDROID_TOOLING_INSTALL_FAILED", summary, DiagnosticSeverity.ERROR)),
        )

    private fun cancelled(packages: List<String>): ToolingResult =
        ToolingResult(
            status = AndroidToolingStatus.MISSING,
            missingPackages = packages,
            diagnostics =
                listOf(
                    Diagnostic(
                        code = "ANDROID_TOOLING_INSTALL_CANCELLED",
                        summary = "Android SDK package installation was cancelled",
                        stage = AnalysisStage.TOOLCHAIN_PROVISIONING,
                        severity = DiagnosticSeverity.WARNING,
                        retry = RetryClassification.RETRYABLE,
                    ),
                ),
        )

    private fun diagnostic(
        code: String,
        summary: String,
        severity: DiagnosticSeverity,
    ): Diagnostic =
        Diagnostic(
            code = code,
            summary = summary,
            stage = AnalysisStage.TOOLCHAIN_PROVISIONING,
            severity = severity,
            retry = RetryClassification.UNKNOWN,
        )

    private companion object {
        const val PROCESS_POLL_MILLISECONDS = 100L
        const val PROCESS_SHUTDOWN_SECONDS = 5L
    }
}

private val AndroidToolchainProfile.platformName: String
    get() = compileSdkPreview ?: compileSdk.toString()

private fun compareVersions(
    left: String,
    right: String,
): Int {
    val leftParts = VERSION_NUMBER.findAll(left).map { it.value.toInt() }.toList()
    val rightParts = VERSION_NUMBER.findAll(right).map { it.value.toInt() }.toList()
    repeat(maxOf(leftParts.size, rightParts.size)) { index ->
        val comparison = (leftParts.getOrNull(index) ?: 0).compareTo(rightParts.getOrNull(index) ?: 0)
        if (comparison != 0) return comparison
    }
    val leftQualifier = VERSION_QUALIFIER.find(left)?.value.orEmpty()
    val rightQualifier = VERSION_QUALIFIER.find(right)?.value.orEmpty()
    return when {
        leftQualifier.isEmpty() && rightQualifier.isNotEmpty() -> 1
        leftQualifier.isNotEmpty() && rightQualifier.isEmpty() -> -1
        else -> leftQualifier.compareTo(rightQualifier)
    }
}

private val VERSION_NUMBER = Regex("\\d+")
private val VERSION_QUALIFIER = Regex("[A-Za-z].*$")
