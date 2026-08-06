package com.bundlephobia.jvm

import com.bundlephobia.jvm.model.ArtifactAnalysis
import com.bundlephobia.jvm.model.ResolvedArtifact
import com.bundlephobia.jvm.model.ResultJson
import com.bundlephobia.jvm.model.ResultStatus
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.security.DigestInputStream
import java.security.MessageDigest
import java.util.HexFormat

/** Content-addressed artifact and static-analysis cache; values are immutable for a digest and analyzer version. */
internal class AnalysisCache(
    private val root: Path,
    private val analyzerVersion: String,
) {
    fun materialize(artifact: ResolvedArtifact): Path {
        require(artifact.digest.algorithm == "sha256") { "Unsupported digest ${artifact.digest.algorithm}" }
        val target = digestPath(root.resolve("artifacts/sha256"), artifact.digest.value, ".jar")
        if (Files.isRegularFile(target)) {
            if (sha256(target) == artifact.digest.value) return target
            Files.deleteIfExists(target)
        }

        Files.createDirectories(target.parent)
        val temporary = Files.createTempFile(target.parent, ".${artifact.digest.value}.", ".tmp")
        try {
            Files.copy(Path.of(artifact.path), temporary, StandardCopyOption.REPLACE_EXISTING)
            val actual = sha256(temporary)
            check(actual == artifact.digest.value) {
                "Artifact digest changed after resolution: expected ${artifact.digest.value}, found $actual"
            }
            publishImmutable(temporary, target)
        } finally {
            Files.deleteIfExists(temporary)
        }
        return target
    }

    fun analyze(
        digest: String,
        displayName: String,
        artifactPath: Path,
        inspector: (Path) -> ArtifactAnalysis,
    ): ArtifactAnalysis {
        val target = digestPath(root.resolve("analysis/$analyzerVersion"), digest, ".json")
        read(target, digest)?.let { return it.copy(displayName = displayName) }

        val analysis = inspector(artifactPath).copy(displayName = displayName)
        if (analysis.status != ResultStatus.FAILED) write(target, ResultJson.encode(analysis))
        return analysis
    }

    private fun read(
        path: Path,
        digest: String,
    ): ArtifactAnalysis? {
        if (!Files.isRegularFile(path)) return null
        val analysis =
            runCatching { ResultJson.decodeArtifactAnalysis(Files.readString(path)) }
                .getOrNull()
                ?.takeIf { analysis -> analysis.digest?.value == digest }
        if (analysis == null) Files.deleteIfExists(path)
        return analysis
    }

    private fun write(
        target: Path,
        value: String,
    ) {
        Files.createDirectories(target.parent)
        val temporary = Files.createTempFile(target.parent, ".${target.fileName}.", ".tmp")
        try {
            Files.writeString(temporary, value)
            publishImmutable(temporary, target)
        } finally {
            Files.deleteIfExists(temporary)
        }
    }

    private fun publishImmutable(
        temporary: Path,
        target: Path,
    ) {
        if (Files.exists(target)) return
        try {
            Files.move(temporary, target, StandardCopyOption.ATOMIC_MOVE)
        } catch (_: AtomicMoveNotSupportedException) {
            try {
                Files.move(temporary, target)
            } catch (_: FileAlreadyExistsException) {
                // A concurrent analyzer published the same immutable digest first.
            }
        } catch (_: FileAlreadyExistsException) {
            // A concurrent analyzer published the same immutable digest first.
        }
    }

    private fun digestPath(
        base: Path,
        digest: String,
        suffix: String,
    ): Path {
        require(digest.matches(SHA256_PATTERN)) { "Invalid SHA-256 digest" }
        return base.resolve(digest.take(2)).resolve("$digest$suffix")
    }

    private fun sha256(path: Path): String {
        val digest = MessageDigest.getInstance("SHA-256")
        Files.newInputStream(path).use { input ->
            DigestInputStream(input, digest).use { it.transferTo(java.io.OutputStream.nullOutputStream()) }
        }
        return HexFormat.of().formatHex(digest.digest())
    }

    private companion object {
        private val SHA256_PATTERN = Regex("[0-9a-f]{64}")
    }
}
