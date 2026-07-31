---
name: package-recommendation-code-review
description: Review Bundlephobia pull requests that add, remove, or reorganize similar-package recommendations. Use during Copilot code review when server/middlewares/similar-packages/fixtures.ts, package recommendation automation, or recommendation criteria change; evaluate functional equivalence, bundle-size advantage, package quality, and shortlist discipline.
---

# Review package recommendations

Treat a recommendation as a product decision, not a string added to a fixture.
Review the linked suggestion issue, the pull-request diff, and the `Package
recommendation quality` Actions summary. Treat submitter claims as unverified.

## Apply the rubric

For every added package:

1. Confirm category fit. The candidate and existing packages must solve the same
   primary user problem for the same runtime. Similar keywords alone are not
   sufficient.
2. Confirm the size comparison is fair. Compare minified and gzipped bytes from
   Bundlephobia, using equivalent entry points or imports. Require the candidate
   to be meaningfully smaller than at least one package it is proposed to
   replace. Prefer candidates in the smallest half of the shortlist.
3. Confirm quality. Use the automated npm and GitHub evidence for existence,
   deprecation, weekly downloads, release activity, repository activity, archive
   status, and stable versions. Inspect documentation and repository context when
   the evidence is ambiguous.
4. Protect the shortlist. A category may contain at most six recommendations.
   Each entry must offer a distinct, defensible tradeoff. If a full category gets
   a new candidate, require the pull request to remove a weaker, larger, stale, or
   redundant entry.
5. Check the proposal's claims. Look for a concrete overlapping use case and a
   relative advantage beyond novelty or self-promotion. Disclosed maintainer
   involvement is acceptable but is not quality evidence.

Do not recommend acceptance solely because a package is tiny or popular. Do not
invent missing size, maintenance, or adoption data. Mark unavailable evidence for
human follow-up.

## Leave one review comment

Post one consolidated pull-request review comment with this structure:

```markdown
## Package recommendation review

**Verdict:** recommend / needs evidence / do not add

| Decision     | Evidence                                         |
| ------------ | ------------------------------------------------ |
| Category fit | ...                                              |
| Gzip size    | candidate bytes; comparison bytes and percentage |
| Quality      | downloads, maintenance, repository, deprecation  |
| Shortlist    | resulting count and distinct tradeoff            |

### Required changes

- Only list actionable blockers. Omit this section when there are none.
```

Use inline comments only for defects in the automation or data structure. Copilot
reviews are advisory; never claim that the review approves or blocks the pull
request.
