package com.bundlephobia.jvm.resolver

/**
 * Locates the resolver plugin artifact without loading Gradle API types in library or CLI processes.
 *
 * The generated, sealed Gradle build uses this class's code source as its plugin classpath.
 */
public object ResolverPluginClasspathAnchor {
    public const val PLUGIN_CLASS: String = "com.bundlephobia.jvm.resolver.JvmRuntimeResolverPlugin"
    public const val RESOLVE_TASK_NAME: String = "resolveJvmRuntime"
    public const val COORDINATE_PROPERTY: String = "jvmResolver.coordinate"
}
