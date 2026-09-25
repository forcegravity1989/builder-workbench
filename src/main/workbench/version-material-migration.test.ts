import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { createVersionDocumentStore } from './version-document-store'
import { createVersionMaterialMigration } from './version-material-migration'
import { PlanningMaterialSchema } from '../../shared/workbench/version-material'
import { importLegacyAcceptanceResults } from '../../shared/workbench/version-material-migration'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'bw-migration-'))
  roots.push(root)
  const directory = join(root, '.bw/planning/v2')
  await mkdir(directory, { recursive: true })
  const file = join(directory, 'data.json')
  const legacy = {
    schema_version: 2,
    version: 'v2',
    previous_version: { version: 'v1' },
    plan: {
      goals: [{ id: 'one', title: 'next', metric: 'users', target: '6', baseline: '1' }],
      tasks: []
    },
    summary: { progress: 'previous release', risks: '' },
    results: {
      goals: [{ id: 'old', title: 'original promise', reading: '4', status: { tone: 'success' } }],
      deliverables: []
    },
    confirmation: { results: { actor: 'user' } },
    unexpectedButValuable: 'retained'
  }
  const original = JSON.stringify(legacy)
  await writeFile(file, original)
  const store = createVersionDocumentStore({
    trustedWorkspacePath: root,
    workflow: 'plan',
    decode: (value) => PlanningMaterialSchema.parse(value)
  })
  const service = createVersionMaterialMigration(async () => store)
  const scope = {
    repoId: 'repo',
    worktreeId: 'tree',
    hostId: 'local',
    workflow: 'plan' as const,
    version: 'v2',
    cycleId: 'new-cycle'
  }
  return { file, directory, original, store, service, scope }
}

it('previews without writing, preserves exact original bytes, and imports only undecided prior-version results', async () => {
  const { file, directory, original, store, service, scope } = await fixture()
  const preview = await service.previewMigration(scope)
  expect(await readdir(directory)).toEqual(['data.json'])
  expect(preview.plan.summary.progress).toContain('v1')
  expect(preview.plan.goals[0].metricTargets).toEqual([])
  const migrated = await service.migrate({ ...scope, expectedRevision: preview.sourceRevision })
  expect(await readFile(join(directory, preview.backupName), 'utf8')).toBe(original)
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(preview.plan)
  expect(await store.read(scope.version)).toEqual(migrated.snapshot)
  expect(
    await service.previewMigration({ ...scope, sourceRevision: preview.sourceRevision })
  ).toEqual(preview)
  const plan = {
    schema_version: 3 as const,
    version: 'v1',
    cycleId: 'old-plan',
    summary: { progress: '', risks: '' },
    goals: [{ goalId: 'old', title: 'original promise', metricTargets: [] }],
    tasks: []
  }
  const draft = importLegacyAcceptanceResults(
    preview,
    plan,
    {
      kind: 'committed',
      version: 'v1',
      cycleId: 'old-plan',
      sourceCommit: 'a'.repeat(40),
      revision: `sha256:${'b'.repeat(64)}`
    },
    'acceptance-cycle'
  )
  expect(draft.version).toBe('v1')
  expect(draft.results[0].readings).toEqual([])
  expect(draft.results[0].decision).toBeUndefined()
  expect(draft.results[0].note).toContain(preview.sourceRevision)
})

it('refuses a changed legacy source without replacing it or creating a backup', async () => {
  const { file, directory, service, scope } = await fixture()
  const preview = await service.previewMigration(scope)
  const changed = JSON.stringify({
    schema_version: 2,
    version: 'v2',
    plan: { goals: [] },
    newer: true
  })
  await writeFile(file, changed)
  await expect(
    service.migrate({ ...scope, expectedRevision: preview.sourceRevision })
  ).rejects.toMatchObject({ code: 'revision-conflict' })
  expect(await readFile(file, 'utf8')).toBe(changed)
  expect(await readdir(directory)).toEqual(['data.json'])
})
