# Package recommendation process

Bundlephobia's similar-package results are curated in
`server/middlewares/similar-packages/fixtures.ts`. Recommendations are not
accepted only because a package is smaller: it must be a credible substitute
for the same use case.

## Submission and triage

1. A contributor submits the package recommendation issue form. The npm package
   name, alternative, functional overlap, relative advantage, and contributor
   relationship are required.
2. The `Package recommendations` workflow checks objective signals and updates
   one report comment on the issue whenever the submission is edited:
   - the package exists on npm and its latest release is not deprecated;
   - it has at least 1,000 weekly npm downloads or 100 GitHub stars;
   - it has recent npm/GitHub activity or a stable 1.x-or-newer release;
   - its repository is not archived;
   - it is not already curated or covered by another open suggestion.
3. A maintainer reviews the claims that cannot be automated: functional
   equivalence, category fit, and whether the package materially improves the
   existing choices.

The thresholds are triage defaults, not a claim that popularity proves quality.
Maintainers may ask for more evidence when metadata is missing or a stable but
inactive package is proposed.

## Curation pull requests

Accepted packages are added to the relevant `similar` array in
`server/middlewares/similar-packages/fixtures.ts`. New categories also need a
clear display name and classifier tags.

For every newly added package, the pull-request workflow repeats the npm and
GitHub checks against current data. It writes the evidence to the Actions job
summary and blocks the pull request when a package is missing, deprecated, below
the popularity threshold, or lacks a maintenance/stability signal. The normal CI
job runs unit tests for the parser and quality rules so changes to the automation
are reviewed like application code.
