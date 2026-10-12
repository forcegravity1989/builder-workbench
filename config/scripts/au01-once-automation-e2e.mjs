/**
 * AU01 acceptance drive: a one-shot automation fires for real at its `onceAt`
 * moment on the BUILT headless runtime server, and the run history plus the
 * scheduled-dispatch count survive a kill-and-restart of that server.
 *
 * Why serve mode and not the dev shell: the scheduler, the persistence layer,
 * and the headless dispatcher all live in the same main process either way,
 * and the serve surface lets the built CLI drive every step deterministically
 * (create → human enable → wait for the tick → read back → restart → read back
 * again). The dev-shell UI labels are a separate manual check.
 *
 * Hard assertions (fail the job):
 *   - `create --trigger once --at` lands onceAt verbatim with an empty rrule,
 *     disabled by default (enabling is the human's call, so the drive plays
 *     that human with an explicit `edit --enabled`);
 *   - a run appears whose trigger is 'scheduled' — the tick loop fired it,
 *     not the drive (the drive never calls `automations run`);
 *   - scheduledRunCount >= 1 after the scheduled dispatch (the lifecycle is
 *     'finished' from the dispatch point on; the agent's own fate — including
 *     dispatch_failed on a box with no claude CLI — is recorded, not asserted);
 *   - after SIGTERM + reboot on the same user-data-dir, the run rows (ids,
 *     triggers, scheduledFor) and scheduledRunCount read back identical.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import process from 'node:process'

const projectDir = resolve(import.meta.dirname, '../..')
const serveEntry = join(projectDir, 'out', 'main', 'index.js')
const READY_TIMEOUT_MS = 120_000
const SHUTDOWN_TIMEOUT_MS = 15_000
// Why a random high port: a fixed one collides with a developer's own `orca serve`
// or the terminal smoke script.
const PORT = 6950 + Math.floor(Number(process.env.ORCA_AU01_PORT_OFFSET ?? '0'))
// The scheduler ticks every 60s, so a due one-shot lands within one tick of its
// moment; the window adds a full extra tick of slack.
const FIRE_WINDOW_MS = 150_000
const POLL_INTERVAL_MS = 3_000

function log(message) {
  process.stdout.write(`[au01-once-e2e] ${message}\n`)
}

function fail(message) {
  process.stderr.write(`[au01-once-e2e] FAIL: ${message}\n`)
  process.exitCode = 1
}

function resolveCli() {
  const built = join(projectDir, 'out', 'cli', 'index.js')
  return existsSync(built)
    ? { command: process.execPath, prefix: [built] }
    : { command: 'orca', prefix: [] }
}

/** The built `orca` CLI, pinned to this server by pairing code. Throws on rpc errors. */
function orca(pairingCode, args) {
  const cli = resolveCli()
  const result = spawnSync(
    cli.command,
    [...cli.prefix, ...args, '--pairing-code', pairingCode, '--json'],
    { encoding: 'utf8', shell: false }
  )
  if (result.error) {
    throw new Error(`orca ${args[0]} failed to spawn: ${result.error.message}`)
  }
  const line = (result.stdout ?? '').trim()
  if (!line.startsWith('{')) {
    throw new Error(`orca ${args.join(' ')} produced no JSON:\n${result.stdout}\n${result.stderr}`)
  }
  const parsed = JSON.parse(line)
  if (parsed.ok === false) {
    throw new Error(
      `orca ${args.join(' ')} returned ${parsed.error?.code}: ${parsed.error?.message}`
    )
  }
  return parsed.result
}

function waitForReady(child) {
  return new Promise((resolvePromise, rejectPromise) => {
    let buffered = ''
    let serverErr = ''
    const timer = setTimeout(
      () => rejectPromise(new Error(`no ready payload within ${READY_TIMEOUT_MS}ms`)),
      READY_TIMEOUT_MS
    )
    // Why read stderr: an unread pipe can fill and block the child, and a boot
    // failure otherwise surfaces only as "exited with 1".
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      serverErr += chunk
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffered += chunk
      for (const line of buffered.split('\n')) {
        if (!line.startsWith('{')) {
          continue
        }
        try {
          const payload = JSON.parse(line)
          if (payload.type === 'orca_server_ready') {
            clearTimeout(timer)
            resolvePromise(payload)
            return
          }
        } catch {
          // Partial line; wait for the rest.
        }
      }
    })
    child.on('exit', (code) => {
      clearTimeout(timer)
      rejectPromise(
        new Error(
          `server exited with ${code} before signalling ready${
            serverErr.trim() ? `:\n${serverErr.trim()}` : ' (no stderr)'
          }`
        )
      )
    })
  })
}

