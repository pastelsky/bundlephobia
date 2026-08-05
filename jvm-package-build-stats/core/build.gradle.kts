import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar
import org.gradle.api.publish.PublishingExtension
import org.gradle.api.publish.maven.MavenPublication
import org.gradle.api.tasks.SourceSetContainer
import org.gradle.language.jvm.tasks.ProcessResources

plugins {
    id("com.gradleup.shadow")
    id("com.vanniktech.maven.publish.base")
    `maven-publish`
}

description = "Public JVM package build statistics library"

dependencies {
    api(project(":model"))
    implementation(project(":archive-analyzer"))
    implementation(project(":classfile-analyzer"))
    implementation(project(":resolver"))
}

java {
    withSourcesJar()
    withJavadocJar()
}

tasks.jar {
    archiveClassifier.set("thin")
}

tasks.named<Jar>("sourcesJar") {
    listOf("model", "archive-analyzer", "classfile-analyzer", "resolver").forEach { module ->
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
            artifactId = "jvm-package-build-stats-core"
            from(components["shadow"])
            artifact(tasks.named("sourcesJar"))
            artifact(tasks.named("javadocJar"))
        }
    }
}

tasks.named<ProcessResources>("processResources") {
    from(rootProject.file("gradlew")) {
        into("bundled-gradle")
    }
    from(rootProject.file("gradlew.bat")) {
        into("bundled-gradle")
    }
    from(rootProject.file("gradle/wrapper/gradle-wrapper.jar")) {
        into("bundled-gradle/gradle/wrapper")
    }
    from(rootProject.file("gradle/wrapper/gradle-wrapper.properties")) {
        into("bundled-gradle/gradle/wrapper")
    }
}
