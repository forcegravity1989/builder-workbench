/**
 * Routing for the sidebar "reveal active workspace" request (#762).
 *
 * #500 keeps version-bound trees out of the native second-column groups: their
 * home is the version tree. Pinned version-bound trees are the exception — they
 * stay in the native Pinned section under both display policies, so they keep
 * the native reveal path. An empty projection (non-Workbench shell, or no
 * version project) always routes native.
 *
 * `isPinnedVersionBound` must be derived from the unfiltered catalog, not the
 * filter-scoped Pinned set: a filter hiding a pinned version tree must not
 * reroute it away from its native Pinned home.
 */
export function resolveSidebarRevealRoute(args: {
  worktreeIdentity: string
  versionTreeIdentities: ReadonlySet<string>
  isPinnedVersionBound?: boolean
}): 'version-tree' | 'native' {
  if (!args.versionTreeIdentities.has(args.worktreeIdentity)) {
    return 'native'
  }
  if (args.isPinnedVersionBound) {
    return 'native'
  }
  return 'version-tree'
}
