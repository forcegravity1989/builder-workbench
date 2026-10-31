import {
  assertCodeHubDetailIdentity,
  parseCodeHubRemote,
  codeHubMergeRequestUrl,
  type CodeHubRemote
} from '../../shared/codehub'
import type { CodeHubTaskDetail } from '../../shared/codehub-tasks'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { parseJson, projectArgs, viewCodeHubTask } from './mutations'
import { resolveCodeHubWebIdentity } from './web-identity'

/** Compares a recorded provider reference to the registered remote. */
export function codeHubRepositoryMatches(repository: string, remote: CodeHubRemote): boolean {
  const recorded = repository
    .trim()
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()
  const remoteIdentity = `${remote.host}/${remote.project}`.toLowerCase()
  if (recorded === remoteIdentity || recorded === remote.project.toLowerCase()) {
    return true
  }
  const parsed = parseCodeHubRemote(repository)
  return (
    parsed !== null &&
    (parsed.host === remote.host || parsed.host === remote.webHost) &&
    parsed.project.toLowerCase() === remote.project.toLowerCase()
  )
}

export function mapCodeHubArchiveState(
  detail: Pick<CodeHubTaskDetail, 'state'>
): 'merged' | 'closed' | 'open' | null {
  const state = detail.state.trim().toLowerCase()
  if (state === 'merged' || state === 'closed') {
    return state
  }
  return state === 'open' || state === 'opened' ? 'open' : null
}

const PAGE_SIZE = 100
const MAX_PAGES = 100

type BranchReviewArgs = {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  sourceBranch: string
  targetBranch: string
  currentHeadOid?: string | null
  states?: readonly ('opened' | 'merged' | 'closed')[]
}

export type CodeHubBranchReview = {
  number: number
  url: string
  state: 'open' | 'merged' | 'closed'
  confirmedContainedHeadOid?: string
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('CodeHub MR 返回了意外的数据形状')
  }
  return value as Record<string, unknown>
}

function projectMatches(url: unknown, remote: CodeHubRemote): boolean {
  // Native project web_url is canonical; clone URLs may use a different transport host.
  if (typeof url !== 'string' || !parseCodeHubRemote(url)) {
    throw new Error('CodeHub MR 未提供可核对的项目来源')
  }
  return codeHubRepositoryMatches(url, remote)
}

function pageRecords(stdout: string, description: string): unknown[] {
  const value = parseJson(stdout)
  if (value === null && stdout.trim() === 'null') {
    return []
  }
  if (!Array.isArray(value) || value.length > PAGE_SIZE) {
    throw new Error(`CodeHub MR ${description}分页格式无效`)
  }
  return value
}

async function mrContainsCommit(args: BranchReviewArgs, iid: number): Promise<boolean> {
  const seen = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const parsed = pageRecords(
      await runCodeHubCli(
        [
          'mr',
          'commits',
          String(iid),
          ...projectArgs(args.remote),
          '-f',
          'json',
          '--limit',
          String(PAGE_SIZE),
          '--offset',
          String(page * PAGE_SIZE)
        ],
        args.execOptions
      ),
      '提交列表'
    )
    let contained = false
    for (const value of parsed) {
      const id = objectRecord(value).id
      if (typeof id !== 'string' || !/^[a-f0-9]{40}$/i.test(id) || seen.has(id)) {
        throw new Error('CodeHub MR 提交列表的 SHA 或分页不可核对')
      }
      seen.add(id)
      contained ||= id === args.currentHeadOid
    }
    if (contained) {
      return true
    }
    if (parsed.length < PAGE_SIZE) {
      return false
    }
  }
  throw new Error('CodeHub MR 提交列表超出可核对的分页范围')
}

/** A merged review belongs to this material revision only when its own commits contain it. */
export async function readCodeHubBranchReview(
  args: BranchReviewArgs
): Promise<CodeHubBranchReview | null> {
  if (!args.sourceBranch || !args.targetBranch) {
    throw new Error('CodeHub MR 来源和目标分支不能为空')
  }
  let remote = args.remote
  for (const state of args.states ?? ['opened', 'merged', 'closed']) {
    if (state === 'merged' && !args.currentHeadOid) {
      continue
    }
    const seen = new Set<number>()
    for (let page = 0; page < MAX_PAGES; page++) {
      const parsed = pageRecords(
        await runCodeHubCli(
          [
            'mr',
            'list',
            ...projectArgs(args.remote),
            '-f',
            'json',
            '--source-branch',
            args.sourceBranch,
            '--target-branch',
            args.targetBranch,
            '--state',
            state,
            '--limit',
            String(PAGE_SIZE),
            '--offset',
            String(page * PAGE_SIZE)
          ],
          args.execOptions
        ),
        '列表'
      )
      for (const value of parsed) {
        const row = objectRecord(value)
        const iid = Number(row.iid)
        if (!Number.isSafeInteger(iid) || iid <= 0 || seen.has(iid)) {
          throw new Error('CodeHub MR 列表的编号或分页不可核对')
        }
        seen.add(iid)
        if (typeof row.web_url !== 'string' || !row.web_url.trim()) {
          throw new Error('CodeHub MR 列表缺少可核对的来源链接')
        }
        remote = await resolveCodeHubWebIdentity(remote, row.web_url, args.execOptions)
        assertCodeHubDetailIdentity({ remote, kind: 'mr', iid }, row.iid, row.web_url)
        if (row.source_branch !== args.sourceBranch || row.target_branch !== args.targetBranch) {
          continue
        }
        const sourceUrl = objectRecord(row.source_project).web_url
        const targetUrl = objectRecord(row.target_project).web_url
        // List projections may omit web_url; the full detail below must prove both projects.
        if (
          (sourceUrl != null && !projectMatches(sourceUrl, remote)) ||
          (targetUrl != null && !projectMatches(targetUrl, remote))
        ) {
          continue
        }
        const detail = await viewCodeHubTask({ ...args, remote, kind: 'mr', iid })
        if (!detail.url?.trim()) {
          throw new Error('CodeHub MR 详情缺少可核对的来源链接')
        }
        if (
          !projectMatches(detail.sourceProjectUrl, remote) ||
          !projectMatches(detail.targetProjectUrl, remote)
        ) {
          continue
        }
        const reviewState = mapCodeHubArchiveState(detail)
        if (
          !reviewState ||
          reviewState !== (state === 'opened' ? 'open' : state) ||
          detail.sourceBranch !== args.sourceBranch ||
          detail.targetBranch !== args.targetBranch
        ) {
          throw new Error('CodeHub MR 状态或分支与列表不一致')
        }
        if (reviewState === 'merged' && !(await mrContainsCommit(args, iid))) {
          continue
        }
        return {
          number: iid,
          url: codeHubMergeRequestUrl(args.remote, iid, detail.url ?? undefined),
          state: reviewState,
          ...(reviewState === 'merged' ? { confirmedContainedHeadOid: args.currentHeadOid! } : {})
        }
      }
      if (parsed.length < PAGE_SIZE) {
        break
      }
      if (page === MAX_PAGES - 1) {
        throw new Error('CodeHub MR 列表超出可核对的分页范围')
      }
    }
  }
  return null
}
