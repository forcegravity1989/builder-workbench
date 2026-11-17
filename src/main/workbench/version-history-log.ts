import { SourceCommit } from '../../shared/workbench/version-material'

export function versionHistoryLogArgs(
  commit: string,
  history: 'all' | 'current' | 'shallow-current' = 'all'
): string[] {
  const current = history !== 'all'
  return [
    'log',
    '-z',
    current ? '--first-parent' : '--full-history',
    ...(current ? [history === 'shallow-current' ? '--min-parents=1' : '--root'] : []),
    '--diff-merges=first-parent',
    '--format=%H%x00%cI',
    '--name-only',
    current ? '--diff-filter=AMT' : '--diff-filter=AM',
    '--no-renames',
    commit,
    '--',
    '.bw/planning'
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
