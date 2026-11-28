import { notifyWorkbenchError } from '../error-feedback'
/**
 * 周期自动化进屏核对：不自动新建。
 *
 * 身份是 creationKey（旧无绑定固定树 `bw-cycle:<scopeKey>:<workflow>`；绑定流程树
 * `bw-cycle:<scopeKey>:<workflow>:<version>`）。同固定树上的旧名字只用于认出早于
 * creationKey 的条目。找到后只覆盖同步 BW 所有的提示词；人所有的字段（启用、时间、
 * 模型、会话复用）不触碰。没有条目就停，由人从「配置自动化」预填创建。
 * 四铁律：定时任务由人启用后才到点，BW 不代启，也不按版本补登记。
 */

import { useEffect } from 'react'
import { useAppStore } from '@/store'
import {
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId
} from '../../../../shared/execution-host/execution-host'
import type { Automation } from '../../../../shared/automations/automation-definition'
import type {
  AutomationAuthorityRef,
  AutomationOwnerRef,
  StableAutomationHostRef
} from '../../../../shared/automations/ownership/automation-owner-ref'
import type { AutomationDestination } from '../../../../shared/automations/ownership/automation-owner-precondition'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import {
  getAutomationAuthorityTarget,
  listAutomationsForTarget
} from '@/components/automations/hosts/automation-host-client'
import { updateAutomationForOwner } from '@/components/automations/hosts/automation-scoped-list-client'
import { automationRuntimePairingRevision } from '@/components/automations/hosts/automation-authority-identity'
import type { CycleScope } from './ports'
import { cycleScopeKey } from './native-cycle-workspace'
import { buildCyclePrompt } from './cycle-prompt'

/** Automation ownership follows the worktree's native host identity, never the current focus. */
export function cycleAutomationHost(scope: CycleScope): StableAutomationHostRef {
  if (scope.runtimeOwnerEnvironmentId) {
    return {
      authority: { kind: 'runtime', environmentId: scope.runtimeOwnerEnvironmentId },
      selector: { kind: 'self' }
    }
  }
  const host = parseExecutionHostId(scope.hostId)
  if (host?.kind === 'ssh') {
    return { authority: { kind: 'desktop' }, selector: { kind: 'ssh', targetId: host.targetId } }
  }
  return { authority: { kind: 'desktop' }, selector: { kind: 'self' } }
}

/** 首项是此前自动登记用的名字；其余是更早的预填名字。进屏只用来认出已有条目。 */
const AUTOMATION_NAMES: Record<VersionWorkflow, readonly string[]> = {
  plan: ['每周版本计划（BW）', '每周版本计划'],
  acceptance: ['每周版本验收（BW）', '每周版本验收']
}

/** G2（P5）：绑定树的条目名版本在前（沿版本材料命名约定），旧条目名仅参与同树去重。 */
function automationNames(workflow: VersionWorkflow, version: string | null): readonly string[] {
  const base = AUTOMATION_NAMES[workflow]
  return version ? [`${version} ${base[0]}`, ...base] : base
}

export function cycleAutomationCreationKey(scope: CycleScope, version?: string | null): string {
  // 绑定树的身份含版本，用来认出该版已有条目；旧无绑定树沿旧 key。
  const ownerScope = ownerSpelledCycleScope(scope)
  return version
    ? `bw-cycle:${cycleScopeKey(ownerScope)}:${ownerScope.workflow}:${version}`
    : `bw-cycle:${cycleScopeKey(ownerScope)}:${ownerScope.workflow}`
}

// Why: 同一逻辑条目的 creationKey 身份必须在 owner 与访客观察方之间一致——访客经
// runtime:<env> 拼写观察 owner 的配对树时，键会按观察方拼写分叉，findExisting 的
// byKey 永不互认，人工改名后走回退 create 在归属宿主产生第二条同树同版条目。键的
// 宿主维度统一取 owner 侧拼写（local），路由仍由 authority 单独决定、不受影响。
function ownerSpelledCycleScope(scope: CycleScope): CycleScope {
  return parseExecutionHostId(scope.hostId)?.kind === 'runtime'
    ? { ...scope, hostId: LOCAL_EXECUTION_HOST_ID, runtimeOwnerEnvironmentId: undefined }
    : scope
}

export type EnsureCycleAutomationResult =
  | { status: 'exists'; automationId: string; syncError?: string }
  | { status: 'absent' }
  | { status: 'skipped'; reason: string }

/**
 * creationKey 优先；回退匹配「同固定树上的同名条目」，覆盖早于本特性经预填手工
 * 创建、没有 creationKey 的自动化。限定 fixedId 防误认其他项目/工作树的同名条目。
 */
function findExisting(
  automations: readonly Automation[],
  creationKey: string,
  names: readonly string[],
  fixedId: string
): Automation | null {
  const byKey = automations.find((item) => item.creationKey === creationKey)
  if (byKey) {
    return byKey
  }
  return (
    automations.find((item) => names.includes(item.name) && item.workspaceId === fixedId) ?? null
  )
}

