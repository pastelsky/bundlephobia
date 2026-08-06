# JavaScript and JVM package-stat concepts

The Node and JVM implementations share a product goal: explain the cost and
shape of adopting a published dependency. They intentionally do not force
different ecosystems into the same measurement model.

## Concept map

| Developer question                            | Node/package-build-stats                | JVM equivalent                                                                                   | JVM result field                                     |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| What is the package's headline weight?        | Built main asset after bundling         | Selected runtime JARs as published                                                               | `sizes.runtimeArchiveBytes`                          |
| What belongs to the requested package?        | Main package contribution               | JARs selected for the requested coordinate                                                       | `sizes.directArtifactArchiveBytes`                   |
| What do dependencies add?                     | Bundler dependency contribution         | Selected transitive runtime JARs                                                                 | `sizes.transitiveArtifactArchiveBytes`               |
| What is the expanded payload?                 | Bundler/module output                   | Uncompressed entries inside selected JARs                                                        | `sizes.runtimeExpandedBytes`                         |
| Which dependency contributes each byte total? | Dependency size tree                    | Exact selected-component totals and shortest paths                                               | `dependencySizes`                                    |
| What can consumers call?                      | ESM/CommonJS exports                    | Aggregate public/protected JVM types and members                                                 | `apiSurface.publicTypes`, `apiSurface.publicMembers` |
| Which API types are physically largest?       | Independently tree-shaken export bundle | Largest visible classfiles, not marginal export sizes                                            | `apiSurface.largestTypes[].classfileBytes`           |
| Which module boundary applies?                | ESM/CommonJS package entry points       | Explicit, automatic, or unnamed JPMS module                                                      | `module.kind`                                        |
| Which namespaces are exported?                | Package export map                      | JPMS exports, including qualified exports                                                        | `module.exports`                                     |
| Which runtime variant was selected?           | Conditional exports and bundler target  | Gradle attributes, capabilities, Java target, and multi-release view                             | `resolution.components[].variants`, `javaVersion`    |
| Is unused code removable?                     | Bundler tree shaking                    | No general JVM equivalent; report API versus implementation classes and dynamic-linkage evidence | `classfiles`, `apiSurface`                           |

## Size terminology

`archiveBytes` always means bytes in published JAR files. A JAR is already a
ZIP archive, so this is the closest useful analogue to transfer/compressed
weight. The JVM result deliberately does not call it `gzip`: gzipping an
already-compressed JAR is neither Maven's published artifact size nor a stable
runtime measure.

`expandedBytes` is the sum of uncompressed JAR entry sizes. It describes disk
and scanning payload, not live heap, class metadata, JIT output, or runtime RSS.
The top-level `sizes` object is the headline summary; `dependencySizes` gives
the same archive/expanded terminology for every selected component.

## Exports, API surface, and tree shaking

JavaScript export-size analysis can build one entry point per export and let a
bundler remove unreachable modules. Standard JVM dependency consumption does
not perform equivalent whole-program tree shaking. JVM analysis therefore
reports two related facts without presenting either as a false marginal size:

- aggregate public/protected type and member counts, plus a bounded list of the
  largest visible classfiles;
- aggregate implementation-class counts plus static-initializer, native,
  reflection, service-loader, and JNI indicators that can constrain shrinking.

Kotlin metadata is read without loading classes. Kotlin `internal`, private,
and local declarations are treated as implementation even when their JVM
access flags are public. Per-member signatures are intentionally omitted: they
made ordinary results too large and imply a level of API detail better served
by dedicated ABI tools.

JPMS exports are reported separately from API types. A public class in a
non-exported package is still bytecode-public, while an explicit module's export
rules determine whether another module can normally access it. Automatic and
unnamed modules are preserved as their canonical JVM concepts rather than
being labelled ESM or CommonJS.

## API and CLI alignment

The library entry point remains `PackageBuildStatsAnalyzer`, analogous to
Node's `getPackageStats`, and returns one schema-versioned
`PackageBuildStatsResult`. `directArtifact`, `sizes`, `dependencySizes`,
`apiSurface`, and `module` make the common developer questions directly
addressable. JSON readers ignore fields added by future schema versions while
writers continue to emit the current `schemaVersion`.

The executable is `jvm-package-stats`, mirroring Node's `package-stats` while
making the ecosystem explicit:

```text
package-stats stats PACKAGE[@VERSION]
jvm-package-stats stats GROUP:ARTIFACT:VERSION [--java-version VERSION]
jvm-package-stats inspect FILE.jar [--java-version VERSION]
```

`analyze` remains an alias for `stats`. JVM-specific resolver controls use
canonical names: `--gradle-executable` and `--resolution-timeout`. Both CLIs
keep operational or usage output on stderr. The JVM CLI presents a bounded,
colored summary on an interactive terminal while preserving complete JSON when
stdout is redirected; `--pretty` and `--json` make that choice explicit.

## Deliberate differences

- Maven coordinates are exact and Gradle performs canonical JVM variant and
  conflict selection; npm client or bundler selection has no direct counterpart.
- `javaVersion` affects both Gradle variant selection and multi-release JAR
  entries, so it is part of the output contract and any caller-owned cache key.
- A Maven component can contribute multiple artifacts. Component totals retain
  `artifactCount` rather than assuming one package equals one file.
- Cancellation stops the owned Gradle subprocess and is checked between static
  artifact analyses. Packages are inspected without executing their code.
- Metadata-only Kotlin Multiplatform coordinates are attributed to their
  nearest selected JVM artifact and reported with an explicit redirect
  diagnostic.
- Persistent caching and result retention belong to the calling service, not
  this analysis library.
- Android runtime selection and compatibility preflight are package-level
  operations. Declared AAR requirements select a pinned stable or preview SDK
  profile before any compiler, D8, or R8 process is started.
- With that profile ready, unshrunk DEX bytes and reference counts are measured
  by D8 over the complete runtime closure. This is the Android analogue of a
  reproducible package-level bundled measurement, not reachability analysis.
- For Android AARs, classes, methods, fields, and classfile bytes physically
  defined by the requested artifact are reported separately from the complete
  closure. This is the package-attributable headline; DEX references remain the
  deployable closure context.

Per-member marginal byte size, whole-program reachability, ProGuard/R8 shrinker
simulation, native-image reachability, and runtime memory are not claimed by
the current schema. Those require an explicit consumer program and toolchain
policy rather than package-only static analysis.
