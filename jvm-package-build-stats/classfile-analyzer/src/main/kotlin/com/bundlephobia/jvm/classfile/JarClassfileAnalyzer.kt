package com.bundlephobia.jvm.classfile

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.ClassfileStats
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.DiagnosticSeverity
import com.bundlephobia.jvm.model.NamespaceStats
import org.objectweb.asm.AnnotationVisitor
import org.objectweb.asm.ClassReader
import org.objectweb.asm.ClassVisitor
import org.objectweb.asm.FieldVisitor
import org.objectweb.asm.MethodVisitor
import org.objectweb.asm.ModuleVisitor
import org.objectweb.asm.Opcodes
import java.io.IOException
import java.nio.file.Path
import java.util.TreeMap
import java.util.jar.Attributes
import java.util.jar.JarFile
import java.util.zip.ZipEntry

/** The deterministic classfile evidence produced for one local JAR. */
public data class ClassfileArtifactAnalysis(
    public val stats: ClassfileStats,
    public val namespaces: List<NamespaceStats>,
    public val diagnostics: List<Diagnostic> = emptyList(),
)

/**
 * Inspects JAR classfiles with ASM without defining, initializing, or otherwise loading package classes.
 *
 * @param targetRuntimeVersion Java feature version used to select effective multi-release JAR entries.
 */
