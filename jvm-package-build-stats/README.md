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
yarn jvm:test
```

Use `yarn workspace jvm-package-build-stats format` to format Gradle and Kotlin
sources.
