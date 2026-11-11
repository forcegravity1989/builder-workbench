import {
  execCommandInWslOrThrow,
  execLocalPreflightCommandOrThrow,
  shellQuote
} from '../../ipc/preflight-command-exec'
import { toLinuxPath } from '../../../shared/wsl-paths'
import { WORKBENCH_REPORT_FOLDER_NAME } from './welink-report-config'

export type WelinkRoute = {
  /** Set when welink-cli was probed inside a WSL distro; absent = local host exec. */
  readonly wslDistro?: string
}

export type WelinkFailureCategory =
  | 'not-installed'
  | 'auth'
  | 'config'
  | 'rate-limit'
  | 'network'
  | 'file'
  | 'unknown'

const CATEGORY_MESSAGES: Record<WelinkFailureCategory, string> = {
  'not-installed': '未检测到 welink-cli,无法发送;请在 设置 → 集成 安装后重试。',
  auth: 'welink-cli 未登录或登录已过期;请运行 welink-cli auth login 后重试。',
  config: 'WeLink 群空间 ID 配置无效(空间不存在或无权限);请联系 BW 管理员核对上报群空间。',
  'rate-limit': 'WeLink 接口限流,请稍后重试。',
  network: '无法访问 WeLink 内网接口(上报仅内网可达);请检查网络后重试。',
  file: '读取待上传文件失败,请重试。',
  unknown: '发送失败(未识别原因),请稍后重试;仍失败请联系 BW 管理员。'
}

/** Message is user-facing (category copy); detail is for span causes only. */
export class WelinkReportError extends Error {
  readonly category: WelinkFailureCategory
  readonly detail: string
  constructor(category: WelinkFailureCategory, detail: string) {
    super(CATEGORY_MESSAGES[category])
    this.name = 'WelinkReportError'
    this.category = category
    this.detail = detail.slice(-400)
  }
}

// Uploads need a longer deadline than command discovery.
const WELINK_UPLOAD_TIMEOUT_MS = 90_000
const WELINK_METADATA_TIMEOUT_MS = 30_000
const RATE_LIMIT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function classifyWelinkErrorText(text: string): WelinkFailureCategory {
  // Order matters: 429 bodies can embed endpoint URLs; NoSuchUser must stay a
  // config verdict even though it arrives as an auth-shaped 404 body.
  if (/status 429|Frequency Control/i.test(text)) {
    return 'rate-limit'
  }
  if (/This user does not exist|NoSuchUser/i.test(text)) {
    return 'config'
  }
  if (/Cannot open file/i.test(text)) {
    return 'file'
  }
  if (/not authenticated|auth login|EXPIRED|invalid token|token is empty|\b401\b/i.test(text)) {
    return 'auth'
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|socket hang up|Timed out running|open\.inner\.welink/i.test(
      text
    )
  ) {
    return 'network'
  }
  return 'unknown'
}

function errorOutput(error: unknown): string {
  const stdout = (error as { stdout?: string }).stdout ?? ''
  const stderr = (error as { stderr?: string }).stderr ?? ''
  const message = error instanceof Error ? error.message : String(error)
  return `${message}\n${stdout}\n${stderr}`
}

function toWelinkReportError(error: unknown): WelinkReportError {
  if (error instanceof WelinkReportError) {
    return error
  }
  // spawn ENOENT = the CLI itself is missing (shim resolution found nothing).
  if ((error as { code?: string }).code === 'ENOENT') {
    return new WelinkReportError('not-installed', errorOutput(error))
  }
  return new WelinkReportError(classifyWelinkErrorText(errorOutput(error)), errorOutput(error))
}

async function runWelinkCli(
  route: WelinkRoute,
  args: string[],
  timeoutMs: number
): Promise<{ stdout: string; stderr: string }> {
  try {
    if (route.wslDistro) {
      const command = ['welink-cli', ...args].map((part) => shellQuote(part)).join(' ')
      return await execCommandInWslOrThrow({ distro: route.wslDistro }, command, timeoutMs)
    }
    return await execLocalPreflightCommandOrThrow('welink-cli', args, timeoutMs)
  } catch (error) {
    throw toWelinkReportError(error)
  }
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const retryable =
        error instanceof WelinkReportError &&
        error.category === 'rate-limit' &&
        attempt < RATE_LIMIT_RETRY_DELAYS_MS.length
      if (!retryable) {
        throw error
      }
      await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt])
    }
  }
}

/** Parse the trailing `File ID: <id>` line of `onebox file-upload` (text-only output). */
export function parseUploadedFileId(stdout: string): string | null {
  const match = stdout.match(/^File ID:\s*([A-Za-z0-9_-]{1,64})\s*$/m)
  return match ? match[1] : null
}

/** Tolerant single-object JSON parse: folder ops print JSON, possibly after progress lines. */
export function parseFirstJsonObject(stdout: string): Record<string, unknown> | null {
  const start = stdout.indexOf('{')
  const end = stdout.lastIndexOf('}')
  if (start === -1 || end <= start) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start, end + 1))
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export type OneboxNode = { id: string; name: string }

