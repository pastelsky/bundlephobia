# Package recommendation process

Bundlephobia's similar-package results are curated in
`server/middlewares/similar-packages/fixtures.ts`. Recommendations are not
accepted only because a package is smaller: it must be a credible substitute
for the same use case.

## Submission and triage

1. A contributor submits the package recommendation issue form. The npm package
   name, category, exact comparison packages, functional overlap, relative
   advantage, and contributor relationship are required.
2. The `Package recommendations` workflow collects objective signals and updates
   one report comment on the issue whenever the submission is edited:
   - the package exists on npm and its latest release is not deprecated;
   - it has at least 1,000 weekly npm downloads or 100 GitHub stars;
   - it has recent npm/GitHub activity or a stable 1.x-or-newer release;
   - its repository is not archived;
   - it is not already curated or covered by another open suggestion;
   - its default-entry minified and gzipped size relative to named alternatives.
3. A maintainer reviews the claims that cannot be automated: functional
   equivalence, category fit, and whether the package materially improves the
   existing choices.

These are advisory signals, not a claim that popularity, recent activity, or a
default-entry bundle estimate proves quality. Missing metadata must remain a
maintainer-review item rather than blocking the proposal.

## Curation pull requests

Accepted packages are added to the relevant `similar` array in
`server/middlewares/similar-packages/fixtures.ts`. New categories also need a
clear display name and classifier tags. Categories are capped at six packages;
adding to a full category requires removing a weaker, larger, stale, or redundant
recommendation in the same pull request.

For every newly added package, the pull-request workflow repeats the npm and
GitHub checks against current data. It writes the evidence to the Actions job
summary and blocks only when npm authoritatively reports that a package is
missing or deprecated, or when the category would exceed six entries. Registry
outages, popularity, maintenance, repository, and bundle-size signals remain
advisory. New categories have no existing size baseline and require agent and
maintainer review.

GitHub Copilot Code Review can load the repository's
`package-recommendation-code-review` skill to review functional equivalence,
comparison fairness, and whether the proposed shortlist is genuinely useful. The
normal CI job runs unit tests for the deterministic parser and quality rules so
changes to the automation are reviewed like application code.

## Enable the agent reviewer

The repository skill and path-specific instructions do not enable Copilot Code
Review by themselves. A repository administrator must create or update a branch
ruleset targeting `bundlephobia` and select **Automatically request Copilot code
review**. Select **Review new pushes** to rerun the review after recommendation
changes. If that ruleset option is unavailable, enable Copilot Code Review for
the account or repository first.

Copilot leaves advisory comments; it does not approve a pull request or replace
the deterministic quality check and maintainer decision.
