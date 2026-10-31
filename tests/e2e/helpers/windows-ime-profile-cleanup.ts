import { existsSync, lstatSync, readdirSync, rmSync, rmdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export async function removeUserDataDirAfterShutdown(userDataDir: string): Promise<void> {
  const root = path.resolve(userDataDir)
  if (
    path.dirname(root).toLowerCase() !== path.resolve(os.tmpdir()).toLowerCase() ||
    !/^workbench-e2e-userdata-[\w-]+$/.test(path.basename(root)) ||
    (existsSync(root) && (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()))
  ) {
    throw new Error('Refusing to remove a directory outside the isolated E2E profile boundary')
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(root, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 4) {
        if (process.platform === 'win32') {
          removeProfileKeepingLockedImeLogs(root)
          return
        }
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
    }
  }
}

/** IME helpers can outlive a force-quit; retain only their locked test-owned logs. */
function removeProfileKeepingLockedImeLogs(root: string): void {
  if (!existsSync(root)) {
    return
  }
  function remove(directory: string): boolean {
    let retained = false
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        retained = remove(file) || retained
        continue
      }
      try {
        rmSync(file, { force: true })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        const relative = path.relative(root, file).split(path.sep).join('/')
        if (
          entry.isFile() &&
          (code === 'EPERM' || code === 'EBUSY') &&
          /^home\/AppData\/LocalLow\/SogouPY\/(?:LOG\/APP\/SGTool_\d+\.log|logs\/SGTool\/\d+\/log\.txt)$/i.test(
            relative
          )
        ) {
          retained = true
        } else {
          throw error
        }
      }
    }
    if (!retained) {
      rmdirSync(directory)
    }
    return retained
  }
  const retained = remove(root)
  if (retained) {
    console.warn(`[e2e] Kept locked external input-method logs only: ${root}`)
  }
}
