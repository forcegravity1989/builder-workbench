import { makePaneKey, isTerminalLeafId } from '../../../shared/stable-pane-id'
import type { Tab } from '../../../shared/tab-types'
import type { TerminalLayoutSnapshot, TerminalTab } from '../../../shared/terminal-tab-types'
import { singlePaneLayoutSnapshot } from '@/store/slices/terminal-helpers'
import { mintStablePaneId } from '@/lib/pane-manager/mint-stable-pane-id'
import { resolveRootlessTerminalLayoutLeafId } from '@/components/terminal-pane/terminal-layout-leaf-ids'

export const WEEK_PLAN_SESSION_LABEL = 'bw/week-plan'

export type WeekPlanTabHit = { worktreeId: string; tab: TerminalTab }
export type WeekPlanStructuredHit = { worktreeId: string; tab: Tab }

export function isWeekPlanTerminalTab(
  tab: Pick<TerminalTab, 'launchAgent' | 'quickCommandLabel' | 'customTitle'>
): boolean {
  if (!hasWeekPlanLabel(tab.quickCommandLabel, tab.customTitle)) {
    return false
  }
  return tab.launchAgent === 'claude' || tab.launchAgent == null
}

export function isWeekPlanStructuredTab(
  tab: Pick<Tab, 'contentType' | 'agentSessionAgent' | 'quickCommandLabel' | 'customLabel'>
): boolean {
  return (
    tab.contentType === 'agent-session' &&
    tab.agentSessionAgent === 'claude' &&
    hasWeekPlanLabel(tab.quickCommandLabel, tab.customLabel)
  )
}

export function findWeekPlanTerminalTab(
  tabs: readonly TerminalTab[] | undefined
): TerminalTab | undefined {
  return tabs?.find(isWeekPlanTerminalTab)
}

export function findWeekPlanStructuredTab(tabs: readonly Tab[] | undefined): Tab | undefined {
  return tabs?.find(isWeekPlanStructuredTab)
}

export type WeekPlanWorktreeRef = {
  id: string
  repoId: string
  displayName: string
  branch: string
  isMainWorktree: boolean
}

export function isWeekPlanWorktreeName(name: string | null | undefined): boolean {
  return hasWeekPlanLabel(name, null)
}

export function resolveWeekPlanHomeWorktreeId(args: {
  activeWorktreeId: string
  projectWorktreeIds: readonly string[]
  worktrees?: readonly WeekPlanWorktreeRef[]
  storedWorktreeId?: string | null
}): string {
  const inProject = uniqueIds([args.activeWorktreeId, ...args.projectWorktreeIds])
  const allowed = new Set(inProject)
  const storedWorktreeId = args.storedWorktreeId?.trim()
  const named = args.worktrees?.find(
    (worktree) =>
      allowed.has(worktree.id) &&
      (isWeekPlanWorktreeName(worktree.displayName) || isWeekPlanWorktreeName(worktree.branch))
  )
  if (named) {
    return named.id
  }
  if (storedWorktreeId && allowed.has(storedWorktreeId)) {
    return storedWorktreeId
  }
  const main = args.worktrees?.find(
    (worktree) => allowed.has(worktree.id) && worktree.isMainWorktree
  )
  if (main) {
    return main.id
  }
  return inProject[0] ?? args.activeWorktreeId
}

export function findWeekPlanTerminalTabInProject(args: {
  activeWorktreeId: string
  tabsByWorktree: Record<string, readonly TerminalTab[] | undefined>
  projectWorktreeIds: readonly string[]
  storedTabId?: string | null
  storedWorktreeId?: string | null
  worktrees?: readonly WeekPlanWorktreeRef[]
}): WeekPlanTabHit | undefined {
  const ordered = weekPlanSearchOrder(args)
  const storedTabId = args.storedTabId?.trim()
  if (storedTabId) {
    for (const worktreeId of ordered) {
      const tab = args.tabsByWorktree[worktreeId]?.find((candidate) => candidate.id === storedTabId)
      if (tab && isWeekPlanTerminalTab(tab)) {
        return { worktreeId, tab }
      }
    }
  }
  for (const worktreeId of ordered) {
    const tab = findWeekPlanTerminalTab(args.tabsByWorktree[worktreeId])
    if (tab) {
      return { worktreeId, tab }
    }
  }
  return undefined
}

