package com.bundlephobia.jvm.classfile

import com.bundlephobia.jvm.model.AnalysisStage
import com.bundlephobia.jvm.model.ApiSurfaceStats
import com.bundlephobia.jvm.model.ApiTypeStats
import com.bundlephobia.jvm.model.ClassfileStats
import com.bundlephobia.jvm.model.Diagnostic
import com.bundlephobia.jvm.model.DiagnosticSeverity
import com.bundlephobia.jvm.model.ModuleExport
import com.bundlephobia.jvm.model.ModuleKind
import com.bundlephobia.jvm.model.ModuleOpen
import com.bundlephobia.jvm.model.ModuleProvider
import com.bundlephobia.jvm.model.ModuleRequirement
import com.bundlephobia.jvm.model.ModuleStats
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
import kotlin.Metadata
import kotlin.metadata.Visibility
import kotlin.metadata.jvm.KotlinClassMetadata
import kotlin.metadata.visibility

/** The deterministic classfile evidence produced for one local JAR. */
public data class ClassfileArtifactAnalysis(
    public val stats: ClassfileStats,
    public val namespaces: List<NamespaceStats>,
    public val module: ModuleStats,
    public val apiSurface: ApiSurfaceStats,
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
                val automaticModuleName = jar.manifest?.mainAttributes?.getValue("Automatic-Module-Name")
                val manifestMainClass = jar.manifest?.mainAttributes?.getValue(Attributes.Name.MAIN_CLASS)
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
                    automaticModuleName = automaticModuleName,
                    manifestMainClass = manifestMainClass,
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
            return ClassfileArtifactAnalysis(
                stats = ClassfileStats(),
                namespaces = emptyList(),
                module = ModuleStats(ModuleKind.UNNAMED),
                apiSurface = ApiSurfaceStats(),
                diagnostics = diagnostics,
            )
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
        automaticModuleName: String?,
        manifestMainClass: String?,
        diagnostics: List<Diagnostic>,
    ): ClassfileArtifactAnalysis {
        val trie = PackageTrie()
        parsedClasses.filterNot(ParsedClass::moduleInfo).forEach(trie::insert)
        val namespaces = trie.namespaces()
        val types = parsedClasses.filterNot(ParsedClass::moduleInfo)
        val moduleClasses = parsedClasses.filter(ParsedClass::moduleInfo)
        val explicitModule = moduleClasses.singleOrNull()
        val module =
            when {
                explicitModule != null -> {
                    explicitModule.toModuleStats(manifestMainClass)
                }

                automaticModuleName != null -> {
                    ModuleStats(
                        kind = ModuleKind.AUTOMATIC,
                        name = automaticModuleName,
                        mainClass = manifestMainClass,
                    )
                }

                else -> {
                    ModuleStats(kind = ModuleKind.UNNAMED, mainClass = manifestMainClass)
                }
            }
        val allApiTypes =
            types
                .filter { type -> type.visibility != TypeVisibility.IMPLEMENTATION }
                .map { type ->
                    ApiTypeStats(
                        name = type.internalName.replace('/', '.'),
                        packageName = type.internalName.substringBeforeLast('/', "").replace('/', '.'),
                        language = if (type.kotlinMetadata) "kotlin" else "java",
                        visibility = type.visibility.name.lowercase(),
                        classfileBytes = type.classBytes,
                        publicMembers = type.publicMembers,
                        protectedMembers = type.protectedMembers,
                    )
                }
        val largestApiTypes =
            allApiTypes
                .sortedWith(compareByDescending(ApiTypeStats::classfileBytes).thenBy(ApiTypeStats::name))
                .take(MAX_REPORTED_API_TYPES)

        return ClassfileArtifactAnalysis(
            stats =
                ClassfileStats(
                    analyzedClasses = types.size,
                    definedMethods = types.sumOf(ParsedClass::definedMethods),
                    definedFields = types.sumOf(ParsedClass::definedFields),
                    classfileBytes = types.sumOf(ParsedClass::classBytes),
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
                    classesWithStaticInitializers = types.count(ParsedClass::staticInitializer),
                    nativeMethodClasses = types.count(ParsedClass::nativeMethods),
                    unsupportedBytecodeVersions = unsupportedVersions.sorted(),
                ),
            namespaces = namespaces,
            module = module,
            apiSurface =
                ApiSurfaceStats(
                    publicTypes = allApiTypes.count { type -> type.visibility == "public" },
                    protectedTypes = allApiTypes.count { type -> type.visibility == "protected" },
                    publicMembers = allApiTypes.sumOf(ApiTypeStats::publicMembers),
                    protectedMembers = allApiTypes.sumOf(ApiTypeStats::protectedMembers),
                    classfileBytes = allApiTypes.sumOf(ApiTypeStats::classfileBytes),
                    largestTypes = largestApiTypes,
                    truncated = allApiTypes.size > largestApiTypes.size,
                ),
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
        const val MAX_REPORTED_API_TYPES: Int = 20
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
    private var definedMethods: Int = 0
    private var definedFields: Int = 0
    private var kotlinMetadata: Boolean = false
    private var kotlinVisibility: TypeVisibility? = null
    private var reflectionIndicator: Boolean = false
    private var serviceLoaderIndicator: Boolean = false
    private var jniIndicator: Boolean = false
    private var staticInitializer: Boolean = false
    private var nativeMethods: Boolean = false
    private var moduleName: String? = null
    private var moduleVersion: String? = null
    private var moduleMainClass: String? = null
    private val moduleExports = sortedSetOf<String>()
    private val moduleExportDetails = mutableListOf<ModuleExport>()
    private val moduleRequires = mutableListOf<ModuleRequirement>()
    private val moduleOpens = mutableListOf<ModuleOpen>()
    private val moduleUses = sortedSetOf<String>()
    private val moduleProvides = mutableListOf<ModuleProvider>()

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
        if (descriptor != KOTLIN_METADATA_DESCRIPTOR) return null
        kotlinMetadata = true
        return KotlinMetadataAnnotationVisitor { metadata ->
            kotlinVisibility = metadata.kotlinTypeVisibility()
        }
    }

    override fun visitModule(
        name: String,
        access: Int,
        version: String?,
    ): ModuleVisitor {
        moduleName = name
        moduleVersion = version
        return object : ModuleVisitor(Opcodes.ASM9) {
            override fun visitMainClass(mainClass: String) {
                moduleMainClass = mainClass.replace('/', '.')
            }

            override fun visitRequire(
                module: String,
                access: Int,
                version: String?,
            ) {
                moduleRequires +=
                    ModuleRequirement(
                        name = module,
                        transitive = access and Opcodes.ACC_TRANSITIVE != 0,
                        static = access and Opcodes.ACC_STATIC_PHASE != 0,
                        version = version,
                    )
            }

            override fun visitExport(
                packaze: String,
                access: Int,
                modules: Array<out String>?,
            ) {
                val packageName = packaze.replace('/', '.')
                moduleExports += packageName
                moduleExportDetails += ModuleExport(packageName, modules.orEmpty().sorted())
            }

            override fun visitOpen(
                packaze: String,
                access: Int,
                modules: Array<out String>?,
            ) {
                moduleOpens += ModuleOpen(packaze.replace('/', '.'), modules.orEmpty().sorted())
            }

            override fun visitUse(service: String) {
                moduleUses += service.replace('/', '.')
            }

            override fun visitProvide(
                service: String,
                providers: Array<out String>,
            ) {
                moduleProvides +=
                    ModuleProvider(
                        service = service.replace('/', '.'),
                        implementations = providers.map { provider -> provider.replace('/', '.') }.sorted(),
                    )
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
        definedFields++
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
        definedMethods++
        if (name == "<clinit>") staticInitializer = true
        if (name != "<clinit>") {
            countMember(access)
        }
        if (access and Opcodes.ACC_NATIVE != 0) {
            jniIndicator = true
            nativeMethods = true
        }
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
        val visibility = kotlinVisibility ?: visibility(innerClassAccess ?: classAccess)
        val apiVisible = visibility == TypeVisibility.PUBLIC || visibility == TypeVisibility.PROTECTED
        return ParsedClass(
            internalName = internalName,
            classBytes = classBytes,
            visibility = visibility,
            publicMembers = if (apiVisible) publicMembers else 0,
            protectedMembers = if (apiVisible) protectedMembers else 0,
            definedMethods = definedMethods,
            definedFields = definedFields,
            kotlinMetadata = kotlinMetadata,
            reflectionIndicator = reflectionIndicator,
            serviceLoaderIndicator = serviceLoaderIndicator,
            jniIndicator = jniIndicator,
            staticInitializer = staticInitializer,
            nativeMethods = nativeMethods,
            moduleInfo = moduleInfo,
            moduleName = moduleName,
            moduleVersion = moduleVersion,
            moduleMainClass = moduleMainClass,
            moduleExports = moduleExports.toList(),
            moduleExportDetails = moduleExportDetails.sortedBy(ModuleExport::packageName),
            moduleRequires = moduleRequires.sortedBy(ModuleRequirement::name),
            moduleOpens = moduleOpens.sortedBy(ModuleOpen::packageName),
            moduleUses = moduleUses.toList(),
            moduleProvides = moduleProvides.sortedBy(ModuleProvider::service),
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
    val definedMethods: Int,
    val definedFields: Int,
    val kotlinMetadata: Boolean,
    val reflectionIndicator: Boolean,
    val serviceLoaderIndicator: Boolean,
    val jniIndicator: Boolean,
    val staticInitializer: Boolean,
    val nativeMethods: Boolean,
    val moduleInfo: Boolean,
    val moduleName: String?,
    val moduleVersion: String?,
    val moduleMainClass: String?,
    val moduleExports: List<String>,
    val moduleExportDetails: List<ModuleExport>,
    val moduleRequires: List<ModuleRequirement>,
    val moduleOpens: List<ModuleOpen>,
    val moduleUses: List<String>,
    val moduleProvides: List<ModuleProvider>,
)

private class KotlinMetadataAnnotationVisitor(
    private val completed: (Metadata) -> Unit,
) : AnnotationVisitor(Opcodes.ASM9) {
    private var kind: Int = 1
    private var metadataVersion: IntArray = intArrayOf()
    private var bytecodeVersion: IntArray = intArrayOf()
    private var data1: Array<String> = emptyArray()
    private var data2: Array<String> = emptyArray()
    private var extraString: String = ""
    private var packageName: String = ""
    private var extraInt: Int = 0

    override fun visit(
        name: String?,
        value: Any?,
    ) {
        when (name) {
            "k" -> kind = value as Int
            "mv" -> metadataVersion = value as IntArray
            "bv" -> bytecodeVersion = value as IntArray
            "xs" -> extraString = value as String
            "pn" -> packageName = value as String
            "xi" -> extraInt = value as Int
        }
    }

    override fun visitArray(name: String): AnnotationVisitor {
        val values = mutableListOf<Any>()
        return object : AnnotationVisitor(Opcodes.ASM9) {
            override fun visit(
                ignored: String?,
                value: Any,
            ) {
                values += value
            }

            override fun visitEnd() {
                when (name) {
                    "mv" -> metadataVersion = values.map(Any::toString).map(String::toInt).toIntArray()
                    "bv" -> bytecodeVersion = values.map(Any::toString).map(String::toInt).toIntArray()
                    "d1" -> data1 = values.map(Any::toString).toTypedArray()
                    "d2" -> data2 = values.map(Any::toString).toTypedArray()
                }
            }
        }
    }

    override fun visitEnd() {
        completed(
            Metadata(
                kind = kind,
                metadataVersion = metadataVersion,
                bytecodeVersion = bytecodeVersion,
                data1 = data1,
                data2 = data2,
                extraString = extraString,
                packageName = packageName,
                extraInt = extraInt,
            ),
        )
    }
}

private fun Metadata.kotlinTypeVisibility(): TypeVisibility? =
    runCatching {
        val metadata = KotlinClassMetadata.readLenient(this)
        if (metadata !is KotlinClassMetadata.Class) return@runCatching null
        when (metadata.kmClass.visibility) {
            Visibility.PUBLIC -> TypeVisibility.PUBLIC
            Visibility.PROTECTED -> TypeVisibility.PROTECTED
            else -> TypeVisibility.IMPLEMENTATION
        }
    }.getOrNull()

private fun ParsedClass.toModuleStats(manifestMainClass: String?): ModuleStats =
    ModuleStats(
        kind = ModuleKind.EXPLICIT,
        name = moduleName,
        version = moduleVersion,
        mainClass = moduleMainClass ?: manifestMainClass,
        requires = moduleRequires,
        exports = moduleExportDetails,
        opens = moduleOpens,
        uses = moduleUses,
        provides = moduleProvides,
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
