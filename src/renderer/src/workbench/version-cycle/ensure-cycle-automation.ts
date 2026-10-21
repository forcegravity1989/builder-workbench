/**
 * BW 周期自动化注册：每个 workflow 恰有一条 BW 标识的自动化，默认关闭。
 *
 * 身份是 creationKey（`bw-cycle:<scopeKey>:<workflow>`）。字段按归属分治：
 * BW 所有的提示词每次进屏覆盖同步为当前 BW 版本（BW 持续演进，定时与手动
 * 跑的必须始终是新版提示）；人所有的字段（启用、时间、模型、会话复用）注册
 * 后永不触碰。四铁律：定时任务真实到点触发，且由人启用后才到点，BW 不代启。
 */

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import type { Automation, AutomationCreateInput } from '../../../../shared/automations-types'
import type {
  AutomationAuthorityRef,
  AutomationOwnerRef,
  StableAutomationHostRef
} from '../../../../shared/automation-owner-ref'
import type { AutomationDestination } from '../../../../shared/automation-owner-precondition'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { VersionWorkflow } from '../../../../shared/workbench/version-document'
import {
  buildAutomationRrule,
  nextAutomationOccurrenceAfter
} from '../../../../shared/automation-schedule-occurrences'
import {
  getAutomationAuthorityTarget,
  listAutomationsForTarget
} from '@/components/automations/automation-host-client'
import {
  createAutomationForDestination,
  updateAutomationForOwner
} from '@/components/automations/automation-scoped-list-client'
import { automationRuntimePairingRevision } from '@/components/automations/automation-authority-identity'
import { buildAutomationRunContextForRepo } from '@/components/automations/automation-run-context'
import type { CycleScope } from './ports'
import { cycleScopeKey } from './native-cycle-workspace'
import { buildCyclePrompt } from './cycle-prompt'
import { cycleAutomationHost } from './use-cycle-automation-draft'

/** 首项是 BW 现在创建用的名字；其余是本特性之前预填路径用过的名字，仅参与去重。 */
const AUTOMATION_NAMES: Record<VersionWorkflow, readonly string[]> = {
  plan: ['每周版本计划（BW）', '每周版本计划'],
  acceptance: ['每周版本验收（BW）', '每周版本验收']
}

/** 本地周频节奏：计划周一 09:00、验收周五 16:00；改时间由人在原生编辑器确认。 */
const SCHEDULES: Record<VersionWorkflow, { dayOfWeek: number; hour: number; minute: number }> = {
  plan: { dayOfWeek: 1, hour: 9, minute: 0 },
  acceptance: { dayOfWeek: 5, hour: 16, minute: 0 }
}

export function cycleAutomationCreationKey(scope: CycleScope): string {
  return `bw-cycle:${cycleScopeKey(scope)}:${scope.workflow}`
}

export type EnsureCycleAutomationResult =
  | { status: 'exists'; automationId: string; syncError?: string }
  | { status: 'created'; automationId: string }
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

// 同一身份并发只发一次创建；后到者共享在途结果（仿 native-workspace.ts）。
const creating = new Map<string, Promise<EnsureCycleAutomationResult>>()

export async function ensureCycleAutomation(
  scope: CycleScope,
  fixedId: string,
  agent: TuiAgent | null
): Promise<EnsureCycleAutomationResult> {
  const creationKey = cycleAutomationCreationKey(scope)
  const pending = creating.get(creationKey)
  if (pending) {
    return await pending
  }
  const task = runEnsure(scope, fixedId, agent, creationKey)
  creating.set(creationKey, task)
  try {
    return await task
  } finally {
    creating.delete(creationKey)
  }
}

