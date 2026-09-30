import { normalizeCloneUrl, parseProjectToml, PROJECT_TOML_REL } from '../../shared/workbench/project-charter'
import { parseCodeHubRemote } from '../../shared/codehub'
import type { CharterProbeRequest, CharterRemoteProbe } from '../../shared/workbench/charter'
import { acquire, extractExecError, ghExecFileAsync, release } from '../github/gh-utils'
import { parseGitHubRemoteIdentity } from '../github/github-remote-identity-parsing'
import { githubHostExecOptions } from '../github/github-repository-host'
import { fetchCodeHubRepoFileRaw, probeCodeHubProject } from '../codehub/repo-reads'

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
    const read = await fetchCodeHubRepoFileRaw({
      remote: codehubRemote,
      filePath: PROJECT_TOML_REL,
      ref: 'main'
    })
    if (read.kind === 'content') {
      return { kind: 'adopted', charter: parseProjectToml(read.content) }
    }
    if (read.kind === 'ref-missing') {
      return {
        kind: 'failed',
        error: '远端 main 分支不存在(默认分支可能是别的名字),接入前没查成;克隆后仍以已有名片为准只补空字段'
      }
    }
    if (read.kind === 'failed') {
      return { kind: 'failed', error: read.error }
    }
    const probe = await probeCodeHubProject({ remote: codehubRemote })
    return probe.exists
      ? { kind: 'absent' }
      : { kind: 'no-repo', error: probe.error ?? '仓库不存在或没有权限' }
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
