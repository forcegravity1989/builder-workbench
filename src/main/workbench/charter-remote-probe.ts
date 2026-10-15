import { readFile } from 'node:fs/promises'
import {
  normalizeCloneUrl,
  parseProjectToml,
  PROJECT_TOML_REL,
  type ProjectCharter
} from '../../shared/workbench/project-charter'
import type {
  CharterIntent,
  CharterProbeRequest,
  CharterRemoteProbe
} from '../../shared/workbench/charter'
import { parseCodeHubRemote } from '../../shared/codehub'
import { acquire, extractExecError, ghExecFileAsync, release } from '../github/gh-utils'
import { parseGitHubRemoteIdentity } from '../github/github-remote-identity-parsing'
import { githubHostExecOptions } from '../github/github-repository-host'
import { fetchCodeHubRepoFileRaw, viewCodeHubProject } from '../codehub/repo-reads'

export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function execMessage(e: unknown): string {
  if (e instanceof Error) {
    const { stderr, stdout } = extractExecError(e)
    return oneLine(stderr || stdout || e.message)
  }
  return oneLine(String(e))
}

/**
 * 克隆前远端名片预读(main fetch_project_toml 对等实现):
 * GitHub 走 gh api raw 读默认分支,CodeHub 走 codehub-cli repo file raw。
 * 「文件不存在」与「仓不存在/没权限」「分支不对」「CLI/登录/网络失败」分开回答。
 */
export async function probeRemoteCharter(params: CharterProbeRequest): Promise<CharterRemoteProbe> {
  const normalized = normalizeCloneUrl(params.url)
  if (!normalized) {
    return { kind: 'failed', error: '远端地址为空' }
  }
  const codehubRemote = parseCodeHubRemote(normalized)
  if (codehubRemote) {
    // 先解默认分支(内源仓多为 master;main 正本 project_default_branch),兼作存在性探测。
    const view = await viewCodeHubProject({ remote: codehubRemote })
    if (view.kind === 'failed') {
      return { kind: 'failed', error: view.error }
    }
    if (view.kind === 'no-repo') {
      return { kind: 'no-repo', error: view.error }
    }
    const ref = view.defaultBranch || 'main'
    const read = await fetchCodeHubRepoFileRaw({
      remote: codehubRemote,
      filePath: PROJECT_TOML_REL,
      ref
    })
    if (read.kind === 'content') {
      return { kind: 'adopted', charter: parseProjectToml(read.content) }
    }
    if (read.kind === 'ref-missing') {
      return {
        kind: 'failed',
        error: `远端 ${ref} 分支读不到(默认分支可能另有其名),接入前没查成;克隆后仍以已有名片为准只补空字段`
      }
    }
    if (read.kind === 'failed') {
      return { kind: 'failed', error: read.error }
    }
    return { kind: 'absent' }
  }
  const ghIdentity = parseGitHubRemoteIdentity(normalized)
  if (!ghIdentity) {
    return {
      kind: 'failed',
      error: '这个地址不是 GitHub / CodeHub 远端,接入前读不了名片;克隆后以已有名片为准只补空字段'
    }
  }
  const slug = `${ghIdentity.owner}/${ghIdentity.repo}`
  const ghOptions = githubHostExecOptions({
    owner: ghIdentity.owner,
    repo: ghIdentity.repo,
    ...(ghIdentity.host && ghIdentity.host !== 'github.com' ? { host: ghIdentity.host } : {})
  })
  await acquire()
  try {
    // 先拿默认分支(兼作仓库存在性证据);拿不到按 main 试读,读不到再分类。
    let ref = 'main'
    let repoReadable = false
    let repoError = ''
    try {
      const { stdout } = await ghExecFileAsync(
        ['repo', 'view', slug, '--json', 'defaultBranchRef,nameWithOwner'],
        { ...ghOptions, timeout: 30_000 }
      )
      const parsed = JSON.parse(stdout) as { defaultBranchRef?: { name?: string } | null }
      ref = parsed.defaultBranchRef?.name?.trim() || 'main'
      repoReadable = true
    } catch (e) {
      repoError = execMessage(e)
    }
    try {
      const { stdout } = await ghExecFileAsync(
        [
          'api',
          '-H',
          'Accept: application/vnd.github.raw',
          `repos/${slug}/contents/${PROJECT_TOML_REL}?ref=${encodeURIComponent(ref)}`
        ],
        { ...ghOptions, timeout: 30_000 }
      )
      return { kind: 'adopted', charter: parseProjectToml(stdout.trim()) }
    } catch (e) {
      const message = execMessage(e)
      const lower = message.toLowerCase()
      if (lower.includes('404') || lower.includes('not found')) {
        if (repoReadable) {
          return { kind: 'absent' }
        }
        return { kind: 'no-repo', error: repoError || message }
      }
      if (lower.includes('no commit found for the ref')) {
        return { kind: 'failed', error: `默认分支 ${ref} 上读不到名片：${message}` }
      }
      return { kind: 'failed', error: message }
    }
  } finally {
    release()
  }
}

export function trimmedIntent(intent: CharterIntent): ProjectCharter {
  return {
    name: intent.name.trim(),
    kind: intent.kind.trim(),
    brief: intent.brief.trim(),
    benchmark: intent.benchmark.trim(),
    opportunity: intent.opportunity.trim()
  }
}

export async function readTextFileGuarded(
  filePath: string
): Promise<{ raw: string | null; error: string | null }> {
  try {
    const buffer = await readFile(filePath)
    if (buffer.includes(0)) {
      return { raw: null, error: '名片不是文本文件,未覆盖' }
    }
    return { raw: buffer.toString('utf8'), error: null }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') {
      return { raw: null, error: null }
    }
    return { raw: null, error: `名片不可读,未覆盖：${execMessage(e)}` }
  }
}
