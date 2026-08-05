import org.gradle.language.jvm.tasks.ProcessResources

description = "Public JVM package build statistics library"

dependencies {
    api(project(":model"))
    implementation(project(":archive-analyzer"))
    implementation(project(":classfile-analyzer"))
    implementation(project(":resolver"))
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
