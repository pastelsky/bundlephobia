package com.bundlephobia.jvm.cli

import com.bundlephobia.jvm.model.AndroidDexStats
import com.bundlephobia.jvm.model.AndroidDexStatus
import com.bundlephobia.jvm.model.AndroidPreflightStats
import com.bundlephobia.jvm.model.ApiSurfaceStats
import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.DependencySizeStats
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.DiagnosticSeverity
import com.bundlephobia.jvm.model.PackageBuildStatsResult
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TargetProfile
import java.util.Locale
import kotlin.math.roundToInt

/** Concise terminal presentation; the JSON model remains the complete machine-readable contract. */
internal class TerminalRenderer(
    private val color: Boolean,
) {
    fun render(result: PackageBuildStatsResult): String =
        buildString {
            title(if (result.target == TargetProfile.ANDROID_RUNTIME) "ANDROID PACKAGE STATS" else "JVM PACKAGE STATS")
            appendLine(style(BOLD_CYAN, result.coordinate.notation))
            val target = if (result.target == TargetProfile.ANDROID_RUNTIME) "Android runtime" else "JVM runtime"
            appendLine("${status(result.status)}  ${dim("$target · Java ${result.javaVersion}")}")

            section("SIZE")
            metric(
                if (result.target == TargetProfile.ANDROID_RUNTIME) "Runtime archives" else "Published JARs",
                bytes(result.sizes.runtimeArchiveBytes),
            )
            metric("Expanded contents", bytes(result.sizes.runtimeExpandedBytes))
            metric("Requested package", bytes(result.sizes.directArtifactArchiveBytes))
            metric("Dependencies", bytes(result.sizes.transitiveArtifactArchiveBytes))

            result.androidPreflight?.let { preflight -> androidPreflight(preflight) }
            result.androidDex?.let { dex -> androidDex(dex) }

            section("RUNTIME CLOSURE")
            metric("Artifacts", count(result.runtimeClosure.artifacts, result.artifactsTruncated))
            metric("Components", result.runtimeClosure.components.toString())
            metric("Dependency depth", result.runtimeClosure.dependencyDepth.toString())

            dependencies(result.dependencySizes.filterNot(DependencySizeStats::requested), result.dependencySizesTruncated)
            result.directArtifact?.let { artifact -> apiSurface(artifact.apiSurface, "API SURFACE") }
            result.directArtifact?.module?.let { module ->
                section("MODULE")
                metric("Kind", module.kind.name.lowercase())
                module.name?.let { metric("Name", it) }
                if (module.exports.isNotEmpty()) metric("JPMS exports", module.exports.size.toString())
            }
            diagnostics(result.diagnostics, result.diagnosticsTruncated)

            section("TIMING")
            metric("Total", duration(result.timings.totalMilliseconds))
            result.timings.stagesMilliseconds.forEach { (stage, milliseconds) -> metric(stage, duration(milliseconds)) }
        }.trimEnd()

    private fun StringBuilder.androidPreflight(preflight: AndroidPreflightStats) {
        section("ANDROID PREFLIGHT")
        metric("Required minSdk", preflight.requiredMinSdk.toString())
        metric("Required compileSdk", preflight.requiredCompileSdk.toString())
        if (preflight.requiredCompileSdkExtension > 0) {
            metric("SDK extension", preflight.requiredCompileSdkExtension.toString())
        }
        preflight.requiredCompileSdkPreview?.let { metric("SDK preview", it) }
        preflight.requiredAgpVersion?.let { metric("Minimum AGP", it) }
        metric("Profile", preflight.selectedProfile?.id ?: "unsupported")
        metric("Tooling", preflight.toolingStatus.name.lowercase(Locale.ROOT))
        metric("Confidence", preflight.confidence.name.lowercase(Locale.ROOT))
        if (preflight.missingToolingPackages.isNotEmpty()) {
            metric("Missing", preflight.missingToolingPackages.joinToString())
        }
    }

    private fun StringBuilder.androidDex(dex: AndroidDexStats) {
        section("DEX · D8 UNSHRUNK")
        metric("Status", dex.status.name.lowercase(Locale.ROOT))
        if (dex.status == AndroidDexStatus.COMPLETE) {
            dex.dexBytes?.let { metric("DEX size", bytes(it)) }
            metric("DEX files", dex.dexFiles.toString())
            dex.referencedMethods?.let { metric("Method references", it.toString()) }
            dex.maxReferencedMethodsPerDex?.let { metric("Largest DEX methods", it.toString()) }
            dex.referencedFields?.let { metric("Field references", it.toString()) }
            dex.definedClasses?.let { metric("Defined classes", it.toString()) }
        } else if (dex.status == AndroidDexStatus.SKIPPED) {
            metric("Method references", "not measured")
        }
        metric("minSdk", dex.minSdk.toString())
        metric("Build Tools", dex.buildToolsVersion)
    }

    fun render(result: ArtifactAnalysis): String =
        buildString {
            title("JVM ARTIFACT STATS")
            appendLine(style(BOLD + CYAN, result.displayName))
            appendLine(status(result.status))

            section("SIZE")
            result.archiveBytes?.let { metric("Published JAR", bytes(it)) }
            result.expandedBytes?.let { metric("Expanded contents", bytes(it)) }

            if (result.payload.isNotEmpty()) {
                section("CONTENTS")
                result.payload
                    .sortedByDescending { category -> category.expandedBytes }
                    .take(8)
                    .forEach { category -> metric(category.category, bytes(category.expandedBytes)) }
            }

            result.classfiles?.let { classfiles ->
                section("CLASSFILES")
                metric("Analyzed classes", classfiles.analyzedClasses.toString())
                metric("Implementation", classfiles.implementationClasses.toString())
                metric("Kotlin metadata", classfiles.kotlinMetadataClasses.toString())
            }
            apiSurface(result.apiSurface, "API SURFACE")
            result.module?.let { module ->
                section("MODULE")
                metric("Kind", module.kind.name.lowercase())
                module.name?.let { metric("Name", it) }
                if (module.exports.isNotEmpty()) metric("JPMS exports", module.exports.size.toString())
            }
            diagnostics(result.diagnostics, truncated = false)
        }.trimEnd()

    private fun StringBuilder.dependencies(
        dependencies: List<DependencySizeStats>,
        truncated: Boolean,
    ) {
        if (dependencies.isEmpty()) return
        section("LARGEST DEPENDENCIES")
        val largest = dependencies.sortedByDescending(DependencySizeStats::archiveBytes).take(10)
        val maximum = largest.maxOfOrNull(DependencySizeStats::archiveBytes)?.coerceAtLeast(1) ?: 1
        largest.forEach { dependency ->
            val width = ((dependency.archiveBytes.toDouble() / maximum) * BAR_WIDTH).roundToInt().coerceIn(1, BAR_WIDTH)
            val label =
                dependency.coordinate.notation
                    .ellipsize(44)
                    .padEnd(44)
            val bar = "█".repeat(width).padEnd(BAR_WIDTH)
            appendLine("  $label ${style(CYAN, bar)}  ${bytes(dependency.archiveBytes).padStart(10)}")
        }
        if (truncated || dependencies.size > largest.size) appendLine(dim("  Showing ${largest.size} largest contributions"))
    }

    private fun StringBuilder.apiSurface(
        api: ApiSurfaceStats?,
        heading: String,
    ) {
        if (api == null) return
        section(heading)
        metric("Visible types", (api.publicTypes + api.protectedTypes).toString())
        metric("Visible members", (api.publicMembers + api.protectedMembers).toString())
        metric("Visible classfiles", bytes(api.classfileBytes))
        if (api.largestTypes.isNotEmpty()) {
            appendLine(dim("  Largest types"))
            api.largestTypes.take(5).forEach { type ->
                appendLine("  ${type.name.ellipsize(55).padEnd(55)} ${bytes(type.classfileBytes).padStart(10)}")
            }
        }
    }

    private fun StringBuilder.diagnostics(
        diagnostics: List<Diagnostic>,
        truncated: Boolean,
    ) {
        if (diagnostics.isEmpty()) return
        section("NOTES")
        diagnostics.take(8).forEach { diagnostic ->
            val marker =
                when (diagnostic.severity) {
                    DiagnosticSeverity.INFO -> style(CYAN, "i")
                    DiagnosticSeverity.WARNING -> style(YELLOW, "!")
                    DiagnosticSeverity.ERROR -> style(RED, "×")
                }
            appendLine("  $marker ${diagnostic.summary}")
        }
        if (truncated || diagnostics.size > 8) appendLine(dim("  Additional diagnostics are available with --json"))
    }

    private fun StringBuilder.title(value: String) {
        appendLine(style(BOLD_MAGENTA, value))
    }

    private fun StringBuilder.section(value: String) {
        appendLine()
        appendLine(style(BOLD, value))
    }

    private fun StringBuilder.metric(
        label: String,
        value: String,
    ) {
        appendLine("  ${label.padEnd(22)} ${style(BOLD, value)}")
    }

    private fun status(status: ResultStatus): String =
        when (status) {
            ResultStatus.COMPLETE -> style(BOLD_GREEN, "● COMPLETE")
            ResultStatus.PARTIAL -> style(BOLD_YELLOW, "● PARTIAL")
            ResultStatus.FAILED -> style(BOLD_RED, "● FAILED")
        }

    private fun count(
        value: Int,
        truncated: Boolean,
    ): String = if (truncated) "$value total" else value.toString()

    private fun duration(milliseconds: Long): String =
        if (milliseconds < 1_000) "$milliseconds ms" else String.format(Locale.ROOT, "%.2f s", milliseconds / 1_000.0)

    private fun bytes(value: Long): String {
        if (value < 1_024) return "$value B"
        val units = listOf("KiB", "MiB", "GiB", "TiB")
        var scaled = value.toDouble()
        var unit = -1
        do {
            scaled /= 1_024.0
            unit++
        } while (scaled >= 1_024 && unit < units.lastIndex)
        val pattern =
            if (scaled >= 100) {
                "%.0f %s"
            } else if (scaled >= 10) {
                "%.1f %s"
            } else {
                "%.2f %s"
            }
        return String.format(Locale.ROOT, pattern, scaled, units[unit])
    }

    private fun String.ellipsize(maximum: Int): String = if (length <= maximum) this else take(maximum - 1) + "…"

    private fun dim(value: String): String = style(DIM, value)

    private fun style(
        code: String,
        value: String,
    ): String = if (color) "$ESCAPE[$code${SEPARATOR}$value$ESCAPE[${RESET}$SEPARATOR" else value

    private companion object {
        const val BAR_WIDTH = 12
        const val ESCAPE = "\u001B"
        const val SEPARATOR = "m"
        const val RESET = "0"
        const val BOLD = "1"
        const val DIM = "2"
        const val RED = "31"
        const val YELLOW = "33"
        const val CYAN = "36"
        const val BOLD_RED = "1;31"
        const val BOLD_GREEN = "1;32"
        const val BOLD_YELLOW = "1;33"
        const val BOLD_CYAN = "1;36"
        const val BOLD_MAGENTA = "1;35"
    }
}
