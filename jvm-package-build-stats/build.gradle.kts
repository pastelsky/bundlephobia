import com.vanniktech.maven.publish.MavenPublishBaseExtension
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.api.publish.PublishingExtension
import org.gradle.api.publish.maven.MavenPublication
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile

plugins {
    base
    kotlin("jvm") version "2.4.10" apply false
    kotlin("plugin.serialization") version "2.4.10" apply false
    id("com.diffplug.spotless") version "8.9.0"
    id("com.gradleup.shadow") version "9.6.1" apply false
    id("com.vanniktech.maven.publish.base") version "0.37.0" apply false
}

group = "com.bundlephobia"
version = providers.gradleProperty("jvmPackageBuildStatsVersion").getOrElse("0.1.0-SNAPSHOT")

subprojects {
    apply(plugin = "java-library")
    apply(plugin = "org.jetbrains.kotlin.jvm")

    group = rootProject.group
    version = rootProject.version

    extensions.configure<JavaPluginExtension> {
        toolchain {
            languageVersion = JavaLanguageVersion.of(21)
        }
    }

    tasks.withType<JavaCompile>().configureEach {
        options.release.set(21)
        options.encoding = "UTF-8"
        options.compilerArgs.addAll(listOf("-Xlint:all", "-Werror"))
    }

    tasks.withType<KotlinJvmCompile>().configureEach {
        compilerOptions {
            allWarningsAsErrors.set(true)
            jvmTarget.set(JvmTarget.JVM_21)
            freeCompilerArgs.add("-Xjdk-release=21")
        }
    }

    tasks.withType<AbstractArchiveTask>().configureEach {
        isPreserveFileTimestamps = false
        isReproducibleFileOrder = true
    }

    tasks.withType<Jar>().configureEach {
        manifest {
            attributes(
                "Implementation-Title" to project.name,
                "Implementation-Version" to project.version,
                "Implementation-Vendor" to "Bundlephobia",
            )
        }
    }

    dependencyLocking {
        lockAllConfigurations()
    }

    dependencies {
        add("testImplementation", kotlin("test"))
    }

    tasks.withType<Test>().configureEach {
        useJUnitPlatform()
    }

    pluginManager.withPlugin("com.vanniktech.maven.publish.base") {
        extensions.configure<MavenPublishBaseExtension> {
            publishToMavenCentral()
            if (providers.gradleProperty("signingInMemoryKey").isPresent) signAllPublications()
        }
        extensions.configure<PublishingExtension> {
            publications.withType<MavenPublication>().configureEach {
                pom {
                    name.set("Bundlephobia ${project.description}")
                    description.set(project.description)
                    url.set("https://github.com/pastelsky/bundlephobia")
                    inceptionYear.set("2026")
                    licenses {
                        license {
                            name.set("MIT License")
                            url.set("https://opensource.org/license/mit")
                            distribution.set("repo")
                        }
                    }
                    developers {
                        developer {
                            id.set("pastelsky")
                            name.set("Shubham Kanodia")
                            email.set("shubham.kanodia10@gmail.com")
                        }
                    }
                    scm {
                        connection.set("scm:git:https://github.com/pastelsky/bundlephobia.git")
                        developerConnection.set("scm:git:ssh://git@github.com/pastelsky/bundlephobia.git")
                        url.set("https://github.com/pastelsky/bundlephobia")
                    }
                    issueManagement {
                        system.set("GitHub")
                        url.set("https://github.com/pastelsky/bundlephobia/issues")
                    }
                }
            }
            repositories {
                maven {
                    name = "releaseTest"
                    url =
                        uri(
                            rootProject.layout.buildDirectory
                                .dir("release-test-repository")
                                .get()
                                .asFile,
                        )
                }
            }
        }
    }
}

spotless {
    java {
        target("**/*.java")
        googleJavaFormat("1.35.0")
    }
    kotlin {
        target("**/*.kt")
        ktlint()
    }
    kotlinGradle {
        target("**/*.gradle.kts")
        ktlint()
    }
}

tasks.named("check") {
    dependsOn(subprojects.map { it.tasks.named("check") })
}

tasks.named("build") {
    dependsOn(subprojects.map { it.tasks.named("build") })
}

tasks.register("test") {
    group = "verification"
    description = "Runs the tests for every JVM package module."
    dependsOn(subprojects.map { it.tasks.named("test") })
}
