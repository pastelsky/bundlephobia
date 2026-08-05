description = "Public JVM package build statistics library"

dependencies {
    api(project(":model"))
    implementation(project(":archive-analyzer"))
    implementation(project(":classfile-analyzer"))
}
