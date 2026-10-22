import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type VersionMaterial
} from '../../shared/workbench/version-material'
import type {
  VersionMaterialRead,
  VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { WorkspaceScopeError } from './workspace-scope-error'
import { acceptanceHumanFieldChanges } from './acceptance-human-guard'
import { planHumanFieldChanges } from './plan-human-guard'

/** Caller identity as seen by the RPC dispatcher; never taken from the request payload. */
export type MaterialSaveCaller = {
  clientKind?: 'mobile' | 'runtime'
}

/**
 * Channel boundary for human-only material fields: acceptance verdicts, Issue
 * notes and carry marks, preparation review and meeting-minutes confirmation,
 * plus the planning risk report and its minutes confirmation and closure marks.
 * Desktop IPC and paired device sockets arrive with an authenticated clientKind;
 * the local Unix-socket CLI — the channel in-session models execute — arrives
 * without one. A human typing `bw materials save` by hand is refused too: these
 * fields are recorded in the BW UI, the CLI channel round-trips them unchanged.
 */
export function isModelSaveChannel(caller: MaterialSaveCaller): boolean {
  return caller.clientKind === undefined
}

/**
 * Save-channel guard: model-channel saves must not touch human conclusions, but
 * must stay able to round-trip them unchanged. The authoritative check runs here
 * on the owning runtime; the CLI client cannot be trusted to enforce it.
 */
export async function assertHumanFieldsUntouched(
  read: (input: VersionMaterialRead) => Promise<{ document: VersionMaterial } | null>,
  params: VersionMaterialSave,
  caller: MaterialSaveCaller
): Promise<void> {
  if (!isModelSaveChannel(caller)) {
    return
  }
  // The read schema is strict; save-only fields cannot enter the read scope.
  const { expectedRevision: _expectedRevision, document: _document, ...readInput } = params
  const stored = (await read(readInput))?.document
  if (params.workflow === 'plan') {
    const current = stored ? PlanningMaterialSchema.parse(stored) : null
    const changes = planHumanFieldChanges(current, PlanningMaterialSchema.parse(params.document))
    if (changes.length > 0) {
      throw new WorkspaceScopeError(
        'forbidden',
        `计划人工字段不符合保存规则（${changes.join('、')}）：风险上报由用户在计划界面填写；会议纪要的人工确认与遗留闭环由人标记，确认后整节冻结，模型通道只能在未确认时撰写纪要正文或原样往返`
      )
    }
    return
  }
  if (params.workflow !== 'acceptance') {
    return
  }
  const current = stored ? AcceptanceMaterialSchema.parse(stored) : null
  const incoming = AcceptanceMaterialSchema.parse(params.document)
  const changes = acceptanceHumanFieldChanges(current, incoming)
  if (changes.length > 0) {
    throw new WorkspaceScopeError(
      'forbidden',
      `验收人工字段不符合保存规则（${changes.join('、')}）：目标达成/不达成、Issue 备注与遗留标记、纪要的人工确认都由人在界面记录，模型通道只能在纪要未确认时撰写正文或原样往返`
    )
  }
}
