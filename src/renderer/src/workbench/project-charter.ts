/** Workbench project charter — `.bw/project.toml` (loop-buddy bw-assets). */

export const PROJECT_TOML_REL = '.bw/project.toml'
export const BW_GITIGNORE_REL = '.bw/.gitignore'

export type ProjectCharter = {
  name: string
  kind: string
  brief: string
  benchmark: string
  /** UI「目标方向」；仓文件字段名 opportunity */
  opportunity: string
}

export const EMPTY_CHARTER: ProjectCharter = {
  name: '',
  kind: '',
  brief: '',
  benchmark: '',
  opportunity: ''
}

function unquote(raw: string): string {
  const t = raw.trim()
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return t
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Minimal TOML top-level string fields (ignores [chat] tables). */
export function parseProjectToml(raw: string): ProjectCharter {
  const out: ProjectCharter = { ...EMPTY_CHARTER }
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || t.startsWith('[')) {
      if (t.startsWith('[')) {
        break
      }
      continue
    }
    const eq = t.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = t.slice(0, eq).trim()
    const val = unquote(t.slice(eq + 1))
    if (key === 'name') {
      out.name = val
    } else if (key === 'kind') {
      out.kind = val
    } else if (key === 'brief') {
      out.brief = val
    } else if (key === 'benchmark') {
      out.benchmark = val
    } else if (key === 'opportunity' || key === 'north_star') {
      out.opportunity = val
    }
  }
  return out
}

export function renderProjectToml(file: ProjectCharter): string {
  return [
    `name = ${quote(file.name)}`,
    `kind = ${quote(file.kind)}`,
    `brief = ${quote(file.brief)}`,
    `benchmark = ${quote(file.benchmark)}`,
    `opportunity = ${quote(file.opportunity)}`,
    '',
    '# 项目群没配。配了就在这里加一段 [chat]。',
    ''
  ].join('\n')
}

export function fillBlankCharter(base: ProjectCharter, intent: ProjectCharter): ProjectCharter {
  return {
    name: base.name.trim() || intent.name.trim(),
    kind: base.kind.trim() || intent.kind.trim(),
    brief: base.brief.trim() || intent.brief.trim(),
    benchmark: base.benchmark.trim() || intent.benchmark.trim(),
    opportunity: base.opportunity.trim() || intent.opportunity.trim()
  }
}

export function joinFsPath(parent: string, name: string): string {
  const sep = parent.includes('\\') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${sep}${name}`
}

export function repoNameFromRemote(remote: string): string {
  const cleaned = remote
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  const parts = cleaned.split(/[/:]/)
  return parts.at(-1) || 'repo'
}

export function normalizeCloneUrl(input: string): string {
  const t = input.trim()
  if (!t) {
    return ''
  }
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(t)) {
    return `https://github.com/${t}.git`
  }
  return t
}

export async function readProjectCharter(repoPath: string): Promise<{
  charter: ProjectCharter | null
  existed: boolean
  error: string | null
}> {
  const filePath = joinFsPath(repoPath, PROJECT_TOML_REL)
  try {
    const exists = await window.api.fs.pathExists({ filePath })
    if (!exists) {
      return { charter: null, existed: false, error: null }
    }
    const { content, isBinary } = await window.api.fs.readFile({ filePath })
    if (isBinary) {
      return { charter: null, existed: true, error: '名片不是文本文件' }
    }
    return { charter: parseProjectToml(content), existed: true, error: null }
  } catch (e) {
    return {
      charter: null,
      existed: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/**
 * Write charter to `.bw/project.toml` on the workspace (MVP：主检出落盘；
 * loop-buddy 完整路径是 bw/project 常驻树 + MR，后续再接)。
 */
export async function writeProjectCharter(
  repoPath: string,
  intent: ProjectCharter,
  options?: { onlyFillBlanks?: boolean }
): Promise<{ wrote: boolean; adopted: boolean; error: string | null }> {
  const bwDir = joinFsPath(repoPath, '.bw')
  const filePath = joinFsPath(repoPath, PROJECT_TOML_REL)
  const gitignorePath = joinFsPath(repoPath, BW_GITIGNORE_REL)
  try {
    const prior = await readProjectCharter(repoPath)
    const adopted = prior.existed
    const next =
      adopted && options?.onlyFillBlanks !== false
        ? fillBlankCharter(prior.charter ?? EMPTY_CHARTER, intent)
        : {
            name: intent.name.trim(),
            kind: intent.kind.trim(),
            brief: intent.brief.trim(),
            benchmark: intent.benchmark.trim(),
            opportunity: intent.opportunity.trim()
          }
    if (!next.name.trim()) {
      return { wrote: false, adopted, error: '项目名称不能为空' }
    }
    const bwExists = await window.api.fs.pathExists({ filePath: bwDir })
    if (!bwExists) {
      await window.api.fs.createDir({ dirPath: bwDir })
    }
    await window.api.fs.writeFile({ filePath, content: renderProjectToml(next) })
    const giExists = await window.api.fs.pathExists({ filePath: gitignorePath })
    if (!giExists) {
      await window.api.fs.writeFile({ filePath: gitignorePath, content: 'worktrees/\n' })
    }
    return { wrote: true, adopted, error: null }
  } catch (e) {
    return {
      wrote: false,
      adopted: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
