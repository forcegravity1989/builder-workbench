import type { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { toRuntimeWorktreeSelector } from '@/runtime/runtime-worktree-selector'

/**
 * Where a page's annotations are mirrored: the host that owns the page, so whoever else is looking
 * at it can see them.
 *
 * Why a route and not just "local": a page streamed from a shared host belongs to that host, and
 * the annotation store on it is the only place both sides can read. For a page on this machine the
 * route is local, which is what the browsing pane always used.
 */
export type BrowserAnnotationHostRoute = {
  target: Parameters<typeof callRuntimeRpc>[0]
  worktree: string
  page: string
}

/** Resolves the route at call time; null while the page has no host-side identity yet. */
export type BrowserAnnotationHostRouter = () => BrowserAnnotationHostRoute | null

export function resolveBrowserAnnotationHostRoute(
  remoteRoute: BrowserAnnotationHostRouter | undefined,
  worktreeId: string,
  browserTabId: string
): BrowserAnnotationHostRoute | null {
  if (remoteRoute) {
    return remoteRoute()
  }
  return {
    target: { kind: 'local' },
    worktree: toRuntimeWorktreeSelector(worktreeId),
    page: browserTabId
  }
}
