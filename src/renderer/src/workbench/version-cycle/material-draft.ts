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
  /** One-line receipt for a silent field-ownership merge; cleared on next edit/save. */
  notice?: string
}

/** Only UI recovery data; the host material transaction remains the authoritative writer. */
export class MaterialDraftController<T extends VersionDocumentIdentity> {
  private generation = 0
  private selection = 0
  private refreshRequest = 0
  private saving = false
  /** 最近一次干净文档（读入/保存/远端采纳），冲突合并的 diff 基线。脏草稿恢复
      （restore 带 dirty）时为 null：分不清哪些字段是人改的，不允许自动合并。 */
  private base: T | null = null
  value: MaterialDraft<T> | null = null
  constructor(
    private port: VersionDocumentPort<T>,
    private publish: (value: MaterialDraft<T> | null) => void,
    // 可选的字段归属合并策略（验收屏传入，见 acceptance-merge.ts）：冲突时
    // 静默合并、只留一行提示；不传（计划屏）维持人工核对提示流。
    private merge?: (base: T, local: T, remote: T) => T
  ) {}
  private update(value: MaterialDraft<T>) {
    this.value = value
    this.publish(value)
  }
  restore(value: MaterialDraft<T>) {
    this.selection++
    this.generation++
    this.refreshRequest++
    this.base = value.dirty ? null : value.document
    this.update(value)
  }
  clear() {
    this.selection++
    this.generation++
    this.refreshRequest++
    this.base = null
    this.value = null
    this.publish(null)
  }
  edit(document: T) {
    if (!this.value || document.version !== this.value.document.version) {
      throw new Error('请先明确版本')
    }
    this.generation++
    this.update({ ...this.value, document, dirty: true, notice: undefined })
  }
  refresh() {
    return this.refreshFromPort(false)
  }
  private async refreshFromPort(insideSave: boolean) {
    if (!this.value || (this.saving && !insideSave)) {
      return
    }
    const original = this.value
    const request = ++this.refreshRequest
    const remote = await this.port.read(original.document.version)
    if (this.value !== original || request !== this.refreshRequest) {
      return
    }
    if (this.value.dirty) {
      if ((remote?.revision ?? null) !== this.value.expectedRevision) {
        if (this.merge && this.base && remote) {
          // 静默合并（验收屏 2026-10-23 拍板）：人与模型字段由 human-guard 保证
          // 不重叠，合并后保持 dirty 交给自动保存落盘，不再要求人工核对。
          this.update({
            document: this.merge(this.base, this.value.document, remote.document),
            expectedRevision: remote.revision,
            dirty: true,
            notice: '远端材料已更新，你的输入已合并'
          })
        } else {
          this.update({
            ...this.value,
            remote,
            error: '材料已在其他会话修改，本地输入已保留。请核对两个版本。'
          })
        }
      } else if (this.value.remote !== undefined) {
        this.update({ ...this.value, remote: undefined, error: undefined })
      }
    } else if (remote) {
      // A poll that reads back the same revision must not republish a freshly
      // parsed copy: consumers compare document identity (report dialog,
      // decision freshness) to mean "unchanged", and identity churn on every
      // 5s poll closed the preview dialog and rehashed evidence for nothing.
      if (
        remote.revision === this.value.expectedRevision &&
        this.value.remote === undefined &&
        this.value.error === undefined
      ) {
        return
      }
      this.base = remote.document
      this.update({ document: remote.document, expectedRevision: remote.revision, dirty: false })
    } else {
      this.update({ ...this.value, error: '材料不存在，保留当前内容；未创建替代文件。' })
    }
  }
  async save(): Promise<boolean> {
    if (!this.value || this.saving) {
      return false
    }
    const value = this.value
    const generation = this.generation
    const selection = this.selection
    this.refreshRequest++
    this.saving = true
    try {
      const saved = await this.port.save({
        version: value.document.version,
        document: value.document,
        expectedRevision: value.expectedRevision
      })
      if (selection !== this.selection) {
        return true
      }
      this.base = saved.document
      this.update(
        this.generation === generation
          ? { document: saved.document, expectedRevision: saved.revision, dirty: false }
          : {
              ...this.value,
              expectedRevision: saved.revision,
              dirty: true,
              error: undefined,
              remote: undefined,
              notice: undefined
            }
      )
      return true
    } catch (error) {
      if (selection === this.selection) {
        this.update({
          ...this.value,
          error: error instanceof Error ? error.message : '保存失败，输入已保留'
        })
        if ((error as { code?: string }).code === 'revision-conflict') {
          await this.refreshFromPort(true).catch(() => undefined)
        }
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
