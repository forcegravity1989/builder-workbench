import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { chromium } from 'playwright'
import { readDirectionResult, runDirectionJourney } from '../e2e/helpers/workbench-direction.ts'

const [endpoint, repoPath, outputDir] = process.argv.slice(2)
if (!endpoint || !repoPath || !outputDir) {
  throw new Error('Usage: record-w01.mts <CDP URL> <registered sample repo> <new output directory>')
}
const git = (args: string[]) =>
  execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim()
const remote = 'yuzhup/bw-e2e-sandbox'
if (git(['remote', 'get-url', 'origin']) !== `https://github.com/${remote}.git`) {
  throw new Error('Recording requires the explicitly authorized dedicated sandbox origin')
}
const gh = (args: string[]) =>
  execFileSync('gh', args, { encoding: 'utf8', timeout: 120_000 }).trim()
const reviewQuery = ['api', `repos/${remote}/pulls?state=open&head=yuzhup:bw/project`]
async function verifyRemote() {
  const readback = readDirectionResult(repoPath, true)
  if (!readback.charter.includes(process.env.W01_VISION ?? '让运营每天看清变化，及时安排跟进')) {
    throw new Error('The material worktree does not contain this run’s vision')
  }
  const reviews = JSON.parse(gh(reviewQuery)).map(
    (pr: { number: number; html_url: string; head: { sha: string } }) => ({
      number: pr.number,
      url: pr.html_url,
      headRefOid: pr.head.sha
    })
  )
  const remoteHead = git(['ls-remote', 'origin', 'refs/heads/bw/project']).split(/\s/)[0]
  const localHead = git(['rev-parse', 'bw/project'])
  if (reviews.length !== 1 || reviews[0].headRefOid !== remoteHead || remoteHead !== localHead) {
    throw new Error('Remote PR, remote branch and local material commit disagree')
  }
  await writeFile(
    path.join(outputDir, 'readback.json'),
    JSON.stringify({ ...readback, reviews, remoteHead }, null, 2)
  )
}
if (process.argv[5] === '--verify') {
  const file = path.join(outputDir, 'recording.json')
  const result = JSON.parse(await readFile(file, 'utf8'))
  if (!result.results.includes('review-submitted')) {
    throw new Error('This capture did not reach the submitted result')
  }
  await verifyRemote()
  await writeFile(
    file,
    JSON.stringify(
      { ...result, success: true, remoteSubmitted: true, verifiedAt: new Date().toISOString() },
      null,
      2
    )
  )
  process.exit(0)
}
if (process.argv[5] === '--publish') {
  const result = JSON.parse(await readFile(path.join(outputDir, 'recording.json'), 'utf8'))
  const evidence = JSON.parse(await readFile(path.join(outputDir, 'readback.json'), 'utf8'))
  const encoder = process.argv[6]
  const trim = Number(process.argv[7] ?? 0)
  if (
    !result.success ||
    !result.remoteSubmitted ||
    !result.runtime ||
    !evidence.remoteHead ||
    !encoder ||
    !Number.isFinite(trim) ||
    trim < 0 ||
    trim >= result.chapters[1].start ||
    path.resolve(result.repoPath) !== path.resolve(repoPath)
  ) {
    throw new Error(
      'Publish requires verified recording evidence, an encoder and a valid preparation trim'
    )
  }
  const assets = path.resolve('src/renderer/src/workbench/explore/assets')
  await mkdir(assets, { recursive: true })
  const nextVideo = path.join(assets, 'w01.next.webm')
  execFileSync(encoder, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-ss',
    String(trim),
    '-i',
    path.join(outputDir, 'w01.webm'),
    '-an',
    '-c:v',
    'vp8',
    '-deadline',
    'realtime',
    '-speed',
    '8',
    '-crf',
    '8',
    '-b:v',
    '1M',
    '-threads',
    '1',
    '-y',
    nextVideo
  ])
  const events = result.events as { at: number }[]
  const mediaInfo = spawnSync(encoder, ['-hide_banner', '-i', nextVideo], { encoding: 'utf8' })
  const mediaTime = mediaInfo.stderr.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!mediaTime) {
    throw new Error('The encoded video duration could not be read; existing assets are unchanged')
  }
  const mediaDuration =
    Number(mediaTime[1]) * 3600 + Number(mediaTime[2]) * 60 + Number(mediaTime[3])
  const skip = events
    .slice(1)
    .flatMap((event, index) =>
      event.at - events[index].at > 6
        ? [{ from: events[index].at + 2.5 - trim, to: event.at - 0.8 - trim }]
        : []
    )
  const manifest = {
    chapters: result.chapters.map((chapter: { index: number; start: number }) => ({
      ...chapter,
      start: Math.max(0, chapter.start - trim)
    })),
    duration: mediaDuration,
    skip,
    size: result.size,
    sourceCommit: result.scriptSource,
    recordedAt: result.recordedAt,
    trimStart: trim
  }
  await rename(nextVideo, path.join(assets, 'w01.webm'))
  await writeFile(path.join(assets, 'w01.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  process.exit(0)
}
const pending = JSON.parse(gh(reviewQuery))
if (pending.length) {
  throw new Error(
    'Finish or explicitly retire the previous sandbox review before another recording'
  )
}
if (process.platform !== 'win32') {
  throw new Error('This dev recorder currently verifies Windows Electron process identity')
}
const processes = JSON.parse(
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process -Filter "Name = \'electron.exe\'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress'
    ],
    { encoding: 'utf8' }
  )
)
const runtime = (Array.isArray(processes) ? processes : [processes]).find((entry) => {
  const root = entry.CommandLine?.match(/--app-path="([^"]+)"/)?.[1]
  return (
    root &&
    path.resolve(root) === process.cwd() &&
    entry.CommandLine.includes(`--remote-debugging-port=${new URL(endpoint).port}`)
  )
})
if (!runtime) {
  throw new Error('CDP port and Electron source root do not match the recording checkout')
}
await mkdir(outputDir, { recursive: false })
const browser = await chromium.connectOverCDP(endpoint)
const page = browser
  .contexts()[0]
  .pages()
  .find((candidate) => candidate.url().startsWith('http://localhost:'))
