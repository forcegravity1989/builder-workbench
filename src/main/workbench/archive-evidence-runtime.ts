import { parseWslPath } from '../wsl'
import {
  getOwnerRepo,
  ghExecFileAsync,
  ghRepoExecOptions,
  githubRepoContext,
  type OwnerRepo
} from '../github/gh-utils'
import { githubHostExecOptions } from '../github/github-api-repository'
import { noteRepositoryRateLimitSpend, repositoryRateLimitGuard } from '../github/rate-limit'
import { githubRepoIdentityKey } from '../../shared/github/repository-identity-key'
import { SourceCommit } from '../../shared/workbench/version-material'
import { createArchiveEvidenceReader } from './archive-evidence'
import type { WorkbenchWorkspaceRepo } from './workspace-resolver'

export type ArchiveMaterialReader = (commit: string, path: string) => Promise<Buffer | null>

type PullEntry = { number?: unknown; state?: unknown }
type RestPull = { state?: unknown; merged_at?: unknown; merge_commit_sha?: unknown }

/**
 * GitHub archive evidence for one registered repo, built only from documented
 * provider returns: commits/{oid}/pulls for the commit→PR association and
 * pulls/{n} for merged_at plus merge_commit_sha. Repos without a resolvable
 * GitHub identity (including CodeHub) get no reader — their archive state stays
 * an honest Unknown instead of a guessed CLI shape.
 */
export async function createNativeArchiveEvidence(
  repo: WorkbenchWorkspaceRepo,
  readMaterialAt: ArchiveMaterialReader
): Promise<{
  ownerRepo: OwnerRepo
  reader: ReturnType<typeof createArchiveEvidenceReader>
} | null> {
  const wslDistro = repo.connectionId ? undefined : parseWslPath(repo.path)?.distro
  const localGitOptions = wslDistro ? { wslDistro } : {}
  const ownerRepo = await getOwnerRepo(repo.path, repo.connectionId, localGitOptions)
  if (!ownerRepo) {
    return null
  }
  const ghOptions = {
    ...ghRepoExecOptions(githubRepoContext(repo.path, repo.connectionId, localGitOptions)),
    ...githubHostExecOptions(ownerRepo)
  }
  const api = async (path: string): Promise<unknown> => {
    if (repositoryRateLimitGuard(ownerRepo, 'core', ghOptions).blocked) {
      throw new Error('GitHub 速率限制中，归档来源暂不可核对')
    }
    noteRepositoryRateLimitSpend(ownerRepo, 'core', 1, ghOptions)
    const { stdout } = await ghExecFileAsync(['api', path], ghOptions)
    return JSON.parse(stdout)
  }
  const slug = `repos/${ownerRepo.owner}/${ownerRepo.repo}`
  return {
    ownerRepo,
    reader: createArchiveEvidenceReader(githubRepoIdentityKey(ownerRepo), {
      async listPullsForCommit(commit) {
        const parsed = await api(`${slug}/commits/${commit}/pulls?per_page=100`)
        if (!Array.isArray(parsed)) {
          throw new Error('provider 返回了意外的提交关联形状')
        }
        return parsed
          .filter((entry): entry is PullEntry => typeof entry === 'object' && entry !== null)
          .filter((entry) => typeof entry.number === 'number')
          .map((entry) => ({
            number: entry.number as number,
            ...(typeof entry.state === 'string' ? { state: entry.state } : {})
          }))
      },
      async readPullMergeFacts(number) {
        const parsed = (await api(`${slug}/pulls/${number}`)) as RestPull
        const merged = typeof parsed.merged_at === 'string' && parsed.merged_at.length > 0
        const mergeCommit =
          typeof parsed.merge_commit_sha === 'string' ? parsed.merge_commit_sha : null
        if (merged && mergeCommit) {
          SourceCommit.parse(mergeCommit)
        }
        return {
          state: typeof parsed.state === 'string' ? parsed.state : '',
          merged,
          mergeCommit: merged ? mergeCommit : null
        }
      },
      readMaterialAt
    })
  }
}
