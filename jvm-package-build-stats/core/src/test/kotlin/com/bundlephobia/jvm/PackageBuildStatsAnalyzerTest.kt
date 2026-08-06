package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.AnalyzeRequest
import com.bundlephobia.jvm.model.AndroidDexStatus
import com.bundlephobia.jvm.model.ArtifactDigest
import com.bundlephobia.jvm.model.DependencyEdge
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.JvmResolutionResult
import com.bundlephobia.jvm.model.MavenCoordinate
import com.bundlephobia.jvm.model.ResolutionStats
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.ResolvedComponent
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import com.bundlephobia.jvm.model.TargetProfile
import com.bundlephobia.jvm.model.TimingStats
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission
import java.security.MessageDigest
import java.util.HexFormat
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PackageBuildStatsAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `aggregates the unique runtime closure and deterministic shortest paths`() {
        val root = MavenCoordinate.parse("example:root:1.0")
        val middle = MavenCoordinate.parse("example:middle:1.0")
        val leaf = MavenCoordinate.parse("example:leaf:1.0")
        val baseResolution =
            resolution(
                requested = root,
                coordinates = listOf(root, middle, leaf),
                edges =
                    listOf(
                        DependencyEdge(root, middle.notation, middle),
                        DependencyEdge(middle, leaf.notation, leaf),
                    ),
            )
        val resolution =
            baseResolution.copy(
                resolution =
                    baseResolution.resolution.copy(
                        components =
                            baseResolution.resolution.components.map { component ->
                                if (component.coordinate == middle) {
                                    component.copy(selectionReasons = listOf("conflict_resolution:selected by rule"))
                                } else {
                                    component
                                }
                            },
                    ),
            )
        val analyzer = analyzer(resolution)

        val result = analyzer.analyze(AnalyzeRequest(root))

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(3, result.runtimeClosure.artifacts)
        assertEquals(3, result.runtimeClosure.components)
        assertEquals(2, result.runtimeClosure.dependencyDepth)
        assertEquals(
            listOf(root, middle, leaf),
            result.runtimeClosure.shortestPaths
                .last()
                .path,
        )
        assertEquals(
            result.runtimeClosure.archiveBytes,
            result.runtimeClosure.directArtifactBytes + result.runtimeClosure.transitiveArtifactBytes,
        )
        assertEquals(result.runtimeClosure.archiveBytes, result.sizes.runtimeArchiveBytes)
        assertEquals(result.runtimeClosure.expandedBytes, result.sizes.runtimeExpandedBytes)
        assertEquals(3, result.dependencySizes.size)
        assertEquals(root, result.dependencySizes.single { it.requested }.coordinate)
        assertEquals(1, result.dependencySizes.single { it.coordinate == middle }.depth)
        assertTrue(result.dependencySizes.single { it.coordinate == middle }.direct)
        assertEquals(2, result.dependencySizes.single { it.coordinate == leaf }.depth)
        assertEquals(2, result.runtimeClosure.largestTransitiveArtifacts.size)
        assertEquals(
            1,
            result.resolution.artifacts.count { artifact -> artifact.coordinate == root },
        )
        assertTrue(result.diagnostics.any { diagnostic -> diagnostic.code == "DEPENDENCY_CONFLICT_SELECTED" })
    }

    @Test
    fun `repeated analysis returns identical evidence without a result cache`() {
        val coordinate = MavenCoordinate.parse("example:cached:1.0")
        val resolution = resolution(coordinate, listOf(coordinate))
        val analyzer = analyzer(resolution)

        val first = analyzer.analyze(AnalyzeRequest(coordinate))
        val second = analyzer.analyze(AnalyzeRequest(coordinate))

        assertEquals(ResultStatus.COMPLETE, second.status)
        assertEquals(first.copy(timings = TimingStats()), second.copy(timings = TimingStats()))
    }

    @Test
    fun `resolution failures preserve completed static evidence`() {
        val coordinate = MavenCoordinate.parse("example:partial:1.0")
        val complete = resolution(coordinate, listOf(coordinate))
        val failed =
            complete.copy(
                status = ResultStatus.FAILED,
                diagnostics =
                    listOf(
                        Diagnostic(
                            code = "UNRESOLVED_DEPENDENCY",
                            summary = "A transitive dependency was unavailable",
                            stage = com.bundlephobia.jvm.model.AnalysisStage.RESOLUTION,
                        ),
                    ),
            )

        val result = analyzer(failed).analyze(AnalyzeRequest(coordinate))

        assertEquals(ResultStatus.PARTIAL, result.status)
        assertEquals(1, result.artifacts.size)
        assertEquals(ResultStatus.COMPLETE, result.directArtifact?.status)
        assertEquals("UNRESOLVED_DEPENDENCY", result.diagnostics.single().code)
    }

    @Test
    fun `oversized dependency graphs are bounded and preserve direct evidence`() {
        val coordinates = (0..10_000).map { index -> MavenCoordinate.parse("example:node$index:1.0") }
        val directPath = jar("root.jar", 1)
        val resolution =
            JvmResolutionResult(
                status = ResultStatus.COMPLETE,
                resolution =
                    ResolutionStats(
                        requested = coordinates.first(),
                        components =
                            coordinates.mapIndexed { index, coordinate ->
                                ResolvedComponent(coordinate, requested = index == 0)
                            },
                        edges =
                            coordinates.zipWithNext { from, selected ->
                                DependencyEdge(from, selected.notation, selected)
                            },
                        artifacts =
                            listOf(
                                ResolvedArtifact(
                                    coordinate = coordinates.first(),
                                    fileName = directPath.fileName.toString(),
                                    path = directPath.toString(),
                                    extension = "jar",
                                    variant = "runtime",
                                    digest = ArtifactDigest(value = sha256(directPath)),
                                ),
                            ),
                    ),
            )

        val result = analyzer(resolution).analyze(AnalyzeRequest(coordinates.first()))

        assertEquals(ResultStatus.PARTIAL, result.status)
        assertEquals(ResultStatus.COMPLETE, result.directArtifact?.status)
        assertTrue(result.runtimeClosure.shortestPaths.isEmpty())
        assertEquals(10_001, result.resolution.componentCount)
        assertEquals(100, result.resolution.components.size)
        assertTrue(result.resolution.truncated)
        val encoded = ResultJson.encode(result)
        assertTrue(encoded.toByteArray().size < 1_000_000)
        assertTrue(!encoded.contains(directPath.toString()))
        assertTrue(result.diagnostics.any { diagnostic -> diagnostic.code == "DEPENDENCY_GRAPH_LIMIT_EXCEEDED" })
    }

    @Test
    fun `attributes a metadata-only Kotlin package to its nearest JVM variant`() {
        val root = MavenCoordinate.parse("example:multiplatform:1.0")
        val jvm = MavenCoordinate.parse("example:multiplatform-jvm:1.0")
        val jvmJar = jar("multiplatform-jvm.jar", 10)
        val resolution =
            JvmResolutionResult(
                status = ResultStatus.COMPLETE,
                resolution =
                    ResolutionStats(
                        requested = root,
                        components =
                            listOf(
                                ResolvedComponent(root, requested = true),
                                ResolvedComponent(jvm, requested = false),
                            ),
                        edges = listOf(DependencyEdge(root, jvm.notation, jvm)),
                        artifacts =
                            listOf(
                                ResolvedArtifact(
                                    coordinate = jvm,
                                    fileName = jvmJar.fileName.toString(),
                                    path = jvmJar.toString(),
                                    extension = "jar",
                                    variant = "runtime",
                                    digest = ArtifactDigest(value = sha256(jvmJar)),
                                ),
                            ),
                    ),
            )

        val result = analyzer(resolution).analyze(AnalyzeRequest(root))

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertTrue(result.sizes.directArtifactArchiveBytes > 0)
        assertEquals(jvm, result.dependencySizes.single { it.requested }.coordinate)
        assertTrue(result.diagnostics.any { diagnostic -> diagnostic.code == "REQUESTED_VARIANT_REDIRECTED" })
    }

    @Test
    fun `does not attribute transitive jars to a requested non-jar artifact`() {
        val root = MavenCoordinate.parse("example:android-only:1.0")
        val dependency = MavenCoordinate.parse("example:jvm-dependency:1.0")
        val rootAar = tempDir.resolve("android-only.aar").also { path -> Files.write(path, byteArrayOf(1)) }
        val dependencyJar = jar("jvm-dependency.jar", 10)
        val resolution =
            JvmResolutionResult(
                status = ResultStatus.PARTIAL,
                resolution =
                    ResolutionStats(
                        requested = root,
                        components =
                            listOf(
                                ResolvedComponent(root, requested = true),
                                ResolvedComponent(dependency, requested = false),
                            ),
                        edges = listOf(DependencyEdge(root, dependency.notation, dependency)),
                        artifacts =
                            listOf(
                                ResolvedArtifact(
                                    coordinate = root,
                                    fileName = rootAar.fileName.toString(),
                                    path = rootAar.toString(),
                                    extension = "aar",
                                    variant = "runtime",
                                    digest = ArtifactDigest(value = sha256(rootAar)),
                                ),
                                ResolvedArtifact(
                                    coordinate = dependency,
                                    fileName = dependencyJar.fileName.toString(),
                                    path = dependencyJar.toString(),
                                    extension = "jar",
                                    variant = "runtime",
                                    digest = ArtifactDigest(value = sha256(dependencyJar)),
                                ),
                            ),
                    ),
            )

        val result = analyzer(resolution).analyze(AnalyzeRequest(root))

        assertEquals(ResultStatus.PARTIAL, result.status)
        assertEquals(null, result.directArtifact)
        assertTrue(result.dependencySizes.none { it.requested })
        assertTrue(result.diagnostics.any { diagnostic -> diagnostic.code == "REQUESTED_ARTIFACT_NOT_ANALYZED" })
        assertTrue(result.diagnostics.none { diagnostic -> diagnostic.code == "REQUESTED_VARIANT_REDIRECTED" })
    }

    @Test
    fun `resolver timeouts are retryable structured failures`() {
        val executable = tempDir.resolve("slow-gradle")
        Files.writeString(executable, "#!/bin/sh\nsleep 2\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val coordinate = MavenCoordinate.parse("example:timeout:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    gradleExecutable = executable,
                    resolutionTimeoutMilliseconds = 25,
                ),
            ).resolve(coordinate, TargetProfile.JVM_RUNTIME, 21, AnalysisCancellation.NONE)

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("RESOLUTION_TIMEOUT", result.diagnostics.single().code)
        assertEquals(com.bundlephobia.jvm.model.RetryClassification.RETRYABLE, result.diagnostics.single().retry)
    }

    @Test
    fun `cancellation stops a running resolver process`() {
        val executable = tempDir.resolve("cancelled-gradle")
        Files.writeString(executable, "#!/bin/sh\nsleep 2\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val started = System.nanoTime()
        val coordinate = MavenCoordinate.parse("example:cancelled:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    gradleExecutable = executable,
                ),
            ).resolve(
                coordinate,
                TargetProfile.JVM_RUNTIME,
                21,
                AnalysisCancellation { System.nanoTime() - started > 50_000_000 },
            )

        assertEquals(ResultStatus.FAILED, result.status)
        assertEquals("RESOLUTION_CANCELLED", result.diagnostics.single().code)
    }

    @Test
    fun `resolver failures retain bounded stderr and clean their configured temporary directory`() {
        val executable = tempDir.resolve("failing-gradle")
        Files.writeString(executable, "#!/bin/sh\necho 'fixture resolution detail' >&2\nexit 7\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val temporaryDirectory = tempDir.resolve("resolver-temporary")
        val coordinate = MavenCoordinate.parse("example:failed:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    gradleExecutable = executable,
                    temporaryDirectory = temporaryDirectory,
                    diagnosticOutputLimitBytes = 128,
                ),
            ).resolve(coordinate, TargetProfile.JVM_RUNTIME, 21, AnalysisCancellation.NONE)

        assertEquals(ResultStatus.FAILED, result.status)
        assertTrue(
            result.diagnostics
                .single()
                .summary
                .contains("fixture resolution detail"),
        )
        assertTrue(Files.list(temporaryDirectory).use { paths -> paths.findAny().isEmpty })
    }

    @Test
    fun `resolver child process receives the running JVM home`() {
        val executable = tempDir.resolve("java-home-gradle")
        Files.writeString(executable, "#!/bin/sh\necho \"JAVA_HOME=${'$'}JAVA_HOME\" >&2\nexit 7\n")
        Files.setPosixFilePermissions(
            executable,
            setOf(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE,
            ),
        )
        val coordinate = MavenCoordinate.parse("example:java-home:1.0")

        val result =
            GradleResolverClient(
                PackageBuildStatsConfig(
                    gradleExecutable = executable,
                    diagnosticOutputLimitBytes = 1_024,
                ),
            ).resolve(coordinate, TargetProfile.JVM_RUNTIME, 21, AnalysisCancellation.NONE)

        assertTrue(
            result.diagnostics
                .single()
                .summary
                .contains("JAVA_HOME=${System.getProperty("java.home")}"),
        )
    }

    @Test
    fun `returns a structured input failure for a missing local jar`() {
        val result = PackageBuildStatsAnalyzer().inspect(Path.of("example.jar"))

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

        val result = PackageBuildStatsAnalyzer().inspect(jar)

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals(1, result.classfiles?.analyzedClasses)
        assertEquals("com.bundlephobia.jvm", result.namespaces.single().name)
        assertEquals(classBytes.size.toLong(), result.namespaces.single().classBytes)
    }

    @Test
    fun `assembles Android AAR size and preflight evidence`() {
        val coordinate = MavenCoordinate.parse("androidx.example:fixture:1.0")
        val archive = androidArchive()
        val resolution =
            JvmResolutionResult(
                status = ResultStatus.COMPLETE,
                target = TargetProfile.ANDROID_RUNTIME,
                resolution =
                    ResolutionStats(
                        requested = coordinate,
                        components = listOf(ResolvedComponent(coordinate, requested = true)),
                        artifacts =
                            listOf(
                                ResolvedArtifact(
                                    coordinate = coordinate,
                                    fileName = archive.fileName.toString(),
                                    path = archive.toString(),
                                    extension = "aar",
                                    variant = "releaseRuntimeElements",
                                    digest = ArtifactDigest(value = sha256(archive)),
                                ),
                            ),
                    ),
            )

        val result = analyzer(resolution).analyze(AnalyzeRequest(coordinate, TargetProfile.ANDROID_RUNTIME))

        assertEquals(ResultStatus.COMPLETE, result.status)
        assertEquals("fixture.aar", result.directArtifact?.displayName)
        assertEquals(1, result.directArtifact?.classfiles?.analyzedClasses)
        assertTrue(requireNotNull(result.directArtifact?.classfiles?.definedMethods) > 0)
        assertTrue(requireNotNull(result.directArtifact?.classfiles?.classfileBytes) > 0)
        assertEquals(26, result.androidPreflight?.requiredMinSdk)
        assertEquals("android-36-stable", result.androidPreflight?.selectedProfile?.id)
        assertEquals(AndroidDexStatus.SKIPPED, result.androidDex?.status)
        assertTrue(result.sizes.runtimeArchiveBytes > 0)
    }

    private fun analyzer(resolution: JvmResolutionResult): PackageBuildStatsAnalyzer =
        PackageBuildStatsAnalyzer(
            config = PackageBuildStatsConfig(),
            resolverClient = ResolverClient { _, _, _, _ -> resolution },
        )

    private fun resolution(
        requested: MavenCoordinate,
        coordinates: List<MavenCoordinate>,
        edges: List<DependencyEdge> = emptyList(),
    ): JvmResolutionResult {
        val artifacts =
            coordinates.mapIndexed { index, coordinate ->
                val path = jar("${coordinate.artifactId}.jar", index + 1)
                ResolvedArtifact(
                    coordinate = coordinate,
                    fileName = path.fileName.toString(),
                    path = path.toString(),
                    extension = "jar",
                    variant = "runtime",
                    digest = ArtifactDigest(value = sha256(path)),
                )
            }
        return JvmResolutionResult(
            status = ResultStatus.COMPLETE,
            resolution =
                ResolutionStats(
                    requested = requested,
                    components = coordinates.map { coordinate -> ResolvedComponent(coordinate, requested = coordinate == requested) },
                    edges = edges,
                    artifacts = artifacts,
                    repositories = listOf("maven-central", "google-maven"),
                ),
        )
    }

    private fun jar(
        name: String,
        size: Int,
    ): Path {
        val jar = tempDir.resolve(name)
        ZipOutputStream(Files.newOutputStream(jar)).use { output ->
            output.putNextEntry(ZipEntry("example/resource-$size.txt"))
            output.write(ByteArray(size) { size.toByte() })
            output.closeEntry()
        }
        return jar
    }

    private fun androidArchive(): Path {
        val archive = tempDir.resolve("fixture.aar")
        val resourceName = PackageBuildStatsAnalyzerTest::class.java.name.replace('.', '/') + ".class"
        val classBytes = requireNotNull(javaClass.classLoader.getResourceAsStream(resourceName)).use { it.readAllBytes() }
        val classesJar =
            java.io.ByteArrayOutputStream().use { bytes ->
                ZipOutputStream(bytes).use { output ->
                    output.putNextEntry(ZipEntry(resourceName))
                    output.write(classBytes)
                    output.closeEntry()
                }
                bytes.toByteArray()
            }
        ZipOutputStream(Files.newOutputStream(archive)).use { output ->
            output.putNextEntry(ZipEntry("AndroidManifest.xml"))
            output.write(
                """<manifest xmlns:android="http://schemas.android.com/apk/res/android"><uses-sdk android:minSdkVersion="26" /></manifest>"""
                    .toByteArray(),
            )
            output.closeEntry()
            output.putNextEntry(ZipEntry("META-INF/com/android/build/gradle/aar-metadata.properties"))
            output.write("minCompileSdk=35\nminAndroidGradlePluginVersion=8.0.0\n".toByteArray())
            output.closeEntry()
            output.putNextEntry(ZipEntry("classes.jar"))
            output.write(classesJar)
            output.closeEntry()
        }
        return archive
    }

    private fun sha256(path: Path): String = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)))
}
