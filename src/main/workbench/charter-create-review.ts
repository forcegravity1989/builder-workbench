import { isCodeHubGitRemote, parseCodeHubRemote } from '../../shared/codehub'
import type { GitRemoteIdentity } from '../../shared/git-remote-identity'
import { CHARTER_BRANCH } from '../../shared/workbench/project-charter'
import type { CharterSubmitOutcome } from '../../shared/workbench/charter'
import { createGitHubPullRequest } from '../github/client/create/create-github-pull-request'
import { createCodeHubMr } from '../codehub/mr-creation'
import { runTrunkBaseline } from './trunk-baseline'
import { execMessage, oneLine } from './charter-remote-probe'
import type { WorkbenchWorkspaceRepo } from './workspace-resolver'
import type { ExecutionHostId } from '../../shared/execution-host'
/** main v0.4 正本的 PR 正文;接入首建与编辑分别对应 create_project / edit_project_card。 */
const FIRST_CHARTER_BODY =
  '第一次接入写下的项目名片。合入之后这个仓就被管过了。\n\n这些件全是 Workbench 自己写的,没有起 agent。开工工具跟人走本机,不进仓。'
const EDIT_CHARTER_BODY = '项目信息改动,等人评审合入。'

export async function createCharterReview({
  repo,
  executionHostId,
  identity,
  execOptions,
  firstTime,
  treePath,
  filled
}: {
  repo: WorkbenchWorkspaceRepo
  executionHostId: ExecutionHostId
  identity: GitRemoteIdentity
  execOptions: { wslDistro?: string }
  firstTime: boolean
  treePath: string
  filled: string[]
}): Promise<CharterSubmitOutcome> {
  const body = firstTime ? FIRST_CHARTER_BODY : EDIT_CHARTER_BODY
  const title = firstTime ? '项目约定' : '项目信息改动'
  // PR/MR 目标分支统一走主干基线解析：钉值或主检出当前分支；解析不出如实
  // 失败，不猜名、不设兜底分支。
  let targetBranch = ''
  try {
    const baseline = await runTrunkBaseline(repo.path, repo.worktreeBaseRef ?? null, execOptions)
    if (!baseline.sync) {
      throw new Error(`基线 ${baseline.ref} 不是一条可推送的分支`)
    }
    targetBranch = baseline.sync.branchName
  } catch (e) {
    return {
      mode: 'failed',
      stage: 'pr',
      error: `定不下 PR 目标分支：${execMessage(e)} —— 分支已推到 ${CHARTER_BRANCH},可手动开`,
      filled
    }
  }
  if (isCodeHubGitRemote(identity)) {
    const remote = parseCodeHubRemote(identity.remoteUrl)
    if (!remote) {
      return {
        mode: 'failed',
        stage: 'pr',
        error: `认不出 CodeHub 远端(${identity.remoteUrl}),分支已推到 ${CHARTER_BRANCH},可手动开 MR`,
        filled
      }
    }
    try {
      const created = await createCodeHubMr({
        remote,
        execOptions,
        sourceBranch: CHARTER_BRANCH,
        targetBranch,
        title,
        description: body
      })
      return {
        mode: 'pr',
        pr: {
          provider: 'codehub',
          number: created.iid,
          url: created.url,
          adopted: created.adopted
        },
        filled
      }
    } catch (e) {
      return {
        mode: 'failed',
        stage: 'pr',
        error: `开 MR 没成：${execMessage(e)} —— 分支已推到 ${CHARTER_BRANCH},可手动开`,
        filled
      }
    }
  }
  const result = await createGitHubPullRequest(
    treePath,
    { provider: 'github', base: targetBranch, head: CHARTER_BRANCH, title, body, draft: false },
    executionHostId,
    { localGitExecOptions: execOptions }
  )
  if (result.ok) {
    return {
      mode: 'pr',
      pr: { provider: 'github', number: result.number, url: result.url, adopted: false },
      filled
    }
  }
  if (result.existingReview && typeof result.existingReview.number === 'number') {
    return {
      mode: 'pr',
      pr: {
        provider: 'github',
        number: result.existingReview.number,
        url: result.existingReview.url,
        adopted: true
      },
      filled
    }
  }
  return {
    mode: 'failed',
    stage: 'pr',
    error: `开 PR 没成：${oneLine(result.error)} —— 分支已推到 ${CHARTER_BRANCH},可手动开`,
    filled
  }
}
