plugins {
    `java-gradle-plugin`
}

description = "Gradle-backed Maven coordinate resolver"

dependencies {
    implementation(project(":model"))

    testImplementation(gradleTestKit())
}

gradlePlugin {
    plugins {
        create("jvmRuntimeResolver") {
            id = "com.bundlephobia.jvm-runtime-resolver"
            implementationClass = "com.bundlephobia.jvm.resolver.JvmRuntimeResolverPlugin"
            displayName = "Bundlephobia JVM runtime resolver"
            description = "Resolves one exact JVM runtime dependency graph with sealed repositories"
        }
    }
}
