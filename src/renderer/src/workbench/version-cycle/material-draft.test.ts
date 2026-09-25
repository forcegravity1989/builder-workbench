import { describe, expect, it } from 'vitest'
import { MaterialDraftController } from './material-draft'

const base = { schema_version: 3 as const, version: 'v1', cycleId: 'one', title: 'initial' }
describe('material draft concurrency', () => {
  it('keeps edits made during save dirty against the returned revision', async () => {
    let finish!: (value: { document: typeof base; revision: string }) => void
    const controller = new MaterialDraftController(
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
