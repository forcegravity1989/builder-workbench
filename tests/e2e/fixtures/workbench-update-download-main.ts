import { app, net } from 'electron'
import { NsisUpdater } from 'electron-updater'
import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { startRecoverableUpdateFeed } from '../../../src/main/updater/recoverable-update-feed'

const root = process.env.WORKBENCH_UPDATE_EVIDENCE_DIR!
mkdirSync(join(root, 'profile'), { recursive: true })
app.setPath('userData', join(root, 'profile'))
const payload = Buffer.from('Workbench real Electron transport verification\n'.repeat(32_768))
const sha512 = createHash('sha512').update(payload).digest('base64')
const filename = 'workbench-windows-setup.exe'
const requests: { path: string; range: string | null }[] = []
let interrupted = false
let retireFeed: (() => void) | undefined
const server = createServer((request, response) => {
  const path = request.url ?? ''
  requests.push({ path, range: request.headers.range ?? null })
  if (path === '/release/latest.yml') {
    response.end(
      stringify({
        version: '999.0.0',
        files: [{ url: filename, sha512, size: payload.length }],
        path: filename,
        sha512
      })
    )
  } else if (path === `/release/${filename}`) {
    const offset = Number(request.headers.range?.match(/^bytes=(\d+)-$/)?.[1] ?? 0)
    if (offset) {
      response.writeHead(206, {
        'Content-Range': `bytes ${offset}-${payload.length - 1}/${payload.length}`,
        'Content-Length': payload.length - offset
      })
    } else {
      response.writeHead(200, { 'Content-Length': payload.length })
    }
    if (!interrupted) {
      interrupted = true
      response.write(payload.subarray(0, 262_144))
      setTimeout(() => retireFeed?.(), 50)
      setTimeout(() => response.destroy(), 100)
    } else {
      response.end(payload.subarray(offset))
    }
  } else {
    response.writeHead(404).end()
  }
})

async function verify(): Promise<void> {
  await app.whenReady()
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'app-update.yml'), 'updaterCacheDirName: native-updater\n')
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Origin server did not start')
  }
  const upstream = `http://127.0.0.1:${address.port}/release`
  const feed = await startRecoverableUpdateFeed({
    upstream,
    cacheDir: join(root, 'downloads'),
    fetch: (url, init) => net.fetch(url, init)
  })
  retireFeed = feed.close
  try {
    class FixtureUpdater extends NsisUpdater {
      constructor() {
        super({ provider: 'generic', url: feed.url })
        this.forceDevUpdateConfig = true
        this.updateConfigPath = join(root, 'app-update.yml')
        this.setFeedURL({ provider: 'generic', url: feed.url })
        this.downloadedUpdateHelper = new DownloadedUpdateHelper(join(root, 'native-cache'))
      }
    }
    const updater = new FixtureUpdater()
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.disableDifferentialDownload = true
    const progress: number[] = []
    updater.on('download-progress', (event) => progress.push(event.transferred))
    updater.on('error', (error) => console.error('[native updater]', error.message))
    const check = await updater.checkForUpdates()
    if (!check?.isUpdateAvailable) {
      throw new Error('The native updater did not find the fixture release')
    }
    const files = await updater.downloadUpdate()
    if (!(await readFile(files[0]!)).equals(payload)) {
      throw new Error('Native staged bytes did not match')
    }
    if (!requests.some((request) => request.range === 'bytes=262144-')) {
      throw new Error('No resumed HTTP Range was observed')
    }
    if (!progress.length || progress.at(-1) !== payload.length) {
      throw new Error('Native progress did not complete')
    }
    await writeFile(
      join(root, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          electron: process.versions.electron,
          nativeUpdater: 'electron-updater@6.8.9',
          cases: [
            'feed-retirement-preserves-inflight-transfer',
            'mid-body-disconnect-range-resume',
            'native-staging-sha512-and-progress'
          ],
          requests,
          progress,
          bytes: payload.length,
          sha512,
          boundary:
            'Actual Electron net and NsisUpdater download/staging. Fixture payload; no installer execution or full Workbench UI journey.'
        },
        null,
        2
      )
    )
    console.log(`PASS: native Electron update transport; evidence ${join(root, 'result.json')}`)
  } finally {
    feed.close()
    server.closeAllConnections()
    server.close()
  }
}

void verify()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
