import { readdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { isWslUncPath } from '../../shared/wsl-paths'
import {
  VersionDocumentError,
  validatePlanningVersion
} from '../../shared/workbench/version-document'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema,
  type VersionMaterial
} from '../../shared/workbench/version-material'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  type VersionMaterialScope,
  type VersionMaterialRead,
  type VersionMaterialSave,
  type VersionMaterialResult,
  type VersionMaterialCandidate
} from '../../shared/workbench/version-material-request'
import { resolveGitDir } from '../git/source-control/resolve-git-dir'
import { resolveGitCommonDir } from '../git/source-control/resolve-git-common-dir'
import { createVersionDocumentStore } from './version-document-store'
import { isMissingFile, resolveVersionPlanningRoot } from './version-document-path'

export type VersionMaterialHost = {
  listRepos(): Pick<Repo, 'id' | 'path' | 'kind' | 'connectionId' | 'executionHostId'>[]
  listWorktrees(): Promise<
    Pick<
      Worktree,
      'id' | 'repoId' | 'path' | 'hostId' | 'runtimeOwnerEnvironmentId' | 'isArchived'
    >[]
  >
}

class MaterialScopeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

export async function materialResult<T>(run: () => Promise<T>): Promise<VersionMaterialResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (error instanceof VersionDocumentError || error instanceof MaterialScopeError) {
      return {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error instanceof VersionDocumentError && error.currentRevision !== undefined
            ? { currentRevision: error.currentRevision }
            : {})
        }
      }
    }
    throw error
  }
}

/** Only native inventory grants filesystem authority. Request payloads contain IDs, never roots. */
export function createVersionMaterialService(host: VersionMaterialHost) {
  async function authorize(scope: VersionMaterialScope): Promise<string> {
    if (scope.hostId !== 'local') {
      throw new MaterialScopeError('unsupported-host', '版本材料目前仅支持本机 Git 项目')
    }
    const repos = host
      .listRepos()
      .filter((repo) => repo.id === scope.repoId && getRepoExecutionHostId(repo) === 'local')
    if (repos.length !== 1) {
      throw new MaterialScopeError('invalid-scope', '项目身份不存在或不唯一')
    }
    const repo = repos[0]
    if (repo.kind === 'folder' || repo.connectionId || isWslUncPath(repo.path)) {
      throw new MaterialScopeError('unsupported-host', '版本材料目前仅支持本机 Git 项目')
    }
    const trees = (await host.listWorktrees()).filter(
      (tree) =>
        tree.id === scope.worktreeId &&
        tree.repoId === repo.id &&
        (tree.hostId === 'local' || (!tree.hostId && !tree.runtimeOwnerEnvironmentId))
    )
    if (trees.length !== 1 || trees[0].isArchived || trees[0].runtimeOwnerEnvironmentId) {
      throw new MaterialScopeError('invalid-scope', '工作树身份不存在、已归档或不唯一')
    }
    const tree = trees[0]
    if (isWslUncPath(tree.path)) {
      throw new MaterialScopeError('unsupported-host', '版本材料目前仅支持本机 Git 项目')
    }
    const root = await realpath(tree.path)
    const gitDir = await resolveGitDir(root)
    const [repoCommon, treeCommon, head] = await Promise.all([
      resolveGitDir(repo.path).then(resolveGitCommonDir).then(realpath),
      resolveGitCommonDir(gitDir).then(realpath),
      readFile(join(gitDir, 'HEAD'), 'utf8')
    ])
    if (repoCommon !== treeCommon) {
      throw new MaterialScopeError('invalid-scope', '工作树不属于所选 Git 项目')
    }
    const branch = scope.workflow === 'plan' ? 'bw/week-plan' : 'bw/week-acceptance'
    if (head.trim() !== `ref: refs/heads/${branch}`) {
      throw new MaterialScopeError('wrong-branch', `请使用 ${branch} 工作树`)
    }
    return root
  }

  async function storeFor(scope: VersionMaterialScope) {
    const root = await authorize(scope)
    return createVersionDocumentStore<VersionMaterial>({
      trustedWorkspacePath: root,
      workflow: scope.workflow,
      decode: (value) =>
        scope.workflow === 'plan'
          ? PlanningMaterialSchema.parse(value)
          : AcceptanceMaterialSchema.parse(value),
      beforeCommit: async () => {
        if ((await authorize(scope)) !== root) {
          throw new MaterialScopeError('invalid-scope', '工作树位置已改变，请重新打开')
        }
      }
    })
  }

  return {
    async list(input: VersionMaterialScope): Promise<VersionMaterialCandidate[]> {
      const scope = VersionMaterialScopeSchema.parse(input)
      const root = await authorize(scope)
      const planningRoot = await resolveVersionPlanningRoot(root)
      let entries
      try {
        entries = await readdir(planningRoot, { withFileTypes: true })
      } catch (error) {
        if (isMissingFile(error)) {
          return []
        }
        throw error
      }
      const store = await storeFor(scope)
      const candidates: VersionMaterialCandidate[] = []
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue
        }
        try {
          validatePlanningVersion(entry.name)
        } catch {
          continue
        }
        try {
          if (await store.read(entry.name)) {
            candidates.push({ version: entry.name, state: 'ready' })
          }
        } catch (error) {
          if (!(error instanceof VersionDocumentError)) {
            throw error
          }
          candidates.push({
            version: entry.name,
            state: error.code === 'migration-required' ? 'migration-required' : 'invalid',
            error: error.message
          })
        }
      }
      return candidates.sort((a, b) => a.version.localeCompare(b.version))
    },
    async read(input: VersionMaterialRead) {
      const request = VersionMaterialReadSchema.parse(input)
      return (await storeFor(request)).read(request.version)
    },
    async save(input: VersionMaterialSave) {
      const request = VersionMaterialSaveSchema.parse(input)
      return (await storeFor(request)).save(request)
    }
  }
}