public class JarClassfileAnalyzer(
    private val targetRuntimeVersion: Int = 21,
) {
    public fun analyze(path: Path): ClassfileArtifactAnalysis {
        val diagnostics = mutableListOf<Diagnostic>()
        val parsedClasses = mutableListOf<ParsedClass>()
        val unsupportedVersions = sortedSetOf<Int>()
        val multiReleaseVersions = sortedSetOf<Int>()

        try {
            JarFile(path.toFile(), false).use { jar ->
                val multiRelease =
                    jar.manifest
                        ?.mainAttributes
                        ?.getValue(Attributes.Name.MULTI_RELEASE)
                        ?.equals("true", ignoreCase = true) == true
                val selected = selectEntries(jar, multiRelease, multiReleaseVersions, diagnostics)
                for (entry in selected) {
                    if (entry.zipEntry.size > MAX_CLASSFILE_BYTES) {
                        diagnostics +=
                            warning(
                                "CLASSFILE_SIZE_LIMIT_EXCEEDED",
                                "Skipped ${entry.zipEntry.name}: classfile exceeds $MAX_CLASSFILE_BYTES bytes",
                            )
                        continue
                    }

                    val bytes = jar.getInputStream(entry.zipEntry).use { it.readNBytes(MAX_CLASSFILE_BYTES + 1) }
                    if (bytes.size > MAX_CLASSFILE_BYTES) {
                        diagnostics +=
                            warning(
                                "CLASSFILE_SIZE_LIMIT_EXCEEDED",
                                "Skipped ${entry.zipEntry.name}: classfile exceeds $MAX_CLASSFILE_BYTES bytes",
                            )
                        continue
                    }
                    val majorVersion = classfileMajorVersion(bytes)
                    if (majorVersion == null) {
                        diagnostics += warning("MALFORMED_CLASSFILE", "Skipped malformed classfile: ${entry.zipEntry.name}")
                        continue
                    }

                    try {
                        parsedClasses += parse(bytes, entry.zipEntry.size)
                    } catch (error: IllegalArgumentException) {
                        if (error.message?.contains("Unsupported class file major version") == true) {
                            unsupportedVersions += majorVersion
                            diagnostics +=
                                warning(
                                    "UNSUPPORTED_BYTECODE_VERSION",
                                    "Skipped ${entry.zipEntry.name}: unsupported classfile major version $majorVersion",
                                )
                        } else {
                            diagnostics += warning("MALFORMED_CLASSFILE", "Skipped malformed classfile: ${entry.zipEntry.name}")
                        }
                    } catch (_: ArrayIndexOutOfBoundsException) {
                        diagnostics += warning("MALFORMED_CLASSFILE", "Skipped malformed classfile: ${entry.zipEntry.name}")
                    }
                }

                return assemble(
                    parsedClasses,
                    multiRelease = multiRelease,
                    multiReleaseVersions = multiReleaseVersions,
                    unsupportedVersions = unsupportedVersions,
                    diagnostics = diagnostics,
                )
            }
        } catch (error: IOException) {
            diagnostics +=
                Diagnostic(
                    code = "CLASSFILE_ARCHIVE_READ_FAILED",
                    summary = error.message?.take(500) ?: "Classfiles could not be read",
                    stage = AnalysisStage.CLASSFILE_ANALYSIS,
                )
            return ClassfileArtifactAnalysis(ClassfileStats(), emptyList(), diagnostics)
        }
    }

    private fun selectEntries(
        jar: JarFile,
        multiRelease: Boolean,
        multiReleaseVersions: MutableSet<Int>,
        diagnostics: MutableList<Diagnostic>,
    ): List<SelectedEntry> {
        val selected = TreeMap<String, SelectedEntry>()
        val entries =
            jar
                .entries()
                .asSequence()
                .filter { !it.isDirectory && it.name.endsWith(".class") }
                .sortedBy { it.name }
        for (entry in entries) {
            val match = MULTI_RELEASE_PATH.matchEntire(entry.name)
            if (match == null) {
                selected.putIfAbsent(entry.name, SelectedEntry(entry, 0))
                continue
            }
            if (!multiRelease) continue

            val version = match.groupValues[1].toIntOrNull()
            if (version == null || version < 9) {
                diagnostics += warning("INVALID_MULTI_RELEASE_ENTRY", "Ignored invalid multi-release entry: ${entry.name}")
                continue
            }
            multiReleaseVersions += version
            if (version > targetRuntimeVersion) continue

            val logicalPath = match.groupValues[2]
            val current = selected[logicalPath]
            if (current == null || version > current.releaseVersion) {
                selected[logicalPath] = SelectedEntry(entry, version)
            }
        }
        return selected.values.toList()
    }

    private fun parse(
        bytes: ByteArray,
        classBytes: Long,
    ): ParsedClass {
        val visitor = InspectingClassVisitor(classBytes)
        ClassReader(bytes).accept(visitor, ClassReader.SKIP_DEBUG or ClassReader.SKIP_FRAMES)
        return visitor.result()
    }

    private fun assemble(
        parsedClasses: List<ParsedClass>,
        multiRelease: Boolean,
        multiReleaseVersions: Set<Int>,
        unsupportedVersions: Set<Int>,
        diagnostics: List<Diagnostic>,
    ): ClassfileArtifactAnalysis {
        val trie = PackageTrie()
        parsedClasses.filterNot(ParsedClass::moduleInfo).forEach(trie::insert)
        val namespaces = trie.namespaces()
        val types = parsedClasses.filterNot(ParsedClass::moduleInfo)
        val moduleClasses = parsedClasses.filter(ParsedClass::moduleInfo)

        return ClassfileArtifactAnalysis(
            stats =
                ClassfileStats(
                    analyzedClasses = types.size,
                    implementationClasses = types.count { it.visibility == TypeVisibility.IMPLEMENTATION },
                    publicTypes = types.count { it.visibility == TypeVisibility.PUBLIC },
                    protectedTypes = types.count { it.visibility == TypeVisibility.PROTECTED },
                    publicMembers = types.sumOf(ParsedClass::publicMembers),
                    protectedMembers = types.sumOf(ParsedClass::protectedMembers),
                    moduleInfoPresent = moduleClasses.isNotEmpty(),
                    moduleNames = moduleClasses.mapNotNull(ParsedClass::moduleName).distinct().sorted(),
                    moduleExports = moduleClasses.flatMap(ParsedClass::moduleExports).distinct().sorted(),
                    multiReleaseVersions = if (multiRelease) multiReleaseVersions.sorted() else emptyList(),
                    kotlinMetadataClasses = types.count(ParsedClass::kotlinMetadata),
                    reflectionIndicatorClasses = types.count(ParsedClass::reflectionIndicator),
                    serviceLoaderIndicatorClasses = types.count(ParsedClass::serviceLoaderIndicator),
                    jniIndicatorClasses = types.count(ParsedClass::jniIndicator),
                    unsupportedBytecodeVersions = unsupportedVersions.sorted(),
                ),
            namespaces = namespaces,
            diagnostics = diagnostics,
        )
    }

    private fun classfileMajorVersion(bytes: ByteArray): Int? {
        if (bytes.size < 8 || bytes[0] != 0xCA.toByte() || bytes[1] != 0xFE.toByte() || bytes[2] != 0xBA.toByte() ||
            bytes[3] != 0xBE.toByte()
        ) {
            return null
        }
        return ((bytes[6].toInt() and 0xFF) shl 8) or (bytes[7].toInt() and 0xFF)
    }

    private fun warning(
        code: String,
        summary: String,
    ): Diagnostic =
        Diagnostic(
            code = code,
            summary = summary,
            stage = AnalysisStage.CLASSFILE_ANALYSIS,
            severity = DiagnosticSeverity.WARNING,
        )

    private data class SelectedEntry(
        val zipEntry: ZipEntry,
        val releaseVersion: Int,
    )

    private companion object {
        const val MAX_CLASSFILE_BYTES: Int = 16 * 1024 * 1024
        val MULTI_RELEASE_PATH: Regex = Regex("^META-INF/versions/([0-9]+)/(.+\\.class)$")
    }
}

