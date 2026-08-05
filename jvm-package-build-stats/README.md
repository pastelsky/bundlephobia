# JVM package build stats

This workspace contains the JVM implementation of Bundlephobia's package build
statistics tooling. The initial foundation targets Kotlin 2.4.10 on JDK 21 and
uses the checked-in Gradle 9.5.1 wrapper.

The modules intentionally contain no analysis behavior yet:

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

## API and CLI milestone

The public model accepts only exact `groupId:artifactId:version` coordinates and
the `jvm-runtime` target. Snapshot, range, dynamic, URL, path, repository, and
Android inputs are rejected.

The CLI contract is:

```text
jvm-package-build-stats analyze GROUP:ARTIFACT:VERSION [--target jvm-runtime]
jvm-package-build-stats inspect FILE.jar
```

JSON analysis results are written to stdout. Usage and operational messages are
written to stderr. Exit codes are `0` for success, `1` for an unexpected CLI
failure, `2` for invalid usage, and `3` for a structured analysis failure.

This milestone intentionally returns `ANALYSIS_NOT_IMPLEMENTED` from both
analysis commands. Local JAR inspection is implemented in the next milestone;
Maven resolution is implemented later.
