import { readdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
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
  type VersionMaterialCandidate
} from '../../shared/workbench/version-material-request'
import { resolveGitDir } from '../git/source-control/resolve-git-dir'
import { resolveGitCommonDir } from '../git/source-control/resolve-git-common-dir'
import { MaterialScopeError } from './version-material-error'
import { resolveWorktreeHostPath } from '../../shared/git-metadata-path'
import { createVersionDocumentStore } from './version-document-store'
import { isMissingFile, resolveVersionPlanningRoot } from './version-document-path'

/** Runs on the filesystem owner; paths come from the authenticated native inventory adapter. */
export type VersionMaterialWorkspace = { repoPath: string; worktreePath: string }

export function createVersionMaterialWorkspace(
  target: VersionMaterialWorkspace,
  reauthorize?: () => Promise<void>
) {
  async function authorize(scope: VersionMaterialScope): Promise<string> {
    await reauthorize?.()
    const root = await realpath(resolveWorktreeHostPath(target.worktreePath) ?? target.worktreePath)
    const gitDir = await resolveGitDir(root)
    const [repoCommon, treeCommon, head] = await Promise.all([
      resolveGitDir(target.repoPath).then(resolveGitCommonDir).then(realpath),
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
