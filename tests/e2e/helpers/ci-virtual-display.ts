// Why: Xvfb (GitHub Actions' ubuntu runners) needs a mapped window for the
// renderer to keep delivering frames. A never-shown window keeps document
// visibilityState 'hidden', Chromium pauses requestAnimationFrame outright
// (the disable-backgrounding launch flags do not lift visibility gating), and
// Playwright actionability's stability check starves — deterministically after
// page.reload(), when the fresh document's visibility resyncs. The same guard
// shape (strict GITHUB_ACTIONS === 'true', linux, DISPLAY, no explicit
// ORCA_BACKGROUND_LAUNCH) is established in-repo by
// paired-client-runtime-environment.ts's post-reload window reveal.
// Guard semantics, briefly:
// - linux: macOS XQuartz exports DISPLAY on real desktop sessions; showing
//   there would bypass the accessory activation policy (Dock/menu bar).
// - strict 'true': a developer's `CI=1` on a real Linux desktop must not map
//   the window over the editor.
// - ORCA_BACKGROUND_LAUNCH !== '1': an explicit background launch keeps its
//   windowless contract; the rAF stall then recurs by that workflow's choice.
// Residual (accepted): a self-hosted Linux runner attached to a real X display
// still counts as "virtual" here — the window maps via showInactive(), no
// focus steal; no such runner exists in this repo.
export function runsOnCiVirtualDisplay(): boolean {
  return (
    process.platform === 'linux' &&
    process.env.GITHUB_ACTIONS === 'true' &&
    Boolean(process.env.DISPLAY) &&
    process.env.ORCA_BACKGROUND_LAUNCH !== '1'
  )
}
