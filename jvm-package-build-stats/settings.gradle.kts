pluginManagement {
    repositories {
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        google()
    }
}

rootProject.name = "jvm-package-build-stats"

include(
    "archive-analyzer",
    "classfile-analyzer",
    "cli",
    "core",
    "model",
    "resolver",
)
