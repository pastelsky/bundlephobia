package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResultStatus
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals

class PackageBuildStatsAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    private val analyzer = PackageBuildStatsAnalyzer()

    @Test
    fun `returns an explicit failed result until coordinate analysis is implemented`() {
        val coordinate = MavenCoordinate.parse("com.google.code.gson:gson:2.13.1")

        val result = analyzer.analyze(AnalyzeRequest(coordinate))

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals(coordinate, result.coordinate)
        assertEquals("ANALYSIS_NOT_IMPLEMENTED", result.diagnostics.single().code)
    }

    @Test
    fun `returns a structured input failure for a missing local jar`() {
        val result = analyzer.inspect(Path.of("example.jar"))

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("example.jar", result.displayName)
        assertEquals("ARCHIVE_NOT_REGULAR_FILE", result.diagnostics.single().code)
    }

    @Test
    fun `combines archive and classfile analysis for local jars`() {
        val resourceName = PackageBuildStatsAnalyzerTest::class.java.name.replace('.', '/') + ".class"
        val classBytes = requireNotNull(javaClass.classLoader.getResourceAsStream(resourceName)).use { it.readAllBytes() }
        val jar = tempDir.resolve("fixture.jar")
        ZipOutputStream(Files.newOutputStream(jar)).use { output ->
            output.putNextEntry(ZipEntry(resourceName))
            output.write(classBytes)
            output.closeEntry()
        }

        val result = analyzer.inspect(jar)

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(1, result.classfiles?.analyzedClasses)
        assertEquals("com.bundlephobia.jvm", result.namespaces.single().name)
        assertEquals(classBytes.size.toLong(), result.namespaces.single().classBytes)
    }
}
