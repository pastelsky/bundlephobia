package com.bundlephobia.jvm.archive

import com.bundlephobia.jvm.model.ResultStatus
import org.apache.commons.compress.archivers.zip.Zip64Mode
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.HexFormat
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class JarArchiveAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `classifies every entry and reconciles exact bytes`() {
        val jar = tempDir.resolve("normal.jar")
        val entries =
            listOf(
                "com/example/Example.class" to byteArrayOf(0xCA.toByte(), 0xFE.toByte()),
                "META-INF/MANIFEST.MF" to "Manifest-Version: 1.0\n".encodeToByteArray(),
                "META-INF/services/com.example.Service" to "com.example.Impl\n".encodeToByteArray(),
                "LICENSE.txt" to "license".encodeToByteArray(),
                "META-INF/RELEASE.SF" to "signature".encodeToByteArray(),
                "META-INF/example.kotlin_module" to byteArrayOf(1, 2, 3),
                "config/application.properties" to "enabled=true".encodeToByteArray(),
            )
        writeJar(jar, entries)

        val result = JarArchiveAnalyzer().analyze(jar)

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(Files.size(jar), result.archiveBytes)
        assertEquals(sha256(jar), result.digest?.value)
        assertEquals(entries.sumOf { it.second.size }.toLong(), result.expandedBytes)
        assertEquals(
            listOf(
                "bytecode",
                "metadata",
                "services",
                "licenses",
                "signatures",
                "kotlin-metadata",
                "other",
            ),
            result.payload.map { it.category },
        )
        assertEquals(entries.size, result.payload.sumOf { it.entries })
        assertEquals(result.expandedBytes, result.payload.sumOf { it.expandedBytes })
        assertTrue(result.payload.sumOf { it.compressedBytes } <= result.archiveBytes!!)
        assertTrue(result.diagnostics.isEmpty())
    }

    @Test
    fun `reads stored entries`() {
        val jar = tempDir.resolve("stored.jar")
        writeJar(jar, listOf("stored.bin" to ByteArray(32) { it.toByte() }), stored = true)

        val result = JarArchiveAnalyzer().analyze(jar)

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(32, result.payload.single().compressedBytes)
        assertEquals(32, result.payload.single().expandedBytes)
    }

    @Test
    fun `reads a ZIP64 jar with small entries`() {
        val jar = tempDir.resolve("zip64.jar")
        writeCommonsJar(jar, Zip64Mode.Always, listOf("small.txt" to "zip64".encodeToByteArray()))

        val result = JarArchiveAnalyzer().analyze(jar)

        assertTrue(Files.readAllBytes(jar).containsSignature(byteArrayOf(0x50, 0x4B, 0x06, 0x06)))
        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(5, result.expandedBytes)
    }

    @Test
    fun `rejects duplicate normalized paths`() {
        val jar = tempDir.resolve("duplicate.jar")
        writeCommonsJar(
            jar,
            Zip64Mode.AsNeeded,
            listOf("same.txt" to byteArrayOf(1), "same.txt" to byteArrayOf(2)),
        )

        assertFailure(jar, "ARCHIVE_DUPLICATE_PATH_LIMIT_EXCEEDED")
    }

    @Test
    fun `normalizes unicode before detecting duplicate paths`() {
        val jar = tempDir.resolve("unicode-duplicate.jar")
        writeCommonsJar(
            jar,
            Zip64Mode.AsNeeded,
            listOf("caf\u00e9.txt" to byteArrayOf(1), "cafe\u0301.txt" to byteArrayOf(2)),
        )

        assertFailure(jar, "ARCHIVE_DUPLICATE_PATH_LIMIT_EXCEEDED")
    }

    @Test
    fun `rejects traversal and ambiguous paths`() {
        val traversal = tempDir.resolve("traversal.jar")
        writeJar(traversal, listOf("../escape.class" to byteArrayOf(1)))
        val backslash = tempDir.resolve("backslash.jar")
        writeJar(backslash, listOf("dir\\escape.class" to byteArrayOf(1)))

        assertFailure(traversal, "ARCHIVE_INVALID_PATH")
        assertFailure(backslash, "ARCHIVE_INVALID_PATH")
    }

    @Test
    fun `returns a structured result for malformed archives`() {
        val jar = tempDir.resolve("malformed.jar")
        Files.write(jar, "not a zip".encodeToByteArray())

        val result = JarArchiveAnalyzer().analyze(jar)

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("MALFORMED_ARCHIVE", result.diagnostics.single().code)
        assertEquals(Files.size(jar), result.archiveBytes)
        assertNotNull(result.digest)
    }

    @Test
    fun `verifies entry CRC without loading or executing contents`() {
        val jar = tempDir.resolve("corrupt-crc.jar")
        val content = "CRC-CONTENT-UNIQUE".encodeToByteArray()
        writeJar(jar, listOf("content.bin" to content), stored = true)
        val archive = Files.readAllBytes(jar)
        val contentOffset = archive.indexOf(content)
        assertTrue(contentOffset >= 0)
        archive[contentOffset] = (archive[contentOffset].toInt() xor 1).toByte()
        Files.write(jar, archive)

        assertFailure(jar, "ARCHIVE_ENTRY_CRC_MISMATCH")
    }

    @Test
    fun `rejects a decompression bomb before streaming entry contents`() {
        val jar = tempDir.resolve("bomb.jar")
        writeJar(jar, listOf("zeros.bin" to ByteArray(1024 * 1024)))
        val analyzer = JarArchiveAnalyzer(ArchiveAnalysisPolicy(maxCompressionRatio = 10.0))

        val result = analyzer.analyze(jar)

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("ARCHIVE_COMPRESSION_RATIO_LIMIT_EXCEEDED", result.diagnostics.single().code)
        assertTrue(result.payload.isEmpty())
    }

    @Test
    fun `enforces entry count compressed expanded nesting and path depth limits`() {
        val twoEntries = tempDir.resolve("two.jar")
        writeJar(twoEntries, listOf("a" to byteArrayOf(1), "b" to byteArrayOf(2)))
        assertFailure(
            twoEntries,
            "ARCHIVE_SIZE_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxArchiveBytes = 1),
        )
        assertFailure(
            twoEntries,
            "ARCHIVE_ENTRY_COUNT_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxEntries = 1),
        )

        val stored = tempDir.resolve("limits.jar")
        writeJar(stored, listOf("a/b/c.bin" to byteArrayOf(1, 2, 3, 4)), stored = true)
        assertFailure(
            stored,
            "ARCHIVE_COMPRESSED_ENTRY_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxCompressedEntryBytes = 3),
        )
        assertFailure(
            stored,
            "ARCHIVE_EXPANDED_ENTRY_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxExpandedEntryBytes = 3),
        )
        assertFailure(
            stored,
            "ARCHIVE_TOTAL_COMPRESSED_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxTotalCompressedEntryBytes = 3),
        )
        assertFailure(
            stored,
            "ARCHIVE_TOTAL_EXPANDED_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxTotalExpandedBytes = 3),
        )
        assertFailure(
            stored,
            "ARCHIVE_PATH_DEPTH_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxPathDepth = 2),
        )

        val nested = tempDir.resolve("nested.jar")
        writeJar(nested, listOf("lib/dependency.jar" to byteArrayOf(1)))
        assertFailure(
            nested,
            "ARCHIVE_NESTING_LIMIT_EXCEEDED",
            ArchiveAnalysisPolicy(maxNestedArchives = 0),
        )
    }

    private fun assertFailure(
        jar: Path,
        diagnosticCode: String,
        policy: ArchiveAnalysisPolicy = ArchiveAnalysisPolicy(),
    ) {
        val result = JarArchiveAnalyzer(policy).analyze(jar)
        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals(diagnosticCode, result.diagnostics.single().code)
    }

    private fun writeJar(
        path: Path,
        entries: List<Pair<String, ByteArray>>,
        stored: Boolean = false,
    ) {
        ZipOutputStream(Files.newOutputStream(path)).use { output ->
            entries.forEach { (name, bytes) ->
                val entry = ZipEntry(name)
                if (stored) {
                    val crc = CRC32().apply { update(bytes) }
                    entry.method = ZipEntry.STORED
                    entry.size = bytes.size.toLong()
                    entry.compressedSize = bytes.size.toLong()
                    entry.crc = crc.value
                }
                output.putNextEntry(entry)
                output.write(bytes)
                output.closeEntry()
            }
        }
    }

    private fun writeCommonsJar(
        path: Path,
        zip64Mode: Zip64Mode,
        entries: List<Pair<String, ByteArray>>,
    ) {
        ZipArchiveOutputStream(path).use { output ->
            output.setUseZip64(zip64Mode)
            entries.forEach { (name, bytes) ->
                output.putArchiveEntry(ZipArchiveEntry(name))
                output.write(bytes)
                output.closeArchiveEntry()
            }
            output.finish()
        }
    }

    private fun sha256(path: Path): String = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)))

    private fun ByteArray.indexOf(needle: ByteArray): Int {
        for (offset in 0..size - needle.size) {
            if (needle.indices.all { index -> this[offset + index] == needle[index] }) return offset
        }
        return -1
    }

    private fun ByteArray.containsSignature(signature: ByteArray): Boolean = indexOf(signature) >= 0
}
