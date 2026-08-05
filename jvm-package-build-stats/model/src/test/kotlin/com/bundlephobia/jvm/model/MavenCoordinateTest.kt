package com.bundlephobia.jvm.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class MavenCoordinateTest {
    @Test
    fun `parses exact Maven coordinates`() {
        val coordinate = MavenCoordinate.parse("com.squareup.okhttp3:okhttp:4.12.0")

        assertEquals("com.squareup.okhttp3", coordinate.groupId)
        assertEquals("okhttp", coordinate.artifactId)
        assertEquals("4.12.0", coordinate.version)
        assertEquals("com.squareup.okhttp3:okhttp:4.12.0", coordinate.notation)
    }

    @Test
    fun `allows legacy groups and exact build metadata`() {
        assertEquals("junit:junit:4.13.2", MavenCoordinate.parse("junit:junit:4.13.2").notation)
        assertEquals(
            "example_group:example-artifact:1.0.0+build7",
            MavenCoordinate.parse("example_group:example-artifact:1.0.0+build7").notation,
        )
    }

    @Test
    fun `rejects malformed coordinates`() {
        listOf(
            "",
            "g:a",
            "g:a:v:extra",
            " g:a:1",
            "g::1",
            "https://repo.example/g:a:1",
            "g/a:a:1",
        ).forEach { value -> assertFailsWith<InvalidCoordinateException> { MavenCoordinate.parse(value) } }
    }

    @Test
    fun `rejects mutable versions`() {
        listOf("1.0-SNAPSHOT", "latest.release", "RELEASE", "1.+", "[1.0,2.0)").forEach { version ->
            val error =
                assertFailsWith<InvalidCoordinateException> {
                    MavenCoordinate.parse("example:library:$version")
                }
            assertEquals(
                if (version == "[1.0,2.0)") {
                    CoordinateError.INVALID_VERSION
                } else {
                    CoordinateError.NON_IMMUTABLE_VERSION
                },
                error.reason,
            )
        }
    }
}
