package com.bundlephobia.jvm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

import com.bundlephobia.jvm.model.AnalyzeRequest;
import com.bundlephobia.jvm.model.MavenCoordinate;
import com.bundlephobia.jvm.model.PackageBuildStatsResult;
import com.bundlephobia.jvm.model.ResultStatus;
import org.junit.jupiter.api.Test;

class JavaApiCompatibilityTest {
  @Test
  void publicApiIsCallableFromJava() {
    MavenCoordinate coordinate = MavenCoordinate.parse("com.google.code.gson:gson:2.13.1");
    AnalyzeRequest request = new AnalyzeRequest(coordinate);

    PackageBuildStatsResult result = new PackageBuildStatsAnalyzer().analyze(request);

    assertNotEquals(ResultStatus.FAILED, result.getStatus());
    assertEquals(coordinate, result.getCoordinate());
  }
}
