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
import java.text.Normalizer
import java.util.HexFormat
import java.util.Locale
import java.util.zip.CRC32
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

            val digest =
                try {
                    sha256(path)
                } catch (error: IOException) {
                    return failed(
                        displayName,
                        "ARCHIVE_READ_FAILED",
                        safeMessage(error),
                        archiveBytes = archiveBytes,
                    )
                }

            val totals = linkedMapOf<PayloadCategory, MutableCategoryStats>()
            return try {
                ZipFile(path.toFile()).use { archive ->
                    val plans = preflight(archive)
                    for (plan in plans) {
                        val streamed = streamAndVerify(archive, plan.entry)
                        if (streamed.expandedBytes != plan.expandedBytes) {
                            violation(
                                "ARCHIVE_ENTRY_SIZE_MISMATCH",
                                "Entry ${plan.normalizedPath} declared ${plan.expandedBytes} bytes but streamed ${streamed.expandedBytes}",
                            )
                        }
                        if (streamed.crc != plan.crc) {
                            violation(
                                "ARCHIVE_ENTRY_CRC_MISMATCH",
                                "Entry ${plan.normalizedPath} failed its CRC-32 integrity check",
                            )
                        }
                        totals
                            .getOrPut(plan.category) { MutableCategoryStats() }
                            .add(plan.compressedBytes, streamed.expandedBytes)
                    }

                    val payload = payload(totals)
                    reconcile(plans, payload)
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
                    digest,
                    archiveBytes,
                    payload(totals),
                )
            } catch (error: ZipException) {
                failed(
                    displayName,
                    "MALFORMED_ARCHIVE",
                    safeMessage(error),
                    digest,
                    archiveBytes,
                    payload(totals),
                )
            } catch (error: IOException) {
                failed(
                    displayName,
                    "ARCHIVE_READ_FAILED",
                    safeMessage(error),
                    digest,
                    archiveBytes,
                    payload(totals),
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

            val duplicates = mutableMapOf<String, Int>()
            var duplicatePaths = 0
            var nestedArchives = 0
            var totalCompressed = 0L
            var totalExpanded = 0L

            return entries.map { entry ->
                val normalizedPath = normalize(entry.name)
                val occurrences = (duplicates[normalizedPath] ?: 0) + 1
                duplicates[normalizedPath] = occurrences
                if (occurrences > 1) {
                    duplicatePaths++
                    if (duplicatePaths > policy.maxDuplicatePaths) {
                        violation(
                            "ARCHIVE_DUPLICATE_PATH_LIMIT_EXCEEDED",
                            "Archive contains duplicate normalized path: $normalizedPath",
                        )
                    }
                }

                if (!entry.isDirectory && isNestedArchive(normalizedPath)) {
                    nestedArchives++
                    if (nestedArchives > policy.maxNestedArchives) {
                        violation(
                            "ARCHIVE_NESTING_LIMIT_EXCEEDED",
                            "Archive contains $nestedArchives nested archive entries; limit is ${policy.maxNestedArchives}",
                        )
                    }
                }

                val compressedBytes = declaredSize(entry.compressedSize, entry.name, "compressed")
                val expandedBytes = declaredSize(entry.size, entry.name, "expanded")
                val crc = declaredSize(entry.crc, entry.name, "CRC-32")
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

                totalCompressed = checkedAdd(totalCompressed, compressedBytes)
                totalExpanded = checkedAdd(totalExpanded, expandedBytes)
                if (totalCompressed > policy.maxTotalCompressedEntryBytes) {
                    violation(
                        "ARCHIVE_TOTAL_COMPRESSED_LIMIT_EXCEEDED",
                        "Compressed entry bytes exceed limit ${policy.maxTotalCompressedEntryBytes}",
                    )
                }
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
                    crc = crc,
                )
            }
        }

        private fun streamAndVerify(
            archive: ZipFile,
            entry: ZipEntry,
        ): StreamedEntry {
            var count = 0L
            val crc = CRC32()
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            archive.getInputStream(entry).use { input ->
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    count = checkedAdd(count, read.toLong())
                    crc.update(buffer, 0, read)
                    if (count > policy.maxExpandedEntryBytes) {
                        violation(
                            "ARCHIVE_EXPANDED_ENTRY_LIMIT_EXCEEDED",
                            "Entry ${entry.name} exceeded expanded byte limit while streaming",
                        )
                    }
                }
            }
            return StreamedEntry(count, crc.value)
        }

        private fun normalize(path: String): String {
            if (path.isEmpty() || path.length > policy.maxPathLength) {
                violation("ARCHIVE_INVALID_PATH", "Archive entry path is empty or too long")
            }
            val normalized = Normalizer.normalize(path, Normalizer.Form.NFC)
            if (
                normalized.any(Char::isISOControl) ||
                '\\' in normalized ||
                normalized.startsWith('/') ||
                DRIVE_PATH.matches(normalized)
            ) {
                violation("ARCHIVE_INVALID_PATH", "Archive entry uses an unsafe path: $path")
            }

            val withoutTrailingSlash = normalized.removeSuffix("/")
            val segments = withoutTrailingSlash.split('/')
            if (segments.any { it.isEmpty() || it == "." || it == ".." }) {
                violation("ARCHIVE_INVALID_PATH", "Archive entry uses an unsafe path: $path")
            }
            if (segments.size > policy.maxPathDepth) {
                violation(
                    "ARCHIVE_PATH_DEPTH_LIMIT_EXCEEDED",
                    "Archive entry path depth exceeds limit ${policy.maxPathDepth}: $path",
                )
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
            digest: String? = null,
            archiveBytes: Long? = null,
            payload: List<PayloadCategoryStats> = emptyList(),
        ): ArtifactAnalysis =
            ArtifactAnalysis(
                status = ResultStatus.FAILED,
                displayName = displayName,
                digest = digest?.let { ArtifactDigest(value = it) },
                archiveBytes = archiveBytes,
                expandedBytes = payload.sumOf(PayloadCategoryStats::expandedBytes).takeIf { payload.isNotEmpty() },
                payload = payload,
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

        private fun isNestedArchive(path: String): Boolean = NESTED_ARCHIVE_SUFFIXES.any(path.lowercase(Locale.ROOT)::endsWith)

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
            val crc: Long,
        )

        private data class StreamedEntry(
            val expandedBytes: Long,
            val crc: Long,
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
            val NESTED_ARCHIVE_SUFFIXES: List<String> = listOf(".jar", ".zip", ".war", ".ear")
        }
    }
