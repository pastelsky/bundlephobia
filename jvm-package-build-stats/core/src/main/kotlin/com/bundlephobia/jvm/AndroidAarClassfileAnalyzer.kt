package com.bundlephobia.jvm

import com.bundlephobia.jvm.classfile.JarClassfileAnalyzer
import com.bundlephobia.jvm.model.ClassfileStats
import com.bundlephobia.jvm.model.Diagnostic
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.util.Comparator
import java.util.zip.ZipFile

internal data class AndroidAarClassfileResult(
    val stats: ClassfileStats,
    val diagnostics: List<Diagnostic>,
)

/** Attributes classfile definitions to bytecode physically embedded in one AAR. */
internal class AndroidAarClassfileAnalyzer(
    private val config: PackageBuildStatsConfig,
    private val javaVersion: Int,
) {
    fun analyze(path: Path): AndroidAarClassfileResult {
        val workDirectory =
            config.temporaryDirectory?.let { parent ->
                Files.createDirectories(parent)
                Files.createTempDirectory(parent, "jvm-aar-classfiles-")
            } ?: Files.createTempDirectory("jvm-aar-classfiles-")
        return try {
            val analyses = extractNestedJars(path, workDirectory).map { JarClassfileAnalyzer(javaVersion).analyze(it) }
            AndroidAarClassfileResult(
                stats = analyses.map { it.stats }.fold(ClassfileStats()) { total, stats -> total.plus(stats) },
                diagnostics = analyses.flatMap { it.diagnostics },
            )
        } finally {
            deleteRecursively(workDirectory)
        }
    }

    private fun extractNestedJars(
        path: Path,
        directory: Path,
    ): List<Path> =
        ZipFile(path.toFile()).use { archive ->
            val entries =
                archive
                    .entries()
                    .asSequence()
                    .filter { entry ->
                        !entry.isDirectory &&
                            (entry.name == "classes.jar" || (entry.name.startsWith("libs/") && entry.name.endsWith(".jar")))
                    }.sortedBy { it.name }
                    .take(MAX_NESTED_JARS + 1)
                    .toList()
            check(entries.size <= MAX_NESTED_JARS) { "AAR contains too many nested JARs" }

            var totalBytes = 0L
            entries.mapIndexed { index, entry ->
                val target = directory.resolve("$index.jar")
                archive.getInputStream(entry).use { input ->
                    Files.newOutputStream(target).use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var entryBytes = 0L
                        while (true) {
                            val read = input.read(buffer)
                            if (read < 0) break
                            entryBytes += read
                            totalBytes += read
                            check(entryBytes <= MAX_NESTED_JAR_BYTES) { "Nested JAR exceeds classfile input limit" }
                            check(totalBytes <= MAX_TOTAL_NESTED_JAR_BYTES) { "AAR bytecode exceeds classfile input limit" }
                            output.write(buffer, 0, read)
                        }
                    }
                }
                target
            }
        }

    private fun ClassfileStats.plus(other: ClassfileStats): ClassfileStats =
        ClassfileStats(
            analyzedClasses = analyzedClasses + other.analyzedClasses,
            definedMethods = definedMethods + other.definedMethods,
            definedFields = definedFields + other.definedFields,
            classfileBytes = classfileBytes + other.classfileBytes,
            implementationClasses = implementationClasses + other.implementationClasses,
            publicTypes = publicTypes + other.publicTypes,
            protectedTypes = protectedTypes + other.protectedTypes,
            publicMembers = publicMembers + other.publicMembers,
            protectedMembers = protectedMembers + other.protectedMembers,
            moduleInfoPresent = moduleInfoPresent || other.moduleInfoPresent,
            moduleNames = (moduleNames + other.moduleNames).distinct().sorted(),
            moduleExports = (moduleExports + other.moduleExports).distinct().sorted(),
            multiReleaseVersions = (multiReleaseVersions + other.multiReleaseVersions).distinct().sorted(),
            kotlinMetadataClasses = kotlinMetadataClasses + other.kotlinMetadataClasses,
            reflectionIndicatorClasses = reflectionIndicatorClasses + other.reflectionIndicatorClasses,
            serviceLoaderIndicatorClasses = serviceLoaderIndicatorClasses + other.serviceLoaderIndicatorClasses,
            jniIndicatorClasses = jniIndicatorClasses + other.jniIndicatorClasses,
            classesWithStaticInitializers = classesWithStaticInitializers + other.classesWithStaticInitializers,
            nativeMethodClasses = nativeMethodClasses + other.nativeMethodClasses,
            unsupportedBytecodeVersions =
                (unsupportedBytecodeVersions + other.unsupportedBytecodeVersions).distinct().sorted(),
        )

    private fun deleteRecursively(directory: Path) {
        try {
            Files.walk(directory).use { paths ->
                paths.sorted(Comparator.reverseOrder()).forEach { path -> Files.deleteIfExists(path) }
            }
        } catch (_: IOException) {
            // Extracted bytecode is temporary evidence and is never returned to callers.
        }
    }

    private companion object {
        const val MAX_NESTED_JARS = 32
        const val MAX_NESTED_JAR_BYTES = 256L * 1_024 * 1_024
        const val MAX_TOTAL_NESTED_JAR_BYTES = 512L * 1_024 * 1_024
    }
}
