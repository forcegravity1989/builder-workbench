/**
 * BW composer 自动化注册：「AI 创建自动化」入口背后的那条禁用态自动化。
 *
 * 与周期自动化（ensure-cycle-automation）同模式：身份是 creationKey
 * （`bw-composer:<项目+仓库+宿主>`，不含 workflow——composer 是项目级入口），
 * 提示词是 BW 所有字段，每次进屏覆盖同步为当前 BW 版本；人所有字段永不触碰。
 * 差别在用途：它永远默认关闭、调度只是 schema 占位，只被「AI 创建自动化」
 * 手动 runNow——用户的描述作为 oneShotPrompt 一次性随行。启用对它没有意义，
 * 人若误启用，跑的也只是 composer 会话本身，不碰任何定时语义。
 */

import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import composerSkill from '../../../../../skills/automation-composer/SKILL.md?raw'
import type { Automation, AutomationCreateInput } from '../../../../shared/automations-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
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
import { buildAutomationRunContextForRepo } from '@/components/automations/automation-run-context'
import type { CycleScope } from './ports'
import { cycleAutomationHost } from './use-cycle-automation-draft'
import { cycleAutomationOwner, destinationFor, pinnedAuthority } from './ensure-cycle-automation'

const COMPOSER_AUTOMATION_NAME = 'AI 创建自动化（BW）'

export function composerAutomationCreationKey(scope: CycleScope): string {
  return `bw-composer:${JSON.stringify([
    scope.projectId,
    scope.repoId,
    scope.hostId,
    scope.runtimeOwnerEnvironmentId ?? ''
  ])}`
}

export type EnsureComposerAutomationResult =
  | { status: 'exists'; automationId: string; syncError?: string }
  | { status: 'created'; automationId: string }
  | { status: 'skipped'; reason: string }

// 同一身份并发只发一次创建；后到者共享在途结果（同 ensure-cycle-automation）。
const creating = new Map<string, Promise<EnsureComposerAutomationResult>>()

export async function ensureComposerAutomation(
  scope: CycleScope,
  fixedId: string,
  agent: TuiAgent | null
): Promise<EnsureComposerAutomationResult> {
  const creationKey = composerAutomationCreationKey(scope)
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
): Promise<EnsureComposerAutomationResult> {
  const host = cycleAutomationHost(scope)
  const authority = pinnedAuthority(host)
  if (!authority) {
    return {
      status: 'skipped',
      reason: '宿主登记未就绪（缺运行时配对版本或 SSH 注册代次），未注册 AI 创建自动化入口。'
    }
  }
  const existing = await listAutomationsForTarget(getAutomationAuthorityTarget(authority))
  const found = existing.find((item: Automation) => item.creationKey === creationKey)
  if (found) {
    // 提示词是 BW 所有字段（composer Skill 随 BW 演进），进屏覆盖同步；
    // 人所有字段（开关、时间、模型、会话复用）永不触碰。
    if (found.prompt === composerSkill) {
      return { status: 'exists', automationId: found.id }
    }
    try {
      await updateAutomationForOwner(cycleAutomationOwner(scope), found.id, {
        prompt: composerSkill
      })
      return { status: 'exists', automationId: found.id }
    } catch (reason) {
      // 同步失败不阻断：已有条目仍可手动运行，如实提示让人核对。
      return {
        status: 'exists',
        automationId: found.id,
        syncError: reason instanceof Error ? reason.message : String(reason)
      }
    }
  }
  if (!agent) {
    return { status: 'skipped', reason: '未检测到可用会话工具，未注册 AI 创建自动化入口。' }
  }
  const state = useAppStore.getState()
  const runContext = buildAutomationRunContextForRepo({
    repoId: scope.repoId,
    repos: state.repos,
    projectHostSetups: state.projectHostSetups
  })
  if (!runContext) {
    return { status: 'skipped', reason: '宿主 setup 未就绪，未注册 AI 创建自动化入口。' }
  }
  const destination = destinationFor(host)
  if (!destination) {
    return {
      status: 'skipped',
      reason: '宿主登记未就绪（缺 SSH 注册代次），未注册 AI 创建自动化入口。'
    }
  }
  // 占位调度：存储 schema 要求非空 rrule；enabled:false 禁用定时，composer 只被手动 runNow。
  const rrule = buildAutomationRrule({ preset: 'daily', hour: 9, minute: 0 })
  const now = Date.now()
  const input: AutomationCreateInput = {
    creationKey,
    name: COMPOSER_AUTOMATION_NAME,
    prompt: composerSkill,
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
  }
  const created = await createAutomationForDestination(authority, input, destination)
  return { status: 'created', automationId: created.id }
}

/**
 * 壳层接线：固定树就绪后按身份注册 composer 入口，已有条目覆盖同步 BW 所有的
 * 提示词；返回条目 id 供「AI 创建自动化」按钮启动会话。跳过与失败都非致命，
 * 只经 onNotice 诚实提示。
 */
export function useEnsureComposerAutomation({
  cycleScope,
  fixedId,
  agent,
  onNotice
}: {
  cycleScope: CycleScope | null
  fixedId: string | null
  agent: TuiAgent | null
  onNotice(message: string): void
}): { automationId: string | null } {
  const [registered, setRegistered] = useState<{ key: string; id: string } | null>(null)
  const scopeKey =
    cycleScope && fixedId ? `${composerAutomationCreationKey(cycleScope)}:${fixedId}` : null
  useEffect(() => {
    if (!cycleScope || !fixedId || !scopeKey) {
      return
    }
    if (!agent) {
      // 工具检测未完成时先不注册；agent 就绪后本 effect 重跑再试（未标记尝试）。
      return
    }
    let active = true
    void (async () => {
      try {
        const result = await ensureComposerAutomation(cycleScope, fixedId, agent)
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
            '已注册 AI 创建自动化入口（默认关闭，不会定时触发）：在计划屏点「AI 创建自动化」，用一句话让 AI 帮你配置定时任务。'
          )
        }
        if (result.status === 'exists' && result.syncError) {
          onNotice(`同步 AI 创建自动化提示词失败：${result.syncError}`)
        }
      } catch (reason) {
        // 注册失败不打断本页：计划与看板照常，人仍可在自动化页手工创建任务。
        if (active) {
          onNotice(
            `注册 AI 创建自动化入口失败：${reason instanceof Error ? reason.message : String(reason)}`
          )
        }
      }
    })()
    return () => {
      active = false
    }
  }, [scopeKey, cycleScope, fixedId, agent, onNotice])
  return { automationId: registered?.key === scopeKey ? registered.id : null }
}
