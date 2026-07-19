# Bundlephobia development loop

Use this workflow for changes that touch `package-build-stats`, Bundlephobia, or
the production server.

## Repositories and branches

- Bundlephobia: `~/dev/bundlephobia`, default/production branch `bundlephobia`.
- Package builder: `~/dev/package-build-stats`, default branch `master`.
- Production: `ssh bphobia`, checkout `/var/www/bundlephobia`.
- Create a temporary worktree from the latest remote default branch. Do not
  switch branches, stash, or reset an active checkout with unrelated work.
- Use `codex/<topic>` branches and verify commits use
  `Shubham Kanodia <shubham.kanodia10@gmail.com>`.

```sh
git fetch origin bundlephobia
git worktree add -b codex/fix-build-timeout /private/tmp/bundlephobia-fix-build-timeout origin/bundlephobia
```

For `package-build-stats`, use its own repository and `origin/master`:

```sh
git fetch origin master
git worktree add -b codex/fix-build-timeout /private/tmp/package-build-stats-fix-build-timeout origin/master
```

## Changing package-build-stats

1. Add a regression test that fails before a bug fix and passes afterward.
2. Run `yarn check`, `yarn test`, and `yarn build`. Treat the slow integration
   suite as diagnostic because it depends on live registries and package managers.
3. Add a changeset with `yarn changeset` for published behavior changes.
4. Open a PR against `master` and wait for all blocking CI checks.
5. Merge the Changesets version PR to publish. Confirm the public version with:

   ```sh
   npm view package-build-stats version --registry=https://registry.npmjs.org
   ```

Do not update Bundlephobia until the exact package version is available from the
public npm registry.

## Updating Bundlephobia

1. Pin the same exact `package-build-stats` version in the root and
   `build-service/package.json`.
2. Update both lockfiles with Yarn and run at least the TypeScript check plus the
   relevant tests/build.
3. Ensure `.npmrc` and `.yarnrc.yml` use `https://registry.npmjs.org`.
4. Reject lockfiles containing private registry URLs or proxy artifacts:

   ```sh
   rg -n -i 'packages\.atlassian|atlassian\.com' yarn.lock build-service/yarn.lock
   ```

5. Open a PR against `bundlephobia`. Deploy only the merged remote commit.

## Deploying with SSH

Inspect before mutating. Production may contain local diagnostics or generated
lockfile drift; preserve it as a patch under `/var/backups/bundlephobia` and do
not delete untracked files. The login shell may be Fish, so use `bash -lc` for
multi-command scripts or enter Bash explicitly as shown below.

```sh
ssh -t bphobia bash
cd /var/www/bundlephobia
git status --short
git pull --ff-only origin bundlephobia

unset YARN_NO_PROXY NPM_CONFIG_NOPROXY npm_config_noproxy no_proxy NO_PROXY
export YARN_NPM_REGISTRY_SERVER=https://registry.npmjs.org
corepack yarn install --immutable
cd build-service
corepack yarn install --immutable

bun upgrade
pm2 restart all --update-env
pm2 save
```

Never kill installers broadly. If stale `bun add` processes exist, stop the
build service first, list exact PIDs and parents, and terminate only confirmed
orphaned build processes.

## Production verification

- Confirm both installed `package-build-stats` copies have the intended version.
- Confirm Bun matches the latest stable GitHub release.
- Confirm all PM2 processes are online and restart counts remain stable.
- Trigger one cache-miss build for a small, newly published public package and
  require HTTP 200 plus `install start`, `install finish`, and queue success logs.
- Check `logs/index-0.log`, `logs/build-service-*.log`, nginx access/error logs,
  host load, memory/swap, and orphaned installer processes for several minutes.
- Distinguish package-specific build errors from infrastructure failures. Treat
  upstream timeouts, OOM kills, restart loops, or orphan growth as deployment
  failures.
