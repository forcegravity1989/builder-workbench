import type { ProjectGroup } from '../../../shared/project-group-types'
import type { Repo } from '../../../shared/repo-types'
import type { Worktree } from '../../../shared/worktree/types'
import { stripCredentialsFromMessage } from '../../../shared/git-remote-error'
import {
  getRepoExecutionHostId,
  getWorktreeExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  parseExecutionHostId
} from '../../../shared/execution-host'
import {
  getProjectIdentityKey,
  isHostLocalProjectId
} from '../../../shared/project-host-setup-projection'
import { composeWorktreeHostIdentity } from '../../../shared/worktree/host-qualified-identity'
import { remoteUrlToWebHref, repoLinkLabel } from './wall-repo-links'

export type WallRepoSlot = {
  /** 展示行(优先本机注册)的 repo id。 */
  repoId: string
  name: string
  path: string
  /** Display label for the remote (owner/repo or host/path). */
  linkLabel: string
  /** https URL when we can derive one; otherwise null (show path only). */
  href: string | null
  remoteUrl: string | null
  /** 该代码仓注册过的全部执行主机 id(去重,本机在前)。 */
  hostIds: string[]
  /** 本机注册行 id——「删除」只对它提供;仅 Builder 主机注册时为 null(随主机配对管理)。 */
  localRepoId: string | null
}

export type WallProject = {
  /** `group:<id>` or `solo:<identityKey>` */
  key: string
  groupId: string | null
  name: string
  /** 激活默认落点:本机主注册优先,其次组件内首行。 */
  primaryRepoId: string
  /** 全部成员行 id(含各主机注册),用于「当前项目」判定。 */
  repoIds: string[]
  /** 归并后的注册行(跨主机、去重),供名片判据读取与工作树计数。 */
  rows: Repo[]
  /** 来源主机 id(本机在前,其余按注册顺序去重)。 */
  hostIds: string[]
  /** 按代码仓身份去重后的槽:同一仓多主机注册只一槽。 */
  slots: WallRepoSlot[]
}

/** 墙只见当前配对集合内的主机:已删主机的残留行不上墙、不计数(铁律一:可重算)。 */
export type WallHostCatalog = {
  environmentIds: ReadonlySet<string>
}

function rowHostId(repo: Repo): string {
  return getRepoExecutionHostId(repo)
}

function isLocalRow(repo: Repo): boolean {
  return rowHostId(repo) === LOCAL_EXECUTION_HOST_ID
}

/** 行是否属于当前主机目录:runtime 行必须指向仍在配对集合里的环境。 */
export function isWallRowHostCurrent(repo: Repo, hosts: WallHostCatalog): boolean {
  const parsed = parseExecutionHostId(rowHostId(repo))
  // 本机 / SSH 行始终在册;runtime 行只在环境仍配对时在册。
  return parsed?.kind !== 'runtime' || hosts.environmentIds.has(parsed.environmentId)
}

/**
 * 行去重:先按当前主机目录剔除已删主机的残留行(「删除→再添加」重复注册的根因),
 * 再对同一在册主机内的双份注册(同 id 或同路径)只留先入的一行。
 * `hosts` 为 null 时不做环境过滤(测试与本机-only 调用方)。
 */
function dedupeWallRows(repos: readonly Repo[], hosts: WallHostCatalog | null): Repo[] {
  const seenIdentities = new Set<string>()
  const seenPaths = new Set<string>()
  const rows: Repo[] = []
  for (const repo of repos) {
    if (hosts && !isWallRowHostCurrent(repo, hosts)) {
      continue
    }
    const hostId = rowHostId(repo)
    const identity = `${hostId}::${repo.id}`
    if (seenIdentities.has(identity)) {
      continue
    }
    const trimmedPath = repo.path?.trim()
    const pathKey = trimmedPath ? `${hostId}::${trimmedPath}` : null
    if (pathKey && seenPaths.has(pathKey)) {
      continue
    }
    seenIdentities.add(identity)
    if (pathKey) {
      seenPaths.add(pathKey)
    }
    rows.push(repo)
  }
  return rows
}

/** 稳定身份键:远端身份键可跨主机匹配;host-local 项目各主机不可匹配,退化为按行独立。 */
function wallIdentityKey(repo: Repo): string {
  const key = getProjectIdentityKey(repo)
  return isHostLocalProjectId(key) ? `row:${rowHostId(repo)}::${repo.id}` : `id:${key}`
}

