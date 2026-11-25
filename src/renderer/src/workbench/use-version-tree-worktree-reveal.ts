import { useEffect, useLayoutEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  isElementRevealedInScrollContainer,
  revealElementInScrollContainer
} from '@/components/sidebar/worktree-sidebar-reveal'
import { REVEAL_SCROLL_SETTLE_TIMEOUT_MS } from '@/components/sidebar/worktree-sidebar-reveal-scroll-settle'
import { useSidebarRevealHighlight } from '@/components/sidebar/worktree-list/navigation/use-reveal-highlight'
import { MAX_REVEAL_RETRIES } from '@/components/sidebar/worktree-list/navigation/pending-reveal-inputs'
import { getWorktreeLineageGroupKey } from '@/components/sidebar/worktree-list/grouping/group-keys'
import { getWorktreeLineageAncestors } from '@/components/sidebar/worktree-lineage-projection'
import { useAfterPinnedScroll } from '@/components/sidebar/worktree-list/viewport/after-pinned-scroll-context'
import type { Worktree } from '../../../shared/worktree/types'
import type { WorktreeLineage } from '../../../shared/worktree/lineage-types'
import { getWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { normalizeStoredWorkbenchVersionBinding } from '../../../shared/workbench/version-binding'
import {
  consumeVersionTreeWorktreeReveal,
  useVersionTreeWorktreeRevealRequest
} from './version-sidebar-state'

export type VersionTreeWorktreeRevealArgs = {
  repoId: string
  worktrees: readonly Worktree[]
  versions: readonly string[]
  materialReady: boolean
  hasSourceProblems: boolean
  planOrderPending: boolean
  expandedVersions: ReadonlySet<string>
  expandVersion: (version: string) => void
  expandSection: () => void
}

/**
 * #762 消费端：把「显示活动工作区」的版本树请求落到真实 DOM——逐层展开
 * （版本节 → 版本组 → 更多版本 → 流程/目标行 → lineage），再沿原生
 * revealElementInScrollContainer 滚动并闪光。重试与闪光复用原生原语；
 * 展开回调走 ref，避免展开本身触发的重渲染重启重试循环。
 */
export function useVersionTreeWorktreeReveal(args: VersionTreeWorktreeRevealArgs): {
  highlightedRevealRowKey: string | null
  forceReveal: { version: string; sequence: number } | null
} {
  const request = useVersionTreeWorktreeRevealRequest()
  const reveal = useSidebarRevealHighlight()
  const scrollApi = useAfterPinnedScroll()
  const scrollApiRef = useRef(scrollApi)
  const argsRef = useRef(args)
  useLayoutEffect(() => {
    scrollApiRef.current = scrollApi
    argsRef.current = args
  })
  const retryRef = useRef<{ sequence: number; count: number } | null>(null)

  const { flashRevealedRow, schedulePendingRevealFrame, cancelPendingRevealFrames } = reveal

  useEffect(() => {
    if (!request || request.repoId !== args.repoId) {
      return
    }
    // 目录未就绪时保留请求（与 focusRequest 同口径），就绪后自动续跑。
    if (args.planOrderPending || (!args.materialReady && !args.hasSourceProblems)) {
      return
    }
    const target = args.worktrees.find(
      (tree) => getWorktreeHostIdentity(tree) === request.worktreeIdentity
    )
    const binding = target
      ? normalizeStoredWorkbenchVersionBinding(target.workbenchVersionBinding)
      : null
    if (
      !target ||
      target.isArchived ||
      !binding ||
      binding.version !== request.version ||
      !args.versions.includes(request.version)
    ) {
      // 目标已离开版本树（删除/归档/绑定变更）：与原生落空口径一致，提示后清除。
      retryRef.current = null
      consumeVersionTreeWorktreeReveal(request.sequence)
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeList.sidebarRowMissing',
          'Target no longer exists'
        )
      )
      return
    }

    const latest = argsRef.current
    latest.expandSection()
    if (!latest.expandedVersions.has(request.version)) {
      latest.expandVersion(request.version)
    }
    // lineage 折叠沿共享 store；宿主过滤与原生 expandGroupsForWorktreeReveal 同口径。
    const state = useAppStore.getState()
    const hostWorktreeMap = new Map<string, Worktree>()
    const hostLineageById: Record<string, WorktreeLineage> = {}
    for (const tree of args.worktrees) {
      if (target.hostId && tree.hostId && tree.hostId !== target.hostId) {
        continue
      }
      hostWorktreeMap.set(tree.id, tree)
      const projected = state.worktreeLineageById[tree.id]
      const inline = (tree as Worktree & { lineage?: WorktreeLineage | null }).lineage
      const lineage = projected?.worktreeInstanceId === tree.instanceId ? projected : inline
      if (lineage) {
        hostLineageById[tree.id] = lineage
      }
    }
    for (const parent of getWorktreeLineageAncestors(target, hostLineageById, hostWorktreeMap)) {
      const groupKey = getWorktreeLineageGroupKey(parent)
      if (state.collapsedGroups.has(groupKey)) {
        state.toggleCollapsedGroup(groupKey)
      }
    }

    let cancelled = false
    const queryRow = (): HTMLElement | null =>
      document.querySelector<HTMLElement>(
        `[data-workbench-version-section] [data-worktree-host-identity="${CSS.escape(request.worktreeIdentity)}"]`
      )
    const finish = (): void => {
      const rowKey = queryRow()?.dataset.worktreeRowKey
      if (rowKey) {
        flashRevealedRow(rowKey)
      }
      retryRef.current = null
      consumeVersionTreeWorktreeReveal(request.sequence)
    }
    // Why: 滚动命令被接受不等于行已落在视口。版本节整体收起后重挂载，内容行较高时
    // remount 测量会触发原生虚拟化列表的测量滚动校正（resizeItem→applyScrollAdjustment），
    // 该校正不受 reveal-settle 守卫抑制，可在 smooth 滚动落地后抢写 scrollTop、把目标行
    // 推出视口。故落地后复核行确在视口；若被抢走，待滚动停稳即瞬时重发并重新置守卫，
    // 直到行稳定留在视口（沿原生 settle 超时兜底），不在滚动命令被接受时即消费请求。
    const verifyRevealLanded = (): void => {
      const startedAt = window.performance.now()
      let prevScrollTop: number | null = null
      const verify = (): void => {
        if (cancelled) {
          return
        }
        const row = queryRow()
        const api = scrollApiRef.current
        const container = api?.scrollRef.current ?? null
        if (!row || !container) {
          schedulePendingRevealFrame(attempt)
          return
        }
        if (isElementRevealedInScrollContainer(container, row)) {
          finish()
          return
        }
        if (window.performance.now() - startedAt > REVEAL_SCROLL_SETTLE_TIMEOUT_MS) {
          finish()
          return
        }
        const top = container.scrollTop
        const settled = prevScrollTop !== null && Math.abs(top - prevScrollTop) < 1
        prevScrollTop = top
        if (!settled) {
          // smooth 滚动仍在动画中：等其停稳，避免重发打断动画。
          schedulePendingRevealFrame(verify)
          return
        }
        revealElementInScrollContainer(container, row, 'auto', api?.markRevealScroll)
        prevScrollTop = null
        schedulePendingRevealFrame(verify)
      }
      schedulePendingRevealFrame(verify)
    }
    const attempt = (): void => {
      if (cancelled) {
        return
      }
      const row = queryRow()
      const api = scrollApiRef.current
      const container = api?.scrollRef.current ?? null
      if (row && container) {
        if (revealElementInScrollContainer(container, row, 'smooth', api?.markRevealScroll)) {
          verifyRevealLanded()
          return
        }
      } else if (row) {
        // 过滤空态：版本树挂在独立滚动容器里，全量挂载、无虚拟化。
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        finish()
        return
      }
      // 行尚未挂载（版本节被虚拟出窗口，或展开还在渲染）：先把内容行带进窗口再重试。
      api?.scrollContentRowIntoView()
      const previous = retryRef.current
      const count = previous?.sequence === request.sequence ? previous.count + 1 : 1
      retryRef.current = { sequence: request.sequence, count }
      if (count <= MAX_REVEAL_RETRIES) {
        schedulePendingRevealFrame(attempt)
        return
      }
      retryRef.current = null
      consumeVersionTreeWorktreeReveal(request.sequence)
      toast.error(
        translate(
          'auto.components.sidebar.WorktreeList.sidebarRowMissing',
          'Target no longer exists'
        )
      )
    }
    schedulePendingRevealFrame(attempt)
    return () => {
      cancelled = true
      cancelPendingRevealFrames()
    }
  }, [
    request,
    args.repoId,
    args.worktrees,
    args.versions,
    args.materialReady,
    args.hasSourceProblems,
    args.planOrderPending,
    flashRevealedRow,
    schedulePendingRevealFrame,
    cancelPendingRevealFrames
  ])

  return {
    highlightedRevealRowKey: reveal.highlightedRevealRowKey,
    forceReveal:
      request && request.repoId === args.repoId
        ? { version: request.version, sequence: request.sequence }
        : null
  }
}
