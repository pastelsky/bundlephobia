package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.ResultStatus
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.HexFormat
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

class AnalysisCacheTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `repairs a corrupt content addressed artifact`() {
        val source = tempDir.resolve("source.jar")
        val expected = "valid artifact".toByteArray()
        Files.write(source, expected)
        val digest = sha256(source)
        val artifact =
            ResolvedArtifact(
                coordinate = MavenCoordinate.parse("example:fixture:1.0"),
                fileName = "source.jar",
                path = source.toString(),
                extension = "jar",
                variant = "runtime",
                digest = ArtifactDigest(value = digest),
            )
        val cache = AnalysisCache(tempDir.resolve("cache"), "test")
        val cached = cache.materialize(artifact)
        Files.writeString(cached, "corrupt")

        val repaired = cache.materialize(artifact)

        assertEquals(cached, repaired)
        assertContentEquals(expected, Files.readAllBytes(repaired))
    }

    @Test
    fun `recomputes a corrupt analysis entry`() {
        val cacheRoot = tempDir.resolve("cache")
        val cache = AnalysisCache(cacheRoot, "test")
        val digest = "a".repeat(64)
        var inspections = 0
        val inspect: (Path) -> ArtifactAnalysis = {
            inspections++
            ArtifactAnalysis(
                status = ResultStatus.COMPLETE,
                displayName = "fixture.jar",
                digest = ArtifactDigest(value = digest),
            )
        }
        cache.analyze(digest, "fixture.jar", tempDir, inspect)
        val analysisPath = cacheRoot.resolve("analysis/test/aa/$digest.json")
        Files.writeString(analysisPath, "not json")

        cache.analyze(digest, "fixture.jar", tempDir, inspect)

        assertEquals(2, inspections)
    }

    private fun sha256(path: Path): String = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)))
}
