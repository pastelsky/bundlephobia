package com.bundlephobia.jvm.resolver

import com.bundlephobia.jvm.model.JvmResolutionResult
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TargetProfile
import org.gradle.testkit.runner.GradleRunner
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.writeText
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class JvmRuntimeResolverPluginTest {
    @Test
    fun `resolves representative JVM runtime coordinates through Gradle`() {
        val coordinates =
            listOf(
                "com.google.code.gson:gson:2.14.0",
                "com.fasterxml.jackson.core:jackson-databind:2.22.1",
                "com.google.guava:guava:33.6.0-jre",
                "com.squareup.okhttp3:okhttp-jvm:5.4.0",
            )

        coordinates.forEach { coordinate ->
            val result = resolve(coordinate)
            assertEquals(ResultStatus.COMPLETE, result.status, result.diagnostics.toString())
            assertEquals(coordinate, result.resolution.requested.notation)
            assertEquals(listOf("maven-central", "google-maven"), result.resolution.repositories)
            assertTrue(result.resolution.components.any { it.requested && it.coordinate.notation == coordinate })
            assertTrue(result.resolution.artifacts.isNotEmpty())
            assertTrue(result.resolution.artifacts.all { it.extension == "jar" })
            assertTrue(result.resolution.artifacts.all { it.digest.value.matches(Regex("[0-9a-f]{64}")) })
            assertTrue(result.resolution.artifacts.all { Files.isRegularFile(Path.of(it.path)) })
            assertTrue(result.resolution.edges.all { it.failure == null })
        }
    }

    @Test
    fun `selects the JVM flavored Guava artifact`() {
        val result = resolve("com.google.guava:guava:33.6.0-jre")
        val guava = result.resolution.artifacts.single { it.coordinate.artifactId == "guava" }
        val component = result.resolution.components.single { it.coordinate.artifactId == "guava" }

        assertEquals("guava-33.6.0-jre.jar", guava.fileName)
        assertTrue(component.variants.any { it.attributes["org.gradle.usage"] == "java-runtime" })
        assertTrue(component.variants.any { it.attributes["org.gradle.jvm.environment"] == "standard-jvm" })
    }

    @Test
    fun `produces identical normalized evidence on repeated resolution`() {
        val coordinate = "com.google.code.gson:gson:2.14.0"

        assertEquals(resolve(coordinate), resolve(coordinate))
    }

    @Test
    fun `returns an unsupported result for a non JAR runtime artifact`() {
        val result = resolve("com.android.support:support-v4:28.0.0")

        assertEquals(ResultStatus.FAILED, result.status)
        assertTrue(result.resolution.artifacts.any { it.extension == "aar" })
        assertTrue(result.diagnostics.any { it.code == "UNSUPPORTED_RUNTIME_ARTIFACT" })
    }

    @Test
    fun `accepts AARs for an Android runtime target`() {
        val result = resolve("androidx.recyclerview:recyclerview:1.4.0", TargetProfile.ANDROID_RUNTIME)

        assertEquals(ResultStatus.COMPLETE, result.status, result.diagnostics.toString())
        assertEquals(TargetProfile.ANDROID_RUNTIME, result.target)
        assertTrue(result.resolution.artifacts.any { it.extension == "aar" })
        assertTrue(result.diagnostics.none { it.code == "UNSUPPORTED_RUNTIME_ARTIFACT" })
    }

    @Test
    fun `returns stable diagnostics for an unresolved dependency`() {
        val result = resolve("com.bundlephobia.missing:definitely-not-published:1.0.0")

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals(listOf("UNRESOLVED_DEPENDENCY"), result.diagnostics.map { it.code })
        val unresolved = assertNotNull(result.resolution.edges.singleOrNull { it.failure != null })
        assertEquals(result.resolution.requested, unresolved.from)
        assertEquals("com.bundlephobia.missing:definitely-not-published:1.0.0", unresolved.requested)
        assertEquals("unresolved", unresolved.failure)
    }

    @Test
    fun `ignores and reports project repository declarations`() {
        val result =
            resolve(
                "com.google.code.gson:gson:2.14.0",
                buildScript =
                    """
                    repositories {
                        maven {
                            name = "forbidden"
                            url = uri("https://example.invalid/maven")
                        }
                    }
                    """.trimIndent(),
            )

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals(listOf("FORBIDDEN_REPOSITORY_DECLARATION"), result.diagnostics.map { it.code })
        assertTrue(result.resolution.artifacts.isEmpty())
        assertTrue(
            result.diagnostics
                .single()
                .summary
                .contains(":forbidden:example.invalid"),
        )
    }

    private fun resolve(
        coordinate: String,
        target: TargetProfile = TargetProfile.JVM_RUNTIME,
        buildScript: String = "",
    ): JvmResolutionResult {
        val projectDirectory = Files.createTempDirectory("jvm-resolver-test-")
        projectDirectory.resolve("settings.gradle.kts").writeText(
            """
            plugins {
                id("${JvmRuntimeResolverPlugin.PLUGIN_ID}")
            }

            rootProject.name = "resolver-test"
            """.trimIndent(),
        )
        projectDirectory.resolve("build.gradle.kts").writeText(buildScript)
        projectDirectory.resolve("gradle.properties").writeText(
            """
            org.gradle.configuration-cache=true
            org.gradle.daemon=false
            org.gradle.warning.mode=all
            """.trimIndent(),
        )

        GradleRunner
            .create()
            .withProjectDir(projectDirectory.toFile())
            .withPluginClasspath()
            .withArguments(
                JvmRuntimeResolverPlugin.RESOLVE_TASK_NAME,
                "-P${JvmRuntimeResolverPlugin.COORDINATE_PROPERTY}=$coordinate",
                "-P${JvmRuntimeResolverPlugin.TARGET_PROPERTY}=${target.serializedValue}",
                "--stacktrace",
            ).build()

        val output = projectDirectory.resolve("build/jvm-resolver/result.json")
        assertTrue(Files.isRegularFile(output))
        return ResultJson.decodeResolution(Files.readString(output))
    }
}
