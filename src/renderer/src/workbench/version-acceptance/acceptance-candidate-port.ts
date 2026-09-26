import { normalizeGitRemoteUrl } from '../../../../shared/git-remote-identity'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host'
import type {
  RuntimeRepoList,
  RuntimeWorktreeListResult,
  RuntimeWorktreeRecord
} from '../../../../shared/runtime-worktree-contracts'
import type { GitCommitCompareResult } from '../../../../shared/git-diff-compare-types'
import type { GitStatusResult } from '../../../../shared/git-status-types'
import { requirePathExistenceResults } from '../../../../shared/path-existence-batch'
import { callRuntimeRpc } from '../../runtime/runtime-rpc-client'
import { routeForOwner } from '../../lib/worktree-owner-route'
import {
  artifactCandidateCheck,
  type CandidateReference,
  type EvidenceCheck,
  type PreparedArtifact
} from './acceptance-model'

export type CandidateScope = {
  repoId: string
  worktreeId: string
  hostId: ExecutionHostId
  runtimeOwnerEnvironmentId?: string
}
export type CandidateCheck = EvidenceCheck & { candidate: CandidateReference }
export type ArtifactCheck = {
  artifactId: string
  candidate: EvidenceCheck
  availability: EvidenceCheck
  execution: EvidenceCheck
  file?: { worktreeId: string; relativePath: string }
  externalUrl?: string
}
export type AcceptanceCandidatePort = {
  check(candidate: CandidateReference): Promise<CandidateCheck>
  inspect(artifact: PreparedArtifact, candidate: CandidateReference): Promise<ArtifactCheck>
  openFile(file: NonNullable<ArtifactCheck['file']>): Promise<void>
}
type Rpc = <T>(method: string, params?: unknown) => Promise<T>

function pathKey(path: string): string {
  const normalized = path.replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(normalized) ? normalized.toLowerCase() : normalized
}

export function artifactRelativePath(location: string, root: string): string | null {
  const path = location.replaceAll('\\', '/')
  const rootKey = pathKey(root)
  const relative = pathKey(path).startsWith(`${rootKey}/`)
    ? path.slice(root.replaceAll('\\', '/').replace(/\/+$/, '').length + 1)
    : path
  if (
    !relative ||
    relative.startsWith('/') ||
    relative.includes(':') ||
    relative.includes('\0') ||
    relative.split('/').some((part) => part === '..' || part === '.')
  ) {
    return null
  }
  return relative
}

