package com.bundlephobia.jvm.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

@Serializable
@ConsistentCopyVisibility
public data class MavenCoordinate private constructor(
    public val groupId: String,
    public val artifactId: String,
    public val version: String,
) {
    @Transient public val notation: String = "$groupId:$artifactId:$version"

    override fun toString(): String = notation

    public companion object {
        private val groupPattern =
            Regex("[A-Za-z0-9_][A-Za-z0-9_-]*(?:\\.[A-Za-z0-9_][A-Za-z0-9_-]*)*")
        private val artifactPattern = Regex("[A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?")
        private val versionPattern = Regex("[A-Za-z0-9](?:[A-Za-z0-9._+-]*[A-Za-z0-9])?")
        private val dynamicVersions =
            setOf("latest", "latest.integration", "latest.release", "release")

        @JvmStatic
        public fun parse(value: String): MavenCoordinate {
            if (value.isEmpty()) {
                throw InvalidCoordinateException(CoordinateError.EMPTY, "Coordinate must not be empty")
            }
            if (value != value.trim()) {
                throw InvalidCoordinateException(
                    CoordinateError.FORMAT,
                    "Coordinate must not contain surrounding whitespace",
                )
            }

            val parts = value.split(':')
            if (parts.size != 3 || parts.any(String::isEmpty)) {
                throw InvalidCoordinateException(
                    CoordinateError.FORMAT,
                    "Coordinate must use the exact groupId:artifactId:version form",
                )
            }

            val (groupId, artifactId, version) = parts
            if (!groupPattern.matches(groupId)) {
                throw InvalidCoordinateException(
                    CoordinateError.INVALID_GROUP,
                    "groupId contains unsupported characters or empty segments",
                )
            }
            if (!artifactPattern.matches(artifactId)) {
                throw InvalidCoordinateException(
                    CoordinateError.INVALID_ARTIFACT,
                    "artifactId contains unsupported characters",
                )
            }
            if (
                version.contains("SNAPSHOT", ignoreCase = true) ||
                version.lowercase() in dynamicVersions ||
                version.contains('*') ||
                version.endsWith(".+")
            ) {
                throw InvalidCoordinateException(
                    CoordinateError.NON_IMMUTABLE_VERSION,
                    "version must identify one immutable published release",
                )
            }
            if (!versionPattern.matches(version)) {
                throw InvalidCoordinateException(
                    CoordinateError.INVALID_VERSION,
                    "version contains unsupported characters",
                )
            }

            return MavenCoordinate(groupId, artifactId, version)
        }
    }
}

public enum class CoordinateError {
    EMPTY,
    FORMAT,
    INVALID_GROUP,
    INVALID_ARTIFACT,
    INVALID_VERSION,
    NON_IMMUTABLE_VERSION,
}

public class InvalidCoordinateException(
    public val reason: CoordinateError,
    message: String,
) : IllegalArgumentException(message)
