import type { ArchivePrStatusResult } from '../../../shared/workbench/archive-pr-status'
import { archiveStateLabel } from '../../../shared/workbench/archive-state-label'
import type { VersionMaterial } from '../../../shared/workbench/version-material'

type Workflow = NonNullable<VersionMaterial['workflow']>

type MaterialReading =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; document: { workflow?: Workflow }; source: 'draft' | 'committed' }

const stageLabels = {
  preparation: '准备已完成',
  goals: '目标已明确',
  breakdown: '拆解已完成',
  review: '评审已确认',
  showcase: '演示已完成',
  archive: '已进入归档'
} satisfies Record<Workflow['stage'], string>

export type VersionWorkflowProgress = ReturnType<typeof versionWorkflowProgress>

export function versionWorkflowProgress(
  material: MaterialReading,
  archiveStatus: ArchivePrStatusResult | null
) {
  if (material.kind !== 'ready') {
    switch (material.kind) {
      case 'loading':
        return { label: '读取中' }
      case 'missing':
        return { label: '未开始' }
      case 'error':
        return { label: '状态未知', reason: material.message }
    }
  }
  const workflow = material.document.workflow
  const reference = workflow?.archivePr
  const prLabel = reference?.provider === 'codehub' ? 'MR' : 'PR'
  return {
    label: workflow
      ? stageLabels[workflow.stage]
      : material.source === 'draft'
        ? '草稿'
        : '阶段未记录',
    archive: reference
      ? {
          label: `${prLabel} ${archiveStatus ? archiveStateLabel(archiveStatus) : '读取中'}`,
          reference,
          status: archiveStatus
        }
      : undefined
  }
}
