import type { CodeHubRemote } from '../../shared/codehub'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'
import { projectArgs } from './mutations'

/**
 * 远端仓库只读探测：raw 读单文件与项目存在性。
 * 错误分类按 main 正本（codehub.rs fetch_project_toml / probe_repo）：
 * 「文件不存在」≠「分支不存在」≠「命令失败」,调用方据此区分
 * 「没接管过」与「没查成」,绝不混同。
 */
export type CodeHubFileRead =
  | { kind: 'content'; content: string }
  /** 仓库可读但该文件不存在。 */
  | { kind: 'absent' }
  /** 分支/ref 不存在（默认分支名不匹配等）。 */
  | { kind: 'ref-missing' }
  /** 其他失败：CLI 缺失、未登录、网络、无权限。 */
  | { kind: 'failed'; error: string }

export type CodeHubProjectView =
  | { kind: 'available'; defaultBranch: string | null }
  /** 项目明确不存在；权限、登录、网络和超时不能落到这个结果。 */
  | { kind: 'no-repo'; error: string }
  /** 查询没有完成，调用方应向用户呈现失败原因。 */
  | { kind: 'failed'; error: string }

/**
 * `--jq` 输出是 JSON 编码值（如 `'"master"'`）；带引号直接当 `--ref` 会 404 Commit Not Found，
 * 必须剥掉编码才是可用的分支名。
 */
function parseJqString(text: string): string | null {
  if (!text || text === 'null') {
    return null
  }
  try {
    const parsed = JSON.parse(text) as unknown
    return typeof parsed === 'string' ? parsed.trim() : null
  } catch {
    return text.trim()
  }
}

function projectViewError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isJqUnsupportedError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('--jq') &&
    (lower.includes('unknown flag') ||
      lower.includes('unknown option') ||
      lower.includes('unrecognized option') ||
      lower.includes('invalid option'))
  )
}

function classifyProjectViewError(message: string): 'no-repo' | 'failed' {
  const lower = message.toLowerCase()
  if (
    /\b404\b/.test(lower) ||
    lower.includes('project not found') ||
    lower.includes('repository not found') ||
    lower.includes('no such project') ||
    lower.includes('project does not exist')
  ) {
    return 'no-repo'
  }
  return 'failed'
}

export async function fetchCodeHubRepoFileRaw(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  filePath: string
  ref: string
}): Promise<CodeHubFileRead> {
  // -H 是全局位,按 main 正本放在 repo 子命令之前。
  const cliArgs = [
    '-H',
    args.remote.host.replace(/:\d+$/, ''),
    'repo',
    'file',
    'raw',
    '-p',
    args.remote.project,
    '--file-path',
    args.filePath,
    '--ref',
    args.ref,
    '--no-cache'
  ]
  try {
    const stdout = await runCodeHubCli(cliArgs, args.execOptions)
    return { kind: 'content', content: stdout.trim() }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const lower = message.toLowerCase()
    if (
      lower.includes('branch not found') ||
      lower.includes('ref not found') ||
      // ref 解析不到 commit 也是「分支读不到」，不能混同「仓里没有该文件」。
      lower.includes('commit not found')
    ) {
      return { kind: 'ref-missing' }
    }
    if (lower.includes('404') || lower.includes('not found') || lower.includes('does not exist')) {
      return { kind: 'absent' }
    }
    return { kind: 'failed', error: message }
  }
}

/** 项目是否存在且可读,顺带取默认分支(main 正本 project_default_branch 对等)。 */
export async function viewCodeHubProject(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
}): Promise<CodeHubProjectView> {
  try {
    const stdout = await runCodeHubCli(
      ['project', 'view', ...projectArgs(args.remote), '--jq', '.default_branch'],
      args.execOptions
    )
    return { kind: 'available', defaultBranch: parseJqString(stdout.trim()) }
  } catch (first) {
    const firstMessage = projectViewError(first)
    // 只有 CLI 明确不支持 --jq 才退回裸 project view；权限、网络等失败不能被
    // 第二次调用的结果覆盖，否则可能把一次失败误报成「项目不存在」。
    if (!isJqUnsupportedError(firstMessage)) {
      return { kind: classifyProjectViewError(firstMessage), error: firstMessage }
    }
    try {
      await runCodeHubCli(['project', 'view', ...projectArgs(args.remote)], args.execOptions)
      return { kind: 'available', defaultBranch: null }
    } catch (second) {
      const message = projectViewError(second) || firstMessage
      return { kind: classifyProjectViewError(message), error: message }
    }
  }
}
