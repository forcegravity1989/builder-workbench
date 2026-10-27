import { app, net } from 'electron'
import { join } from 'node:path'
import { isWorkbenchProduct } from '../startup/workbench-product'
import type { ElectronAutoUpdater } from '../electron-updater-loader'
import { WORKBENCH_RELEASE_REPO } from '../../shared/release-channel'
import { startRecoverableUpdateFeed } from './recoverable-update-feed'

let activeFeed: {
  upstream: string
  promise: ReturnType<typeof startRecoverableUpdateFeed>
} | null = null
let quitCleanupRegistered = false

export async function setRecoverableReleaseFeed(
  updater: ElectronAutoUpdater,
  upstream: string
): Promise<void> {
  if (
    process.platform !== 'win32' ||
    !isWorkbenchProduct() ||
    !upstream.startsWith(`https://github.com/${WORKBENCH_RELEASE_REPO}/releases/`)
  ) {
    updater.setFeedURL({ provider: 'generic', url: upstream })
    return
  }
  if (!quitCleanupRegistered) {
    quitCleanupRegistered = true
    app.once('will-quit', () => {
      void activeFeed?.promise.then((feed) => feed.close()).catch(() => {})
    })
  }
  if (activeFeed?.upstream !== upstream) {
    void activeFeed?.promise.then((feed) => feed.close()).catch(() => {})
    const promise = startRecoverableUpdateFeed({
      upstream,
      cacheDir: join(app.getPath('userData'), 'update-downloads'),
      fetch: (url, init) => net.fetch(url, init)
    })
    activeFeed = { upstream, promise }
    void promise.catch(() => {
      if (activeFeed?.promise === promise) {
        activeFeed = null
      }
    })
  }
  const feed = await activeFeed.promise
  updater.disableDifferentialDownload = true
  updater.setFeedURL({ provider: 'generic', url: feed.url })
}
