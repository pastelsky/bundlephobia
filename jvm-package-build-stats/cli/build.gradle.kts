import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar
import org.gradle.api.publish.PublishingExtension
import org.gradle.api.publish.maven.MavenPublication
import org.gradle.api.tasks.SourceSetContainer

plugins {
    application
    id("com.gradleup.shadow")
    id("com.vanniktech.maven.publish.base")
    `maven-publish`
}

description = "Command-line interface for JVM package build statistics"

dependencies {
    implementation(project(":core"))
    implementation("info.picocli:picocli:4.7.7")
}

application {
    applicationName = "jvm-package-stats"
    mainClass = "com.bundlephobia.jvm.cli.MainKt"
}

java {
    withSourcesJar()
    withJavadocJar()
}

tasks.jar {
    archiveClassifier.set("thin")
}

tasks.named<Jar>("sourcesJar") {
    listOf("model", "archive-analyzer", "classfile-analyzer", "resolver", "core").forEach { module ->
        from(project(":$module").extensions.getByType<SourceSetContainer>()["main"].allSource)
    }
}

tasks.named<ShadowJar>("shadowJar") {
    archiveClassifier.set("")
    duplicatesStrategy = DuplicatesStrategy.INCLUDE
    exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA")
}

extensions.configure<PublishingExtension> {
    publications {
        create<MavenPublication>("maven") {
            artifactId = "jvm-package-build-stats-cli"
            from(components["shadow"])
            artifact(tasks.named("sourcesJar"))
            artifact(tasks.named("javadocJar"))
        }
    }
}
