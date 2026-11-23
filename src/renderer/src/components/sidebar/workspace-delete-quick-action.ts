// Why: the delete quick action lives in the always-on hover chrome now, so the
// old Option/Alt transient-reveal modifier no longer gates it. Visibility is a
// pure function of the card's own state.
export function canShowWorkspaceDeleteQuickAction(args: {
  isDeleting: boolean
  isMainWorktree: boolean
}): boolean {
  return !args.isDeleting && !args.isMainWorktree
}
