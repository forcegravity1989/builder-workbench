// Preview-only data/IPC adapters. Product components and styles are imported unchanged.
import { useSyncExternalStore } from 'react'
import type { Repo } from '../../../../../src/shared/repo-types'
import type { ExecutionHostId } from '../../../../../src/shared/execution-host'
import type { WallProject } from '../../../../../src/renderer/src/workbench/workbench-wall-projects'
import type { submitProjectOnboard as NativeOnboard } from '../../../../../src/renderer/src/workbench/run-project-onboard'
import { renderProjectToml } from '../../../../../src/shared/workbench/project-charter'
import {
  joinFsPath,
  normalizeCloneUrl,
  repoNameFromRemote
} from '../../../../../src/renderer/src/workbench/project-charter'

const listeners = new Set<() => void>()
export const charter = {
  name: '订单服务',
  kind: '',
  brief: '处理订单与支付回调',
  benchmark: '',
  opportunity: '让支付处理稳定、可追踪'
}
const initialCharter = { ...charter }
const repo = (
  id: string,
  host: ExecutionHostId,
  path: string,
  name: string,
  project = 'order'
): Repo => ({
  id,
  executionHostId: host,
  path,
  displayName: name,
  addedAt: 0,
  badgeColor: '',
  gitRemoteIdentity: {
    canonicalKey: `git.example.com/team/${project}`,
    remoteName: 'origin',
    remoteUrl: `https://git.example.com/team/${project}.git`
  }
})
const local = repo('repo-b', 'local', '/home/li/pay', 'pay-work')
const remote = repo('repo-a', 'runtime:builder-a', 'C:/dev/order', '订单API')
const ops = repo('repo-c', 'runtime:builder-c', '/srv/ops', 'ops', 'ops')
let mode = 'first'
let stage = 0
type Environment = { id: string; name: string }
type Tree = {
  id: string
  repoId: string
  executionHostId: ExecutionHostId
  path: string
  isMainWorktree: boolean
}
type PreviewState = {
  repos: Repo[]
  projectGroups: never[]
  activeRepoId: null
  settings: { workspaceDir: string }
  runtimeEnvironments: Environment[]
  runtimeStatusByEnvironmentId: Map<string, { status: object | null }>
  sshTargetLabels: Map<string, string>
  worktreesByRepo: Record<string, Tree[]>
  fetchReposForAllHosts: () => Promise<void>
  fetchAllWorktrees: () => Promise<void>
  setRuntimeEnvironments: (envs: Environment[]) => void
  readRuntimeHostStatusSnapshots: () => Promise<void>
  fetchWorktrees: () => Promise<boolean>
  allWorktrees: () => Tree[]
  openSettingsTarget: (target: { pane: string; hostId: string }) => void
  openSettingsPage: () => void
}
let snapshot: PreviewState
let view: 'wall' | 'onboard' | 'handoff' = 'wall'
const status = () =>
  new Map(
    snapshot.runtimeEnvironments.map((env) => [
      env.id,
      { status: mode === 'offline' || mode === 'all-offline' ? null : {} }
    ])
  )