function distinctHostIds(repos: readonly Repo[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  // 本机在前,其余按注册出现顺序。
  const sorted = [...repos].sort((a, b) => Number(isLocalRow(b)) - Number(isLocalRow(a)))
  for (const repo of sorted) {
    const hostId = rowHostId(repo)
    if (!seen.has(hostId)) {
      seen.add(hostId)
      ordered.push(hostId)
    }
  }
  return ordered
}

function toSlotFromRows(rows: readonly Repo[]): WallRepoSlot {
  // 展示优先本机注册行(有删除入口、路径对用户最有意义),否则首行。
  const preferred = rows.find(isLocalRow) ?? rows[0]
  const remoteUrl = preferred.gitRemoteIdentity?.remoteUrl
    ? stripCredentialsFromMessage(preferred.gitRemoteIdentity.remoteUrl)
    : null
  const localRow = rows.find(isLocalRow)
  return {
    repoId: preferred.id,
    name: preferred.displayName || '未命名仓',
    path: preferred.path,
    linkLabel: repoLinkLabel(preferred),
    href: remoteUrl ? remoteUrlToWebHref(remoteUrl) : null,
    remoteUrl,
    hostIds: distinctHostIds(rows),
    localRepoId: localRow ? localRow.id : null
  }
}

/** 组内行排序:本机在前,再按用户组内顺序,最后按注册出现顺序(稳定)。 */
function sortComponentRows(rows: readonly Repo[], indexById: Map<string, number>): Repo[] {
  return [...rows].sort((a, b) => {
    const localDelta = Number(isLocalRow(b)) - Number(isLocalRow(a))
    if (localDelta !== 0) {
      return localDelta
    }
    const orderDelta = (a.projectGroupOrder ?? 0) - (b.projectGroupOrder ?? 0)
    if (orderDelta !== 0) {
      return orderDelta
    }
    return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0)
  })
}

type UnionFind = {
  find: (key: string) => string
  union: (a: string, b: string) => void
}

function createUnionFind(): UnionFind {
  const parent = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    while ((parent.get(root) ?? root) !== root) {
      root = parent.get(root)!
    }
    // 路径压缩
    let cursor = key
    while ((parent.get(cursor) ?? cursor) !== cursor) {
      const next = parent.get(cursor)!
      parent.set(cursor, root)
      cursor = next
    }
    return root
  }
  const union = (a: string, b: string): void => {
    const ra = find(a)
    const rb = find(b)
    if (ra === rb) {
      return
    }
    // 以字典序较小者为根,保证与输入顺序无关的确定性。
    if (ra < rb) {
      parent.set(rb, ra)
    } else {
      parent.set(ra, rb)
    }
  }
  return { find, union }
}

/**
 * Build wall projects (G3):
 * - 只纳入当前配对主机目录内的注册行;已删主机残留行不上墙(重复注册去重)。
 * - 同一主机内同 id/同路径的重复注册只算一行。
 * - 同一代码仓身份(远端身份键)跨多主机归并为一张卡;用户 projectGroup 也归并。
 * - 卡片按代码仓身份去重成槽;本机注册槽可删,仅 Builder 主机注册不可删。
 *
 * `hosts` 省略时不做环境过滤(纯函数默认全在册,便于测试与本机-only 场景)。
 */
