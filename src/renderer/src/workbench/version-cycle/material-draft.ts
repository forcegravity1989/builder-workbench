import type {
  VersionDocumentIdentity,
  VersionDocumentPort,
  VersionDocumentSnapshot
} from '../../../../shared/workbench/version-document'

export type MaterialDraft<T> = {
  document: T
  expectedRevision: string | null
  dirty: boolean
  remote?: { document: T; revision: string } | null
  error?: string
}

/** Only UI recovery data; the host material transaction remains the authoritative writer. */
export class MaterialDraftController<T extends VersionDocumentIdentity> {
  private generation = 0
  private saving = false
  value: MaterialDraft<T> | null = null
  constructor(
    private port: VersionDocumentPort<T>,
    private publish: (value: MaterialDraft<T>) => void
  ) {}
  private update(value: MaterialDraft<T>) {
    this.value = value
    this.publish(value)
  }
  restore(value: MaterialDraft<T>) {
    this.generation++
    this.update(value)
  }
  edit(document: T) {
    if (!this.value || document.version !== this.value.document.version)
      throw new Error('请先明确版本')
    this.generation++
    this.update({ ...this.value, document, dirty: true })
  }
  async refresh() {
    if (!this.value) return
    const original = this.value
    const remote = await this.port.read(original.document.version)
    if (!this.value || this.value.document.version !== original.document.version) return
    if (this.value.dirty) {
      if (remote?.revision !== this.value.expectedRevision)
        this.update({
          ...this.value,
          remote,
          error: '材料已在其他会话修改，本地输入已保留。请核对两个版本。'
        })
    } else if (remote)
      this.update({ document: remote.document, expectedRevision: remote.revision, dirty: false })
    else this.update({ ...this.value, error: '材料不存在，保留当前内容；未创建替代文件。' })
  }
  async save(): Promise<boolean> {
    if (!this.value || this.saving) return false
    const value = this.value
    const generation = this.generation
    this.saving = true
    try {
      const saved = await this.port.save({
        version: value.document.version,
        document: value.document,
        expectedRevision: value.expectedRevision
      })
      if (this.value?.document.version !== value.document.version) return true
      this.update(
        this.generation === generation
          ? { document: saved.document, expectedRevision: saved.revision, dirty: false }
          : {
              ...this.value,
              expectedRevision: saved.revision,
              dirty: true,
              error: undefined,
              remote: undefined
            }
      )
      return true
    } catch (error) {
      if (this.value?.document.version === value.document.version) {
        this.update({
          ...this.value,
          error: error instanceof Error ? error.message : '保存失败，输入已保留'
        })
        if ((error as { code?: string }).code === 'revision-conflict')
          await this.refresh().catch(() => undefined)
      }
      return false
    } finally {
      this.saving = false
    }
  }
  useRemote(remote: VersionDocumentSnapshot<T>) {
    this.restore({ document: remote.document, expectedRevision: remote.revision, dirty: false })
  }
  useMerged(document: T, revision: string) {
    this.restore({ document, expectedRevision: revision, dirty: true })
  }
}