/** 请求必须钉住当前化身：镜像列表查不到的运行时宁可 skipped，不向未知修订发请求。 */
function pinnedAuthority(host: StableAutomationHostRef): AutomationAuthorityRef | null {
  if (host.authority.kind === 'desktop') {
    return { kind: 'desktop' }
  }
  const pairingRevision = automationRuntimePairingRevision(
    useAppStore.getState().runtimeEnvironments,
    host.authority.environmentId
  )
  return pairingRevision === -1
    ? null
    : { kind: 'runtime', environmentId: host.authority.environmentId, pairingRevision }
}

function destinationFor(host: StableAutomationHostRef): AutomationDestination | null {
  if (host.selector.kind === 'self') {
    return { selector: { kind: 'self' } }
  }
  const targetGeneration = useAppStore.getState().sshTargetGenerations.get(host.selector.targetId)
  return targetGeneration === undefined
    ? null
    : { selector: { kind: 'ssh', targetId: host.selector.targetId, targetGeneration } }
}

export function cycleAutomationOwner(scope: CycleScope): AutomationOwnerRef {
  const host = cycleAutomationHost(scope)
  const authority = pinnedAuthority(host)
  const destination = destinationFor(host)
  if (!authority || !destination) {
    throw new Error('自动化宿主登记未就绪，请在自动化页核对连接。')
  }
  return { authority, selector: destination.selector }
}

// 进屏和手动配置可以共享同一工作区的在途核对。
const pendingChecks = new Map<string, Promise<EnsureCycleAutomationResult>>()

export async function ensureCycleAutomation(
  scope: CycleScope,
  fixedId: string,
  version?: string | null
): Promise<EnsureCycleAutomationResult> {
  const creationKey = cycleAutomationCreationKey(scope, version)
  const pendingKey = JSON.stringify([
    creationKey,
    scope.hostId,
    scope.runtimeOwnerEnvironmentId,
    fixedId
  ])
  const pending = pendingChecks.get(pendingKey)
  if (pending) {
    return await pending
  }
  const task = runEnsure(scope, fixedId, creationKey, version ?? null)
  pendingChecks.set(pendingKey, task)
  try {
    return await task
  } finally {
    pendingChecks.delete(pendingKey)
  }
}

async function runEnsure(
  scope: CycleScope,
  fixedId: string,
  creationKey: string,
  version: string | null
): Promise<EnsureCycleAutomationResult> {
  const host = cycleAutomationHost(scope)
  const names = automationNames(scope.workflow, version)
  const authority = pinnedAuthority(host)
  if (!authority) {
    return {
      status: 'skipped',
      reason: '宿主登记未就绪（缺运行时配对版本或 SSH 注册代次），未核对周期自动化。'
    }
  }
  // 列表目标按工作树的宿主身份取（getAutomationAuthorityTarget），不随当前焦点环境。
  const existing = findExisting(
    await listAutomationsForTarget(getAutomationAuthorityTarget(authority)),
    creationKey,
    names,
    fixedId
  )
  if (existing) {
    // BW 持续演进：提示词是 BW 所有字段，每次进屏覆盖同步为当前版本；
    // 人所有字段（启用开关、触发时间、模型、会话复用）永不触碰。
    try {
      const prompt = await buildCyclePrompt(scope, fixedId)
      if (existing.prompt !== prompt) {
        await updateAutomationForOwner(cycleAutomationOwner(scope), existing.id, { prompt })
      }
      return { status: 'exists', automationId: existing.id }
    } catch (reason) {
      // 同步失败不阻断：已有条目仍可手动运行，如实提示让人核对。
      return {
        status: 'exists',
        automationId: existing.id,
        syncError: reason instanceof Error ? reason.message : String(reason)
      }
    }
  }
  return { status: 'absent' }
}

export function useEnsureCycleAutomation({
  cycleScope,
  fixedId,
  onNotice,
  version = null
}: {
  cycleScope: CycleScope | null
  fixedId: string | null
  onNotice(message: string): void
  /** 绑定树的版本，只进入身份与命名；提示词由 resolveWorkbenchPromptAssets 按树绑定自检。 */
  version?: string | null
}): void {
  useEffect(() => {
    if (!cycleScope || !fixedId) {
      return
    }
    let active = true
    void (async () => {
      try {
        const result = await ensureCycleAutomation(cycleScope, fixedId, version)
        if (!active) {
          return
        }
        if (result.status === 'skipped') {
          onNotice(result.reason)
          return
        }
        if (result.status === 'exists' && result.syncError) {
          notifyWorkbenchError('周期自动化未更新', result.syncError, '可从配置自动化入口重试。')
        }
      } catch (reason) {
        if (active) {
          notifyWorkbenchError('周期自动化未核对', reason, '可从配置自动化入口重试。')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [cycleScope, fixedId, onNotice, version])
}
