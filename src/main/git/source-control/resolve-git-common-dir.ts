import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveGitMetadataPath } from '../../../shared/git-metadata-path'

/** Resolve the shared Git directory for a main or linked worktree. */
export async function resolveGitCommonDir(gitDir: string): Promise<string> {
  try {
    const raw = (await readFile(join(gitDir, 'commondir'), 'utf-8')).trim()
    if (raw.length > 0) {
      return resolveGitMetadataPath(gitDir, raw) ?? gitDir
    }
  } catch {
    // No commondir: this is already the common Git directory.
  }
  return gitDir
}
