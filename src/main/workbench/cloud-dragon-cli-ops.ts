import { commandExecFileAsync } from '../git/command-runner/command-exec-file'
import { extractExecError, isMissingCommandBinaryError } from '../git/exec-error'
import { CLOUDDRAGON_PROJECT_ID } from './cloud-dragon-package-ops'
import { PackagePipelineError, failureText } from './package-pipeline-error'

/**
 * CloudDragon 出包执行面：list/launch 不驱动页面，直接走本机 cloudbuild CLI
 * （cb，CloudDragon 1.0 API 的官方客户端）。流水线名与执行方案名沿用页面链
 * 路的语义：出包 = 按流水线名找 ID，再按 pr_pipeline 方案执行。制品面
 * （latest/download）不在 CLI 能力内，仍在 cloud-dragon-package-ops 的浏览器
 * 会话。cb 凭证自管（cb login，~/.cloudbuild/），与 GitHub 侧的 gh 对称。
 */

const CB_TIMEOUT_MS = 60_000
/** 与页面链路相同的执行方案：出包走 pr_pipeline 方案启动。 */
const PACKAGE_SCHEME_NAME = 'pr_pipeline'

async function runCb(args: string[]): Promise<string> {
  try {
    // --group 是 CLI 根级全局 flag：scheme 子命令没有自己的 --group，靠它
    // 统一限定本项目（CLI 语义的 group_id）；不带时 scheme 调用报
    // "no group_id set"。
    const argv = [...args, '--group', CLOUDDRAGON_PROJECT_ID]
    const { stdout } = await commandExecFileAsync('cb', argv, {
      encoding: 'utf8',
      timeout: CB_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024
    })
    return stdout
  } catch (error) {
    if (isMissingCommandBinaryError(error)) {
      throw new PackagePipelineError(
        'cb-missing',
        '本机没有安装 cloudbuild CLI（cb），无法操作 CloudDragon 流水线；请先安装：npm install -g @hw-cloudbuild/cloudbuild-cli'
      )
    }
    const { stderr, stdout } = extractExecError(error)
    const text = stderr.trim() || stdout.trim()
    if (/Not logged in/i.test(text)) {
      throw new PackagePipelineError('cb-auth', 'cloudbuild CLI 未登录，请先在本机运行 cb login')
    }
    throw new PackagePipelineError(
      'cb-failed',
      `cb 命令执行失败（${args.slice(0, 3).join(' ')}）：${text || failureText(error)}`
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

// CLI 的 -o json 会剔除空值键，字段一律按可缺省处理。
type CloudDragonPipelineList = {
  entity?: { id?: string; pipelineName?: string }[]
}
type CloudDragonSchemeList = {
  entities?: { id?: string; name?: string }[]
}

async function fetchPipelines(): Promise<{ id: string; name: string }[]> {
  // URL 里的 /project/<id>/ 段即 CLI 语义的 group_id，--group 与页面
  // 「当前项目下的流水线」范围一致。
  const raw = await runCb(['pipeline', 'list', '-o', 'json'])
  const parsed = parseJson<CloudDragonPipelineList>(
    raw,
    'cb-parse-failed',
    '读不出 CloudDragon 流水线列表'
  )
  return (parsed.entity ?? [])
    .map((item) => ({ id: item.id ?? '', name: item.pipelineName ?? '' }))
    .filter((item) => item.id && item.name)
}

export async function listCloudDragonPipelines(): Promise<string[]> {
  const pipelines = await fetchPipelines()
  if (pipelines.length === 0) {
    throw new PackagePipelineError('pipeline-list-empty', '当前项目下的流水线列表为空')
  }
  return pipelines.map((item) => item.name)
}

export async function launchCloudDragonPipeline(pipeline: string): Promise<void> {
  const pipelines = await fetchPipelines()
  const target = pipelines.find((item) => item.name === pipeline)
  if (!target) {
    throw new PackagePipelineError('pipeline-not-found', `当前项目下没有找到流水线 ${pipeline}`)
  }
  const schemeRaw = await runCb(['pipeline', 'scheme', 'list', target.id, '-o', 'json'])
  const schemes = parseJson<CloudDragonSchemeList>(
    schemeRaw,
    'cb-parse-failed',
    `读不出流水线 ${pipeline} 的执行方案`
  )
  const scheme = (schemes.entities ?? []).find((item) => item.name === PACKAGE_SCHEME_NAME)
  if (!scheme?.id) {
    throw new PackagePipelineError(
      'scheme-not-found',
      `流水线 ${pipeline} 没有名为 ${PACKAGE_SCHEME_NAME} 的执行方案，无法出包`
    )
  }
  // --yes 跳过 CLI 的交互确认；受理即 exit 0，jobId 不进产品协议。
  await runCb(['pipeline', 'scheme', 'execute', target.id, '--ids', scheme.id, '--yes'])
}
