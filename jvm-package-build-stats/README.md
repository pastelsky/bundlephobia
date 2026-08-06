# JVM package build stats

This workspace contains the JVM implementation of Bundlephobia's package build
statistics tooling. It targets JDK 21, uses Kotlin 2.4.10 and a pinned Gradle
9.5.1 resolver, and never executes code from the package being measured.

- `model`: stable request and result types;
- `core`: public library facade and orchestration;
- `resolver`: Gradle-backed Maven coordinate resolution;
- `archive-analyzer`: defensive JAR archive analysis;
- `classfile-analyzer`: non-loading JVM classfile analysis;
- `cli`: command-line application.

From the repository root, run:

```sh
yarn jvm:build
yarn jvm:check
yarn jvm:format
yarn jvm:test
```

`jvm:format` applies ktlint to Kotlin and Gradle Kotlin DSL sources and Google
Java Format to Java sources. `jvm:check` verifies formatting and compiles Kotlin
and Java with warnings treated as errors; javac runs with all lint warnings
enabled.

## Published artifacts

After the first release, use the Java/Kotlin library with:

```kotlin
dependencies {
    implementation("com.bundlephobia:jvm-package-build-stats-core:VERSION")
}
```

```java
MavenCoordinate coordinate = MavenCoordinate.parse("com.google.code.gson:gson:2.14.0");
PackageBuildStatsResult result =
    new PackageBuildStatsAnalyzer().analyze(new AnalyzeRequest(coordinate));
String json = ResultJson.encode(result);
```

The executable artifact is
`com.bundlephobia:jvm-package-build-stats-cli:VERSION`. Both published JARs are
self-contained so the internal analyzer modules are not part of the public
Maven surface. The CLI JAR has a main-class manifest and can run with
`java -jar`.

## API and CLI

See [JavaScript and JVM package-stat concepts](docs/JAVASCRIPT-JVM-CONCEPTS.md)
for the shared terminology and the intentional ecosystem differences around
compressed size, exports, tree shaking, ESM, JPMS, and Gradle variants.

The public model accepts only exact `groupId:artifactId:version` coordinates and
the `jvm-runtime` target. Snapshot, range, dynamic, URL, path, repository, and
Android inputs are rejected.

The CLI contract is:

```text
jvm-package-stats stats GROUP:ARTIFACT:VERSION [--target jvm-runtime] [--java-version VERSION]
jvm-package-stats inspect FILE.jar [--java-version VERSION]
```

JSON analysis results are written to stdout. Usage and operational messages are
written to stderr. Exit codes are `0` for success, `1` for an unexpected CLI
failure, `2` for invalid usage, and `3` for a structured analysis failure.

`stats` (also available through the `analyze` alias) resolves the selected JVM runtime graph and combines archive, classfile, dependency, and
namespace evidence. It reports direct and transitive bytes, dependency depth,
shortest selected paths, largest transitive JARs, and conflict-selection
diagnostics. `inspect` performs the same static JAR analysis without resolving
dependencies.

The library does not persist artifacts or results; service callers own caching
and retention policy. Library callers can supply a Gradle wrapper, resolution
timeout, temporary root, and diagnostic-output bound through
`PackageBuildStatsConfig`.

Resolution runs in a temporary empty Gradle build. It evaluates only the owned
settings plugin and an empty build script: dependency-provided classes, tests,
annotation processors, build plugins, and scripts are never loaded or run.
Cancellation and timeouts stop that subprocess, and temporary build files are
removed. If graph resolution is incomplete after some artifacts were selected,
the result remains `partial` and preserves the completed static evidence.

Inspection reports exact archive bytes and mutually exclusive byte totals for
bytecode, metadata, services, licenses, signatures, Kotlin metadata, and other
content. It rejects unsafe paths, duplicates, excessive entry counts and sizes,
suspicious compression ratios, and malformed archives. ZIP64 archives are
supported subject to the same long-valued size and count limits.

For valid archives, inspection uses ASM visitors without class loading to report
the effective requested-Java class view, deterministic package namespaces,
aggregate public/protected API counts, implementation classes, explicit,
automatic or unnamed JPMS modules, and multi-release versions. Kotlin source
visibility is recovered from metadata, so `internal` declarations are not
misreported as public API. It also reports static indicators for reflection,
service loading, JNI, static initializers, native methods, and unsupported
future bytecode. Indicators describe bytecode evidence; they do not claim that
a code path executes or that an implementation class can safely be removed.

Public results are deliberately bounded. API surface is reported as aggregate
type/member counts plus the 20 largest visible types. Artifact analyses,
dependency contributions, paths, resolution evidence, and diagnostics each
have deterministic limits with total-count and truncation fields. Public
resolution summaries contain digests but never machine-local artifact paths.

## Internal Gradle resolver plugin

Coordinate resolution is implemented as a settings plugin so repository policy
is established before project evaluation. The sealed resolver build configures
Maven Central followed by Google Maven, ignores and reports project repository
declarations, and installs Gradle's JVM ecosystem compatibility rules.

Within this workspace, apply the plugin in a dedicated `settings.gradle.kts`:

```kotlin
plugins {
    id("com.bundlephobia.jvm-runtime-resolver")
}
```

Then run the owned task with one exact coordinate:

```sh
./gradlew resolveJvmRuntime \
  -PjvmResolver.coordinate=com.google.code.gson:gson:2.14.0
```

The task writes `build/jvm-resolver/result.json`. It records sorted components,
selected JVM runtime variants and attributes, dependency edges and selection
reasons, artifact paths and SHA-256 digests, and the permitted repository IDs.
Unresolved edges, forbidden project repositories, and non-JAR runtime artifacts
produce stable structured diagnostics. Gradle's public resolution API does not
expose reliable per-artifact repository provenance, so repository IDs describe
the complete ordered repository set rather than claiming which repository
served an individual artifact.

The root coordinate remains strictly exact. Transitive dependencies may request
ranges because Gradle normalizes them to selected exact components and preserves
both the requested edge and selected version in the result.

The public `analyze` API invokes this plugin through the sealed temporary build;
the standalone task remains useful for inspecting normalized resolver evidence.

## Contract and operations

- [Release process](docs/RELEASING.md) documents signing and Maven Central verification.
