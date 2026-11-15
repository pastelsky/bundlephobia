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

Custom host maintenance is versioned in `operations/`: `disk-clean.sh` and
`autorestart.sh` install at `/var/www/`, `cron/root.crontab` is the root user's
crontab, `systemd/pm2-root.service` is the PM2 boot unit, and
`systemd/bundlephobia.{service,timer}` is the existing hourly watchdog. Compare
live files before installing updates; pulling the application does not install host files.
Keep credentials, runtime data and generated PM2 dumps outside Git.
Install the host package `fd-find` before enabling `disk-clean.sh`.

```sh
ssh bphobia
cd /var/www/bundlephobia
./operations/deploy.sh
```

The zero-downtime deployment script performs the complete sequence:

1. Validates git status and pulls `origin/bundlephobia` (`--ff-only`).
2. Installs dependencies immutably for root and `build-service`, and upgrades Bun.
3. Compiles production assets (`corepack yarn build`) _before_ reloading services so
   the running server is never restarted against unbuilt or incompatible bundles.
4. Validates and syncs HAProxy configuration if modified, reloading HAProxy hitlessly.
5. Performs a rolling, zero-downtime reload of all PM2 apps (`pm2 reload all --update-env`)
   with coordinated readiness signals (`wait_ready`) and graceful HTTP connection draining.
6. Saves the PM2 process list and runs automated health checks against loopback (port 5400)
   and HAProxy endpoints.

Confirm both installed `package-build-stats` versions, Bun, and the deployed git
commit from the script's output summary. Check PM2, application/build logs,
nginx/HAProxy errors, host resources, and API responses. Treat upstream timeouts,
OOM kills, restart loops, or growing orphaned installer processes as deployment failures.