export function buildWallProjects(
  repos: readonly Repo[],
  groups: readonly ProjectGroup[],
  hosts: WallHostCatalog | null = null
): WallProject[] {
  const rows = dedupeWallRows(repos, hosts)
  const indexById = new Map<string, number>()
  rows.forEach((repo, index) => indexById.set(repo.id, index))

  const groupById = new Map(groups.map((g) => [g.id, g]))
  const uf = createUnionFind()
  const rowKey = (repo: Repo): string => `row:${repo.id}`

  // 先让每行自成一个集合。
  for (const repo of rows) {
    uf.find(rowKey(repo))
  }
  // 按代码仓身份归并(跨主机同一仓)。
  const firstRowByIdentity = new Map<string, Repo>()
  for (const repo of rows) {
    const identity = wallIdentityKey(repo)
    const prior = firstRowByIdentity.get(identity)
    if (prior) {
      uf.union(rowKey(prior), rowKey(repo))
    } else {
      firstRowByIdentity.set(identity, repo)
    }
  }
  // 按用户项目组归并(仅当组仍存在,避免引用已删组的悬挂 id 造成错误归并)。
  const firstRowByGroup = new Map<string, Repo>()
  for (const repo of rows) {
    const groupId = repo.projectGroupId
    if (!groupId || !groupById.has(groupId)) {
      continue
    }
    const prior = firstRowByGroup.get(groupId)
    if (prior) {
      uf.union(rowKey(prior), rowKey(repo))
    } else {
      firstRowByGroup.set(groupId, repo)
    }
  }

  // 收集连通分量。
  const components = new Map<string, Repo[]>()
  for (const repo of rows) {
    const root = uf.find(rowKey(repo))
    const bucket = components.get(root)
    if (bucket) {
      bucket.push(repo)
    } else {
      components.set(root, [repo])
    }
  }

  const projects: WallProject[] = []
  for (const componentRows of components.values()) {
    const sorted = sortComponentRows(componentRows, indexById)
    // 组件对应的组:取成员里 tabOrder 最小、名字最小的现存组(确定性)。
    const memberGroupIds = [
      ...new Set(sorted.map((r) => r.projectGroupId).filter(Boolean))
    ] as string[]
    const componentGroups = memberGroupIds
      .map((id) => groupById.get(id))
      .filter((g): g is ProjectGroup => Boolean(g))
      .sort((a, b) => a.tabOrder - b.tabOrder || a.name.localeCompare(b.name))
    const group = componentGroups[0] ?? null

    // 槽:按代码仓身份去重(同一仓多主机 → 一槽)。
    const slotRowsByIdentity = new Map<string, Repo[]>()
    for (const repo of sorted) {
      const identity = wallIdentityKey(repo)
      const bucket = slotRowsByIdentity.get(identity)
      if (bucket) {
        bucket.push(repo)
      } else {
        slotRowsByIdentity.set(identity, [repo])
      }
    }
    const slots = [...slotRowsByIdentity.values()].map(toSlotFromRows)

    const primaryRepoId = sorted.find(isLocalRow)?.id ?? sorted[0].id
    const soloIdentity = wallIdentityKey(sorted.find(isLocalRow) ?? sorted[0])
    projects.push({
      key: group ? `group:${group.id}` : `solo:${soloIdentity}`,
      groupId: group ? group.id : null,
      name: group ? group.name : (sorted.find(isLocalRow) ?? sorted[0]).displayName || '未命名项目',
      primaryRepoId,
      repoIds: sorted.map((r) => r.id),
      rows: sorted,
      hostIds: distinctHostIds(sorted),
      slots
    })
  }

  // 排序:有组的卡按组 tabOrder/名字在前,其余按组件首行注册顺序。
  const firstIndexOf = (project: WallProject): number =>
    Math.min(...project.repoIds.map((id) => indexById.get(id) ?? Number.MAX_SAFE_INTEGER))
  projects.sort((a, b) => {
    const ga = a.groupId ? groupById.get(a.groupId) : null
    const gb = b.groupId ? groupById.get(b.groupId) : null
    if (ga && gb) {
      return ga.tabOrder - gb.tabOrder || ga.name.localeCompare(gb.name)
    }
    if (ga && !gb) {
      return -1
    }
    if (!ga && gb) {
      return 1
    }
    return firstIndexOf(a) - firstIndexOf(b)
  })

  return projects
}

/**
 * 墙卡工作树计数(现算,不写死):对该项目全部在册注册行,累计各自 host 名下的工作树,
 * 按 host-qualified 身份去重,保证「同一项目多主机」不重复计数、已删主机残留行不计入
 * (rows 已由 buildWallProjects 过滤到当前主机目录)。没数据自然得 0,不装绿(铁律二)。
 */
export function countWallProjectWorktrees(
  rows: readonly Repo[],
  worktreesByRepo: Record<string, readonly Worktree[]>
): number {
  const seen = new Set<string>()
  let count = 0
  for (const row of rows) {
    const hostId = rowHostId(row)
    for (const worktree of worktreesByRepo[row.id] ?? []) {
      // 只计属于本注册行 host 的工作树;legacy 无 hostId 的行按所属仓 host 归属。
      if (getWorktreeExecutionHostId(worktree, row) !== hostId) {
        continue
      }
      const identity = composeWorktreeHostIdentity(worktree.hostId, worktree.id)
      if (seen.has(identity)) {
        continue
      }
      seen.add(identity)
      count += 1
    }
  }
  return count
}