// Validate server-supplied IDs before reusing them as CLI arguments.
const SAFE_ONEBOX_ID = /^[A-Za-z0-9_-]{1,64}$/

function normalizeOneboxId(value: unknown): string | null {
  if (
    typeof value !== 'string' &&
    (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
  ) {
    return null
  }
  const id = String(value)
  return SAFE_ONEBOX_ID.test(id) ? id : null
}

export function parseFolderListing(json: Record<string, unknown> | null): {
  folders: OneboxNode[]
} {
  const normalize = (value: unknown): OneboxNode[] => {
    if (!Array.isArray(value)) {
      return []
    }
    const nodes: OneboxNode[] = []
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) {
        continue
      }
      const record = entry as Record<string, unknown>
      const id = record.id ?? record.fileId ?? record.folderId ?? record.nodeId
      const name = record.name ?? record.fileName ?? record.folderName
      if (id === undefined || id === null || typeof name !== 'string') {
        continue
      }
      const idText = normalizeOneboxId(id)
      if (!idText) {
        continue
      }
      nodes.push({ id: idText, name })
    }
    return nodes
  }
  return {
    folders: normalize(json?.folders ?? json?.children)
  }
}

async function listFolder(
  route: WelinkRoute,
  spaceId: string,
  parentId: string
): Promise<{ folders: OneboxNode[] }> {
  const { stdout } = await withRateLimitRetry(() =>
    runWelinkCli(
      route,
      ['onebox', 'folder-list', '--space-id', spaceId, '--parent', parentId],
      WELINK_METADATA_TIMEOUT_MS
    )
  )
  const parsed = parseFirstJsonObject(stdout)
  if (!parsed) {
    throw new WelinkReportError('unknown', `folder-list returned no JSON: ${stdout}`)
  }
  return parseFolderListing(parsed)
}

async function createFolder(
  route: WelinkRoute,
  spaceId: string,
  parentId: string,
  name: string
): Promise<string> {
  const { stdout } = await withRateLimitRetry(() =>
    runWelinkCli(
      route,
      ['onebox', 'folder-new', '--space-id', spaceId, '--parent', parentId, '--name', name],
      WELINK_METADATA_TIMEOUT_MS
    )
  )
  const parsed = parseFirstJsonObject(stdout)
  const id = normalizeOneboxId(parsed ? (parsed.id ?? parsed.folderId) : undefined)
  if (!id) {
    throw new WelinkReportError('unknown', `folder-new returned no usable id: ${stdout}`)
  }
  return id
}

// One ensured folder per space per process; concurrent submissions share the
// in-flight promise so a burst of reports cannot double-create the folder.
const reportFolderCache = new Map<string, Promise<string>>()

export function ensureReportFolder(route: WelinkRoute, spaceId: string): Promise<string> {
  const cached = reportFolderCache.get(spaceId)
  if (cached) {
    return cached
  }
  const pending = (async () => {
    const listing = await listFolder(route, spaceId, '0')
    const existing = listing.folders.find((folder) => folder.name === WORKBENCH_REPORT_FOLDER_NAME)
    if (existing) {
      return existing.id
    }
    return createFolder(route, spaceId, '0', WORKBENCH_REPORT_FOLDER_NAME)
  })()
  reportFolderCache.set(spaceId, pending)
  void pending.catch(() => {
    reportFolderCache.delete(spaceId)
  })
  return pending
}

/** Upload one file into the report folder; returns the onebox File ID. */
export async function uploadReportFile(
  route: WelinkRoute,
  spaceId: string,
  folderId: string,
  windowsFilePath: string,
  fileName: string
): Promise<string> {
  const cliPath = route.wslDistro ? toLinuxPath(windowsFilePath) : windowsFilePath
  const { stdout } = await withRateLimitRetry(() =>
    runWelinkCli(
      route,
      ['onebox', 'file-upload', '--space-id', spaceId, '--parent', folderId, cliPath],
      WELINK_UPLOAD_TIMEOUT_MS
    )
  )
  const fileId = parseUploadedFileId(stdout)
  if (!fileId) {
    // Same-content dedupe skips the upload step but still prints the File ID,
    // so a missing id means the output shape changed — surface as unknown.
    throw new WelinkReportError('unknown', `file-upload printed no File ID for ${fileName}`)
  }
  return fileId
}

/** Move a file to the onebox recycle bin (file-remove is not a physical delete). */
export async function removeReportFile(
  route: WelinkRoute,
  spaceId: string,
  fileId: string
): Promise<void> {
  try {
    await withRateLimitRetry(() =>
      runWelinkCli(
        route,
        ['onebox', 'file-remove', '--space-id', spaceId, '--file-id', fileId],
        WELINK_METADATA_TIMEOUT_MS
      )
    )
  } catch (error) {
    // A retry after a lost acknowledgement must still finish local receipt cleanup.
    if (error instanceof WelinkReportError && error.detail.includes('This file does not exist.')) {
      return
    }
    throw error
  }
}