async function runEnsure(
  scope: CycleScope,
  fixedId: string,
  agent: TuiAgent | null,
  creationKey: string
): Promise<EnsureCycleAutomationResult> {
  const host = cycleAutomationHost(scope)
  const names = AUTOMATION_NAMES[scope.workflow]
  const authority = pinnedAuthority(host)
  if (!authority) {
    return {
      status: 'skipped',
      reason: '宿主登记未就绪（缺运行时配对版本或 SSH 注册代次），未注册周期自动化。'
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
    const prompt = await buildCyclePrompt(scope, fixedId)
    if (existing.prompt === prompt) {
      return { status: 'exists', automationId: existing.id }
    }
    try {
      await updateAutomationForOwner(cycleAutomationOwner(scope), existing.id, { prompt })
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
  if (!agent) {
    return { status: 'skipped', reason: '未检测到可用会话工具，未注册周期自动化。' }
  }
  const state = useAppStore.getState()
  const runContext = buildAutomationRunContextForRepo({
    repoId: scope.repoId,
    repos: state.repos,
    projectHostSetups: state.projectHostSetups
  })
  if (!runContext) {
    return { status: 'skipped', reason: '宿主 setup 未就绪，未注册周期自动化。' }
  }
  const destination = destinationFor(host)
  if (!destination) {
    return { status: 'skipped', reason: '宿主登记未就绪（缺 SSH 注册代次），未注册周期自动化。' }
  }
  const rrule = buildAutomationRrule({ preset: 'weekly', ...SCHEDULES[scope.workflow] })
  const now = Date.now()
  const input: AutomationCreateInput = {
    creationKey,
    name: names[0],
    prompt: await buildCyclePrompt(scope, fixedId),
    precheck: null,
    agentId: agent,
    runContext,
    // 遗留 repo 字段与 runContext 成对：机器选择器由它推导（id:<repoId>）。
    projectId: scope.repoId,
    workspaceMode: 'existing',
    workspaceId: fixedId,
    baseBranch: null,
    reuseSession: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    rrule,
    dtstart: nextAutomationOccurrenceAfter(rrule, now, now),
    missedRunGraceMinutes: 720,
    enabled: false
    // sourceContext 在 automation-params.ts 的 schema 与 AutomationCreateInput 类型上
    // 均可选可空（TaskSourceContext.optional().nullable()），周期自动化没有任务源，不传。
  }
  const created = await createAutomationForDestination(authority, input, destination)
  return { status: 'created', automationId: created.id }
}

/**
 * 壳层接线：固定树就绪后按身份注册，已有条目覆盖同步 BW 所有的提示词；
 * 返回已存在/新建条目的 id 与身份键，供「配置自动化」按钮决定编辑还是预填。
 * 跳过与失败都非致命，只经 onNotice 诚实提示。
 */
export function useEnsureCycleAutomation({
  cycleScope,
  fixedId,
  workflow,
  agent,
  onNotice,
  skip = null
}: {
  cycleScope: CycleScope | null
  fixedId: string | null
  workflow: VersionWorkflow
  agent: TuiAgent | null
  onNotice(message: string): void
  /**
   * G2 (P3a)：版本绑定树跳过旧身份自动化注册——creationKey 尚无版本维度
   * （P5 接入），复用旧 key 会把条目错挂到旧版树；跳过时如实不注册、
   * 由调用方给出诚实提示，不假报就绪。
   */
  skip?: string | null
}): { automationId: string | null; creationKey: string | null } {
  const [registered, setRegistered] = useState<{ key: string; id: string } | null>(null)
  const scopeKey = cycleScope && fixedId ? `${cycleScopeKey(cycleScope)}:${fixedId}` : null
  useEffect(() => {
    if (skip || !cycleScope || !fixedId || !scopeKey) {
      return
    }
    if (!agent) {
      // 工具检测未完成时先不注册；agent 就绪后本 effect 重跑再试（未标记尝试）。
      return
    }
    let active = true
    void (async () => {
      try {
        const result = await ensureCycleAutomation(cycleScope, fixedId, agent)
        if (!active) {
          return
        }
        if (result.status === 'skipped') {
          onNotice(result.reason)
          return
        }
        setRegistered({ key: scopeKey, id: result.automationId })
        if (result.status === 'created') {
          onNotice(
            workflow === 'plan'
              ? '已注册每周版本计划自动化（默认关闭）：在自动化页启用后，每周一 09:00 触发。'
              : '已注册每周版本验收自动化（默认关闭）：在自动化页启用后，每周五 16:00 触发。'
          )
        }
        if (result.status === 'exists' && result.syncError) {
          onNotice(`同步周期自动化提示词失败：${result.syncError}`)
        }
      } catch (reason) {
        // 注册失败不打断本页：会话与看板照常，「配置自动化」仍可手工预填创建。
        if (active) {
          onNotice(
            `注册周期自动化失败：${reason instanceof Error ? reason.message : String(reason)}`
          )
        }
      }
    })()
    return () => {
      active = false
    }
  }, [scopeKey, cycleScope, fixedId, workflow, agent, onNotice, skip])
  return {
    automationId: registered?.key === scopeKey ? registered.id : null,
    creationKey: cycleScope && !skip ? cycleAutomationCreationKey(cycleScope) : null
  }
}
