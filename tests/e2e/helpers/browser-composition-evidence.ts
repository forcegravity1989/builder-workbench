import { writeFileSync } from 'node:fs'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'

export async function captureBrowserCompositionEvidence(
  app: ElectronApplication,
  page: Page,
  info: TestInfo
): Promise<void> {
  const allowed =
    process.platform === 'linux' &&
    process.env.GITHUB_ACTIONS === 'true' &&
    process.env.RUNNER_ENVIRONMENT === 'github-hosted' &&
    process.env.ORCA_E2E_CAPTURE_VIRTUAL_DISPLAY === '1' &&
    Boolean(process.env.DISPLAY)
  if (!allowed) {
    return
  }

  for (const kind of ['screen', 'window'] as const) {
    const name = `browser-split-native-${kind}`
    let metadata: unknown
    try {
      const handle = await app.browserWindow(page)
      const windowId = await handle.evaluate((window) => window.id as number)
      await handle.dispose()
      const result = await app.evaluate(
        async ({ app, BrowserWindow, desktopCapturer, screen }, { kind, windowId }) => {
          // This helper must never capture a developer's or self-hosted runner's desktop.
          if (
            process.platform !== 'linux' ||
            process.env.GITHUB_ACTIONS !== 'true' ||
            process.env.RUNNER_ENVIRONMENT !== 'github-hosted' ||
            process.env.ORCA_E2E_CAPTURE_VIRTUAL_DISPLAY !== '1' ||
            !process.env.DISPLAY
          ) {
            throw new Error('Capture requires the hosted Xvfb job')
          }

          const window = BrowserWindow.fromId(windowId)
          if (!window || window.isDestroyed()) {
            throw new Error('Fixture window is unavailable')
          }
          const windowState = {
            id: window.id,
            webContentsId: window.webContents.id,
            visible: window.isVisible(),
            minimized: window.isMinimized(),
            focused: window.isFocused(),
            bounds: window.getBounds(),
            contentBounds: window.getContentBounds(),
            zoomFactor: window.webContents.getZoomFactor()
          }
          const provenance = {
            capturedAt: new Date().toISOString(),
            sourceHead: process.env.GITHUB_SHA,
            display: process.env.DISPLAY,
            runnerEnvironment: process.env.RUNNER_ENVIRONMENT,
            forceHeadful: process.env.ORCA_E2E_FORCE_HEADFUL,
            gpuFlags: Object.fromEntries(
              [
                'disable-gpu',
                'disable-gpu-compositing',
                'in-process-gpu',
                'use-gl',
                'use-angle',
                'enable-unsafe-swiftshader'
              ].map((flag) => [
                flag,
                {
                  present: app.commandLine.hasSwitch(flag),
                  value: app.commandLine.getSwitchValue(flag)
                }
              ])
            )
          }
          let timeout: ReturnType<typeof setTimeout> | undefined
          const capture = async () => {
            if (kind === 'window') {
              const image = await window.capturePage(undefined, { stayHidden: true })
              return { image, source: { kind: 'BrowserWindow.capturePage' } }
            }
            const displays = screen.getAllDisplays()
            if (displays.length !== 1) {
              throw new Error('Expected one isolated Xvfb display')
            }
            const display = displays[0]
            const sources = await desktopCapturer.getSources({
              types: ['screen'],
              thumbnailSize: {
                width: Math.round(display.size.width * display.scaleFactor),
                height: Math.round(display.size.height * display.scaleFactor)
              },
              fetchWindowIcons: false
            })
            if (sources.length !== 1) {
              throw new Error('Expected one Xvfb screen source')
            }
            const source = sources[0]
            if (source.display_id && source.display_id !== String(display.id)) {
              throw new Error('Screen source does not match the Xvfb display')
            }
            return {
              image: source.thumbnail,
              source: {
                kind: 'desktopCapturer screen',
                id: source.id,
                displayId: source.display_id,
                displayBounds: display.bounds,
                scaleFactor: display.scaleFactor
              }
            }
          }
          const captured = await Promise.race([
            capture(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Native capture timed out')), 5000)
            })
          ]).finally(() => clearTimeout(timeout))
          return {
            pngBase64: captured.image.toPNG().toString('base64'),
            size: captured.image.getSize(),
            empty: captured.image.isEmpty(),
            scaleFactors: captured.image.getScaleFactors(),
            source: captured.source,
            windowState,
            provenance
          }
        },
        { kind, windowId }
      )
      const { pngBase64, ...details } = result
      const pngPath = info.outputPath(`${name}.png`)
      writeFileSync(pngPath, Buffer.from(pngBase64, 'base64'))
      await info.attach(name, { path: pngPath, contentType: 'image/png' })
      metadata = { status: 'captured', ...details }
    } catch (error) {
      metadata = {
        status: 'capture-failed',
        error: error instanceof Error ? error.message : String(error)
      }
    }
    const jsonPath = info.outputPath(`${name}.json`)
    writeFileSync(jsonPath, `${JSON.stringify(metadata, null, 2)}\n`)
    await info.attach(`${name}-metadata`, { path: jsonPath, contentType: 'application/json' })
  }
}
