import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createEvidenceTree, checkImages, commentImageUrls } from './publish-pr-evidence.mjs'
import {
  sourceFingerprint,
  outputFingerprint,
  canReuseBuild,
  verificationEnv,
  developmentEnv,
  prepareEnvironment
} from './run-bw-verification.mjs'

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
  'base64'
)
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args])

function repository(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'bw-workflow-tools-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  git(root, 'init', '--quiet')
  git(root, 'config', 'user.name', 'Protocol Test')
  git(root, 'config', 'user.email', 'protocol@example.invalid')
  git(root, 'remote', 'add', 'origin', 'https://github.com/o/r.git')
  writeFileSync(path.join(root, 'source.png'), png)
  git(root, 'add', 'source.png')
  git(root, 'commit', '--quiet', '-m', 'fixture')
  return root
}

test('preparation locates the common repository, checks existing registration and keeps machine facts local', (t) => {
  const root = repository(t)
  const task = path.join(root, 'task-tree')
  git(root, 'worktree', 'add', '--quiet', '--detach', task, 'HEAD')
  const profile = path.join(root, 'existing-profile')
  mkdirSync(path.join(profile, 'profiles/local-default'), { recursive: true })
  writeFileSync(
    path.join(profile, 'orca-profile-index.json'),
    JSON.stringify({ activeProfileId: 'local-default' })
  )
  writeFileSync(
    path.join(profile, 'profiles/local-default/orca-data.json'),
    JSON.stringify({ repos: [{ id: 'bw', path: root }] })
  )
  const recordPath = path.join(root, '.bw/runtime/verification/environment.json')
  mkdirSync(path.dirname(recordPath), { recursive: true })
  writeFileSync(
    recordPath,
    JSON.stringify({
      machine: 'CURRENT',
      network: 'internal',
      devProfile: path.join(root, 'outdated-profile'),
      maxConcurrentHeavyJobs: 4
    })
  )
  const prepared = prepareEnvironment(task, {
    assistant: 'claude',
    devProfile: path.relative(task, profile),
    machine: 'current'
  })
  assert.equal(prepared.recordPath, recordPath)
  assert.equal(prepared.devProfile, profile)
  assert.equal(prepared.projectRegistration, 'registered-in-profile')
  assert.equal(prepared.projectId, 'bw')
  assert.equal(prepared.network, 'internal')
  assert.equal(prepared.maxConcurrentHeavyJobs, 4)
  assert.equal(prepared.uiVerification, 'not-checked')
  assert.doesNotThrow(() => git(root, 'check-ignore', '--quiet', recordPath))
  const foreign = prepareEnvironment(task, {
    assistant: 'codex',
    devProfile: path.join(root, 'another-machine-profile'),
    machine: 'different'
  })
  assert.equal(foreign.network, 'unknown')
  assert.equal(foreign.projectRegistration, 'profile-missing')
  assert.equal(foreign.maxConcurrentHeavyJobs, 1)
  const saved = readFileSync(recordPath)
  writeFileSync(
    path.join(root, '.gitignore'),
    '!.bw/runtime/verification/\n!.bw/runtime/verification/environment.json\n'
  )
  assert.throws(() => prepareEnvironment(task, { devProfile: profile }), /Git 忽略/)
  assert.deepEqual(readFileSync(recordPath), saved)
  git(root, 'add', '--force', recordPath)
  assert.throws(() => prepareEnvironment(task, { devProfile: profile }), /Git 跟踪/)
  assert.deepEqual(readFileSync(recordPath), saved)
})

test('binary evidence trees preserve exact names and image bytes without touching branch, index or worktree', (t) => {
  const root = repository(t)
  const status = git(root, 'status', '--porcelain=v1', '-z')
  const index = readFileSync(path.join(root, '.git/index'))
  const head = git(root, 'rev-parse', 'HEAD')
  const files = [{ file: path.join(root, 'source.png'), name: 'before-plan.png' }]
  const result = createEvidenceTree(root, 'o/r', 'shots/test', files)
  const names = git(root, 'ls-tree', '-z', '--name-only', result.sha)
  assert.equal(names.toString(), 'before-plan.png\0')
  assert.deepEqual(git(root, 'show', `${result.sha}:before-plan.png`), png)
  assert.deepEqual(git(root, 'status', '--porcelain=v1', '-z'), status)
  assert.deepEqual(readFileSync(path.join(root, '.git/index')), index)
  assert.deepEqual(git(root, 'rev-parse', 'HEAD'), head)
  assert.equal(createEvidenceTree(root, 'o/r', 'shots/test', files).sha, result.sha)
  assert.throws(() => createEvidenceTree(root, 'o/r', 'main', files), /shots/)
  assert.throws(
    () => createEvidenceTree(root, 'o/r', 'shots/test', [{ ...files[0], name: 'before.png\r' }]),
    /名称/
  )
  assert.throws(() => createEvidenceTree(root, 'another/repo', 'shots/test', files), /origin/)
})

test('published and rendered images require HTTP success, real image response and matching content', async () => {
  const images = commentImageUrls(
    '<img alt="before" src="https://github.com/o/r/raw/sha/before.png?a=1&amp;b=2">'
  )
  assert.equal(images[0].url, 'https://github.com/o/r/raw/sha/before.png?a=1&b=2')
  const response =
    (body, type, status = 200) =>
    async () =>
      new Response(body, { status, headers: { 'content-type': type } })
  assert.equal((await checkImages(images, response(png, 'image/png')))[0].type, 'image/png')
  await assert.rejects(checkImages(images, response('missing', 'text/plain', 404)), /404/)
  await assert.rejects(checkImages(images, response('<html>login</html>', 'text/html')), /图片/)
  await assert.rejects(checkImages(images, response(png, 'text/html')), /类型/)
  await assert.rejects(
    checkImages([{ ...images[0], sha256: 'wrong' }], response(png, 'image/png')),
    /内容/
  )
  await assert.rejects(checkImages([], response(png, 'image/png')), /没有/)
})

test('build reuse requires matching source including new files and matching complete output', (t) => {
  const dev = developmentEnv({
    ORCA_DEV_USER_DATA_PATH: 'persistent-profile',
    REMOTE_DEBUGGING_PORT: '9337',
    ORCA_ELECTRON_VITE_TARGET: 'renderer'
  })
  assert.equal(dev.ORCA_DEV_USER_DATA_PATH, 'persistent-profile')
  assert.equal(dev.REMOTE_DEBUGGING_PORT, '9337')
  assert.equal(dev.ORCA_ELECTRON_VITE_TARGET, undefined)
  const env = verificationEnv({ ORCA_ELECTRON_VITE_TARGET: 'renderer', ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(env.ORCA_ELECTRON_VITE_TARGET, undefined)
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(env.VITE_EXPOSE_STORE, 'true')
  const root = repository(t)
  mkdirSync(path.join(root, 'src'))
  writeFileSync(path.join(root, 'src/new.ts'), 'before')
  const before = sourceFingerprint(root)
  writeFileSync(path.join(root, 'src/new.ts'), 'after')
  const source = sourceFingerprint(root)
  assert.notEqual(before, source)
  assert.equal(outputFingerprint(root), null)
  for (const file of ['out/main/index.js', 'out/preload/index.js', 'out/renderer/index.html']) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), 'built')
  }
  const output = outputFingerprint(root)
  assert.equal(canReuseBuild({ source, output }, source, output), true)
  assert.equal(canReuseBuild({ source: before, output }, source, output), false)
  writeFileSync(path.join(root, 'out/main/index.js'), 'other build')
  assert.equal(canReuseBuild({ source, output }, source, outputFingerprint(root)), false)
})
