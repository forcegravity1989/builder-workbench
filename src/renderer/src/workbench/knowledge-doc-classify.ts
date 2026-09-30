import {
  KB_GROUPS,
  KB_REGISTRY_DOCS,
  ROOT_ENG_BASENAMES,
  ROOT_USER_BASENAMES,
  normalizeKbRelativePath,
  registryMetaForPath,
  type KbDoc
} from './knowledge-doc-registry'

const DEFAULT_EXCLUDE_PREFIXES = ['docs/review-evidence/'] as const

function basenameOf(norm: string): string {
  return norm.split('/').pop() ?? norm
}

/** 知识库屏内置分类规则（跨仓通用启发式）。 */
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