function failure(error: unknown): EvidenceCheck {
  return { kind: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
}

export function createAcceptanceCandidatePort(
  scope: CandidateScope,
  rpc: Rpc
): AcceptanceCandidatePort {
  const expectedHost =
    parseExecutionHostId(scope.hostId)?.kind === 'runtime' ? 'local' : scope.hostId
  const selector = (id: string) => `id:${id}`
  async function requireTree(worktreeId: string): Promise<RuntimeWorktreeRecord> {
    const { worktree } = await rpc<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
      worktree: selector(worktreeId)
    })
    const { repos } = await rpc<RuntimeRepoList>('repo.list')
    const repo = repos.find(
      (item) => item.id === scope.repoId && getRepoExecutionHostId(item) === expectedHost
    )
    if (
      !repo ||
      worktree.repoId !== scope.repoId ||
      (worktree.hostId ?? getRepoExecutionHostId(repo)) !== expectedHost
    ) {
      throw new Error('源码工作区与所选项目或宿主不一致')
    }
    return worktree
  }
  async function check(candidate: CandidateReference): Promise<CandidateCheck> {
    try {
      await requireTree(scope.worktreeId)
      const { repos } = await rpc<RuntimeRepoList>('repo.list')
      const repo = repos.find(
        (item) => item.id === scope.repoId && getRepoExecutionHostId(item) === expectedHost
      )
      const key = repo?.gitRemoteIdentity?.canonicalKey
      if (!key) {
        return { candidate, kind: 'unknown', reason: '项目尚无可核对的仓库来源身份' }
      }
      if ((normalizeGitRemoteUrl(candidate.repository) ?? candidate.repository) !== key) {
        return { candidate, kind: 'mismatch', reason: '源码候选的仓库来源与所选项目不一致' }
      }
      const result = await rpc<GitCommitCompareResult>('git.commitCompare', {
        worktree: selector(scope.worktreeId),
        commitId: candidate.commit
      })
      if (result.summary.status !== 'ready' || result.summary.commitOid !== candidate.commit) {
        return {
          candidate,
          kind: 'unavailable',
          reason: result.summary.errorMessage ?? '宿主尚未找到该候选提交，请同步并核对来源'
        }
      }
      return { candidate, kind: 'verified', checkedAt: new Date().toISOString() }
    } catch (error) {
      return { candidate, ...failure(error) }
    }
  }
  return {
    check,
    async inspect(artifact, candidate) {
      const declared = artifactCandidateCheck(artifact, candidate)
      const result: ArtifactCheck = {
        artifactId: artifact.artifactId,
        candidate: declared.kind === 'mismatch' ? declared : await check(candidate),
        availability: { kind: 'unknown', reason: '材料可用性尚未核对' },
        execution: { kind: 'unknown', reason: '未关联执行入口与源码工作区' }
      }
      try {
        if (/^https?:\/\//i.test(artifact.location)) {
          const url = new URL(artifact.location)
          if (url.username || url.password) {
            throw new Error('材料链接不应包含账号凭据')
          }
          result.externalUrl = url.href
          result.availability = { kind: 'unknown', reason: '外部材料，请打开核对可用性与内容' }
        }
        if (!artifact.executionRoot) {
          return result
        }
        const list = await rpc<RuntimeWorktreeListResult>('worktree.list', {
          repo: `id:${scope.repoId}`,
          limit: 1000
        })
        const matches = list.worktrees.filter(
          (tree) =>
            pathKey(tree.path) === pathKey(artifact.executionRoot!) &&
            (!tree.hostId || tree.hostId === expectedHost)
        )
        if (matches.length !== 1) {
          result.execution = { kind: 'unknown', reason: '尚未在所属宿主定位唯一的原生源码工作区' }
          return result
        }
        const tree = await requireTree(matches[0].id)
        const status = await rpc<GitStatusResult>('git.status', {
          worktree: selector(tree.id),
          includeLineStats: false
        })
        result.execution =
          status.head !== candidate.commit
            ? { kind: 'mismatch', reason: '源码工作区当前提交与候选不一致，请核对生成时的执行记录' }
            : status.entries.length > 0 || status.didHitLimit
              ? { kind: 'unknown', reason: '源码工作区有未提交修改，不能仅凭 HEAD 证明制品来源' }
              : {
                  kind: 'unknown',
                  reason: '当前源码工作区匹配；仍需核对生成时的原生任务输出与制品校验值'
                }
        if (!result.externalUrl) {
          const relativePath = artifactRelativePath(artifact.location, tree.path)
          if (!relativePath) {
            throw new Error('材料不在关联工作区内，请通过原生会话核对文件位置')
          }
          const [exists] = requirePathExistenceResults(
            await rpc('files.pathsExist', {
              worktree: selector(tree.id),
              relativePaths: [relativePath]
            }),
            1
          )
          result.availability =
            'error' in exists
              ? { kind: 'unavailable', reason: exists.error }
              : exists.exists
                ? { kind: 'verified', checkedAt: new Date().toISOString() }
                : { kind: 'unavailable', reason: '关联工作区中未找到材料文件' }
          if ('exists' in exists && exists.exists) {
            result.file = { worktreeId: tree.id, relativePath }
          }
        }
      } catch (error) {
        result.availability = failure(error)
      }
      return result
    },
    async openFile(file) {
      await requireTree(file.worktreeId)
      await rpc('files.open', {
        worktree: selector(file.worktreeId),
        relativePath: file.relativePath
      })
    }
  }
}

export function nativeAcceptanceCandidatePort(scope: CandidateScope): AcceptanceCandidatePort {
  const route = routeForOwner(scope)
  if (!route) {
    throw new Error('缺少源码工作区的宿主路由')
  }
  const target = route.runtimeEnvironmentId
    ? { kind: 'environment' as const, environmentId: route.runtimeEnvironmentId }
    : { kind: 'local' as const }
  return createAcceptanceCandidatePort(scope, (method, params) =>
    callRuntimeRpc(target, method, params)
  )
}
