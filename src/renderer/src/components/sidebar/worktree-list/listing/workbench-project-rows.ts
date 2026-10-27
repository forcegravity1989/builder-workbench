import { WORKBENCH_OTHER_PROJECTS_LABEL } from '@/workbench/version-sidebar-state'
import type { HostHeaderRow, HostSectionRow } from '../../host-section-rows'
import type { GroupHeaderRow } from '../grouping/row-types'
import type { Repo } from '../../../../../../shared/repo-types'
import type { ProjectGroup } from '../../../../../../shared/project-group-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'

type Header = GroupHeaderRow | HostHeaderRow
type Node = { header?: Header; row?: HostSectionRow; children: Node[]; depth: number }

function rowRepoId(row: HostSectionRow): string | null {
  if (row.type === 'item') {
    return row.worktree.repoId
  }
  return 'repo' in row ? (row.repo?.id ?? null) : null
}

/** Split only presentation; native grouping keys, actions and persisted order remain intact. */
export function projectWorkbenchRows(args: {
  rows: HostSectionRow[]
  repoId: string
  currentRepoIds: readonly string[]
  repos: readonly Repo[]
  projectGroups: readonly ProjectGroup[]
  worktrees: readonly Worktree[]
  expanded: boolean
  onToggle: () => void
}): HostSectionRow[] {
  const wanted = new Set(args.currentRepoIds)
  const groupMap = new Map(args.projectGroups.map((group) => [group.id, group]))
  const root: Node = { children: [], depth: -2 }
  const stack = [root]
  for (const row of args.rows) {
    if (row.type === 'header' || row.type === 'host-header') {
      const depth = row.type === 'host-header' ? -1 : (row.projectGroupDepth ?? 0)
      while (stack.length > 1 && stack.at(-1)!.depth >= depth) {
        stack.pop()
      }
      const node: Node = { header: row, children: [], depth }
      stack.at(-1)!.children.push(node)
      stack.push(node)
    } else {
      stack.at(-1)!.children.push({ row, children: [], depth: 99 })
    }
  }
  function repoInGroup(repo: Repo, id: string): boolean {
    let groupId = repo.projectGroupId
    const seen = new Set<string>()
    while (groupId && !seen.has(groupId)) {
      if (groupId === id) {
        return true
      }
      seen.add(groupId)
      groupId = groupMap.get(groupId)?.parentGroupId ?? undefined
    }
    return false
  }
  function headerRepos(header: Header): Set<string> {
    if (header.type === 'host-header') {
      return new Set(
        args.repos
          .filter((repo) => getRepoExecutionHostId(repo) === header.hostId)
          .map((repo) => repo.id)
      )
    }
    if (header.repo) {
      return new Set([header.repo.id])
    }
    if (header.projectGroup?.id) {
      return new Set(
        args.repos
          .filter((repo) => repoInGroup(repo, header.projectGroup!.id!))
          .map((repo) => repo.id)
      )
    }
    const ids = new Set(header.worktreeIds ?? [])
    return new Set(args.worktrees.filter((tree) => ids.has(tree.id)).map((tree) => tree.repoId))
  }
  function split(node: Node): [HostSectionRow[], HostSectionRow[]] {
    if (node.row) {
      return wanted.has(rowRepoId(node.row) ?? '') ? [[node.row], []] : [[], [node.row]]
    }
    const parts: [HostSectionRow[], HostSectionRow[]] = [[], []]
    for (const child of node.children) {
      const childParts = split(child)
      parts[0].push(...childParts[0])
      parts[1].push(...childParts[1])
    }
    if (!node.header) {
      return parts
    }
    const header = node.header
    const memberRepos = headerRepos(header)
    const sharedHeader =
      (parts[0].length > 0 && parts[1].length > 0) ||
      (node.children.length === 0 &&
        [...memberRepos].some((id) => wanted.has(id)) &&
        [...memberRepos].some((id) => !wanted.has(id)))
    const memberIds =
      header.type === 'header' && header.worktreeIds ? new Set(header.worktreeIds) : null
    for (const side of [0, 1] as const) {
      const hasMembers = [...memberRepos].some((id) => wanted.has(id) === (side === 0))
      if (
        parts[side].length === 0 &&
        (node.children.length > 0 || (!hasMembers && !(side === 1 && memberRepos.size === 0)))
      ) {
        continue
      }
      const count = sharedHeader
        ? args.worktrees.filter(
            (tree) =>
              memberRepos.has(tree.repoId) &&
              (!memberIds || memberIds.has(tree.id)) &&
              wanted.has(tree.repoId) === (side === 0)
          ).length
        : header.count
      parts[side].unshift({
        ...header,
        count,
        partialPresentation: sharedHeader,
        presentationKey: `workbench:${side}:${header.type}:${header.hostId ?? ''}:${header.key}`
      })
    }
    return parts
  }
  const [current, other] = split(root)
  if (other.length === 0) {
    return current
  }
  const count = new Set(
    other.flatMap((row) => {
      if (row.type === 'header' || row.type === 'host-header') {
        return [...headerRepos(row)].filter((id) => !wanted.has(id))
      }
      const id = rowRepoId(row)
      return id && !wanted.has(id) ? [id] : []
    })
  ).size
  return [
    ...current,
    {
      type: 'header',
      key: `workbench:other-projects:${args.repoId}`,
      label: WORKBENCH_OTHER_PROJECTS_LABEL,
      count,
      tone: '',
      displaySection: { expanded: args.expanded, onToggle: args.onToggle }
    },
    ...(args.expanded ? other : [])
  ]
}
