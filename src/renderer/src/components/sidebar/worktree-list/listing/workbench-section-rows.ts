import type { Repo } from '../../../../../../shared/repo-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { HostSectionRow } from '../../host-section-rows'
import { PINNED_GROUP_KEY } from '../grouping/group-keys'
import { getProjectHeaderRevealTarget } from '../grouping/project-grouping'
import type { ProjectGroupingModel } from '../grouping/project-grouping'
import type { Row, WorktreeGroupBy } from '../grouping/row-types'

/** Reposition complete native sections without changing saved project or worktree order. */
export function buildWorkbenchSectionRows({
  rows,
  workbench,
  groupBy,
  repoIds,
  repoMap,
  projectGrouping,
  projectGroups,
  withHostSections
}: {
  rows: Row[]
  workbench: boolean
  groupBy: WorktreeGroupBy
  repoIds: readonly string[]
  repoMap: Map<string, Repo>
  projectGrouping: ProjectGroupingModel
  projectGroups: readonly ProjectGroup[]
  withHostSections: (rows: Row[]) => HostSectionRow[]
}): HostSectionRow[] {
  if (!workbench) {
    return withHostSections(rows)
  }
  const pinnedStart = rows.findIndex((row) => row.type === 'header' && row.key === PINNED_GROUP_KEY)
  const nextHeader =
    pinnedStart === -1
      ? -1
      : rows.findIndex((row, index) => index > pinnedStart && row.type === 'header')
  const pinnedEnd = nextHeader === -1 ? rows.length : nextHeader
  const pinned = pinnedStart === -1 ? [] : rows.slice(pinnedStart, pinnedEnd)
  let natural =
    pinnedStart === -1 ? rows : [...rows.slice(0, pinnedStart), ...rows.slice(pinnedEnd)]
  if (groupBy === 'repo' && repoIds.length > 0) {
    const targetKeys = new Set(
      repoIds.map((id) => getProjectHeaderRevealTarget(id, repoMap, projectGrouping).key)
    )
    const visibleKeys = new Set(natural.flatMap((row) => (row.type === 'header' ? [row.key] : [])))
    const groupById = new Map(projectGroups.map((group) => [group.id, group]))
    const rootGroupIds = new Set<string>()
    for (const id of repoIds) {
      if (visibleKeys.has(getProjectHeaderRevealTarget(id, repoMap, projectGrouping).key)) {
        continue
      }
      let groupId = repoMap.get(id)?.projectGroupId
      const seen = new Set<string>()
      while (groupId && !seen.has(groupId)) {
        seen.add(groupId)
        rootGroupIds.add(groupId)
        groupId = groupById.get(groupId)?.parentGroupId
      }
    }
    const prefix: Row[] = []
    const blocks: Row[][] = []
    for (const row of natural) {
      if (row.type === 'header' && (row.projectGroupDepth ?? 0) === 0) {
        blocks.push([])
      }
      const block = blocks.at(-1)
      if (block) {
        block.push(row)
      } else {
        prefix.push(row)
      }
    }
    const isCurrent = (block: Row[]) =>
      block.some(
        (row) =>
          row.type === 'header' &&
          (targetKeys.has(row.key) ||
            (!!row.projectGroup?.id && rootGroupIds.has(row.projectGroup.id)))
      )
    natural = [...prefix, ...blocks.filter(isCurrent).flat()]
  }
  // Keep Pinned global even when the user explicitly groups the remaining list by host.
  return [...pinned, ...withHostSections(natural)]
}