export function announce(text: string) {
  window.dispatchEvent(new CustomEvent('prototype:notice', { detail: text }))
}
function emit() {
  for (const listener of listeners) {
    listener()
  }
}
export function getView() {
  return view
}
export function fixtureRows() {
  return snapshot.repos
}
export function getMode() {
  return mode
}
function setView(next: 'wall' | 'onboard' | 'handoff') {
  view = next
  snapshot = { ...snapshot }
  emit()
}
function reconcile() {
  if (mode === 'late' && stage === 0) {
    snapshot = { ...snapshot, repos: [local, { ...remote, gitRemoteIdentity: undefined }] }
  } else if (mode === 'first') {
    snapshot = { ...snapshot, repos: stage === 0 ? [] : stage === 1 ? [local] : [local, remote] }
  } else if (mode === 'leader') {
    snapshot = { ...snapshot, repos: stage === 0 ? [local, remote] : [local, remote, ops] }
  } else {
    snapshot = { ...snapshot, repos: [local, remote] }
  }
  snapshot = {
    ...snapshot,
    runtimeStatusByEnvironmentId: status(),
    worktreesByRepo: Object.fromEntries(
      snapshot.repos.map((row) => [
        row.id,
        [
          {
            id: `tree-${row.id}`,
            repoId: row.id,
            executionHostId: row.executionHostId || 'local',
            path: row.path,
            isMainWorktree: true
          }
        ]
      ])
    )
  }
  emit()
}
export function reset(next: string) {
  mode = next
  stage = 0
  view = 'wall'
  Object.assign(charter, initialCharter)
  local.path = '/home/li/pay'
  snapshot = {
    repos: [],
    projectGroups: [],
    activeRepoId: null,
    settings: { workspaceDir: '/home/li/workspaces' },
    runtimeEnvironments: next === 'first' ? [] : [{ id: 'builder-a', name: 'Builder-A' }],
    runtimeStatusByEnvironmentId: new Map(),
    sshTargetLabels: new Map(),
    worktreesByRepo: {},
    fetchReposForAllHosts: async () => {
      if (mode === 'late') {
        stage = 1
      }
      reconcile()
    },
    fetchAllWorktrees: async () => {},
    setRuntimeEnvironments: (envs: Environment[]) => {
      snapshot = { ...snapshot, runtimeEnvironments: envs }
      emit()
    },
    readRuntimeHostStatusSnapshots: async () => {
      reconcile()
    },
    fetchWorktrees: async () => true,
    allWorktrees: () => Object.values(snapshot.worktreesByRepo).flat(),
    openSettingsTarget: (target: { pane: string; hostId: string }) =>
      announce(`原生设置交接：${target.pane} · ${target.hostId}。此预览未装载完整设置页。`),
    openSettingsPage: () => {}
  }
  reconcile()
}
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function getSnapshot() {
  return snapshot
}
export const useAppStore = Object.assign(
  function useAppStore<T>(selector: (value: PreviewState) => T): T {
    return selector(useSyncExternalStore(subscribe, getSnapshot))
  },
  { getState: () => snapshot }
)
export function openProjectOnboard() {
  setView('onboard')
}
export function openProjectWall() {
  setView('wall')
}
export function closeProjectPage() {
  announce('真实页面的关闭入口已触发；此组件预览没有宿主导航。')
}
export async function switchActiveProject(id: string) {
  const row = snapshot.repos.find((item) => item.id === id)
  if (!row) {
    throw new Error('演示目录中没有该注册')
  }
  announce(
    `真实总览入口触发：${row.executionHostId} · ${row.path}。不在预览中另画总览、会话或文件页。`
  )
  setView('handoff')
}
export async function ensureWallProjectGroup() {
  throw new Error('演示未开放修改原生项目分组')
}
export async function removeRepoFromWallProject() {
  throw new Error('演示未开放解除真实注册')
}
const projectCharter = (row: Pick<Repo, 'id'> | undefined) =>
  row?.id === 'repo-c'
    ? { ...charter, name: '运营工具', brief: '维护项目运维脚本', opportunity: '让运维操作可复用' }
    : { ...charter }
export function useWallAdoptions(projects: WallProject[]) {
  return {
    loadCount: 1,
    adoptionByKey: Object.fromEntries(
      projects.map((project) => [
        project.key,
        {
          adopted: mode !== 'all-offline',
          charter: projectCharter(project.rows[0]),
          status: null
        }
      ])
    )
  }
}
export function useWallReadings(projects: WallProject[]) {
  return Object.fromEntries(
    projects.map((project) => [
      project.key,
      {
        version: { kind: 'undecided' },
        progress: { kind: 'hidden' },
        sessions:
          mode === 'offline' ? { kind: 'unknown' } : { kind: 'known', count: project.rows.length },
        prs: { kind: 'unknown', reason: '预览没有调用真实平台' }
      }
    ])
  )
}
export async function readRepoCharter(row: Repo) {
  const value = projectCharter(row)
  return { charter: value, raw: renderProjectToml(value) }
}
export async function readCharterPrStatus() {
  return { headHasCharter: true, remoteAvailable: true }
}
export async function probeRemoteCharter() {
  return { kind: 'adopted', charter }
}
export async function probeLocalCharter() {
  return { prefill: charter, note: '样例首次填写名片；确认只更新演示数据，不写入真实文件。' }
}
export async function submitProjectOnboard(input: Parameters<typeof NativeOnboard>[0]) {
  local.path = input.localRepo
    ? input.workspace
    : joinFsPath(input.cloneParent, repoNameFromRemote(normalizeCloneUrl(input.remote)))
  Object.assign(charter, input.intent)
  input.onLog({ kind: 'ok', text: '演示接入完成；没有写入磁盘、Git 或远端。' })
  stage = 1
  reconcile()
  announce(
    '真实接入流程在完成后切到项目总览。本预览未嵌入总览，可用外部演示控制返回项目墙核对聚合。'
  )
  setView('handoff')
  return { ok: true, repoId: local.id, attached: false }
}
export function nativeWorkspaceScope(tree: Tree) {
  return { repoId: tree.repoId, worktreeId: tree.id, hostId: tree.executionHostId }
}
export async function ensureNamedWorktree(scope: { repoId: string }) {
  return { id: `preview-${scope.repoId}` }
}
export async function submitProjectCharter() {
  return { mode: 'failed', error: '此预览只读真实组件，不向任何主机或平台提交。' }
}
export async function updateTrunkCode() {
  throw new Error('此预览不更新代码')
}
export function trunkUpdateNotice() {
  return '此预览不更新代码'
}
export function translate(_key: string, fallback: string) {
  return fallback
}
export function addFixtureHost(name: string) {
  const id = name === 'Builder-C' ? 'builder-c' : 'builder-a'
  const envs = snapshot.runtimeEnvironments.filter((env) => env.id !== id)
  snapshot = { ...snapshot, runtimeEnvironments: [...envs, { id, name }] }
  stage = mode === 'first' ? 2 : 1
  reconcile()
}
export function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}
reset('first')
