import {
  getRepoExecutionHostId,
  getRepoSshConnectionId,
  parseExecutionHostId
} from '../../../shared/execution-host'
import type { Repo } from '../../../shared/repo-types'
import type {
  CharterIntent,
  CharterReadResult,
  CharterRemoteProbe,
  CharterScope,
  CharterStatus,
  CharterSubmitOutcome
} from '../../../shared/workbench/charter'
import type { VersionMaterialResult } from '../../../shared/workbench/version-material-request'
import { routeForOwner } from '../lib/worktree-owner-route'
import { callRuntimeRpc, type RuntimeClientTarget } from '../runtime/runtime-rpc-client'
import { MetricRuntimeError, callMetricRuntime } from './metric-runtime-rpc'
import { readProjectCharter } from './project-charter'

/** 克隆前远端名片预读:gh / codehub-cli 在本机执行,固定走本地 runtime。 */
export async function probeRemoteCharter(url: string): Promise<CharterRemoteProbe> {
  const result = await callRuntimeRpc<VersionMaterialResult<CharterRemoteProbe>>(
    { kind: 'local' },
    'workbench.charter.probeRemote',
    { url },
    { timeoutMs: 90_000 }
  )
  if (!result.ok) {
    throw new MetricRuntimeError(result.error.code, result.error.message)
  }
  return result.value
}

/** 名片经 bw/project 固定树提交并开 PR;失败是返回值不是异常(项目已接入)。 */
export async function submitProjectCharter(
  scope: CharterScope,
  runtimeOwnerEnvironmentId: string | undefined,
  intent: CharterIntent,
  firstTime: boolean,
  edit?: { expectedRaw: string | null }
): Promise<CharterSubmitOutcome> {
  return callMetricRuntime<CharterSubmitOutcome>(
    // wire 契约是 strictObject:只上送三键,调用方 spread 进来的 projectId 等会被 zod 拒。
    { repoId: scope.repoId, worktreeId: scope.worktreeId, hostId: scope.hostId },
    runtimeOwnerEnvironmentId,
    'workbench.charter.submit',
    (ownerScope) => ({ scope: ownerScope, intent, firstTime, ...(edit ? { edit } : {}) }),
    300_000
  )
}

/**
 * G3 墙判据:按仓库 owner/runtime 路由读注册仓主检出的 `.bw/project.toml`。
 * 本机与 SSH 走 fs 桥;runtime 主机经 workbench.charter.read 在 owner 侧读。
 * 连接失败/IO 失败返回 error——「没读成」不冒充「不存在」(铁律二同源语义)。
 */
export async function readRepoCharter(
  repo: Pick<Repo, 'id' | 'path' | 'connectionId' | 'executionHostId'>,
  runtimeOwnerEnvironmentId?: string
): Promise<CharterReadResult> {
  const hostId = getRepoExecutionHostId(repo)
  const parsedHost = parseExecutionHostId(hostId)
  if (parsedHost?.kind !== 'runtime') {
    const local = await readProjectCharter(repo.path, getRepoSshConnectionId(repo))
    return { charter: local.charter, raw: local.raw, existed: local.existed, error: local.error }
  }
  const route = routeForOwner({ hostId, runtimeOwnerEnvironmentId })
  if (!route?.runtimeEnvironmentId) {
    return { charter: null, existed: false, error: '无法识别仓库所属 runtime 主机' }
  }
  try {
    const result = await callRuntimeRpc<VersionMaterialResult<CharterReadResult>>(
      { kind: 'environment', environmentId: route.runtimeEnvironmentId },
      'workbench.charter.read',
      // runtime-kind 宿主在 owner 侧就是本地注册(与 charter.status 同一路由约定)。
      { repoId: repo.id, hostId: 'local' },
      { timeoutMs: 30_000 }
    )
    if (!result.ok) {
      return { charter: null, existed: false, error: result.error.message }
    }
    return result.value
  } catch (e) {
    return { charter: null, existed: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 墙卡/总览的名片 PR 状态。查询失败返回 queryFailed——「没查成」
 * 不冒充「没有 PR」。
 */
export async function readCharterPrStatus(
  repo: Pick<Repo, 'id' | 'connectionId' | 'executionHostId'>,
  runtimeOwnerEnvironmentId?: string
): Promise<CharterStatus> {
  const hostId = getRepoExecutionHostId(repo)
  const route = routeForOwner({ hostId, runtimeOwnerEnvironmentId })
  if (!route) {
    return { pr: null, headHasCharter: false, queryFailed: true }
  }
  const target: RuntimeClientTarget = route.runtimeEnvironmentId
    ? { kind: 'environment', environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' }
  const ownerHostId = parseExecutionHostId(hostId)?.kind === 'runtime' ? 'local' : hostId
  try {
    const result = await callRuntimeRpc<VersionMaterialResult<CharterStatus>>(
      target,
      'workbench.charter.status',
      { repoId: repo.id, hostId: ownerHostId },
      { timeoutMs: 45_000 }
    )
    if (!result.ok) {
      return { pr: null, headHasCharter: false, queryFailed: true }
    }
    return result.value
  } catch {
    return { pr: null, headHasCharter: false, queryFailed: true }
  }
}
