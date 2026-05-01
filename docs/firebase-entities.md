# Firebase Entities

This repo stores Firebase data in the Realtime Database under a small set of top-level nodes.

There are two useful views of that model:

- Logical entities: what shape each stored value has.
- Storage layout: how those entities are keyed under Firebase paths.

`encodeFirebaseKey()` is used for package names and versions before writing keys, so package names like `@scope/pkg` and versions containing reserved Firebase characters are stored in encoded form.

## Logical Entity Diagram

```mermaid
erDiagram
    FIREBASE_PACKAGE ||--o{ PACKAGE_BUILD_RESULT : stores_versions_in
    FIREBASE_PACKAGE ||--o{ PACKAGE_EXPORT_SIZES : stores_versions_in
    FIREBASE_PACKAGE ||--o| PACKAGE_SEARCH : tracked_by
    PACKAGE_BUILD_RESULT ||--o{ DEPENDENCY_SIZE : contains

    FIREBASE_PACKAGE {
        string encodedKey PK
        string packageName "decoded npm package name"
    }

    PACKAGE_BUILD_RESULT {
        string version PK
        boolean scoped
        string name
        string description
        string repository
        int dependencyCount
        boolean hasJSNext
        boolean hasJSModule
        boolean hasSideEffects
        boolean isModuleType
        int size
        int gzip
        string[] ignoredMissingDependencies
    }

    DEPENDENCY_SIZE {
        string name
        int approximateSize
    }

    PACKAGE_EXPORT_SIZES {
        string version PK
        string name
        string[] exports "export paths discovered by package-build-stats"
        object sizesByExport "per-export size payload from package-build-stats"
    }

    PACKAGE_SEARCH {
        string packageName PK
        string name
        string version
        int count
        long lastSearched
    }
```

## Realtime Database Layout

```mermaid
erDiagram
    FIREBASE_ROOT ||--|| MODULES_V2 : has
    FIREBASE_ROOT ||--|| MODULES_V3 : has
    FIREBASE_ROOT ||--|| EXPORTS_V2 : has
    FIREBASE_ROOT ||--|| EXPORTS_V3 : has
    FIREBASE_ROOT ||--|| SEARCHES_V2 : has

    MODULES_V2 ||--o{ MODULES_PACKAGE : package_key
    MODULES_V3 ||--o{ MODULES_PACKAGE : package_key
    EXPORTS_V2 ||--o{ EXPORTS_PACKAGE : package_key
    EXPORTS_V3 ||--o{ EXPORTS_PACKAGE : package_key
    SEARCHES_V2 ||--o{ SEARCH_ENTRY : package_key

    MODULES_PACKAGE ||--o{ MODULES_VERSION_ENTRY : version_key
    EXPORTS_PACKAGE ||--o{ EXPORTS_VERSION_ENTRY : version_key

    FIREBASE_ROOT {
        string databaseURL
    }

    MODULES_V2 {
        string path "modules-v2"
    }

    MODULES_V3 {
        string path "modules-v3"
    }

    EXPORTS_V2 {
        string path "exports"
    }

    EXPORTS_V3 {
        string path "exports-v3"
    }

    SEARCHES_V2 {
        string path "searches-v2"
    }

    MODULES_PACKAGE {
        string encodedPackageKey PK
    }

    EXPORTS_PACKAGE {
        string encodedPackageKey PK
    }

    SEARCH_ENTRY {
        string encodedPackageKey PK
        string name
        string version
        int count
        long lastSearched
    }

    MODULES_VERSION_ENTRY {
        string encodedVersionKey PK
        object packageBuildResult
    }

    EXPORTS_VERSION_ENTRY {
        string encodedVersionKey PK
        object packageExportSizes
    }
```

## Notes

- `modules-v2` is the legacy package size cache.
- `modules-v3` is the current package size cache, with fallback reads to `modules-v2`.
- `exports` is the legacy export-size cache.
- `exports-v3` is the current export-size cache, with fallback reads to `exports`.
- `searches-v2` tracks recent/popular package lookups and is updated when `/api/size` is called with `record=true`.

## Source References

- [utils/firebase.utils.js](/Users/skanodia/dev/bundlephobia/utils/firebase.utils.js)
- [cache-service/middlewares/package-size.middleware.js](/Users/skanodia/dev/bundlephobia/cache-service/middlewares/package-size.middleware.js)
- [cache-service/middlewares/exports-size.middleware.js](/Users/skanodia/dev/bundlephobia/cache-service/middlewares/exports-size.middleware.js)
- [server/middlewares/results/build.middleware.js](/Users/skanodia/dev/bundlephobia/server/middlewares/results/build.middleware.js)
- [server/middlewares/exportsSizes.middleware.js](/Users/skanodia/dev/bundlephobia/server/middlewares/exportsSizes.middleware.js)
- [**tests**/errors-cache.test.js](/Users/skanodia/dev/bundlephobia/__tests__/errors-cache.test.js)