if (!page) {
  throw new Error('Expected a running Workbench dev renderer')
}
const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
const repos = await page.evaluate(() => window.api.repos.list())
const repo = repos.find((candidate) => path.resolve(candidate.path) === path.resolve(repoPath))
if (!repo) {
  throw new Error('Register the dedicated sample through Workbench before recording')
}
const chapters: { index: number; start: number }[] = []
const results: string[] = []
const events: { kind: string; at: number }[] = []
let startedAt = 0
let duration = 0
let recording = false
let success = false
try {
  await runDirectionJourney(page, repo.id, {
    submit: process.env.W01_SUBMIT === '1',
    vision: process.env.W01_VISION,
    observer: {
      async chapter(index) {
        if (!recording) {
          await page.screencast.start({ path: path.join(outputDir, 'w01.webm'), size })
          recording = true
          startedAt = Date.now()
        }
        chapters.push({ index, start: (Date.now() - startedAt) / 1000 })
        events.push({ kind: 'chapter', at: (Date.now() - startedAt) / 1000 })
        await page.waitForTimeout(600)
      },
      async point(target) {
        if (!recording) {
          return
        }
        events.push({ kind: 'action', at: (Date.now() - startedAt) / 1000 })
        await target.hover()
        const bounds = await target.boundingBox()
        if (bounds) {
          const x = bounds.x + Math.min(30, bounds.width / 2)
          const y = bounds.y + bounds.height / 2
          await page.screencast.showOverlay(
            `<svg width="30" height="36" style="position:fixed;left:${x}px;top:${y}px;pointer-events:none"><path d="M2 2L2 26L9 19L15 31L20 28L14 17L25 17Z" fill="#222" stroke="white" stroke-width="2"/></svg>`,
            { duration: 750 }
          )
        }
        await page.waitForTimeout(350)
      },
      async result(name) {
        results.push(name)
        events.push({ kind: name, at: (Date.now() - startedAt) / 1000 })
        await page.screenshot({ path: path.join(outputDir, `${name}.png`) })
        await page.waitForTimeout(800)
      }
    }
  })
  duration = (Date.now() - startedAt) / 1000
  await page.screencast.stop()
  recording = false
  await verifyRemote()
  success = true
} finally {
  if (recording) {
    await page.screencast.stop()
  }
  await writeFile(
    path.join(outputDir, 'recording.json'),
    JSON.stringify(
      {
        success,
        scriptSource: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        runtimeUrl: page.url(),
        endpoint,
        size,
        runtime: { pid: runtime.ProcessId, sourceRoot: process.cwd() },
        repoPath,
        repoId: repo.id,
        recordedAt: new Date().toISOString(),
        chapters,
        results,
        duration: duration || (Date.now() - startedAt) / 1000,
        events,
        remoteSubmitted: process.env.W01_SUBMIT === '1' && success
      },
      null,
      2
    )
  )
  await browser.close()
}
