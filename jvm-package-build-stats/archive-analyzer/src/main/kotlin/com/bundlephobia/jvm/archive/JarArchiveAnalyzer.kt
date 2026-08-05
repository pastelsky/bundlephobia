package com.bundlephobia.jvm.archive

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.PayloadCategoryStats
import com.bundlephobia.jvm.model.ResultStatus
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.HexFormat
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipException
import java.util.zip.ZipFile

public class JarArchiveAnalyzer
    @JvmOverloads
    constructor(
        private val policy: ArchiveAnalysisPolicy = ArchiveAnalysisPolicy(),
    ) {
        public fun analyze(path: Path): ArtifactAnalysis {
            val displayName = path.fileName?.toString() ?: path.toString()
            if (!Files.isRegularFile(path)) {
                return failed(displayName, "ARCHIVE_NOT_REGULAR_FILE", "Input is not a regular file")
            }

            val archiveBytes =
                try {
                    Files.size(path)
                } catch (error: IOException) {
                    return failed(displayName, "ARCHIVE_READ_FAILED", safeMessage(error))
                }
            if (archiveBytes > policy.maxArchiveBytes) {
                return failed(
                    displayName,
                    "ARCHIVE_SIZE_LIMIT_EXCEEDED",
                    "Archive has $archiveBytes bytes; limit is ${policy.maxArchiveBytes}",
                    archiveBytes = archiveBytes,
                )
            }

            val totals = linkedMapOf<PayloadCategory, MutableCategoryStats>()
            return try {
                ZipFile(path.toFile()).use { archive ->
                    val plans = preflight(archive)
                    for (plan in plans) {
                        val expandedBytes = streamAndCount(archive, plan.entry)
                        if (expandedBytes != plan.expandedBytes) {
                            violation(
                                "ARCHIVE_ENTRY_SIZE_MISMATCH",
                                "Entry ${plan.normalizedPath} declared ${plan.expandedBytes} bytes but streamed $expandedBytes",
                            )
                        }
                        totals
                            .getOrPut(plan.category) { MutableCategoryStats() }
                            .add(plan.compressedBytes, expandedBytes)
                    }

                    val payload = payload(totals)
                    reconcile(plans, payload)
                    val digest = sha256(path)
                    ArtifactAnalysis(
                        status = ResultStatus.COMPLETE,
                        displayName = displayName,
                        digest = ArtifactDigest(value = digest),
                        archiveBytes = archiveBytes,
                        expandedBytes = payload.sumOf(PayloadCategoryStats::expandedBytes),
                        payload = payload,
                    )
                }
            } catch (error: ArchiveViolation) {
                failed(
                    displayName,
                    error.code,
                    error.message,
                    archiveBytes = archiveBytes,
                )
            } catch (error: ZipException) {
                failed(
                    displayName,
                    "MALFORMED_ARCHIVE",
                    safeMessage(error),
                    archiveBytes = archiveBytes,
                )
            } catch (error: IOException) {
                failed(
                    displayName,
                    "ARCHIVE_READ_FAILED",
                    safeMessage(error),
                    archiveBytes = archiveBytes,
                )
            }
        }

        private fun preflight(archive: ZipFile): List<EntryPlan> {
            val entries = ArrayList<ZipEntry>(minOf(policy.maxEntries, 1_024))
            val enumeration = archive.entries()
            while (enumeration.hasMoreElements()) {
                if (entries.size >= policy.maxEntries) {
                    violation(
                        "ARCHIVE_ENTRY_COUNT_LIMIT_EXCEEDED",
                        "Archive has more than ${policy.maxEntries} entries",
                    )
                }
                entries.add(enumeration.nextElement())
            }

            val paths = mutableSetOf<String>()
            var totalExpanded = 0L

            return entries.map { entry ->
                val normalizedPath = normalize(entry.name)
                if (!paths.add(normalizedPath)) {
                    violation(
                        "ARCHIVE_DUPLICATE_PATH",
                        "Archive contains duplicate path: $normalizedPath",
                    )
                }

                val compressedBytes = declaredSize(entry.compressedSize, entry.name, "compressed")
                val expandedBytes = declaredSize(entry.size, entry.name, "expanded")
                if (compressedBytes > policy.maxCompressedEntryBytes) {
                    violation(
                        "ARCHIVE_COMPRESSED_ENTRY_LIMIT_EXCEEDED",
                        "Entry $normalizedPath has $compressedBytes compressed bytes; limit is ${policy.maxCompressedEntryBytes}",
                    )
                }
                if (expandedBytes > policy.maxExpandedEntryBytes) {
                    violation(
                        "ARCHIVE_EXPANDED_ENTRY_LIMIT_EXCEEDED",
                        "Entry $normalizedPath has $expandedBytes expanded bytes; limit is ${policy.maxExpandedEntryBytes}",
                    )
                }
                if (expandedBytes > 0 && expandedBytes.toDouble() / maxOf(1L, compressedBytes) > policy.maxCompressionRatio) {
                    violation(
                        "ARCHIVE_COMPRESSION_RATIO_LIMIT_EXCEEDED",
                        "Entry $normalizedPath exceeds compression-ratio limit ${policy.maxCompressionRatio}",
                    )
                }

                totalExpanded = checkedAdd(totalExpanded, expandedBytes)
                if (totalExpanded > policy.maxTotalExpandedBytes) {
                    violation(
                        "ARCHIVE_TOTAL_EXPANDED_LIMIT_EXCEEDED",
                        "Expanded entry bytes exceed limit ${policy.maxTotalExpandedBytes}",
                    )
                }

                EntryPlan(
                    entry = entry,
                    normalizedPath = normalizedPath,
                    category = classify(normalizedPath),
                    compressedBytes = compressedBytes,
                    expandedBytes = expandedBytes,
                )
            }
        }

        private fun streamAndCount(
            archive: ZipFile,
            entry: ZipEntry,
        ): Long {
            var count = 0L
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            archive.getInputStream(entry).use { input ->
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    count = checkedAdd(count, read.toLong())
                    if (count > policy.maxExpandedEntryBytes) {
                        violation(
                            "ARCHIVE_EXPANDED_ENTRY_LIMIT_EXCEEDED",
                            "Entry ${entry.name} exceeded expanded byte limit while streaming",
                        )
                    }
                }
            }
            return count
        }

        private fun normalize(path: String): String {
            if (path.isEmpty() || '\u0000' in path || '\\' in path || path.startsWith('/') || DRIVE_PATH.matches(path)) {
                violation("ARCHIVE_INVALID_PATH", "Archive entry uses an unsafe path: $path")
            }

            val withoutTrailingSlash = path.removeSuffix("/")
            val segments = withoutTrailingSlash.split('/')
            if (segments.any { it.isEmpty() || it == "." || it == ".." }) {
                violation("ARCHIVE_INVALID_PATH", "Archive entry uses an unsafe path: $path")
            }
            return segments.joinToString("/")
        }

        private fun classify(path: String): PayloadCategory {
            val lowercase = path.lowercase(Locale.ROOT)
            val basename = lowercase.substringAfterLast('/')
            return when {
                lowercase == "meta-inf/services" || lowercase.startsWith("meta-inf/services/") -> {
                    PayloadCategory.SERVICES
                }

                LICENSE_NAME.matches(basename) -> {
                    PayloadCategory.LICENSES
                }

                lowercase.startsWith("meta-inf/") && SIGNATURE_FILE.matches(basename) -> {
                    PayloadCategory.SIGNATURES
                }

                lowercase.endsWith(".kotlin_module") ||
                    lowercase.endsWith(".kotlin_builtins") ||
                    lowercase.endsWith(".kotlin_metadata") -> {
                    PayloadCategory.KOTLIN_METADATA
                }

                lowercase.endsWith(".class") -> {
                    PayloadCategory.BYTECODE
                }

                lowercase == "meta-inf" || lowercase.startsWith("meta-inf/") -> {
                    PayloadCategory.METADATA
                }

                else -> {
                    PayloadCategory.OTHER
                }
            }
        }

        private fun reconcile(
            plans: List<EntryPlan>,
            payload: List<PayloadCategoryStats>,
        ) {
            val plannedCompressed = plans.sumOf(EntryPlan::compressedBytes)
            val plannedExpanded = plans.sumOf(EntryPlan::expandedBytes)
            val plannedEntries = plans.size
            if (
                payload.sumOf(PayloadCategoryStats::compressedBytes) != plannedCompressed ||
                payload.sumOf(PayloadCategoryStats::expandedBytes) != plannedExpanded ||
                payload.sumOf(PayloadCategoryStats::entries) != plannedEntries
            ) {
                violation(
                    "ARCHIVE_BYTE_RECONCILIATION_FAILED",
                    "Payload categories do not reconcile with archive entries",
                )
            }
        }

        private fun payload(totals: Map<PayloadCategory, MutableCategoryStats>): List<PayloadCategoryStats> =
            PayloadCategory.entries.mapNotNull { category ->
                totals[category]?.let { stats ->
                    PayloadCategoryStats(
                        category = category.value,
                        compressedBytes = stats.compressedBytes,
                        expandedBytes = stats.expandedBytes,
                        entries = stats.entries,
                    )
                }
            }

        private fun failed(
            displayName: String,
            code: String,
            summary: String,
            archiveBytes: Long? = null,
        ): ArtifactAnalysis =
            ArtifactAnalysis(
                status = ResultStatus.FAILED,
                displayName = displayName,
                archiveBytes = archiveBytes,
                diagnostics =
                    listOf(
                        Diagnostic(
                            code = code,
                            summary = summary,
                            stage = AnalysisStage.ARCHIVE_ANALYSIS,
                        ),
                    ),
            )

        private fun sha256(path: Path): String {
            val digest = MessageDigest.getInstance("SHA-256")
            Files.newInputStream(path).use { input ->
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    digest.update(buffer, 0, read)
                }
            }
            return HexFormat.of().formatHex(digest.digest())
        }

        private fun declaredSize(
            size: Long,
            path: String,
            kind: String,
        ): Long {
            if (size < 0) {
                violation("ARCHIVE_INVALID_SIZE", "Entry $path has no declared $kind size")
            }
            return size
        }

        private fun checkedAdd(
            left: Long,
            right: Long,
        ): Long =
            try {
                Math.addExact(left, right)
            } catch (_: ArithmeticException) {
                violation("ARCHIVE_SIZE_OVERFLOW", "Archive entry byte totals overflowed")
            }

        private fun safeMessage(error: IOException): String = error.message?.take(500) ?: "Archive could not be read"

        private fun violation(
            code: String,
            message: String,
        ): Nothing = throw ArchiveViolation(code, message)

        private data class EntryPlan(
            val entry: ZipEntry,
            val normalizedPath: String,
            val category: PayloadCategory,
            val compressedBytes: Long,
            val expandedBytes: Long,
        )

        private data class MutableCategoryStats(
            var compressedBytes: Long = 0,
            var expandedBytes: Long = 0,
            var entries: Int = 0,
        ) {
            fun add(
                compressed: Long,
                expanded: Long,
            ) {
                compressedBytes = Math.addExact(compressedBytes, compressed)
                expandedBytes = Math.addExact(expandedBytes, expanded)
                entries = Math.addExact(entries, 1)
            }
        }

        private enum class PayloadCategory(
            val value: String,
        ) {
            BYTECODE("bytecode"),
            METADATA("metadata"),
            SERVICES("services"),
            LICENSES("licenses"),
            SIGNATURES("signatures"),
            KOTLIN_METADATA("kotlin-metadata"),
            OTHER("other"),
        }

        private class ArchiveViolation(
            val code: String,
            override val message: String,
        ) : IOException(message)

        private companion object {
            val DRIVE_PATH: Regex = Regex("^[A-Za-z]:.*")
            val LICENSE_NAME: Regex = Regex("^(license|notice|copying|copyright)([._-].*)?$")
            val SIGNATURE_FILE: Regex = Regex("^.+\\.(sf|rsa|dsa|ec)$")
        }
    }
