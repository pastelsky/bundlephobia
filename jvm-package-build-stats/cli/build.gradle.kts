plugins {
    application
}

description = "Command-line interface for JVM package build statistics"

dependencies {
    implementation(project(":core"))
    implementation("info.picocli:picocli:4.7.7")
}

application {
    applicationName = "jvm-package-build-stats"
    mainClass = "com.bundlephobia.jvm.cli.MainKt"
}
