import { deliverMaintenanceResult } from './maintenance-result'
import { randomUUID } from 'node:crypto'
import type { WorkerShowResult } from '../orchestration/workers/worker-view-results'
import type { BotItemShowView } from './bot-items-format'
import { authorized, discover, findExistingWork, type Issue } from './maintenance-issues'
import type { OrchestrationMutationRequestShowResult } from '../../shared/orchestration/orchestration-mutation-request'
import { RuntimeClientError } from '../runtime/connection/types'
import { isRequestUnsent } from '../runtime/connection/client-error-recovery'
import type { RuntimeRepoList } from '../../shared/worktree/catalog/runtime-worktree-contracts'
import { getRequiredStringFlag } from '../arguments/flags'
import { callerChat } from '../automations/automation-caller-chat'
import type { CommandHandler } from '../dispatch/dispatch'
import { isDevCliInvocation } from '../orchestration/recovery/runtime-compatibility'
import type { WorkerStartAgentReceipt } from '../orchestration/workers/worker-start-agent-view'
import { findBot, type BotsListResult } from './bot'
import type { BotItemListView, BotItemWriteView } from './bot-items-format'
import { withMaintenanceQueue } from './maintenance-queue'

function dispatchFromReceipt(receipt: unknown): string | undefined {
  if (!receipt || typeof receipt !== 'object') {
    return undefined
  }
  if ('dispatchId' in receipt && typeof receipt.dispatchId === 'string') {
    return receipt.dispatchId
  }
  return 'accepted' in receipt ? dispatchFromReceipt(receipt.accepted) : undefined
}

