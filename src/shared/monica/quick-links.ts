import { z } from 'zod'

/**
 * Project-level "quick links" — a small list of web addresses a builder opens
 * repeatedly for the current project. Deliberately NOT a service/port model:
 * there are no health signals, so nothing here derives an "up/down" state.
 */
export const QUICK_LINKS_SCHEMA_VERSION = 1 as const

export const QuickLinkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1)
})

export const QuickLinksDocumentSchema = z.object({
  schemaVersion: z.literal(QUICK_LINKS_SCHEMA_VERSION),
  links: z.array(QuickLinkSchema)
})

export type QuickLink = z.infer<typeof QuickLinkSchema>
export type QuickLinksDocument = z.infer<typeof QuickLinksDocumentSchema>

export function emptyQuickLinksDocument(): QuickLinksDocument {
  return { schemaVersion: QUICK_LINKS_SCHEMA_VERSION, links: [] }
}

/** Strip a single trailing slash so `…/docs` and `…/docs/` compare equal. */
function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/**
 * Parse and canonicalize a web address used as a quick link. Only absolute
 * http/https URLs without embedded credentials are allowed (no `user:pass@`).
 * Throws on anything else so callers can surface a specific reason.
 */
export function normalizeQuickLinkUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('请输入地址')
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error('请输入完整地址，例如 https://example.com')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('地址需使用 http 或 https')
  }
  if (parsed.username || parsed.password) {
    throw new Error('地址不能包含账号密码')
  }
  return stripTrailingSlash(parsed.href)
}

/** Human-facing short form: host + path (drops protocol/query/hash noise). */
export function displayQuickLinkUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname === '/' ? '' : parsed.pathname
    return `${parsed.host}${path}`
  } catch {
    return url
  }
}

export type QuickLinkDraftInput = {
  name: string
  url: string
  existing: readonly Pick<QuickLink, 'id' | 'url'>[]
  /** Link being edited (excluded from the duplicate check); null when adding. */
  editingId?: string | null
}

export type QuickLinkDraftResult =
  | { ok: true; name: string; url: string }
  | { ok: false; field: 'name' | 'url'; message: string }

/** Validate a name+url draft against the current list; returns the value to store. */
export function validateQuickLinkDraft(input: QuickLinkDraftInput): QuickLinkDraftResult {
  const name = input.name.trim()
  if (!name) {
    return { ok: false, field: 'name', message: '请填写名称' }
  }
  let url: string
  try {
    url = normalizeQuickLinkUrl(input.url)
  } catch (error) {
    return { ok: false, field: 'url', message: (error as Error).message }
  }
  const duplicate = input.existing.some(
    (link) => link.id !== input.editingId && stripTrailingSlash(link.url.trim()) === url
  )
  if (duplicate) {
    return { ok: false, field: 'url', message: '这个地址已在常用链接中' }
  }
  return { ok: true, name, url }
}

/** Stable id for a new link; falls back when crypto.randomUUID is unavailable. */
export function generateQuickLinkId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) {
    return `ql_${uuid}`
  }
  return `ql_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