export function findWeekPlanStructuredTabInProject(args: {
  activeWorktreeId: string
  unifiedTabsByWorktree: Record<string, readonly Tab[] | undefined>
  projectWorktreeIds: readonly string[]
  storedTabId?: string | null
  storedWorktreeId?: string | null
  worktrees?: readonly WeekPlanWorktreeRef[]
}): WeekPlanStructuredHit | undefined {
  const ordered = weekPlanSearchOrder(args)
  const storedTabId = args.storedTabId?.trim()
  if (storedTabId) {
    for (const worktreeId of ordered) {
      const tab = args.unifiedTabsByWorktree[worktreeId]?.find(
        (candidate) => candidate.id === storedTabId
      )
      if (tab && isWeekPlanStructuredTab(tab)) {
        return { worktreeId, tab }
      }
    }
  }
  for (const worktreeId of ordered) {
    const tab = findWeekPlanStructuredTab(args.unifiedTabsByWorktree[worktreeId])
    if (tab) {
      return { worktreeId, tab }
    }
  }
  return undefined
}

export function resolveWeekPlanPaneKey(
  tabId: string,
  layout: TerminalLayoutSnapshot | undefined
): string | null {
  const leafId = leafIdFromLayout(layout)
  return leafId ? makePaneKey(tabId, leafId) : null
}

export function seedWeekPlanLayoutIfNeeded(
  tabId: string,
  layout: TerminalLayoutSnapshot | undefined
): { paneKey: string; snapshot: TerminalLayoutSnapshot | null } {
  const existing = resolveWeekPlanPaneKey(tabId, layout)
  if (existing) {
    return { paneKey: existing, snapshot: null }
  }
  const leafId = mintStablePaneId()
  return { paneKey: makePaneKey(tabId, leafId), snapshot: singlePaneLayoutSnapshot(leafId) }
}

export function weekPlanProjectKey(
  worktree: { repoId?: string } | null | undefined,
  worktreeId: string
): string {
  return worktree?.repoId ?? worktreeId
}

export function weekPlanProjectWorktreeIds(
  activeWorktreeId: string,
  worktrees: readonly { id: string; repoId: string }[]
): string[] {
  const repoId = worktrees.find((entry) => entry.id === activeWorktreeId)?.repoId
  if (!repoId) {
    return [activeWorktreeId]
  }
  return uniqueIds(worktrees.filter((entry) => entry.repoId === repoId).map((entry) => entry.id))
}

function weekPlanSearchOrder(args: {
  activeWorktreeId: string
  projectWorktreeIds: readonly string[]
  storedWorktreeId?: string | null
  worktrees?: readonly WeekPlanWorktreeRef[]
}): string[] {
  return uniqueIds([
    resolveWeekPlanHomeWorktreeId(args),
    ...args.projectWorktreeIds,
    args.activeWorktreeId
  ])
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => id.length > 0))]
}

function hasWeekPlanLabel(
  quickCommandLabel: string | null | undefined,
  customTitle: string | null | undefined
): boolean {
  return isWeekPlanLabelValue(quickCommandLabel) || isWeekPlanLabelValue(customTitle)
}

function isWeekPlanLabelValue(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? ''
  return (
    trimmed === WEEK_PLAN_SESSION_LABEL ||
    trimmed.startsWith(`${WEEK_PLAN_SESSION_LABEL} -`) ||
    trimmed.startsWith(`${WEEK_PLAN_SESSION_LABEL}-`)
  )
}

function leafIdFromLayout(layout: TerminalLayoutSnapshot | undefined): string | null {
  if (!layout) {
    return null
  }
  if (layout.activeLeafId && isTerminalLeafId(layout.activeLeafId)) {
    return layout.activeLeafId
  }
  const rootless = resolveRootlessTerminalLayoutLeafId(layout)
  if (rootless) {
    return rootless
  }
  return layout.root?.type === 'leaf' && isTerminalLeafId(layout.root.leafId)
    ? layout.root.leafId
    : null
}
