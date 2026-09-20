import {
  KB_GROUPS,
  KB_REGISTRY_DOCS,
  ROOT_ENG_BASENAMES,
  ROOT_USER_BASENAMES,
  isKbRoleKey,
  normalizeKbRelativePath,
  registryMetaForPath,
  type KbDoc,
  type KbRoleKey
} from './knowledge-doc-registry'
import { compactPathsForRole, type KnowledgeMap, type KnowledgeMapSection } from './knowledge-map'

const DEFAULT_EXCLUDE_PREFIXES = ['docs/review-evidence/'] as const

/** Avoid treating the map file itself as a markdown doc path in drafts. */
const KNOWLEDGE_MAP_SENTINEL = '.bw/knowledge-map.toml'

function basenameOf(norm: string): string {
  return norm.split('/').pop() ?? norm
}

/** 跨仓通用角色启发式（草稿用）；单仓真相以 `.bw/knowledge-map.toml` 为准。 */
export function classifyKbDocGroup(relativePath: string): string | null {
  const norm = normalizeKbRelativePath(relativePath)
  const base = basenameOf(norm)
  const lower = norm.toLowerCase()

  if (norm === '.bw/project.toml' || norm.startsWith('.bw/')) {
    return 'eng-bw'
  }
  for (const prefix of DEFAULT_EXCLUDE_PREFIXES) {
    if (norm.startsWith(prefix)) {
      return null
    }
  }
  if (norm.startsWith('docs/site/content/docs/') || /\/content\/docs\//.test(norm)) {
    return 'user-docs'
  }
  if (norm.startsWith('docs/site/')) {
    return null
  }
  if (norm.startsWith('docs/readme/')) {
    return 'user-readme'
  }
  if (!norm.includes('/') && ROOT_USER_BASENAMES.has(base)) {
    return 'user-readme'
  }
  if (!norm.includes('/') && /^readme(\.[a-z0-9_-]+)?\.mdx?$/i.test(base)) {
    return 'user-readme'
  }
  if (!norm.includes('/') && ROOT_ENG_BASENAMES.has(base)) {
    return 'eng-agents'
  }
  if (
    /(^|\/)(01-principles|principles)\//i.test(norm) ||
    /(^|\/)vision\//i.test(norm) ||
    (/principle|vision/i.test(base) && norm.startsWith('docs/'))
  ) {
    return 'eng-principles'
  }
  if (
    /(^|\/)(05-features|features)\//i.test(norm) ||
    /(intent|spec|roadmap|checklist|rollout|correction)/i.test(lower) ||
    /\/[^/]*plan[^/]*\.mdx?$/i.test(lower)
  ) {
    return 'eng-features'
  }
  if (
    /(^|\/)(02-adr|adr)\//i.test(norm) ||
    /styleguide|architecture|compat|契约|boundary|contract/i.test(lower)
  ) {
    return 'eng-contract'
  }
  if (/(^|\/)(reference|howto|runbook|ops)\//i.test(norm) || /howto|runbook/i.test(base)) {
    return 'eng-reference'
  }
  if (norm.startsWith('docs/') || norm.startsWith('cloud/docs/')) {
    return 'eng-reference'
  }
  return null
}

/** Build a draft map by classifying paths with role heuristics. */
export function draftKnowledgeMapFromPaths(paths: readonly string[]): KnowledgeMap {
  const byRole = new Map<KbRoleKey, string[]>()
  const exclude: string[] = []
  const seenExclude = new Set<string>()

  for (const raw of paths) {
    const norm = normalizeKbRelativePath(raw)
    if (!norm || norm === KNOWLEDGE_MAP_SENTINEL) {
      continue
    }
    const role = classifyKbDocGroup(norm)
    if (!role) {
      if (norm.startsWith('docs/review-evidence/') && !seenExclude.has('docs/review-evidence/')) {
        exclude.push('docs/review-evidence/')
        seenExclude.add('docs/review-evidence/')
      }
      continue
    }
    if (!isKbRoleKey(role)) {
      continue
    }
    const list = byRole.get(role) ?? []
    list.push(norm)
    byRole.set(role, list)
  }

  // Always keep machine charter visible.
  if (!byRole.has('eng-bw')) {
    byRole.set('eng-bw', ['.bw/project.toml'])
  }

  const sections: KnowledgeMapSection[] = []
  for (const group of KB_GROUPS) {
    if (!isKbRoleKey(group.key)) {
      continue
    }
    const members = byRole.get(group.key)
    if (!members || members.length === 0) {
      continue
    }
    sections.push({
      role: group.key,
      paths: compactPathsForRole(members)
    })
  }

  return {
    version: 1,
    status: 'draft',
    sections,
    exclude
  }
}

export function kbDocIdFromPath(relativePath: string): string {
  const norm = normalizeKbRelativePath(relativePath)
  return registryMetaForPath(norm)?.id ?? norm.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function ledeFromMarkdownBody(body: string): string {
  const lines = body.split('\n')
  const prose = lines.find((l) => {
    const t = l.trim()
    return t && !t.startsWith('#') && !t.startsWith('---')
  })
  const heading = lines.find((l) => l.trim().startsWith('#'))
  const pick = prose ?? heading
  if (!pick) {
    return '仓库文档'
  }
  return pick
    .replace(/^#+\s*/, '')
    .trim()
    .slice(0, 80)
}

const GROUP_ORDER = KB_GROUPS.map((g) => g.key)
const REGISTRY_PATH_ORDER = new Map(KB_REGISTRY_DOCS.map((d, i) => [d.path, i]))

export function sortKbDocs(docs: KbDoc[]): KbDoc[] {
  return [...docs].sort((a, b) => {
    const ga = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (ga !== 0) {
      return ga
    }
    const ra = REGISTRY_PATH_ORDER.get(a.path) ?? 9999
    const rb = REGISTRY_PATH_ORDER.get(b.path) ?? 9999
    if (ra !== rb) {
      return ra - rb
    }
    return a.path.localeCompare(b.path)
  })
}