function pairingCodeFrom(payload) {
  const url = payload?.pairing?.url
  if (!url) {
    throw new Error('ready payload carried no pairing offer')
  }
  const code = new URL(url).searchParams.get('code')
  if (!code) {
    throw new Error(`pairing url had no code: ${url}`)
  }
  return code
}

/**
 * Why require('electron') and not `npx electron`: on Windows spawn() without a
 * shell cannot resolve npx.cmd (ENOENT), and a shell would re-split the user
 * data path. The electron package's main export IS the executable path when
 * required from plain Node.
 */
function electronExecutable() {
  const require = createRequire(import.meta.dirname)
  const electronPath = require('electron')
  if (typeof electronPath !== 'string' || !existsSync(electronPath)) {
    throw new Error(`electron package did not resolve to an executable: ${String(electronPath)}`)
  }
  return electronPath
}

function bootServer(userDataDir) {
  const child = spawn(
    electronExecutable(),
    [
      serveEntry,
      '--serve',
      '--serve-port',
      String(PORT),
      '--serve-json',
      `--user-data-dir=${userDataDir}`
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } }
  )
  return child
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  child.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise((r) => child.on('exit', () => r(true))),
    new Promise((r) => setTimeout(() => r(false), SHUTDOWN_TIMEOUT_MS))
  ])
  if (!exited) {
    child.kill('SIGKILL')
    fail(`server did not exit within ${SHUTDOWN_TIMEOUT_MS}ms of SIGTERM`)
  }
}

function seedGitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'au01-repo-'))
  writeFileSync(join(dir, 'README.md'), '# au01 once automation e2e\n')
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`)
    }
  }
  git('init', '-b', 'main')
  git('config', 'user.email', 'au01@orca.test')
  git('config', 'user.name', 'AU01 Drive')
  git('add', '-A')
  git('commit', '-m', 'seed')
  return dir
}

/** The rows the restart comparison cares about: identity + schedule provenance. */
function runFingerprint(runs) {
  return runs
    .map((run) => `${run.id}|${run.trigger}|${run.scheduledFor ?? ''}|${run.status}`)
    .sort()
}

async function waitForScheduledRun(pairingCode, automationId, deadline) {
  while (Date.now() < deadline) {
    const runs = orca(pairingCode, ['automations', 'runs', '--id', automationId])?.runs ?? []
    const scheduled = runs.find((run) => run.trigger === 'scheduled')
    if (scheduled) {
      return { scheduled, runs }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  return null
}

async function main() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'au01-serve-'))
  const repoDir = seedGitRepo()
  let child = null

  try {
    child = bootServer(userDataDir)
    log(`booting serve on port ${PORT} with userData ${userDataDir}`)
    const pairingCode = pairingCodeFrom(await waitForReady(child))
    log('server ready, paired')

    const repo = orca(pairingCode, ['repo', 'add', '--path', repoDir])?.repo
    if (!repo?.id) {
      throw new Error('repo.add returned no repo id')
    }
    log(`registered repo ${repo.id}`)

    // 90s ahead: comfortably past the next 60s scheduler tick, close enough to keep
    // the drive quick. ISO with milliseconds, which --at accepts.
    const onceAt = new Date(Date.now() + 90_000).toISOString()
    const name = `au01-once-${randomBytes(3).toString('hex')}`
    const created =
      orca(pairingCode, [
        'automations',
        'create',
        '--name',
        name,
        '--trigger',
        'once',
        '--at',
        onceAt,
        '--prompt',
        'Reply with the single word: au01',
        '--provider',
        'claude',
        '--repo',
        `id:${repo.id}`,
        '--disabled'
      ])?.automation ?? null
    if (!created?.id) {
      throw new Error('automations create returned no automation id')
    }
    // The wire carries onceAt as epoch milliseconds; the drive sent ISO.
    if (created.onceAt !== Date.parse(onceAt)) {
      throw new Error(`create drifted onceAt: sent ${onceAt}, stored ${created.onceAt}`)
    }
    if (created.rrule !== '') {
      throw new Error(`one-shot create stored rrule '${created.rrule}', expected ''`)
    }
    if (created.enabled) {
      throw new Error('create --disabled still started enabled')
    }
    log(`created one-shot ${created.id} onceAt=${created.onceAt} (disabled)`)

    // The drive plays the human: enabling is an explicit edit, never a create side effect.
    const enabled = orca(pairingCode, ['automations', 'edit', created.id, '--enabled'])?.automation
    if (!enabled?.enabled) {
      throw new Error('edit --enabled did not enable the automation')
    }
    log('human enabled the automation; waiting for the tick to fire it')

    const deadline = Date.now() + FIRE_WINDOW_MS
    const fired = await waitForScheduledRun(pairingCode, created.id, deadline)
    if (!fired) {
      throw new Error(
        `no trigger='scheduled' run within ${FIRE_WINDOW_MS}ms — the tick loop never dispatched the one-shot`
      )
    }
    const { scheduled, runs } = fired
    log(
      `scheduled run ${scheduled.id} status=${scheduled.status} ` +
        `scheduledFor=${scheduled.scheduledFor ?? '(none)'}`
    )

    const before = orca(pairingCode, ['automations', 'show', '--id', created.id])?.automation
    if (!before) {
      throw new Error('automations show returned no automation')
    }
    if ((before.scheduledRunCount ?? 0) < 1) {
      throw new Error(
        `scheduledRunCount=${before.scheduledRunCount ?? 0} after a scheduled dispatch; expected >= 1`
      )
    }
    log(`scheduledRunCount=${before.scheduledRunCount} — lifecycle 'finished' from dispatch on`)

    const runsBefore = runFingerprint(runs)
    const countBefore = before.scheduledRunCount
    const onceAtBefore = before.onceAt

    // Iron rule: kill the process, reboot on the same profile, and every number
    // must come back identical.
    await stopServer(child)
    log('server killed; rebooting on the same user-data-dir')
    child = bootServer(userDataDir)
    const pairingCode2 = pairingCodeFrom(await waitForReady(child))
    log('server rebooted, re-paired')

    const after = orca(pairingCode2, ['automations', 'show', '--id', created.id])?.automation
    const runsAfter = runFingerprint(
      orca(pairingCode2, ['automations', 'runs', '--id', created.id])?.runs ?? []
    )
    if (!after) {
      throw new Error('automations show after restart returned no automation')
    }
    if (after.scheduledRunCount !== countBefore) {
      throw new Error(
        `scheduledRunCount drifted across restart: ${countBefore} -> ${after.scheduledRunCount}`
      )
    }
    if (after.onceAt !== onceAtBefore) {
      throw new Error(`onceAt drifted across restart: ${onceAtBefore} -> ${after.onceAt}`)
    }
    if (runsAfter.length !== runsBefore.length) {
      throw new Error(
        `run count drifted across restart: ${runsBefore.length} -> ${runsAfter.length}`
      )
    }
    for (let i = 0; i < runsBefore.length; i += 1) {
      if (runsBefore[i] !== runsAfter[i]) {
        throw new Error(
          `run row drifted across restart:\n  before: ${runsBefore[i]}\n  after:  ${runsAfter[i]}`
        )
      }
    }
    log(
      `restart read-back identical: ${runsAfter.length} run row(s), ` +
        `scheduledRunCount=${after.scheduledRunCount}, onceAt=${after.onceAt}`
    )
    log(
      `EVIDENCE name=${name} automationId=${created.id} onceAt=${onceAt} runs=${runsAfter.length}`
    )
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  } finally {
    if (child) {
      await stopServer(child)
    }
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(repoDir, { recursive: true, force: true })
  }

  if (!process.exitCode) {
    log('PASS')
  }
}

await main()
