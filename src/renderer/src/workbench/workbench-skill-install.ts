import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { WorkbenchSkillTopic } from '../../../shared/workbench/skill-assets'
import { ownerSpelledHostId } from './version-binding-port'
import {
  nativeWorkspaceRuntimeTarget,
  type NativeWorkspaceScope
} from './version-cycle/native-workspace'

const pending = new Map<string, Promise<string>>()

export function installWorkbenchSkill(
  scope: NativeWorkspaceScope,
  worktreeId: string,
  topic: WorkbenchSkillTopic
): Promise<string> {
  const key = JSON.stringify([scope, worktreeId, topic])
  const existing = pending.get(key)
  if (existing) {
    return existing
  }
  const operation = callRuntimeRpc<{ skillPath: string }>(
    nativeWorkspaceRuntimeTarget(scope),
    'workbench.skills.prepare',
    {
      repoId: scope.repoId,
      worktreeId,
      hostId: ownerSpelledHostId(scope.hostId),
      topic
    },
    { timeoutMs: 120_000 }
  )
    .then((result) => result.skillPath)
    .finally(() => pending.delete(key))
  pending.set(key, operation)
  return operation
}
