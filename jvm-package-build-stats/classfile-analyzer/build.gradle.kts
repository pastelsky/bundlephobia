description = "Non-loading JVM classfile analysis"

dependencies {
    api(project(":model"))
    implementation("org.ow2.asm:asm:9.10.1")
    implementation("org.jetbrains.kotlin:kotlin-metadata-jvm:2.4.10")
}
