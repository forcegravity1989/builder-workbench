import { FLOATING_TERMINAL_WORKTREE_ID } from '../../shared/workspace/identity/floating-workspace-id'
import { parseWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import { WORKTREE_ID_SEPARATOR } from '../../shared/terminal/pty/lifecycle/pty-session-id-format'
import { startSpan } from '../observability/tracer'

/**
 * Where the lookup gave up. `resolver` is the choke point every worktree-selector miss funnels
 * through (`resolveWorktreeSelector`; folder-workspace misses resolve elsewhere and carry no
 * facts to report), `host-scoped` the `id:` + requiredHostId short-circuit a managed workspace
 * uses, which never reaches the resolver.
 */
export type WorktreeSelectorMissStage = 'resolver' | 'host-scoped'

/**
 * Everything the runtime already knows when a selector fails to resolve. Kept as a plain
 * record so the runtime can build it without the observability lane importing runtime types.
 */
export type WorktreeSelectorMissFacts = {
  readonly stage: WorktreeSelectorMissStage
  /**
   * The entry that asked for the resolution (`showManagedWorktree`, `activateManagedWorktree`,
   * `structured-session-location`, …), or `null` when an unthreaded internal caller missed.
   * Distinguishes a user-facing surface from benign probes without a span per RPC channel.
   */
  readonly caller: string | null
  readonly selector: string
  readonly requiredHostId: string | null
  readonly worktreeId: string | null
  readonly repoKnown: boolean | null
  /**
   * `null` when the repo id resolves to rows on more than one host: `getRepo(id)` is host-blind,
   * so reporting an arbitrary row's host would claim "local" for a remote worktree (#11163).
   */
  readonly repoHost: 'local' | 'remote' | null
  readonly metaPresent: boolean | null
  /** Local filesystem only — a remote/WSL path says nothing about the host that owns it. */
  readonly pathExistsLocal: boolean | null
  /** Whether the fleet snapshot was already fresh when the request started. */
  readonly cacheFreshAtRequest: boolean
  readonly resolvedWorktreeCount: number | null
  readonly repoResolvedWorktreeCount: number | null
  readonly repoMetaCount: number | null
}

export function isSelectorNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === 'selector_not_found'
}

export function worktreeSelectorKind(selector: string): string {
  const colon = selector.indexOf(':')
  if (colon <= 0) {
    return 'bare'
  }
  const prefix = selector.slice(0, colon)
  return prefix === 'identity' ||
    prefix === 'id' ||
    prefix === 'path' ||
    prefix === 'branch' ||
    prefix === 'name' ||
    prefix === 'issue'
    ? prefix
    : 'bare'
}

/**
 * The worktree a failed selector names, or `null` when it names none. Only `id:`, a bare
 * `repo::path` id and a `worktree:` workspace key qualify; splitting a `branch:feature::x`
 * value or a workspace key would yield a fake repo id and report "repo unknown" for a repo
 * that is known.
 */
export function worktreeIdFromSelector(selector: string): string | null {
  // Why strip `id:` before parsing the workspace key: the terminal target accepts both
  // `worktree:<id>` and `id:worktree:<id>`, and stopping at the first form would split the
  // leftover prefix into a fake repo id.
  const hasIdPrefix = selector.startsWith('id:')
  const candidate = hasIdPrefix ? selector.slice(3) : selector
  const scope = parseWorkspaceKey(candidate)
  if (scope) {
    return scope.type === 'worktree' ? scope.worktreeId : null
  }
  if (!hasIdPrefix && worktreeSelectorKind(selector) !== 'bare') {
    return null
  }
  return candidate.includes(WORKTREE_ID_SEPARATOR) ? candidate : null
}

/**
 * Selectors the runtime rejects by contract rather than because a lookup missed: `active` is
 * never resolvable and the floating terminal has no managed worktree by design. Recording
 * them would dilute the miss signal with caller mistakes.
 */
export function isNonMissSelector(selector: string): boolean {
  return (
    selector === 'active' ||
    selector === FLOATING_TERMINAL_WORKTREE_ID ||
    selector === `id:${FLOATING_TERMINAL_WORKTREE_ID}`
  )
}

const SELECTOR_PREFIX_RE = /^(?:id|path|branch|name|identity|issue):/

/**
 * Why a span instead of widening every `Error('selector_not_found')`: the existing failure
 * spans (e.g. `workbench.materials.list`) only carry the bare message, so a trace could not
 * say *which* worktree id missed or whether the runtime had seen the repo at all. One child
 * span per miss keeps the original error contract untouched while making the next occurrence
 * diagnosable from `main.trace.ndjson` alone.
 */
export function recordWorktreeSelectorMiss(facts: WorktreeSelectorMissFacts, cause: unknown): void {
  const span = startSpan('runtime.worktree-selector-miss', {
    attributes: {
      kind: 'runtime',
      'selector.kind': worktreeSelectorKind(facts.selector),
      'selector.value': facts.selector,
      'selector.stage': facts.stage,
      'selector.caller': facts.caller,
      'selector.required_host_id': facts.requiredHostId,
      'selector.worktree_id': facts.worktreeId,
      'selector.stripped_value': facts.selector.replace(SELECTOR_PREFIX_RE, ''),
      'repo.known': facts.repoKnown,
      'repo.host': facts.repoHost,
      'meta.present': facts.metaPresent,
      'path.exists_local': facts.pathExistsLocal,
      'cache.fresh_at_request': facts.cacheFreshAtRequest,
      'resolved.worktree_count': facts.resolvedWorktreeCount,
      'repo.resolved_worktree_count': facts.repoResolvedWorktreeCount,
      'repo.meta_count': facts.repoMetaCount
    }
  })
  span.fail(cause instanceof Error ? cause : new Error(String(cause)))
}
