import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

it.each(['transient', 'persistent'])(
  'recovers %s worker failures without resetting PM2',
  mode => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-'))
    const pm2 = path.join(root, 'pm2.mjs')
    const state = path.join(root, 'state.json')
    const calls = path.join(root, 'calls.jsonl')

    const services = [
      'main',
      'build-service',
      'build-service',
      'cache-service',
      'installation-service',
      'bundlephobia-victoriametrics',
      'bundlephobia-node-exporter',
    ]

    fs.writeFileSync(
      state,
      JSON.stringify({
        reads: 0,
        apps: services.map((name, i) => ({
          name,
          pm2_env: { status: i === 2 ? 'stopping' : 'online' },
        })),
      }),
    )
    fs.writeFileSync(path.join(root, 'process.yml'), '')
    fs.writeFileSync(
      pm2,
      `#!${process.execPath}
import fs from 'node:fs'
const state = JSON.parse(fs.readFileSync(process.env.TEST_PM2_STATE))
const args = process.argv.slice(2)
if (args[0] === 'jlist') {
  if (process.env.TEST_RECOVERY === 'transient' && state.reads > 0) state.apps.forEach(p => p.pm2_env.status = 'online')
  console.log(JSON.stringify(state.apps))
  state.reads++
} else {
  fs.appendFileSync(process.env.TEST_PM2_CALLS, JSON.stringify(args)+'\\n')
  if (args[0] === 'startOrRestart') state.apps.filter(p => p.name === args[args.indexOf('--only')+1]).forEach(p => p.pm2_env.status = 'online')
}
fs.writeFileSync(process.env.TEST_PM2_STATE, JSON.stringify(state))
`,
      { mode: 0o755 },
    )

    try {
      execFileSync(
        'bash',
        [
          '-c',
          'source "$1"; PM2="$2"; PM2_WORKING_DIR="$3"; LOG_FILE=/dev/null; sleep() { :; }; if check_services; then exit 9; fi; restart_all',
          '_',
          path.resolve('operations/autorestart.sh'),
          pm2,
          root,
        ],
        {
          env: {
            ...process.env,
            TEST_PM2_STATE: state,
            TEST_PM2_CALLS: calls,
            TEST_RECOVERY: mode,
          },
          stdio: 'pipe',
        },
      )

      const actions = fs.existsSync(calls)
        ? fs
            .readFileSync(calls, 'utf8')
            .trim()
            .split('\n')
            .map(line => JSON.parse(line))
        : []

      expect(actions).toEqual(
        mode === 'transient'
          ? []
          : [
              [
                'startOrRestart',
                'process.yml',
                '--only',
                'build-service',
                '--update-env',
              ],
              ['save'],
            ],
      )
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  },
)
