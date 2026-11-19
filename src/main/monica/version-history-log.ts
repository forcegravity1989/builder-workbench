import { SourceCommit } from '../../shared/monica/version-material'

export function versionHistoryLogArgs(commit: string): string[] {
  return [
    'log',
    '-z',
    '--full-history',
    '--diff-merges=first-parent',
    '--format=%H%x00%cI',
    '--name-only',
    '--diff-filter=AM',
    '--no-renames',
    commit,
    '--',
    '.bw/planning'
  ]
}

export function planEntryLogArgs(commit: string, shallow: boolean): string[] {
  return [
    'log',
    '-z',
    // Read the commit that actually added data.json. A first-parent merge diff
    // attributes a side-branch addition to the merge commit instead.
    '--no-merges',
    // A shallow boundary looks like an addition when diffed against an empty tree.
    shallow ? '--min-parents=1' : '--root',
    '--format=%H%x00%cI',
    '--name-only',
    '--diff-filter=A',
    '--no-renames',
    commit,
    '--',
    ':(glob).bw/planning/*/data.json'
  ]
}

export function versionMaterialAtGitPath(file: string) {
  const match = /^\.bw\/planning\/([^/]+)\/(data|acceptance)\.json$/.exec(file)
  return match
    ? {
        version: match[1],
        workflow: match[2] === 'data' ? ('plan' as const) : ('acceptance' as const)
      }
    : null
}

export function* readVersionHistoryLog(log: Buffer) {
  let sourceCommit = ''
  let committedAt = ''
  const tokens = log.toString('utf8').split('\0')
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (SourceCommit.safeParse(token).success) {
      sourceCommit = token
      committedAt = tokens[++index]
      continue
    }
    // Git separates the commit header from its first raw path with one newline.
    const file = token.replace(/^\n/, '')
    const material = versionMaterialAtGitPath(file)
    if (sourceCommit && material) {
      yield { file, ...material, sourceCommit, committedAt }
    }
  }
}
