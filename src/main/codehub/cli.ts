import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { extractExecError, isMissingCommandBinaryError } from '../git/exec-error'

const execFileAsync = promisify(execFile)

export async function runCodeHubCli(
  args: readonly string[],
  options?: { cwd?: string }
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('codehub-cli', [...args], {
      cwd: options?.cwd,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024
    })
    return stdout
  } catch (error) {
    if (isMissingCommandBinaryError(error)) {
      throw new Error('codehub-cli is not installed or not on PATH')
    }
    const { stderr, stdout } = extractExecError(error)
    throw new Error(stderr.trim() || stdout.trim() || 'codehub-cli failed')
  }
}
