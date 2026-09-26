import { describe, expect, it } from 'vitest'
import { MaterialDraftController } from './material-draft'

const base = { schema_version: 3 as const, version: 'v1', cycleId: 'one', title: 'initial' }
describe('material draft concurrency', () => {
  it('keeps an unsaved new document editable while no file exists', async () => {
    let remote: { document: typeof base; revision: string } | null = null
    const controller = new MaterialDraftController<typeof base>(
      {
        read: async () => remote,
        save: async (input) => ({ document: input.document, revision: 'saved' })
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: null, dirty: true })
    await controller.refresh()
    expect(controller.value?.remote).toBeUndefined()
    expect(controller.value?.error).toBeUndefined()
    remote = { document: { ...base, title: 'another writer' }, revision: 'other' }
    await controller.refresh()
    expect(controller.value?.remote?.document.title).toBe('another writer')
    remote = null
    await controller.refresh()
    expect(controller.value).toMatchObject({ document: base, expectedRevision: null, dirty: true })
    expect(controller.value?.remote).toBeUndefined()
    expect(controller.value?.error).toBeUndefined()
  })
  it('reports deletion of an existing document without treating it as new', async () => {
    const controller = new MaterialDraftController<typeof base>(
      {
        read: async () => null,
        save: async (input) => ({ document: input.document, revision: 'saved' })
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'existing', dirty: true })
    await controller.refresh()
    expect(controller.value?.remote).toBeNull()
    expect(controller.value?.expectedRevision).toBe('existing')
    expect(controller.value?.error).toBeTruthy()
  })
  it('invalidates reads even when a cached object is restored again', async () => {
    let finish!: (value: { document: typeof base; revision: string }) => void
    const controller = new MaterialDraftController<typeof base>(
      {
        read: () =>
          new Promise((resolve) => {
            finish = resolve
          }),
        save: async (input) => ({ document: input.document, revision: 'saved' })
      },
      () => {}
    )
    const cached = { document: base, expectedRevision: 'old', dirty: false }
    controller.restore(cached)
    const refresh = controller.refresh()
    controller.restore({ ...cached, document: { ...base, cycleId: 'two' } })
    controller.restore(cached)
    finish({ document: { ...base, cycleId: 'two' }, revision: 'wrong-cycle' })
    await refresh
    expect(controller.value).toBe(cached)
  })
  it('holds the save lock until conflict readback finishes', async () => {
    let finish!: (value: { document: typeof base; revision: string }) => void
    let saves = 0
    const controller = new MaterialDraftController<typeof base>(
      {
        read: () =>
          new Promise((resolve) => {
            finish = resolve
          }),
        save: async () => {
          saves++
          throw Object.assign(new Error('conflict'), { code: 'revision-conflict' })
        }
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'old', dirty: true })
    const first = controller.save()
    await Promise.resolve()
    expect(await controller.save()).toBe(false)
    finish({ document: base, revision: 'remote' })
    await first
    expect(saves).toBe(1)
  })
  it('clears selection without letting an in-flight read restore it', async () => {
    let finish!: (value: { document: typeof base; revision: string }) => void
    const controller = new MaterialDraftController<typeof base>(
      {
        read: () =>
          new Promise((resolve) => {
            finish = resolve
          }),
        save: async (input) => ({ document: input.document, revision: 'saved' })
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'old', dirty: false })
    const refresh = controller.refresh()
    controller.clear()
    finish({ document: base, revision: 'old' })
    await refresh
    expect(controller.value).toBeNull()
  })
  it('ignores an old refresh after a newer edit has been saved', async () => {
    let finishRead!: (value: { document: typeof base; revision: string }) => void
    const controller = new MaterialDraftController<typeof base>(
      {
        read: () =>
          new Promise((resolve) => {
            finishRead = resolve
          }),
        save: async (input) => ({ document: input.document, revision: 'saved' })
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'old', dirty: false })
    const refresh = controller.refresh()
    controller.edit({ ...base, title: 'new text' })
    await controller.save()
    finishRead({ document: base, revision: 'old' })
    await refresh
    expect(controller.value).toMatchObject({
      document: { title: 'new text' },
      expectedRevision: 'saved',
      dirty: false
    })
  })
  it('does not apply save completion to a reselected version', async () => {
    let finish!: (value: { document: typeof base; revision: string }) => void
    const controller = new MaterialDraftController<typeof base>(
      {
        read: async () => null,
        save: () =>
          new Promise((resolve) => {
            finish = resolve
          })
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'old', dirty: true })
    const save = controller.save()
    controller.restore({
      document: { ...base, version: 'v2' },
      expectedRevision: 'two',
      dirty: false
    })
    controller.restore({
      document: { ...base, title: 'reselected' },
      expectedRevision: 'new',
      dirty: true
    })
    finish({ document: base, revision: 'saved' })
    await save
    expect(controller.value).toMatchObject({
      document: { title: 'reselected' },
      expectedRevision: 'new',
      dirty: true
    })
  })
  it('keeps edits made during save dirty against the returned revision', async () => {
    let finish!: (value: { document: typeof base; revision: string }) => void
    const controller = new MaterialDraftController<typeof base>(
      {
        read: async () => null,
        save: () =>
          new Promise((resolve) => {
            finish = resolve
          })
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'old', dirty: true })
    const save = controller.save()
    controller.edit({ ...base, title: 'newer typing' })
    finish({ document: base, revision: 'saved' })
    await save
    expect(controller.value).toMatchObject({
      document: { title: 'newer typing' },
      expectedRevision: 'saved',
      dirty: true
    })
  })
  it('retains both versions on conflict and does not retry overwriting remote', async () => {
    let saves = 0
    const remote = { document: { ...base, title: 'from model' }, revision: 'remote' }
    const controller = new MaterialDraftController(
      {
        read: async () => remote,
        save: async () => {
          saves++
          throw Object.assign(new Error('conflict'), { code: 'revision-conflict' })
        }
      },
      () => {}
    )
    controller.restore({ document: base, expectedRevision: 'old', dirty: true })
    expect(await controller.save()).toBe(false)
    expect(controller.value).toMatchObject({ document: base, expectedRevision: 'old', remote })
    expect(saves).toBe(1)
  })
})
