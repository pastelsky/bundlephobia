package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.PackageBuildStatsResult
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.ToolchainManifest
import java.nio.file.Path

public class PackageBuildStatsAnalyzer {
    public fun analyze(request: AnalyzeRequest): PackageBuildStatsResult =
        PackageBuildStatsResult(
            status = ResultStatus.FAILED,
            coordinate = request.coordinate,
            target = request.target,
            toolchain = currentToolchain(),
            resolution = ResolutionStats(request.coordinate),
            diagnostics = listOf(notImplementedDiagnostic()),
        )

    public fun inspect(path: Path): ArtifactAnalysis =
        ArtifactAnalysis(
            status = ResultStatus.FAILED,
            displayName = path.fileName?.toString() ?: "<jar>",
            diagnostics = listOf(notImplementedDiagnostic()),
        )

    private fun notImplementedDiagnostic(): Diagnostic =
        Diagnostic(
            code = "ANALYSIS_NOT_IMPLEMENTED",
            summary = "Analysis behavior is not available in this milestone",
            stage = AnalysisStage.INPUT,
        )

    private fun currentToolchain(): ToolchainManifest =
        ToolchainManifest(
            generation = "jvm-2026-08-g1",
            analyzerVersion = "0.0.0-SNAPSHOT",
            jdkVersion = System.getProperty("java.version"),
            jdkVendor = System.getProperty("java.vendor"),
            kotlinVersion = "2.4.10",
            gradleVersion = "9.5.1",
        )
}