private class InspectingClassVisitor(
    private val classBytes: Long,
) : ClassVisitor(Opcodes.ASM9) {
    private lateinit var internalName: String
    private var classAccess: Int = 0
    private var innerClassAccess: Int? = null
    private var publicMembers: Int = 0
    private var protectedMembers: Int = 0
    private var kotlinMetadata: Boolean = false
    private var reflectionIndicator: Boolean = false
    private var serviceLoaderIndicator: Boolean = false
    private var jniIndicator: Boolean = false
    private var moduleName: String? = null
    private val moduleExports = sortedSetOf<String>()

    override fun visit(
        version: Int,
        access: Int,
        name: String,
        signature: String?,
        superName: String?,
        interfaces: Array<out String>?,
    ) {
        internalName = name
        classAccess = access
    }

    override fun visitInnerClass(
        name: String,
        outerName: String?,
        innerName: String?,
        access: Int,
    ) {
        if (name == internalName) innerClassAccess = access
    }

    override fun visitAnnotation(
        descriptor: String,
        visible: Boolean,
    ): AnnotationVisitor? {
        if (descriptor == KOTLIN_METADATA_DESCRIPTOR) kotlinMetadata = true
        return null
    }

    override fun visitModule(
        name: String,
        access: Int,
        version: String?,
    ): ModuleVisitor {
        moduleName = name
        return object : ModuleVisitor(Opcodes.ASM9) {
            override fun visitExport(
                packaze: String,
                access: Int,
                modules: Array<out String>?,
            ) {
                moduleExports += packaze.replace('/', '.')
            }
        }
    }

    override fun visitField(
        access: Int,
        name: String,
        descriptor: String,
        signature: String?,
        value: Any?,
    ): FieldVisitor? {
        countMember(access)
        return null
    }

    override fun visitMethod(
        access: Int,
        name: String,
        descriptor: String,
        signature: String?,
        exceptions: Array<out String>?,
    ): MethodVisitor? {
        if (name != "<clinit>") countMember(access)
        if (access and Opcodes.ACC_NATIVE != 0) jniIndicator = true
        return object : MethodVisitor(Opcodes.ASM9) {
            override fun visitMethodInsn(
                opcode: Int,
                owner: String,
                name: String,
                descriptor: String,
                isInterface: Boolean,
            ) {
                if (isReflectionCall(owner, name)) reflectionIndicator = true
                if (owner == SERVICE_LOADER_OWNER) serviceLoaderIndicator = true
                if (owner == SYSTEM_OWNER && name in JNI_SYSTEM_METHODS) jniIndicator = true
            }
        }
    }

    fun result(): ParsedClass {
        val moduleInfo = internalName == "module-info"
        val visibility = visibility(innerClassAccess ?: classAccess)
        val apiVisible = visibility == TypeVisibility.PUBLIC || visibility == TypeVisibility.PROTECTED
        return ParsedClass(
            internalName = internalName,
            classBytes = classBytes,
            visibility = visibility,
            publicMembers = if (apiVisible) publicMembers else 0,
            protectedMembers = if (apiVisible) protectedMembers else 0,
            kotlinMetadata = kotlinMetadata,
            reflectionIndicator = reflectionIndicator,
            serviceLoaderIndicator = serviceLoaderIndicator,
            jniIndicator = jniIndicator,
            moduleInfo = moduleInfo,
            moduleName = moduleName,
            moduleExports = moduleExports.toList(),
        )
    }

    private fun countMember(access: Int) {
        if (access and (Opcodes.ACC_SYNTHETIC or Opcodes.ACC_BRIDGE) != 0) return
        when {
            access and Opcodes.ACC_PUBLIC != 0 -> publicMembers++
            access and Opcodes.ACC_PROTECTED != 0 -> protectedMembers++
        }
    }

    private fun visibility(access: Int): TypeVisibility =
        when {
            access and Opcodes.ACC_PUBLIC != 0 -> TypeVisibility.PUBLIC
            access and Opcodes.ACC_PROTECTED != 0 -> TypeVisibility.PROTECTED
            else -> TypeVisibility.IMPLEMENTATION
        }

    private fun isReflectionCall(
        owner: String,
        name: String,
    ): Boolean =
        owner.startsWith("java/lang/reflect/") ||
            owner.startsWith("java/lang/invoke/MethodHandles") ||
            (owner == CLASS_OWNER && name in REFLECTIVE_CLASS_METHODS)

    private companion object {
        const val KOTLIN_METADATA_DESCRIPTOR: String = "Lkotlin/Metadata;"
        const val CLASS_OWNER: String = "java/lang/Class"
        const val SERVICE_LOADER_OWNER: String = "java/util/ServiceLoader"
        const val SYSTEM_OWNER: String = "java/lang/System"
        val REFLECTIVE_CLASS_METHODS: Set<String> =
            setOf(
                "forName",
                "getConstructor",
                "getDeclaredConstructor",
                "getField",
                "getDeclaredField",
                "getMethod",
                "getDeclaredMethod",
                "newInstance",
            )
        val JNI_SYSTEM_METHODS: Set<String> = setOf("load", "loadLibrary")
    }
}

