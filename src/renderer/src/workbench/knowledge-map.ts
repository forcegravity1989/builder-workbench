/** Per-repo KB role map — `.bw/knowledge-map.toml` (仓内真相；路径因仓而异). */

import { authorizeWorkbenchLocalPath } from './authorize-workbench-local-path'
import { isKbRoleKey, normalizeKbRelativePath, type KbRoleKey } from './knowledge-doc-registry'
import { joinFsPath } from './project-charter'

export const KNOWLEDGE_MAP_REL = '.bw/knowledge-map.toml'

export type KnowledgeMapStatus = 'draft' | 'reviewed'

export type KnowledgeMapSection = {
  role: KbRoleKey
  paths: string[]
}

export type KnowledgeMap = {
  version: number
  status: KnowledgeMapStatus
  sections: KnowledgeMapSection[]
  exclude: string[]
}

export const EMPTY_KNOWLEDGE_MAP: KnowledgeMap = {
  version: 1,
  status: 'draft',
  sections: [],
  exclude: []
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

function parseStringArray(raw: string): string[] {
  const inner = raw.trim()
  if (!inner.startsWith('[') || !inner.endsWith(']')) {
    return []
  }
  const body = inner.slice(1, -1).trim()
  if (!body) {
    return []
  }
  const out: string[] = []
  const re = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const captured = match[1] ?? match[2] ?? ''
    out.push(captured.replace(/\\"/g, '"').replace(/\\\\/g, '\\'))
  }
  return out
}

function normalizeMapPath(path: string): string {
  return normalizeKbRelativePath(path).replace(/\/+$/, '')
}

/** True if `file` equals `pattern` or sits under a directory prefix pattern. */
export function pathMatchesMapPattern(file: string, pattern: string): boolean {
  const f = normalizeKbRelativePath(file)
  const p = normalizeMapPath(pattern)
  if (!p) {
    return false
  }
  if (f === p) {
    return true
  }
  // Directory prefix: "docs/foo" or "docs/foo/" matches docs/foo/bar.md
  if (pattern.endsWith('/') || !/\.[a-z0-9]+$/i.test(p)) {
    return f.startsWith(`${p}/`)
  }
  return false
}

function matchScore(file: string, pattern: string): number {
  if (!pathMatchesMapPattern(file, pattern)) {
    return -1
  }
  const p = normalizeMapPath(pattern)
  const f = normalizeKbRelativePath(file)
  if (f === p) {
    return 10_000 + p.length
  }
  return p.length
}

/** Classify with map: exclude wins; else longest/exact section path wins. */
export function classifyWithMap(relativePath: string, map: KnowledgeMap): string | null {
  const norm = normalizeKbRelativePath(relativePath)
  for (const ex of map.exclude) {
    if (pathMatchesMapPattern(norm, ex)) {
      return null
    }
  }
  let bestRole: KbRoleKey | null = null
  let bestScore = -1
  for (const section of map.sections) {
    for (const pattern of section.paths) {
      const score = matchScore(norm, pattern)
      if (score > bestScore) {
        bestScore = score
        bestRole = section.role
      }
    }
  }
  return bestRole
}

export function parseKnowledgeMap(raw: string): KnowledgeMap {
  const out: KnowledgeMap = {
    version: 1,
    status: 'draft',
    sections: [],
    exclude: []
  }
  let mode: 'top' | 'section' | 'exclude' = 'top'
  let current: KnowledgeMapSection | null = null

  const flushSection = () => {
    if (current && current.paths.length > 0) {
      out.sections.push(current)
    }
    current = null
  }

  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) {
      continue
    }
    if (t === '[[section]]') {
      flushSection()
      mode = 'section'
      current = { role: 'eng-reference', paths: [] }
      continue
    }
    if (t === '[[exclude]]') {
      flushSection()
      mode = 'exclude'
      continue
    }
    if (t.startsWith('[')) {
      flushSection()
      mode = 'top'
      continue
    }
    const eq = t.indexOf('=')
    if (eq <= 0) {
      continue
    }
    const key = t.slice(0, eq).trim()
    const valRaw = t.slice(eq + 1).trim()
    if (mode === 'top') {
      if (key === 'version') {
        const n = Number(unquote(valRaw))
        if (Number.isFinite(n) && n > 0) {
          out.version = Math.floor(n)
        }
      } else if (key === 'status') {
        const s = unquote(valRaw)
        if (s === 'draft' || s === 'reviewed') {
          out.status = s
        }
      }
      continue
    }
    if (mode === 'exclude') {
      if (key === 'paths') {
        out.exclude.push(...parseStringArray(valRaw).map(normalizeKbRelativePath))
      }
      continue
    }
    if (mode === 'section' && current) {
      if (key === 'role') {
        const role = unquote(valRaw)
        if (isKbRoleKey(role)) {
          current.role = role
        }
      } else if (key === 'paths') {
        current.paths = parseStringArray(valRaw).map(normalizeKbRelativePath)
      }
    }
  }
  flushSection()
  return out
}

