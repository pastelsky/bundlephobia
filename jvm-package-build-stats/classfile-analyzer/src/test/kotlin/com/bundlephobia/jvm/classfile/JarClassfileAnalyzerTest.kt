package com.bundlephobia.jvm.classfile

import com.bundlephobia.jvm.model.ClassfileStats
import com.bundlephobia.jvm.model.ModuleKind
import com.bundlephobia.jvm.model.NamespaceStats
import org.junit.jupiter.api.io.TempDir
import org.objectweb.asm.ClassWriter
import org.objectweb.asm.Opcodes
import org.objectweb.asm.Type
import java.nio.file.Files
import java.nio.file.Path
import java.util.jar.Attributes
import java.util.jar.Manifest
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JarClassfileAnalyzerTest {
    @TempDir lateinit var tempDir: Path

    @Test
    fun `counts Java API and namespaces deterministically`() {
        val publicApi =
            classBytes("com/acme/PublicApi", Opcodes.ACC_PUBLIC or Opcodes.ACC_ABSTRACT) {
                visitField(Opcodes.ACC_PUBLIC, "publicField", "I", null, null).visitEnd()
                visitField(Opcodes.ACC_PROTECTED, "protectedField", "I", null, null).visitEnd()
                visitField(Opcodes.ACC_PRIVATE, "privateField", "I", null, null).visitEnd()
                visitMethod(Opcodes.ACC_PUBLIC or Opcodes.ACC_ABSTRACT, "publicMethod", "()V", null, null).visitEnd()
                visitMethod(Opcodes.ACC_PROTECTED or Opcodes.ACC_ABSTRACT, "protectedMethod", "()V", null, null).visitEnd()
            }
        val internal =
            classBytes("com/acme/Internal", Opcodes.ACC_ABSTRACT) {
                visitField(Opcodes.ACC_PUBLIC, "notPublicApi", "I", null, null).visitEnd()
            }
        val protectedNested =
            classBytes("com/acme/Outer\$Protected", Opcodes.ACC_ABSTRACT) {
                visitInnerClass("com/acme/Outer\$Protected", "com/acme/Outer", "Protected", Opcodes.ACC_PROTECTED or Opcodes.ACC_STATIC)
                visitField(Opcodes.ACC_PUBLIC, "visible", "I", null, null).visitEnd()
            }
        val jar =
            writeJar(
                "java.jar",
                mapOf(
                    "com/acme/PublicApi.class" to publicApi,
                    "com/acme/Internal.class" to internal,
                    "com/acme/Outer\$Protected.class" to protectedNested,
                ),
            )

        val first = JarClassfileAnalyzer().analyze(jar)
        val second = JarClassfileAnalyzer().analyze(jar)

        assertEquals(first, second)
        assertEquals(
            ClassfileStats(
                analyzedClasses = 3,
                definedMethods = 2,
                definedFields = 5,
                classfileBytes = (publicApi.size + internal.size + protectedNested.size).toLong(),
                implementationClasses = 1,
                publicTypes = 1,
                protectedTypes = 1,
                publicMembers = 3,
                protectedMembers = 2,
            ),
            first.stats,
        )
        assertEquals(
            listOf(
                NamespaceStats(
                    name = "com.acme",
                    classBytes = (publicApi.size + internal.size + protectedNested.size).toLong(),
                    classes = 3,
                    publicTypes = 1,
                    publicMembers = 3,
                    protectedTypes = 1,
                    protectedMembers = 2,
                    implementationClasses = 1,
                ),
            ),
            first.namespaces,
        )
        assertEquals(1, first.apiSurface.publicTypes)
        assertEquals(1, first.apiSurface.protectedTypes)
        assertEquals(3, first.apiSurface.publicMembers)
        assertEquals(2, first.apiSurface.protectedMembers)
        assertEquals(2, first.apiSurface.largestTypes.size)
    }

    @Test
    fun `detects real Kotlin metadata without loading the class`() {
        val resourceName = KotlinFixture::class.java.name.replace('.', '/') + ".class"
        val bytes = requireNotNull(KotlinFixture::class.java.classLoader.getResourceAsStream(resourceName)).use { it.readAllBytes() }
        val jar = writeJar("kotlin.jar", mapOf(resourceName to bytes))

        val result = JarClassfileAnalyzer().analyze(jar)

        assertEquals(1, result.stats.kotlinMetadataClasses)
        assertEquals(1, result.stats.analyzedClasses)
    }

    @Test
    fun `uses Kotlin source visibility instead of JVM access flags`() {
        val classes = listOf(InternalKotlinApi::class.java, PublicKotlinApi::class.java)
        val entries =
            classes.associate { type ->
                val resourceName = type.name.replace('.', '/') + ".class"
                resourceName to requireNotNull(type.classLoader.getResourceAsStream(resourceName)).use { it.readAllBytes() }
            }
        val jar = writeJar("kotlin-visibility.jar", entries)

        val result = JarClassfileAnalyzer().analyze(jar)

        assertEquals(2, result.stats.kotlinMetadataClasses)
        assertEquals(1, result.stats.publicTypes)
        assertEquals(1, result.stats.implementationClasses)
        assertEquals(listOf(PublicKotlinApi::class.java.name), result.apiSurface.largestTypes.map { it.name })
    }

    @Test
    fun `reads JPMS module names and exports`() {
        val moduleInfo = moduleInfoBytes("com.acme.module", listOf("com/acme/api", "com/acme/spi"))
        val jar = writeJar("module.jar", mapOf("module-info.class" to moduleInfo))

        val result = JarClassfileAnalyzer().analyze(jar)

        assertTrue(result.stats.moduleInfoPresent)
        assertEquals(listOf("com.acme.module"), result.stats.moduleNames)
        assertEquals(listOf("com.acme.api", "com.acme.spi"), result.stats.moduleExports)
        assertEquals(ModuleKind.EXPLICIT, result.module.kind)
        assertEquals("com.acme.module", result.module.name)
        assertEquals(listOf("com.acme.api", "com.acme.spi"), result.module.exports.map { it.packageName })
        assertEquals(0, result.stats.analyzedClasses)
        assertTrue(result.namespaces.isEmpty())
    }

    @Test
    fun `distinguishes automatic and unnamed modules`() {
        val manifest =
            Manifest().apply {
                mainAttributes[Attributes.Name.MANIFEST_VERSION] = "1.0"
                mainAttributes.putValue("Automatic-Module-Name", "com.acme.automatic")
            }
        val classfile = classBytes("com/acme/Api", Opcodes.ACC_PUBLIC)

        val automatic = JarClassfileAnalyzer().analyze(writeJar("automatic.jar", mapOf("com/acme/Api.class" to classfile), manifest))
        val unnamed = JarClassfileAnalyzer().analyze(writeJar("unnamed.jar", mapOf("com/acme/Api.class" to classfile)))

        assertEquals(ModuleKind.AUTOMATIC, automatic.module.kind)
        assertEquals("com.acme.automatic", automatic.module.name)
        assertEquals(ModuleKind.UNNAMED, unnamed.module.kind)
        assertEquals(null, unnamed.module.name)
    }

    @Test
    fun `selects the effective Java 21 multi-release class`() {
        val base = classBytes("com/acme/Versioned", Opcodes.ACC_ABSTRACT)
        val java17 = classBytes("com/acme/Versioned", Opcodes.ACC_PUBLIC or Opcodes.ACC_ABSTRACT)
        val java22 = classBytes("com/acme/Versioned", Opcodes.ACC_PRIVATE or Opcodes.ACC_ABSTRACT)
        val manifest =
            Manifest().apply {
                mainAttributes[Attributes.Name.MANIFEST_VERSION] = "1.0"
                mainAttributes[Attributes.Name.MULTI_RELEASE] =
                    "true"
            }
        val jar =
            writeJar(
                "multi-release.jar",
                mapOf(
                    "com/acme/Versioned.class" to base,
                    "META-INF/versions/17/com/acme/Versioned.class" to java17,
                    "META-INF/versions/22/com/acme/Versioned.class" to java22,
                ),
                manifest,
            )

        val result = JarClassfileAnalyzer().analyze(jar)

        assertEquals(listOf(17, 22), result.stats.multiReleaseVersions)
        assertEquals(1, result.stats.analyzedClasses)
        assertEquals(1, result.stats.publicTypes)
        assertEquals(java17.size.toLong(), result.namespaces.single().classBytes)
    }

    @Test
    fun `detects reflection service loading and JNI indicators`() {
        val reflection =
            classBytes("signals/Reflection", Opcodes.ACC_PUBLIC) {
                val method = visitMethod(Opcodes.ACC_PUBLIC or Opcodes.ACC_STATIC, "reflect", "()V", null, null)
                method.visitCode()
                method.visitLdcInsn("java.lang.String")
                method.visitMethodInsn(Opcodes.INVOKESTATIC, "java/lang/Class", "forName", "(Ljava/lang/String;)Ljava/lang/Class;", false)
                method.visitInsn(Opcodes.POP)
                method.visitInsn(Opcodes.RETURN)
                method.visitMaxs(1, 0)
                method.visitEnd()
            }
        val serviceLoader =
            classBytes("signals/Services", Opcodes.ACC_PUBLIC) {
                val method = visitMethod(Opcodes.ACC_PUBLIC or Opcodes.ACC_STATIC, "load", "()V", null, null)
                method.visitCode()
                method.visitLdcInsn(Type.getType("Ljava/lang/Runnable;"))
                method.visitMethodInsn(
                    Opcodes.INVOKESTATIC,
                    "java/util/ServiceLoader",
                    "load",
                    "(Ljava/lang/Class;)Ljava/util/ServiceLoader;",
                    false,
                )
                method.visitInsn(Opcodes.POP)
                method.visitInsn(Opcodes.RETURN)
                method.visitMaxs(1, 0)
                method.visitEnd()
            }
        val jni =
            classBytes("signals/Native", Opcodes.ACC_PUBLIC or Opcodes.ACC_ABSTRACT) {
                visitMethod(Opcodes.ACC_PUBLIC or Opcodes.ACC_NATIVE, "nativeCall", "()V", null, null).visitEnd()
            }
        val jar =
            writeJar(
                "signals.jar",
                mapOf(
                    "signals/Reflection.class" to reflection,
                    "signals/Services.class" to serviceLoader,
                    "signals/Native.class" to jni,
                ),
            )

        val result = JarClassfileAnalyzer().analyze(jar)

        assertEquals(1, result.stats.reflectionIndicatorClasses)
        assertEquals(1, result.stats.serviceLoaderIndicatorClasses)
        assertEquals(1, result.stats.jniIndicatorClasses)
        assertEquals(1, result.stats.nativeMethodClasses)
    }

    @Test
    fun `returns deterministic evidence for future bytecode`() {
        val future = classBytes("future/Example", Opcodes.ACC_PUBLIC).copyOf()
        future[6] = 0x7F
        future[7] = 0xFF.toByte()
        val jar = writeJar("future.jar", mapOf("future/Example.class" to future))

        val result = JarClassfileAnalyzer().analyze(jar)

        assertEquals(listOf(32767), result.stats.unsupportedBytecodeVersions)
        assertEquals("UNSUPPORTED_BYTECODE_VERSION", result.diagnostics.single().code)
        assertEquals(0, result.stats.analyzedClasses)
    }

    private fun classBytes(
        name: String,
        access: Int,
        configure: ClassWriter.() -> Unit = {},
    ): ByteArray {
        val writer = ClassWriter(0)
        writer.visit(Opcodes.V21, access or Opcodes.ACC_SUPER, name, null, "java/lang/Object", null)
        writer.configure()
        writer.visitEnd()
        return writer.toByteArray()
    }

    private fun moduleInfoBytes(
        moduleName: String,
        exports: List<String>,
    ): ByteArray {
        val writer = ClassWriter(0)
        writer.visit(Opcodes.V21, Opcodes.ACC_MODULE, "module-info", null, null, null)
        val module = writer.visitModule(moduleName, 0, null)
        exports.forEach { module.visitExport(it, 0) }
        module.visitEnd()
        writer.visitEnd()
        return writer.toByteArray()
    }

    private fun writeJar(
        name: String,
        entries: Map<String, ByteArray>,
        manifest: Manifest? = null,
    ): Path {
        val path = tempDir.resolve(name)
        ZipOutputStream(Files.newOutputStream(path)).use { output ->
            if (manifest != null) {
                output.putNextEntry(stableEntry("META-INF/MANIFEST.MF"))
                manifest.write(output)
                output.closeEntry()
            }
            entries.toSortedMap().forEach { (entryName, bytes) ->
                output.putNextEntry(stableEntry(entryName))
                output.write(bytes)
                output.closeEntry()
            }
        }
        return path
    }

    private fun stableEntry(name: String): ZipEntry = ZipEntry(name).apply { time = 0L }

    private class KotlinFixture
}
