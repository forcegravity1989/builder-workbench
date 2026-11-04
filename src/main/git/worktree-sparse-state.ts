import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { GitRuntimeOptions } from './git-runtime-options'
import { resolveGitDir } from './status'
import { resolveGitCommonDir } from './source-control/resolve-git-common-dir'
export { resolveGitCommonDir } from './source-control/resolve-git-common-dir'

export async function detectSparseCheckout(
  worktreePath: string,
  // WSL writes guest-spelled gitdir pointers that require the caller's distro for Windows I/O.
  options: Pick<GitRuntimeOptions, 'wslDistro'> = {}
): Promise<boolean> {
  // Filesystem probes avoid a Git subprocess per worktree on each poll.
  try {
    const gitDir = await resolveGitDir(worktreePath, options)
    const stats = await stat(join(gitDir, 'info', 'sparse-checkout'))
    if (!stats.isFile() || stats.size === 0) {
      return false
    }
    // Disable retains the pattern file; confirm core.sparseCheckout through direct config reads.
    return await isSparseCheckoutEnabled(gitDir)
  } catch {
    return false
  }
}

// Worktree config overrides shared config only while extensions.worktreeConfig is enabled.
async function isSparseCheckoutEnabled(gitDir: string): Promise<boolean> {
  const commonDir = await resolveGitCommonDir(gitDir)
  const sharedConfig = await readGitConfigText(join(commonDir, 'config'))
  const sharedFlag = parseCoreSparseCheckoutFlag(sharedConfig)
  // Stale worktree config must not override a disabled extensions.worktreeConfig setting.
  if (parseGitConfigFlag(sharedConfig, 'extensions', 'worktreeconfig') !== true) {
    return sharedFlag ?? false
  }
  const worktreeConfig = await readGitConfigText(join(gitDir, 'config.worktree'))
  return parseCoreSparseCheckoutFlag(worktreeConfig) ?? sharedFlag ?? false
}

async function readGitConfigText(configPath: string): Promise<string> {
  try {
    return await readFile(configPath, 'utf-8')
  } catch {
    return ''
  }
}

export function parseCoreSparseCheckoutFlag(configContent: string): boolean | undefined {
  return parseGitConfigFlag(configContent, 'core', 'sparsecheckout')
}

// Headers can share a line with one assignment; its value extends to end of line.
const GIT_CONFIG_SECTION_HEADER = /^\[\s*([A-Za-z0-9.-]+)(\s+"(?:[^"\\]|\\.)*")?\s*\]/
const GIT_CONFIG_ASSIGNMENT = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/

// `section` and `key` must be lowercase: git config names are case-insensitive.
function parseGitConfigFlag(
  configContent: string,
  section: string,
  key: string
): boolean | undefined {
  let inSection = false
  let value: boolean | undefined
  for (const rawLine of configContent.split(/\r?\n/)) {
    let rest = stripGitConfigComment(rawLine).trim()
    for (
      let header = rest.match(GIT_CONFIG_SECTION_HEADER);
      header;
      header = rest.match(GIT_CONFIG_SECTION_HEADER)
    ) {
      inSection = header[1].toLowerCase() === section && header[2] === undefined
      rest = rest.slice(header[0].length).trim()
    }
    if (!inSection || rest.length === 0) {
      continue
    }
    const assignment = rest.match(GIT_CONFIG_ASSIGNMENT)
    if (!assignment || assignment[1].toLowerCase() !== key) {
      continue
    }
    value = parseGitConfigBoolean(assignment[2])
  }
  return value
}

function stripGitConfigComment(line: string): string {
  let inQuotes = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"' && line[index - 1] !== '\\') {
      inQuotes = !inQuotes
    } else if ((char === '#' || char === ';') && !inQuotes) {
      return line.slice(0, index)
    }
  }
  return line
}

// Valueless booleans are true; explicit values accept Git's true/yes/on/1 forms.
function parseGitConfigBoolean(raw: string | undefined): boolean {
  if (raw === undefined) {
    return true
  }
  const value = raw
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .toLowerCase()
  return value === 'true' || value === 'yes' || value === 'on' || value === '1'
}
