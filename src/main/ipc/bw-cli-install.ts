import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { BrowserWindow, ipcMain } from 'electron'
import {
  BW_CLI_INSTALL_COMMANDS,
  isBwCliInstallId,
  type BwCliInstallFinishedPayload,
  type BwCliInstallId
} from '../../shared/bw-cli-install-commands'

// Why (BW #323): install runs as an app-owned background command (user
// decision 2026-10-16) — no terminal session appears in the session bar; the
// card keeps showing "Installing…" and the finish broadcast drives the
// completion / failure notification plus an automatic re-check. Login stays
// terminal-injected because it needs interactive QR / credential input.

const FINISHED_CHANNEL = 'cliInstall:finished'
const inFlight = new Set<BwCliInstallId>()

function broadcastCliInstallFinished(payload: BwCliInstallFinishedPayload): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(FINISHED_CHANNEL, payload)
  }
}

// Why (BW #366): a CLI's install口径 can be a sequence (cloudbuild sets the
// scoped registry before installing) — steps run in order and the first
// failure aborts the rest, with the reason naming the failing step.
function runInstallStep(command: readonly string[], onOutput: (chunk: string) => void): Promise<number | null> {
  return new Promise((resolve, reject) => {
    // Why: npm is npm.cmd on Windows — route through cmd.exe so the shim
    // resolves; posix spawns npm directly. cmd.exe /c bare-expands the argv,
    // so BW_CLI_INSTALL_COMMANDS entries must never carry cmd.exe
    // metacharacters (space & | < > ^ ( ) , ;) — registry URLs and package
    // ids are safe. No timeout: installs against the internal registry can
    // take minutes, and the finish broadcast carries the outcome either way.
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/c', ...command], {
            cwd: homedir(),
            windowsHide: true
          })
        : spawn(command[0], command.slice(1), { cwd: homedir() })
    child.stdout?.on('data', (chunk: Buffer | string) => onOutput(String(chunk)))
    child.stderr?.on('data', (chunk: Buffer | string) => onOutput(String(chunk)))
    child.on('error', (error) => reject(error))
    child.on('close', (code) => resolve(code))
  })
}

export function registerCliInstallHandlers(): void {
  ipcMain.handle('cliInstall:start', (_event, args: unknown): { started: boolean } => {
    const cli = (args as { cli?: unknown } | null)?.cli
    if (!isBwCliInstallId(cli) || inFlight.has(cli)) {
      return { started: false }
    }
    inFlight.add(cli)
    let tail = ''
    const appendTail = (chunk: string): void => {
      tail = (tail + chunk).slice(-2000)
    }
    const finish = (ok: boolean, reason: string): void => {
      inFlight.delete(cli)
      broadcastCliInstallFinished({ cli, ok, reason, tail })
    }
    void (async () => {
      const steps = BW_CLI_INSTALL_COMMANDS[cli]
      for (const [index, step] of steps.entries()) {
        try {
          const code = await runInstallStep(step, appendTail)
          if (code !== 0) {
            finish(false, `step ${index + 1} (${step.join(' ')}) exit code ${code ?? 'unknown'}`)
            return
          }
        } catch (error) {
          finish(false, `step ${index + 1} (${step.join(' ')}) failed to start: ${String(error)}`)
          return
        }
      }
      finish(true, '')
    })()
    return { started: true }
  })

  ipcMain.handle('cliInstall:isRunning', (_event, args: unknown): boolean => {
    const cli = (args as { cli?: unknown } | null)?.cli
    return isBwCliInstallId(cli) ? inFlight.has(cli) : false
  })
}
