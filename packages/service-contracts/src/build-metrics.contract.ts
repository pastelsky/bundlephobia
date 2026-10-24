// Stable SDK failure names shared by the collector and dashboard. Keep raw
// messages and package names out of labels to bound metric cardinality.
export const BUILD_FAILURE_CODES = [
  'EntryPointError',
  'InstallError',
  'BuildError',
  'MinifyError',
  'MissingDependencyError',
  'PackageNotFoundError',
  'UnsupportedPackageError',
  'UnexpectedBuildError',
  'CLIBuildError',
  'BuildCancelledError',
  'UnknownError',
] as const
