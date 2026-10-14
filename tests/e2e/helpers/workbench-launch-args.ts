import { dirname } from 'node:path'

export function getWorkbenchElectronLaunchArgs(mainPath: string, headful: boolean): string[] {
  // Launch through package.json so app version and resource paths match a packaged app.
  const appPath = dirname(dirname(dirname(mainPath)))
  // Why: E2E launches the app backgrounded (ORCA_BACKGROUND_LAUNCH) and on
  // Windows/macOS the window can sit occluded behind the developer's desktop.
  // Chromium then throttles requestAnimationFrame, and Playwright's click
  // actionability check ("visible, enabled and stable") needs two consecutive
  // animation frames — it starves forever on a throttled renderer. These flags
  // keep frame delivery alive for occluded/backgrounded test windows.
  // They do NOT lift visibility gating: a window that is never shown
  // (ORCA_E2E_HEADLESS) keeps document visibilityState 'hidden', where
  // Chromium pauses rAF outright. That starved the CI Xvfb smoke
  // deterministically after reload — the earlier "Xvfb never needed these"
  // note was wrong; the fix is showing the window on virtual displays via
  // ORCA_E2E_HEADFUL=1 (see workbench-app.ts), not more flags.
  const frameFlags = [
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling'
  ]
  // Isolated macOS profiles must not invoke the system keychain UI. Without
  // these Chromium switches startup can block before the first renderer target.
  const keychainArgs =
    process.platform === 'darwin' ? ['--password-store=basic', '--use-mock-keychain'] : []
  if (process.platform === 'darwin') {
    // Crash tests must not block later launches on AppKit's saved-window recovery dialog.
    return [...frameFlags, ...keychainArgs, appPath, '-ApplePersistenceIgnoreState', 'YES']
  }
  if (headful && process.platform === 'linux' && process.env.CI) {
    // Hosted runners have no GPU; SwiftShader keeps WebGL assertions from silently skipping.
    return [
      ...frameFlags,
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--disable-gpu-sandbox',
      appPath
    ]
  }
  if (headful || process.platform !== 'linux') {
    return [...frameFlags, ...keychainArgs, appPath]
  }

  // Why: Ubuntu CI cannot run Electron's setuid chrome-sandbox (not root-owned
  // mode 4755 in node_modules). Playwright's electron.launch injects
  // --no-sandbox automatically; raw spawn() paths (e.g. second-instance
  // activation) must match or Chromium aborts with SIGTRAP before handshake.
  // GPU flags keep headless under Xvfb on a software path when the GPU
  // subprocess cannot initialize.
  return [
    ...frameFlags,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--in-process-gpu',
    ...keychainArgs,
    appPath
  ]
}
