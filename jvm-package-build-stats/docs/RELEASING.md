# Maven Central release process

The public artifacts are:

- `com.bundlephobia:jvm-package-build-stats-core`
- `com.bundlephobia:jvm-package-build-stats-cli`

The maintained GradleUp Shadow plugin packages internal modules and runtime
libraries into those two JARs. The Vanniktech Maven Publish plugin supplies
Central Portal upload, in-memory signing, sources/Javadoc artifacts, checksums,
and deployment validation. No artifacts are published from pull requests.

## One-time setup

Register the `com.bundlephobia` namespace in Central Portal, publish the GPG
public key, create a Central user token, and configure the protected
`maven-central` GitHub environment with:

- `MAVEN_CENTRAL_USERNAME`
- `MAVEN_CENTRAL_PASSWORD`
- `MAVEN_SIGNING_KEY`
- `MAVEN_SIGNING_KEY_ID`
- `MAVEN_SIGNING_PASSWORD`

The private key must be ASCII-armored and is passed to Gradle only through an
in-memory property. Never commit credentials or key material.

## Release

1. Merge the final release PR and wait for all blocking CI jobs.
2. From the `bundlephobia` branch, dispatch **Release JVM package build stats**
   with a stable semantic version such as `0.1.0`.
3. The workflow builds/tests, builds both shadow JARs twice and compares
   SHA-256, signs every publication, and uploads/releases through Central
   Portal.
4. The workflow polls Maven Central for both coordinates, downloads the public
   JARs, byte-compares them with the locally signed release inputs, and prints
   SHA-256 values.

Central propagation can take 10–30 minutes. A missing namespace, signing key,
token, validation failure, checksum difference, or absent public coordinate is
a failed release. Do not retry under a different version until the deployment
state in Central Portal is understood.

## Local dry run

This command publishes only to a repository under `build/`; it never contacts
Central Portal:

```sh
./gradlew \
  :core:publishMavenPublicationToReleaseTestRepository \
  :cli:publishMavenPublicationToReleaseTestRepository
```

Inspect the generated POMs and self-contained JARs under
`build/release-test-repository/com/bundlephobia`. Release versions are supplied
with `-PjvmPackageBuildStatsVersion=X.Y.Z`; the default remains
`0.1.0-SNAPSHOT`.
