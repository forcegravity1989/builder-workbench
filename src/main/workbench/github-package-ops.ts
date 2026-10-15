import { stat } from 'node:fs/promises'
import path from 'node:path'
import { ghExecFileAsync } from '../git/runner'
import type {
  PackageDownloadReceipt,
  PackageLatest
} from '../../shared/workbench/package-pipeline'
import { PackagePipelineError, failureText } from './package-pipeline-error'

/**
 * GitHub 出包：不驱动页面，直接走本机 gh CLI。流水线是仓里文件名为
 * `bw-package*` 的 Actions workflow（该前缀即识别规则）；出包即 workflow_dispatch；
 * 最新包是仓里最新的 release；下载取该 release 的安装包本体。与 CloudDragon
 * 侧共用同一份出包协议，界面无需区分宿主。
 */

/** 识别规则：workflow 文件名以该前缀开头即为本仓的出包流水线。 */
const PACKAGE_WORKFLOW_PREFIX = 'bw-package'
const GH_TIMEOUT_MS = 60_000
const DOWNLOAD_TIMEOUT_MS = 300_000

/** 更新器元数据（latest.yml / blockmap / 清单）不算制品包，不进列表也不下载。 */
const UPDATE_METADATA = /(\.ya?ml|\.blockmap|\.json)$/i
const INSTALLER_BODY = /\.(exe|msi|dmg|pkg|appimage|deb|rpm|zip|7z|tar\.gz)$/i

export type GitHubRepo = { owner: string; repo: string }

type GhContext = {
  repo: GitHubRepo
  /** gh 需要 repo 的宿主（GHES 企业版）；默认 github.com。 */
  host?: string
  cwd: string
  wslDistro?: string
}

function slug(repo: GitHubRepo): string {
  return `${repo.owner}/${repo.repo}`
}

async function runGh(
  context: GhContext,
  args: string[],
  timeout = GH_TIMEOUT_MS
): Promise<string> {
  try {
    const { stdout } = await ghExecFileAsync(args, {
      cwd: context.cwd,
      host: context.host,
      wslDistro: context.wslDistro,
      timeout
    })
    return stdout
  } catch (error) {
    throw new PackagePipelineError(
      'gh-failed',
      `gh 命令执行失败（${args.slice(0, 3).join(' ')}）：${failureText(error)}`
    )
  }
}

function parseJson<T>(raw: string, code: string, message: string): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new PackagePipelineError(code, message)
  }
}

type WorkflowList = { workflows?: { name?: string; path?: string; state?: string }[] }

function isPackageWorkflowPath(workflowPath: string | undefined): boolean {
  const file = (workflowPath ?? '').split('/').pop() ?? ''
  return file.toLowerCase().startsWith(PACKAGE_WORKFLOW_PREFIX)
}

export async function listGitHubPipelines(context: GhContext): Promise<string[]> {
  const raw = await runGh(context, [
    'api',
    `repos/${slug(context.repo)}/actions/workflows?per_page=100`
  ])
  const parsed = parseJson<WorkflowList>(raw, 'gh-parse-failed', '读不出 GitHub workflow 列表')
  const names = (parsed.workflows ?? [])
    .filter((workflow) => isPackageWorkflowPath(workflow.path))
    .filter((workflow) => workflow.state !== 'disabled_manually')
    .map((workflow) => workflow.name ?? '')
    .filter(Boolean)
  if (names.length === 0) {
    throw new PackagePipelineError(
      'pipeline-list-empty',
      `这个项目里没有出包流水线（缺少文件名为 ${PACKAGE_WORKFLOW_PREFIX}*.yml 的 workflow）`
    )
  }
  return names
}

export async function launchGitHubPipeline(
  context: GhContext,
  pipeline: string,
  ref: string
): Promise<void> {
  await runGh(context, ['workflow', 'run', pipeline, '--ref', ref, '--repo', slug(context.repo)])
}

type ReleaseList = {
  tag_name?: string
  name?: string
  created_at?: string
  published_at?: string
  prerelease?: boolean
  assets?: { name?: string }[]
}[]

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  const pad = (part: number): string => String(part).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** 安装包本体名列表：排除更新器元数据（latest.yml / blockmap）。 */
function installerAssets(assets: { name?: string }[] | undefined): string[] {
  return (assets ?? [])
    .map((asset) => asset.name ?? '')
    .filter((name) => name && !UPDATE_METADATA.test(name) && INSTALLER_BODY.test(name))
}

async function fetchReleases(context: GhContext): Promise<ReleaseList> {
  // Why 列表端点而非 /releases/latest：latest 端点跳过预发布，而 dev/RC 通道
  // 的包全是预发布，用它永远读不到。
  const raw = await runGh(context, ['api', `repos/${slug(context.repo)}/releases?per_page=1`])
  return parseJson<ReleaseList>(raw, 'gh-parse-failed', '读不出 GitHub release 列表')
}

export async function readGitHubLatest(context: GhContext): Promise<PackageLatest | null> {
  const releases = await fetchReleases(context)
  const release = releases[0]
  if (!release?.tag_name) {
    return null
  }
  return {
    project: slug(context.repo),
    version: release.tag_name,
    created: formatTimestamp(release.created_at ?? release.published_at),
    files: installerAssets(release.assets)
  }
}

export async function downloadGitHubPackage(
  context: GhContext,
  directory: string
): Promise<PackageDownloadReceipt> {
  const releases = await fetchReleases(context)
  const release = releases[0]
  if (!release?.tag_name) {
    throw new PackagePipelineError('version-not-found', `项目 ${slug(context.repo)} 还没有制品包`)
  }
  const [asset] = installerAssets(release.assets)
  if (!asset) {
    throw new PackagePipelineError(
      'version-not-found',
      `最新制品包 ${release.tag_name} 里没有可下载的安装包`
    )
  }
  await runGh(
    context,
    [
      'release',
      'download',
      release.tag_name,
      '--pattern',
      asset,
      '--dir',
      directory,
      '--repo',
      slug(context.repo),
      '--clobber'
    ],
    DOWNLOAD_TIMEOUT_MS
  )
  const file = path.join(directory, asset)
  return { file, bytes: (await stat(file)).size }
}