const tick: CommandHandler = async (ctx) => {
  const caller = callerChat()
  if (!caller.callerSessionId || ctx.flags.has('environment')) {
    throw new Error('请在执行机上从 Monica Fix 的对话运行。')
  }
  const repoId = getRequiredStringFlag(ctx.flags, 'repo')
  const { repos } = (await ctx.client.call<RuntimeRepoList>('repo.list', {})).result
  const repo = repos.find((entry) => entry.id === repoId)
  if (!repo || repo.connectionId || (repo.executionHostId && repo.executionHostId !== 'local')) {
    throw new Error('请从执行机上选择该机已登记的项目 ID。')
  }
  const call = async <T>(method: string, args: Record<string, unknown>) =>
    (await ctx.client.call<T>(method, args)).result
  const { botId } = await call<BotItemListView>('bots.items.list', { ...caller, limit: 1 })
  const bot = await findBot(ctx.client, botId)
  if (bot.templateId !== 'bw-maintenance' || bot.paused) {
    throw new Error('当前 Bot 未启用维护模板。')
  }
  const { issues: discovered, source } = await discover(ctx, repoId)
  const outcome = await withMaintenanceQueue(
    source,
    bot.id,
    async () => (await call<BotsListResult>('bots.list', {})).bots.map((entry) => entry.id),
    async (queue, save) => {
      const eligible = new Set(discovered.map((issue) => issue.url))
      queue.waiting = queue.waiting.filter((issue) => eligible.has(issue.url))
      const known = new Set([
        ...queue.handled,
        queue.active?.url,
        ...queue.waiting.map((issue) => issue.url)
      ])
      queue.waiting.push(...discovered.filter((issue) => !known.has(issue.url)))
      await save()
      const reports = []
      for (const pending of queue.reports) {
        try {
          const landed = await deliverMaintenanceResult(ctx, repoId, caller, pending)
          if (landed) {
            reports.push({ issue: pending.url, pr: landed })
            queue.reports = queue.reports.filter((entry) => entry.url !== pending.url)
            await save()
          }
        } catch (error) {
          reports.push({ issue: pending.url, status: 'PR 回报待重试', reason: String(error) })
        }
      }
      if (!queue.active && queue.handled.length && discovered.length) {
        const handled = new Set(queue.handled)
        for (const issue of discovered.filter((entry) => handled.has(entry.url))) {
          const { items } = await call<BotItemListView>('bots.items.list', {
            ...caller,
            all: true,
            link: issue.url
          })
          const item = items.find(
            (entry) => entry.status === 'needs_you' || entry.status === 'working'
          )
          const dispatch = item?.links.find((link) => link.kind === 'dispatch')
          if (!item || dispatch?.kind !== 'dispatch') {
            continue
          }
          const id = dispatch.latest ?? dispatch.ref
          const show = await call<WorkerShowResult>('orchestration.workerShow', { dispatch: id })
          if (show.projection?.outcome === 'in_progress') {
            queue.active = { ...issue, item: item.number, dispatchId: id }
            queue.handled = queue.handled.filter((url) => url !== issue.url)
            await save()
            break
          }
        }
      }
      if (queue.active) {
        const active = queue.active
        const itemParams = { ...caller, item: String(active.item) }
        const { item } = await call<BotItemShowView>('bots.items.show', itemParams)
        const receipt =
          !active.dispatchId && active.request
            ? await call<OrchestrationMutationRequestShowResult>('orchestration.requestShow', {
                request: active.request
              })
            : undefined
        const expected = active.dispatchId ?? dispatchFromReceipt(receipt?.receipt)
        const worker = item.links.find(
          (link) =>
            link.kind === 'dispatch' &&
            (expected
              ? link.ref === expected || link.latest === expected
              : link.title === active.url)
        )
        if (!worker || worker.kind !== 'dispatch') {
          const dispatch = expected
          if (dispatch) {
            await call('bots.items.link', { ...itemParams, refs: [`dispatch:${dispatch}`] })
            active.dispatchId = dispatch
            await save()
          }
          if (!dispatch && receipt?.state === 'absent' && item.status !== 'needs_you') {
            await call('bots.items.set', {
              ...itemParams,
              status: 'needs_you',
              comment:
                '原派发没有可核实的回执。请检查宿主工作树和 worker，找到后关联到本事项，定时检查会继续。'
            })
          }
          return {
            status: '正在核对原派发',
            active,
            receipt: receipt?.state,
            waiting: queue.waiting,
            reports
          }
        }
        const dispatch = worker.latest ?? worker.ref
        if (!['completed', 'failed', 'stopped'].includes(worker.state)) {
          return {
            status: '正在处理',
            issue: active.url,
            worker,
            question: item.question,
            waiting: queue.waiting,
            reports
          }
        }
        const show = await call<WorkerShowResult>('orchestration.workerShow', { dispatch })
        const outcome = show.projection?.outcome
        if (outcome !== 'succeeded' && outcome !== 'failed') {
          return {
            status: '原 worker 尚未确认结束，若已中断请从 BW 恢复',
            issue: active.url,
            worker,
            outcome,
            waiting: queue.waiting,
            reports
          }
        }
        active.dispatchId = dispatch
        if (outcome === 'succeeded' || worker.pr?.shown) {
          queue.reports.push(active)
        }
        queue.handled.push(active.url)
        delete queue.active
        await save()
        return {
          status: 'worker 已结束',
          issue: active.url,
          worker,
          waiting: queue.waiting,
          reports
        }
      }
      const next = queue.waiting[0]
      if (!next) {
        return { status: '队列为空', reports }
      }
      const { existingTree, existingPR } = await findExistingWork(ctx, repoId, next)
      const itemList = await call<BotItemListView>('bots.items.list', {
        ...caller,
        all: true,
        link: next.url
      })
      const item =
        itemList.items[0] ??
        (
          await call<BotItemWriteView>('bots.items.add', {
            ...caller,
            title: `修复 #${next.number}`,
            links: [next.url],
            description: next.url,
            doneMeans: '修复 PR 回到此对话'
          })
        ).item
      if (existingTree || existingPR) {
        const note = existingPR?.url ?? existingTree?.path
        await call('bots.items.set', {
          ...caller,
          item: String(item.number),
          status: 'needs_you',
          comment: `已有关联工作，请核对后接续：${note}`
        })
        queue.waiting.shift()
        queue.handled.push(next.url)
        await save()
        return {
          status: '已有工作',
          issue: next.url,
          workspace: existingTree?.path,
          pr: existingPR?.url,
          reports
        }
      }
      const fresh = await call<Issue | null>('github.workItem', {
        repo: repoId,
        type: 'issue',
        number: next.number
      })
      if (!authorized(fresh) || fresh.url !== next.url) {
        return { status: '待核对派工标签', issue: next.url }
      }
      queue.waiting.shift()
      const active = { ...next, item: item.number, request: randomUUID() }
      queue.active = active
      await save()
      let receipt: WorkerStartAgentReceipt
      try {
        receipt = (
          await ctx.client.call<WorkerStartAgentReceipt>(
            'orchestration.workerStart',
            {
              repo: repoId,
              worktree: 'new-child',
              origin: `bot-item:${item.number}`,
              agent: bot.agent,
              taskTitle: next.url,
              devMode: isDevCliInvocation(),
              spec: `拉取最新代码，按项目 workbench-start 处理 Issue ${
                next.url
              }。关联此 Issue 到当前 worker 工作树，开 PR 后在最终报告给出完整 PR 链接。先查已有工作；如有维护者在修，回报现有进展。关联 PR，向原 Bot 回报。保留 Issue 供人关闭。${
                ctx.flags.has('skip-ci') ? ' 本次不要运行 CI，提交使用 [skip ci]。' : ''
              }`
            },
            { orchestrationRequestId: active.request }
          )
        ).result
      } catch (error) {
        if (
          isRequestUnsent(error) ||
          (error instanceof RuntimeClientError &&
            error.data &&
            typeof error.data === 'object' &&
            'effectsApplied' in error.data &&
            error.data.effectsApplied === false)
        ) {
          delete queue.active
          queue.waiting.unshift(next)
          await save()
        }
        throw error
      }
      queue.active.dispatchId = receipt.dispatchId
      await save()
      return {
        status: receipt.state,
        issue: next.url,
        dispatchId: receipt.dispatchId,
        waiting: queue.waiting,
        reports
      }
    }
  )
  console.log(JSON.stringify(outcome))
}

export const MAINTENANCE_HANDLERS: Record<string, CommandHandler> = { 'bot maintenance tick': tick }
