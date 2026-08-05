package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResultStatus
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertEquals

class PackageBuildStatsAnalyzerTest {
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
    fun `does not inspect local files in the API shell milestone`() {
        val result = analyzer.inspect(Path.of("example.jar"))

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("example.jar", result.displayName)
        assertEquals("ANALYSIS_NOT_IMPLEMENTED", result.diagnostics.single().code)
    }
}
