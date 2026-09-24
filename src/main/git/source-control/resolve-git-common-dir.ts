import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

/** Resolve the shared Git directory for a main or linked worktree. */
export async function resolveGitCommonDir(gitDir: string): Promise<string> {
  try {
    const raw = (await readFile(join(gitDir, 'commondir'), 'utf-8')).trim()
    if (raw.length > 0) {
      return isAbsolute(raw) ? raw : resolve(gitDir, raw)
    }
  } catch {
    // No commondir: this is already the common Git directory.
  }
  return gitDir
}
