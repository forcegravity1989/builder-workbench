import { useAppStore } from '@/store'

// Why (BW #323): buttons are local-scope only (spec I09 — remote runtimes
// cannot host local terminal tabs or run local installs). The active
// worktree requirement was dropped with the floating-terminal move (user
// decision 2026-10-16): login no longer hangs off an imported project.
// Login itself runs in the card-embedded inline terminal (user decision
// 2026-10-19) — see OnboardingInlineCommandTerminal usage in the cards.
export function useIsLocalCliScope(): boolean {
  const activeRuntimeEnvironmentId = useAppStore(
    (s) => s.settings?.activeRuntimeEnvironmentId?.trim() ?? ''
  )
  return activeRuntimeEnvironmentId === ''
}
