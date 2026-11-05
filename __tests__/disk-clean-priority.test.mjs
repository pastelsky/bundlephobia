import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

const script = new URL('../operations/disk-clean.sh', import.meta.url).pathname

function shell(code, trace = '/dev/null') {
  return execFileSync(
    'bash',
    ['-c', 'source "$1"; log() { :; }; ' + code, 'test', script],
    {
      encoding: 'utf8',
      env: { ...process.env, TRACE: trace },
    },
  ).trim()
}

for (const [pressure, previous, expected] of [
  [79, 'background', 'background'],
  [80, 'background', 'elevated'],
  [89, 'elevated', 'elevated'],
  [90, 'background', 'urgent'],
  [100, 'background', 'urgent'],
  [85, 'urgent', 'urgent'],
  [84, 'urgent', 'elevated'],
  [75, 'elevated', 'elevated'],
  [74, 'elevated', 'background'],
]) {
  test(`pressure ${pressure}, previous ${previous}: ${expected}`, () => {
    assert.equal(
      shell(`cleanup_priority_level ${pressure} ${previous}`),
      expected,
    )
  })
}

test('uses bounded normal priorities for elevation, never real-time scheduling', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-priority-'))
  const trace = path.join(dir, 'trace')

  try {
    shell(
      `
      chrt() { echo "chrt $*" >> "$TRACE"; }
      renice() { echo "renice $*" >> "$TRACE"; }
      ionice() { echo "ionice $*" >> "$TRACE"; }
      set_cleanup_process_priority 123 background
      set_cleanup_process_priority 123 elevated
      set_cleanup_process_priority 123 urgent
    `,
      trace,
    )
    assert.equal(
      fs.readFileSync(trace, 'utf8'),
      [
        'chrt --idle --pid 0 123',
        'renice -n 19 -p 123',
        'ionice -c 3 -n 0 -p 123',
        'chrt --other --pid 0 123',
        'renice -n 10 -p 123',
        'ionice -c 2 -n 6 -p 123',
        'chrt --other --pid 0 123',
        'renice -n 0 -p 123',
        'ionice -c 2 -n 4 -p 123',
        '',
      ].join('\n'),
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('updates running descendants rather than only future commands', () => {
  assert.equal(
    shell(`
    cleanup_process_tree() { printf '100\n101\n102\n'; }
    cleanup_task_ids() { echo "$1"; }
    set_cleanup_process_priority() { echo "$1:$2"; }
    apply_cleanup_priority 100 urgent
  `),
    '100:urgent\n101:urgent\n102:urgent',
  )
})

for (const [load, root, scratch] of [
  [95, 40, 40],
  [20, 95, 40],
  [20, 40, 95],
  ['', 40, 40],
]) {
  test(`supervises in-flight work using load=${load}, root=${root}, scratch=${scratch}`, () => {
    assert.equal(
      shell(`
      cycle=0
      kill() { (( cycle < 2 )); }
      sleep() { cycle=$((cycle + 1)); }
      get_cleanup_load_percent() { if (( cycle == 0 )); then echo '${load}'; else echo 10; fi; }
      get_disk_usage() { if (( cycle == 0 )); then echo '${root}'; else echo 40; fi; }
      get_loop_usage() { if (( cycle == 0 )); then echo '${scratch}'; else echo 40; fi; }
      apply_cleanup_priority() { echo "$2"; }
      supervise_cleanup 123
    `),
      'urgent\nbackground',
    )
  })
}

test('phase instrumentation preserves failure status', () => {
  assert.equal(
    shell(
      `get_disk_usage() { echo 40; }; get_loop_usage() { echo 40; }; run_cleanup_phase failed false; echo "status=$?"`,
    ),
    'status=1',
  )
})

test('also reprioritizes existing worker threads', () => {
  assert.equal(
    shell(`
    cleanup_process_tree() { echo 100; }
    cleanup_task_ids() { printf '100\n105\n'; }
    set_cleanup_process_priority() { echo "$1:$2"; }
    apply_cleanup_priority 100 elevated
  `),
    '100:elevated\n105:elevated',
  )
})

test('supervisor exits when the real child completes and preserves its status', () => {
  assert.equal(
    shell(`
    get_cleanup_load_percent() { echo 20; }
    get_disk_usage() { echo 40; }
    get_loop_usage() { echo 40; }
    apply_cleanup_priority() { :; }
    sleep() { command sleep 0.01; }
    bash -c 'sleep 0.05; exit 7' & worker=$!
    supervise_cleanup "$worker"
    wait "$worker"; echo "status=$?"
  `),
    'status=7',
  )
})
