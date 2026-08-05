package com.bundlephobia.jvm.resolver

import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.Configuration
import org.gradle.api.artifacts.ResolutionStrategy
import org.gradle.api.artifacts.repositories.UrlArtifactRepository
import org.gradle.api.attributes.Bundling
import org.gradle.api.attributes.Category
import org.gradle.api.attributes.LibraryElements
import org.gradle.api.attributes.Usage
import org.gradle.api.attributes.java.TargetJvmEnvironment
import org.gradle.api.attributes.java.TargetJvmVersion
import org.gradle.api.initialization.Settings
import org.gradle.api.initialization.resolve.RepositoriesMode
import org.gradle.api.provider.ListProperty
import org.gradle.api.provider.Provider

/**
 * Seals dependency resolution to Maven Central followed by Google Maven and installs the resolver task.
 *
 * The plugin is applied to `settings.gradle.kts` so repository policy is established before projects are
 * evaluated. Project-level repositories are ignored by Gradle and also reported in the resolver output.
 */
public class JvmRuntimeResolverPlugin : Plugin<Settings> {
    override fun apply(settings: Settings) {
        val state = settings.extensions.create("jvmResolverState", JvmResolverSettingsState::class.java)
        settings.dependencyResolutionManagement.apply {
            repositories.clear()
            repositories.mavenCentral { it.name = MAVEN_CENTRAL_ID }
            repositories.google { it.name = GOOGLE_MAVEN_ID }
            repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
        }

        settings.gradle.beforeProject { project -> observeProjectRepositories(project, state) }
        settings.gradle.rootProject { project -> registerResolverTask(project, state) }
    }

    private fun observeProjectRepositories(
        project: Project,
        state: JvmResolverSettingsState,
    ) {
        project.repositories.whenObjectAdded { repository ->
            val location =
                when (repository) {
                    is UrlArtifactRepository -> repository.url.host ?: repository.url.scheme
                    else -> repository.javaClass.simpleName
                }
            state.forbiddenRepositories.add("${project.path}:${repository.name}:$location")
        }
    }

    private fun registerResolverTask(
        project: Project,
        state: JvmResolverSettingsState,
    ) {
        project.pluginManager.apply("jvm-ecosystem")
        val coordinate = project.providers.gradleProperty(COORDINATE_PROPERTY)
        val runtimeConfiguration = runtimeConfiguration(project, coordinate)
        project.tasks.register(RESOLVE_TASK_NAME, JvmRuntimeResolutionTask::class.java) { task ->
            task.coordinate.convention(coordinate)
            task.forbiddenRepositories.convention(state.forbiddenRepositories)
            task.outputFile.convention(project.layout.buildDirectory.file("jvm-resolver/result.json"))
            task.resolutionConfiguration = runtimeConfiguration
        }
    }

    private fun runtimeConfiguration(
        project: Project,
        coordinate: Provider<String>,
    ): Configuration =
        project.configurations
            .resolvable("jvmResolverRuntime") { configuration ->
                configuration.isTransitive = true
                configuration.dependencies.addLater(coordinate.map { project.dependencies.create(it) })
                configuration.resolutionStrategy.apply {
                    failOnChangingVersions()
                    sortArtifacts(ResolutionStrategy.SortOrder.DEPENDENCY_FIRST)
                }
                configuration.attributes {
                    it.attribute(Usage.USAGE_ATTRIBUTE, project.objects.named(Usage::class.java, Usage.JAVA_RUNTIME))
                    it.attribute(Category.CATEGORY_ATTRIBUTE, project.objects.named(Category::class.java, Category.LIBRARY))
                    it.attribute(
                        LibraryElements.LIBRARY_ELEMENTS_ATTRIBUTE,
                        project.objects.named(LibraryElements::class.java, LibraryElements.JAR),
                    )
                    it.attribute(
                        Bundling.BUNDLING_ATTRIBUTE,
                        project.objects.named(Bundling::class.java, Bundling.EXTERNAL),
                    )
                    it.attribute(
                        TargetJvmEnvironment.TARGET_JVM_ENVIRONMENT_ATTRIBUTE,
                        project.objects.named(TargetJvmEnvironment::class.java, TargetJvmEnvironment.STANDARD_JVM),
                    )
                    it.attribute(TargetJvmVersion.TARGET_JVM_VERSION_ATTRIBUTE, TARGET_JVM_VERSION)
                }
            }.get()

    public companion object {
        public const val PLUGIN_ID: String = "com.bundlephobia.jvm-runtime-resolver"
        public const val RESOLVE_TASK_NAME: String = "resolveJvmRuntime"
        public const val COORDINATE_PROPERTY: String = "jvmResolver.coordinate"
        public const val MAVEN_CENTRAL_ID: String = "maven-central"
        public const val GOOGLE_MAVEN_ID: String = "google-maven"
        private const val TARGET_JVM_VERSION: Int = 21
    }
}

/** Shared settings state used to turn forbidden project repositories into task input. */
public abstract class JvmResolverSettingsState {
    public abstract val forbiddenRepositories: ListProperty<String>
}
