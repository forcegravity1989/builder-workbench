import type { AcceptanceMaterial, VersionMaterial } from '../../shared/workbench/version-material'
import type {
  VersionMaterialRead,
  VersionMaterialSave
} from '../../shared/workbench/version-material-request'
import { WorkspaceScopeError } from './workspace-scope-error'

/** Caller identity as seen by the RPC dispatcher; never taken from the request payload. */
export type MaterialSaveCaller = {
  clientKind?: 'mobile' | 'runtime'
}

/**
 * Channel boundary for human-only conclusion fields (decision/preparationReview).
 * Desktop IPC and paired device sockets arrive with an authenticated clientKind;
 * the local Unix-socket CLI — the channel in-session models execute — arrives
 * without one. A human typing `bw materials save` by hand is refused too:
 * conclusions are recorded in the acceptance UI, the CLI channel round-trips them unchanged.
 */
export function isModelSaveChannel(caller: MaterialSaveCaller): boolean {
  return caller.clientKind === undefined
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/** Names the human-only fields the incoming document would add, change or drop. */
export function humanFieldChanges(
  current: AcceptanceMaterial | null,
  incoming: AcceptanceMaterial
): string[] {
  const changes: string[] = []
  if (json(current?.preparationReview) !== json(incoming.preparationReview)) {
    changes.push('preparationReview')
  }
  const currentByGoal = new Map(
    (current?.results ?? []).map((item) => [item.goalId, item.decision])
  )
  const incomingByGoal = new Map(incoming.results.map((item) => [item.goalId, item.decision]))
  for (const goalId of new Set([...currentByGoal.keys(), ...incomingByGoal.keys()])) {
    if (json(currentByGoal.get(goalId)) !== json(incomingByGoal.get(goalId))) {
      changes.push(`results[${goalId}].decision`)
    }
  }
  return changes
}

/**
 * Save-channel guard: model-channel saves must not touch human conclusions, but must
 * stay able to round-trip them unchanged. The authoritative check runs here on the
 * owning runtime; the CLI client cannot be trusted to enforce it.
 */
export async function assertHumanFieldsUntouched(
  read: (input: VersionMaterialRead) => Promise<{ document: VersionMaterial } | null>,
  params: VersionMaterialSave,
  caller: MaterialSaveCaller
): Promise<void> {
  if (params.workflow !== 'acceptance' || !isModelSaveChannel(caller)) {
    return
  }
  // The acceptance-workflow store decodes with AcceptanceMaterialSchema, so the stored
  // document for this scope is acceptance material.
  const current = ((await read(params))?.document ?? null) as AcceptanceMaterial | null
  const changes = humanFieldChanges(current, params.document)
  if (changes.length > 0) {
    throw new WorkspaceScopeError(
      'forbidden',
      `人工结论字段不能经 CLI 通道写入或修改（${changes.join('、')}）；请在验收界面由人记录，其余字段可照常保存`
    )
  }
}
