import { commandExecFileAsync } from '../git/command-runner/command-exec-file'
import { extractExecError, isMissingCommandBinaryError } from '../git/exec-error'
import { withCodeHubSpan } from '../observability/instrumentation'

export type CodeHubExecOptions = { cwd?: string; wslDistro?: string }

export async function runCodeHubCli(
  args: readonly string[],
  options?: CodeHubExecOptions
): Promise<string> {
  return withCodeHubSpan({ args, cwd: options?.cwd }, async () => {
    try {
      const { stdout } = await commandExecFileAsync('codehub-cli', [...args], {
        ...options,
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
  })
}