private data class ParsedClass(
    val internalName: String,
    val classBytes: Long,
    val visibility: TypeVisibility,
    val publicMembers: Int,
    val protectedMembers: Int,
    val kotlinMetadata: Boolean,
    val reflectionIndicator: Boolean,
    val serviceLoaderIndicator: Boolean,
    val jniIndicator: Boolean,
    val moduleInfo: Boolean,
    val moduleName: String?,
    val moduleExports: List<String>,
)

private enum class TypeVisibility {
    PUBLIC,
    PROTECTED,
    IMPLEMENTATION,
}

private class PackageTrie {
    private val root = Node()

    fun insert(parsed: ParsedClass) {
        val packageName = parsed.internalName.substringBeforeLast('/', "")
        var node = root
        for (segment in packageName.split('/').filter(String::isNotEmpty)) {
            node = node.children.getOrPut(segment) { Node() }
        }
        node.stats.add(parsed)
    }

    fun namespaces(): List<NamespaceStats> {
        val result = mutableListOf<NamespaceStats>()
        flatten(root, emptyList(), result)
        return result
    }

    private fun flatten(
        node: Node,
        path: List<String>,
        result: MutableList<NamespaceStats>,
    ) {
        if (node.stats.classes > 0) {
            result += node.stats.toResult(if (path.isEmpty()) "<default>" else path.joinToString("."))
        }
        node.children.forEach { (segment, child) -> flatten(child, path + segment, result) }
    }

    private class Node {
        val children: TreeMap<String, Node> = TreeMap()
        val stats: MutableNamespaceStats = MutableNamespaceStats()
    }
}

private data class MutableNamespaceStats(
    var classBytes: Long = 0,
    var classes: Int = 0,
    var publicTypes: Int = 0,
    var publicMembers: Int = 0,
    var protectedTypes: Int = 0,
    var protectedMembers: Int = 0,
    var implementationClasses: Int = 0,
) {
    fun add(parsed: ParsedClass) {
        classBytes += parsed.classBytes
        classes++
        publicMembers += parsed.publicMembers
        protectedMembers += parsed.protectedMembers
        when (parsed.visibility) {
            TypeVisibility.PUBLIC -> publicTypes++
            TypeVisibility.PROTECTED -> protectedTypes++
            TypeVisibility.IMPLEMENTATION -> implementationClasses++
        }
    }

    fun toResult(name: String): NamespaceStats =
        NamespaceStats(
            name = name,
            classBytes = classBytes,
            classes = classes,
            publicTypes = publicTypes,
            publicMembers = publicMembers,
            protectedTypes = protectedTypes,
            protectedMembers = protectedMembers,
            implementationClasses = implementationClasses,
        )
}
