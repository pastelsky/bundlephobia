#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
test_output="$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/bp-scratch-contract.XXXXXX")"
test_runtime="$test_output/runtime"
scratch_root="$test_output/scratch"
trace_directory="$test_output/trace"
mkdir -p "$test_runtime" "$scratch_root" "$trace_directory"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "output=$test_output" >> "$GITHUB_OUTPUT"
fi

command -v strace >/dev/null
command -v bun >/dev/null
cp "$repo_root/.npmrc" "$test_runtime/.npmrc"
node --input-type=module - "$repo_root" "$test_runtime" <<'JS'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
const [source, destination] = process.argv.slice(2)
const app = JSON.parse(fs.readFileSync(path.join(source, 'package.json')))
const builder = JSON.parse(fs.readFileSync(path.join(source, 'build-service/package.json')))
assert.equal(app.dependencies['package-build-stats'], builder.dependencies['package-build-stats'])
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: Object.fromEntries(['package-build-stats', 'zod', 'p-queue'].map(name => [name, app.dependencies[name]])) }))
for (const entry of ['operations', 'installation-service', 'build-service']) {
  fs.cpSync(path.join(source, entry), path.join(destination, entry), { recursive: true, filter: location => !location.split(path.sep).includes('node_modules') && !location.endsWith('.tgz') })
}
JS
(
  cd "$test_runtime"
  npm install --no-audit --no-fund
  if [ -n "${PBS_PACKAGE_TARBALL:-}" ]; then
    sha256sum "$PBS_PACKAGE_TARBALL"
    npm install --no-save --package-lock=false --no-audit --no-fund "$PBS_PACKAGE_TARBALL"
  fi
)

sudo mount -t tmpfs -o "size=128m,uid=$(id -u),gid=$(id -g),mode=0700" tmpfs "$scratch_root"
trap 'sudo umount "$scratch_root"' EXIT
mkdir -p "$scratch_root/cache/tmp"
export BUILD_TMP_DIR="$scratch_root"
export BUILD_METRICS_SLOW_BUILD_MS=0.001
export TMPDIR="$scratch_root/cache/tmp"
export XDG_CACHE_HOME="$scratch_root/cache/xdg"
export XDG_DATA_HOME="$scratch_root/cache/xdg-data"
export DO_NOT_TRACK=1

# -ff follows child processes/threads; -y resolves directory FDs and cwd.
set +e
strace -ff -qq -y -s 4096 -e trace=%file,ftruncate,fchmod -o "$trace_directory/fs" \
  node --test "$test_runtime/operations/tests/scratch-contract.test.mjs"
contract_status=$?
set -e
node "$test_runtime/operations/tests/check-scratch-writes.mjs" "$trace_directory" "$scratch_root"

# Prove tracing catches a transient write outside scratch, even after deletion.
negative_trace="$trace_directory/negative-control"
mkdir -p "$negative_trace"
strace -ff -qq -y -s 4096 -e trace=%file,ftruncate,fchmod -o "$negative_trace/fs" \
  node --input-type=module - "$test_output/expected-unmanaged-probe" <<'JS'
import fs from 'node:fs'
const location = process.argv[2]
fs.writeFileSync(location, 'negative control')
fs.unlinkSync(location)
JS
if node "$test_runtime/operations/tests/check-scratch-writes.mjs" "$negative_trace" "$scratch_root" \
    > "$negative_trace/result.log" 2>&1; then
  echo "Write guard failed to reject the intentional unmanaged write"
  exit 1
fi
node --input-type=module - "$negative_trace/result.log" <<'JS'
import fs from 'node:fs'
import assert from 'node:assert/strict'
const result = fs.readFileSync(process.argv[2], 'utf8')
assert.ok(result.includes('expected-unmanaged-probe') && result.includes('inspectedWrites'))
console.log('Negative control: transient unmanaged write correctly rejected')
JS
exit "$contract_status"