export function renderKnowledgeMap(map: KnowledgeMap): string {
  const lines: string[] = [
    `version = ${map.version}`,
    `status = ${quote(map.status)}`,
    '',
    '# AI-native 文档角色地图：路径因仓而异，role 跨仓一致。',
    '# 用 skills/bw-knowledge-docs 审阅后把 status 改为 reviewed。',
    ''
  ]
  for (const section of map.sections) {
    if (section.paths.length === 0) {
      continue
    }
    lines.push('[[section]]')
    lines.push(`role = ${quote(section.role)}`)
    lines.push(`paths = [${section.paths.map(quote).join(', ')}]`)
    lines.push('')
  }
  if (map.exclude.length > 0) {
    lines.push('[[exclude]]')
    lines.push(`paths = [${map.exclude.map(quote).join(', ')}]`)
    lines.push('')
  }
  return lines.join('\n')
}

export async function readKnowledgeMap(repoPath: string): Promise<{
  map: KnowledgeMap | null
  existed: boolean
  error: string | null
}> {
  const filePath = joinFsPath(repoPath, KNOWLEDGE_MAP_REL)
  try {
    await authorizeWorkbenchLocalPath(repoPath)
    const exists = await window.api.fs.pathExists({ filePath })
    if (!exists) {
      return { map: null, existed: false, error: null }
    }
    const { content, isBinary } = await window.api.fs.readFile({ filePath })
    if (isBinary) {
      return { map: null, existed: true, error: '知识库地图不是文本文件' }
    }
    return { map: parseKnowledgeMap(content), existed: true, error: null }
  } catch (e) {
    return {
      map: null,
      existed: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export async function writeKnowledgeMap(
  repoPath: string,
  map: KnowledgeMap,
  options?: { overwrite?: boolean }
): Promise<{ wrote: boolean; existed: boolean; error: string | null }> {
  const bwDir = joinFsPath(repoPath, '.bw')
  const filePath = joinFsPath(repoPath, KNOWLEDGE_MAP_REL)
  try {
    await authorizeWorkbenchLocalPath(repoPath)
    const existed = await window.api.fs.pathExists({ filePath })
    if (existed && options?.overwrite !== true) {
      return { wrote: false, existed: true, error: null }
    }
    const bwExists = await window.api.fs.pathExists({ filePath: bwDir })
    if (!bwExists) {
      await window.api.fs.createDir({ dirPath: bwDir })
    }
    await window.api.fs.writeFile({ filePath, content: renderKnowledgeMap(map) })
    return { wrote: true, existed, error: null }
  } catch (e) {
    return {
      wrote: false,
      existed: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

/**
 * Collapse paths under a role into a small set of directory prefixes + leftovers.
 * Prefer a directory prefix when ≥2 files share it.
 */
export function compactPathsForRole(paths: readonly string[]): string[] {
  const norms = [...new Set(paths.map(normalizeKbRelativePath))].sort()
  if (norms.length === 0) {
    return []
  }
  const dirs = new Map<string, string[]>()
  const files: string[] = []
  for (const p of norms) {
    const slash = p.lastIndexOf('/')
    if (slash <= 0) {
      files.push(p)
      continue
    }
    const dir = `${p.slice(0, slash + 1)}`
    const list = dirs.get(dir) ?? []
    list.push(p)
    dirs.set(dir, list)
  }
  const out: string[] = [...files]
  const covered = new Set<string>()
  const sortedDirs = [...dirs.entries()].sort((a, b) => b[0].length - a[0].length)
  for (const [dir, members] of sortedDirs) {
    if (members.every((m) => covered.has(m))) {
      continue
    }
    if (members.length >= 2) {
      out.push(dir)
      for (const m of members) {
        covered.add(m)
      }
    } else {
      for (const m of members) {
        if (!covered.has(m)) {
          out.push(m)
          covered.add(m)
        }
      }
    }
  }
  return [...new Set(out)].sort()
}
