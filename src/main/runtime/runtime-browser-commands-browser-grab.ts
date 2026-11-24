import { RuntimeBrowserCommandsWithBrowserScreencast } from './runtime-browser-commands-browser-screencast'
import type { BrowserCommandTargetParams } from './runtime-browser-commands-browser-command-target-params'
import { browserManager } from '../browser/browser-manager'
import type {
  BrowserCaptureSelectionScreenshotResult,
  BrowserGrabRect,
  BrowserGrabResult,
  BrowserSetGrabModeResult
} from '../../shared/browser-grab-types'

/**
 * Element picking for a page a remote viewer is looking at.
 *
 * Why this exists: Orca's picker is driven over local IPC and checks that the caller owns the
 * guest, so a remote pane could not use it. These commands expose the same manager operations to
 * the runtime RPC layer, resolved by page id like every other browser command; the in-guest
 * overlay and payload extraction are the native ones, unchanged.
 */
export class RuntimeBrowserCommandsWithBrowserGrab extends RuntimeBrowserCommandsWithBrowserScreencast {
  async browserGrabSetMode(
    params: { enabled: boolean } & BrowserCommandTargetParams
  ): Promise<BrowserSetGrabModeResult> {
    const { browserPageId, webContents } = await this.resolveGrabGuest(params)
    const ok = await browserManager.setGrabMode(browserPageId, params.enabled, webContents)
    return ok ? { ok: true } : { ok: false, reason: 'injection-failed' }
  }

  async browserGrabAwait(
    params: { opId: string } & BrowserCommandTargetParams,
    signal?: AbortSignal
  ): Promise<BrowserGrabResult> {
    const { browserPageId, webContents } = await this.resolveGrabGuest(params)
    // Why: when the viewer disconnects mid-pick nobody will answer, so release the host page's
    // picker overlay now instead of leaving it to block the host's clicks until the op times out.
    const release = (): void => browserManager.cancelGrabOp(browserPageId, 'user')
    if (signal?.aborted) {
      release()
    } else {
      signal?.addEventListener('abort', release, { once: true })
    }
    try {
      return await browserManager.awaitGrabSelection(browserPageId, params.opId, webContents)
    } finally {
      signal?.removeEventListener('abort', release)
    }
  }

  async browserGrabCancel(params: BrowserCommandTargetParams): Promise<{ cancelled: boolean }> {
    const { browserPageId } = await this.resolveGrabGuest(params)
    browserManager.cancelGrabOp(browserPageId, 'user')
    return { cancelled: true }
  }

  async browserGrabScreenshot(
    params: { rect: BrowserGrabRect } & BrowserCommandTargetParams
  ): Promise<BrowserCaptureSelectionScreenshotResult> {
    const { browserPageId, webContents } = await this.resolveGrabGuest(params)
    const screenshot = await browserManager.captureSelectionScreenshot(
      browserPageId,
      params.rect,
      webContents
    )
    return screenshot
      ? { ok: true, screenshot }
      : { ok: false, reason: 'Screenshot capture failed' }
  }

  private async resolveGrabGuest(
    params: BrowserCommandTargetParams
  ): Promise<{ browserPageId: string; webContents: Electron.WebContents }> {
    const target = await this.resolveBrowserCommandTarget(params)
    return this.resolveBrowserPageWebContents(target.worktreeId, target.browserPageId)
  }
}
