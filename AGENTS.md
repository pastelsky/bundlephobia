# Bundlephobia development loop

Use this workflow for changes spanning `package-build-stats`, Bundlephobia, and
the production server.

## Repositories

- Bundlephobia: `~/dev/bundlephobia`, default/production branch `bundlephobia`.
- Package builder: `~/dev/package-build-stats`, default branch `master`.
- Production: `ssh bphobia`, checkout `/var/www/bundlephobia`.
- Work in a temporary worktree created from the latest remote default branch.
  Do not switch, stash, or reset an active checkout containing unrelated work.
- Commit as `Shubham Kanodia <shubham.kanodia10@gmail.com>`.

## Change and publish package-build-stats

1. Make the change in the `package-build-stats` repository and run `yarn check`,
   `yarn test`, and `yarn build`.
2. Add a changeset with `yarn changeset` for published behavior changes.
3. Open a PR against `master` and wait for blocking CI checks.
4. Merge the Changesets version PR to publish the package.
5. Confirm the version is available from the public npm registry before updating
   Bundlephobia.

## Update Bundlephobia

1. Pin the same exact version in the root and `build-service/package.json`.
2. Update both Yarn lockfiles and run the relevant checks.
3. Keep npm and Yarn on the public registry configured by `.npmrc` and
   `.yarnrc.yml`; do not override the repository registry configuration.
4. Open a PR against `bundlephobia` and deploy only the merged commit.

## Deploy and verify

Inspect `git status` before pulling and do not overwrite server-side changes.

```sh
ssh bphobia
cd /var/www/bundlephobia
git status --short
git pull --ff-only origin bundlephobia
corepack yarn install --immutable
cd build-service && corepack yarn install --immutable
bun upgrade
pm2 restart all --update-env
pm2 save
```

Confirm both installed `package-build-stats` versions, Bun, and the deployed git
commit. Check PM2, application/build logs, nginx errors, host resources, and API
responses. Treat upstream timeouts, OOM kills, restart loops, or growing orphaned
installer processes as deployment failures.
