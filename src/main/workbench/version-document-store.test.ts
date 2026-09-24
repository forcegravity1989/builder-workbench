import { fork, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVersionDocumentStore } from './version-document-store'
import type { VersionDocumentIdentity } from '../../shared/workbench/version-document'

type FixtureDocument = VersionDocumentIdentity & { title: string }

function decode(value: unknown): FixtureDocument {
  const document = value as FixtureDocument
  if (!document || typeof document.title !== 'string') {
    throw new Error('title must be a string')
  }
  return document
}

const document = (title: string): FixtureDocument => ({
  schema_version: 3,
  version: 'v0.5',
  cycleId: 'cycle-1',
  title
})

describe('version document transactions', () => {
  let directory: string
  let workspace: string
  const children: ChildProcess[] = []

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'bw-version-store-'))
    workspace = join(directory, 'workspace')
    await mkdir(workspace)
  })

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
        child.kill()
        await exited
      }
    }
    await rm(directory, { recursive: true, force: true })
  })

  function store(workflow: 'plan' | 'acceptance' = 'plan') {
    return createVersionDocumentStore({ trustedWorkspacePath: workspace, workflow, decode })
  }

  it('reads without creating files and independently restores plan and acceptance after reopening', async () => {
    expect(await store().read('v0.5')).toBeNull()
    expect(await readdir(workspace)).toEqual([])
    const plan = await store().save({
      version: 'v0.5',
      expectedRevision: null,
      document: document('计划')
    })
    const acceptance = await store('acceptance').save({
      version: 'v0.5',
      expectedRevision: null,
      document: document('验收')
    })
    expect(await store().read('v0.5')).toEqual(plan)
    expect(await store('acceptance').read('v0.5')).toEqual(acceptance)
    expect(
      JSON.parse(await readFile(join(workspace, '.bw/planning/v0.5/data.json'), 'utf8'))
    ).toEqual(plan.document)
    expect(
      JSON.parse(await readFile(join(workspace, '.bw/planning/v0.5/acceptance.json'), 'utf8'))
    ).toEqual(acceptance.document)
    await expect(
      store().save({ version: 'v0.5', expectedRevision: null, document: document('误新建') })
    ).rejects.toMatchObject({ code: 'revision-conflict', currentRevision: plan.revision })
  })

  it('allows only one of two real processes to replace the same revision and preserves the winner', async () => {
    const initial = await store().save({
      version: 'v0.5',
      expectedRevision: null,
      document: document('原稿')
    })
    const worker = join(directory, 'writer.cjs')
    await build({
      stdin: {
        contents: `import { createVersionDocumentStore } from ${JSON.stringify(resolve('src/main/workbench/version-document-store.ts'))};
          process.on('message', async ({root, revision, title}) => {
            const store = createVersionDocumentStore({trustedWorkspacePath: root, workflow: 'plan', decode: value => value});
            try {
              const snapshot = await store.save({version: 'v0.5', expectedRevision: revision,
                document: {schema_version: 3, version: 'v0.5', cycleId: 'cycle-1', title}});
              process.send({kind: 'saved', snapshot});
            } catch (error) { process.send({kind: 'error', code: error.code, currentRevision: error.currentRevision}); }
            process.disconnect();
          });
          process.send({kind: 'ready'});`,
        resolveDir: process.cwd()
      },
      outfile: worker,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent'
    })
    type Outcome = {
      kind: string
      code?: string
      currentRevision?: string
      snapshot?: { revision: string; document: FixtureDocument }
    }
    const writers = await Promise.all(
      ['UI 修改', '模型修改'].map(async (title) => {
        const child = fork(worker, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], execArgv: [] })
        children.push(child)
        let stderr = ''
        child.stderr?.on('data', (data) => {
          stderr += data
        })
        const ready = new Promise<void>((resolve, reject) => {
          child.once('error', reject)
          child.once('message', (message) => {
            if ((message as Outcome).kind === 'ready') {
              resolve()
            } else {
              reject(new Error('writer did not become ready'))
            }
          })
          child.once('exit', (code) => {
            if (code !== 0) {
              reject(new Error(stderr || `writer exited ${code}`))
            }
          })
        })
        await ready
        const outcome = new Promise<Outcome>((resolve, reject) => {
          child.once('error', reject)
          child.once('message', (message) => resolve(message as Outcome))
          child.once('exit', (code) => {
            if (code !== 0) {
              reject(new Error(stderr || `writer exited ${code}`))
            }
          })
        })
        return { child, title, outcome }
      })
    )
    for (const writer of writers) {
      writer.child.send({ root: workspace, revision: initial.revision, title: writer.title })
    }
    const outcomes = await Promise.all(writers.map((writer) => writer.outcome))
    expect(outcomes.filter((result) => result.kind === 'saved')).toHaveLength(1)
    const winner = outcomes.find((result) => result.kind === 'saved')!.snapshot!
    expect(outcomes.find((result) => result.kind === 'error')).toMatchObject({
      code: 'revision-conflict',
      currentRevision: winner.revision
    })
    expect(await store().read('v0.5')).toEqual(winner)
    expect((await readdir(join(workspace, '.bw/planning/v0.5'))).sort()).toEqual(['data.json'])
  })

  it('keeps legacy and broken files intact instead of migrating, resetting or overwriting them', async () => {
    const parent = join(workspace, '.bw/planning/v0.5')
    await mkdir(parent, { recursive: true })
    const file = join(parent, 'data.json')
    for (const [raw, code] of [
      [
        JSON.stringify({ schema_version: 2, version: 'v0.5', confirmation: { plan: true } }),
        'migration-required'
      ],
      ['{broken', 'invalid-document'],
      [JSON.stringify({ ...document('wrong version'), version: 'v0.6' }), 'invalid-document']
    ]) {
      await writeFile(file, raw)
      await expect(store().read('v0.5')).rejects.toMatchObject({ code })
      await expect(
        store().save({ version: 'v0.5', expectedRevision: null, document: document('new') })
      ).rejects.toMatchObject({ code })
      expect(await readFile(file, 'utf8')).toBe(raw)
    }
    await expect(
      store().save({
        version: 'v0.5',
        expectedRevision: null,
        document: { ...document('bad'), title: 123 } as unknown as FixtureDocument
      })
    ).rejects.toMatchObject({ code: 'invalid-document' })
  })

  it('rejects unselected versions, path traversal and Windows aliases without touching the workspace', async () => {
    for (const version of [
      '',
      '../escape',
      'v/a',
      'v\\a',
      '.local',
      'template',
      'CON.txt',
      'v0.5.',
      'v0.5 ',
      'v:ads'
    ]) {
      await expect(store().read(version)).rejects.toMatchObject({ code: 'invalid-version' })
      await expect(
        store().save({ version, expectedRevision: null, document: { ...document('bad'), version } })
      ).rejects.toMatchObject({ code: 'invalid-version' })
    }
    expect(await readdir(workspace)).toEqual([])
  })

  it('refuses a symlink or Windows junction inside the material path', async () => {
    const outside = join(directory, 'outside')
    await mkdir(outside)
    await symlink(
      outside,
      join(workspace, '.bw'),
      process.platform === 'win32' ? 'junction' : 'dir'
    )
    await expect(store().read('v0.5')).rejects.toMatchObject({ code: 'unsafe-path' })
    await expect(
      store().save({ version: 'v0.5', expectedRevision: null, document: document('bad') })
    ).rejects.toMatchObject({ code: 'unsafe-path' })
    expect(await readdir(outside)).toEqual([])
  })
})
