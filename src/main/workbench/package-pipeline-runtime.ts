import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { Download, Page } from 'playwright-core'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { MetricScope } from '../../shared/workbench/metrics'
import type {
  PackageDownloadReceipt,
  PackageLaunchReceipt,
  PackageLatest,
  PackagePipelineCatalog,
  PackagePipelinePort
} from '../../shared/workbench/package-pipeline'

/**
 * CloudDragon 出包运行时：每次操作起一个无头本机 Chrome（channel:'chrome'），
 * 依赖内网 SSO 自动登录态完成页面操作。选择器与链路均经真实页面验证：
 * 列表/启动在流水线列表页，制品包在制品仓库服务页；启动走
 * #startLaunch_<流水线> → 执行方案启动 → pr_pipeline；下载走
 * d-icon#artifact_artifactDownloadId 换签名 URL 后由浏览器下载。
 */
export class PackagePipelineError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message)
    this.name = 'PackagePipelineError'
  }
}

// Why: CloudDragon 项目 ID 属于组织侧配置，当前接入 gtsllm-dfx 所在项目；
// 配置化（随项目设置存储）是后续任务，不在此扩展协议。
const CLOUDDRAGON_PROJECT_ID = 'ga751ea99cf714cb1914e68639ac89123'
const LIST_URL = `https://clouddragon.huawei.com/pipeline/project/${CLOUDDRAGON_PROJECT_ID}/pipeline/list`
const SERVICES_URL = `https://clouddragon.huawei.com/artifact/project/${CLOUDDRAGON_PROJECT_ID}/services`

const SSO_TIMEOUT_MS = 90_000
const RENDER_POLL_INTERVAL_MS = 1_000
const TABLE_RENDER_TIMEOUT_MS = 20_000
const DIALOG_ACTION_TIMEOUT_MS = 10_000
const LAUNCH_CONFIRM_TIMEOUT_MS = 30_000
const DOWNLOAD_EVENT_TIMEOUT_MS = 120_000

function assertLocalHost(scope: MetricScope): void {
  const host = parseExecutionHostId(scope.hostId)
  if (host?.kind === 'ssh') {
    throw new PackagePipelineError(
      'remote-unsupported',
      '出包依赖本机 Chrome 的内网登录态，请在本地宿主的工作树上操作'
    )
  }
}

async function openCloudDragonPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'load' })
  // SSO redirects through login.huawei.com and back automatically; poll the
  // URL instead of a fixed sleep so a fast pass-through returns immediately.
  const deadline = Date.now() + SSO_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (!page.url().includes('login.huawei.com')) {
      return
    }
    await page.waitForTimeout(2000)
  }
  throw new PackagePipelineError('sso-timeout', 'CloudDragon 内网登录跳转超时，请确认本机网络与登录态')
}

async function withCloudDragonPage<T>(run: (page: Page) => Promise<T>): Promise<T> {
  // Dynamic import keeps playwright-core out of main-process startup until the
  // acceptance screen actually drives CloudDragon.
  const { chromium } = await import('playwright-core')
  let browser: Awaited<ReturnType<typeof chromium.launch>>
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    throw new PackagePipelineError(
      'browser-unavailable',
      `无法启动本机 Chrome（出包依赖系统安装的 Chrome）：${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  try {
    const page = await (await browser.newContext()).newPage()
    return await run(page)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

async function switchScopeToCurrentProject(page: Page): Promise<void> {
  try {
    await page.locator('input.devui-select-input').first().click({ timeout: TABLE_RENDER_TIMEOUT_MS })
    await page.getByText('当前项目下的流水线', { exact: true }).click({
      timeout: DIALOG_ACTION_TIMEOUT_MS
    })
  } catch {
    throw new PackagePipelineError('scope-switch-failed', '流水线列表页范围切换失败，页面结构可能已变化')
  }
}

async function listPipelinesOnPage(page: Page): Promise<string[]> {
  await openCloudDragonPage(page, LIST_URL)
  await switchScopeToCurrentProject(page)
  // The per-row run button id carries the pipeline name, so the button list is
  // the name list — no text scraping of table cells needed.
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const names = await page.evaluate<string[]>(`(() => {
      return Array.from(document.querySelectorAll('button[id^="startLaunch_"]'))
        .map((button) => button.id.slice('startLaunch_'.length))
        .filter(Boolean)
    })()`)
    if (names.length > 0) {
      return names
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  throw new PackagePipelineError('pipeline-list-empty', '当前项目下的流水线列表为空或加载超时')
}

async function launchPipelineOnPage(page: Page, pipeline: string): Promise<void> {
  await openCloudDragonPage(page, LIST_URL)
  await switchScopeToCurrentProject(page)
  try {
    await page.locator(`#startLaunch_${pipeline}`).click({ timeout: TABLE_RENDER_TIMEOUT_MS })
  } catch {
    throw new PackagePipelineError('pipeline-not-found', `当前项目下没有找到流水线 ${pipeline}`)
  }
  try {
    await page.getByText('执行方案启动', { exact: true }).first().click({
      timeout: DIALOG_ACTION_TIMEOUT_MS
    })
    await page.getByText('pr_pipeline', { exact: true }).first().click({
      timeout: DIALOG_ACTION_TIMEOUT_MS
    })
  } catch {
    throw new PackagePipelineError('launch-dialog-failed', '启动弹窗未按预期展开执行方案，页面结构可能已变化')
  }
  // Acceptance = the launch dialog closes. Failure = the page surfaces the
  // account's "no permission" toast; check it first so a closed dialog with a
  // lingering toast is not misread as success.
  const deadline = Date.now() + LAUNCH_CONFIRM_TIMEOUT_MS
  while (Date.now() < deadline) {
    const state = await page.evaluate<{ dialogOpen: boolean; noPermission: boolean }>(`(() => {
      const overlay = document.querySelector('.cdk-overlay-container')
      return {
        dialogOpen: Boolean(overlay && (overlay.textContent || '').includes('启动流水线')),
        noPermission: (document.body.innerText || '').includes('no permission')
      }
    })()`)
    if (state.noPermission) {
      throw new PackagePipelineError(
        'no-permission',
        `当前账号没有流水线 ${pipeline} 的启动权限，请先在 CloudDragon 上申请`
      )
    }
    if (!state.dialogOpen) {
      return
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  throw new PackagePipelineError(
    'launch-unconfirmed',
    '流水线启动未在预期时间内确认受理，请到 CloudDragon 列表页核对运行状态'
  )
}

/**
 * Navigate to the newest software version detail of a service. Version links
 * are listed newest-first; a service with no versions yields null (the panel
 * shows 暂无制品包) instead of an error.
 */
async function openNewestVersionDetail(page: Page, service: string): Promise<string | null> {
  await openCloudDragonPage(page, SERVICES_URL)
  try {
    await page.getByText(service, { exact: true }).first().click({ timeout: TABLE_RENDER_TIMEOUT_MS })
  } catch {
    throw new PackagePipelineError('service-not-found', `制品仓库没有找到服务 ${service}`)
  }
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  let version: string | null = null
  while (Date.now() < deadline) {
    version = await page.evaluate<string | null>(`(() => {
      const links = Array.from(document.querySelectorAll('a.devui-link'))
        .map((link) => (link.textContent || '').trim())
        .filter((text) => /^\\d+\\.\\d+\\.\\d+/.test(text))
      return links.length > 0 ? links[0] : null
    })()`)
    if (version) {
      break
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  if (!version) {
    return null
  }
  await page.locator('a.devui-link', { hasText: version }).first().click({
    timeout: DIALOG_ACTION_TIMEOUT_MS
  })
  return version
}

async function readVersionDetail(page: Page): Promise<{ created: string; files: string[] }> {
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const detail = await page.evaluate<{ created: string; files: string[] }>(`(() => {
      const text = document.body.innerText || ''
      const files = Array.from(
        new Set(
          Array.from(document.querySelectorAll('tr, [class*="row"]'))
            .flatMap((row) => Array.from(row.querySelectorAll('span[title]')))
            .map((span) => span.getAttribute('title'))
            .filter((title) => Boolean(title && /\\.(7z|hwp7s)$/i.test(title)))
        )
      )
      const labeled = text.match(/创建时间[:：\\s]*(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2})/)
      const any = text.match(/\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}/)
      return { files, created: (labeled && labeled[1]) || (any && any[0]) || '' }
    })()`)
    if (detail.files.length > 0 && detail.created) {
      return detail
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  throw new PackagePipelineError('version-detail-timeout', '制品包详情读取超时，请稍后重试')
}

async function downloadOnPage(
  page: Page,
  service: string,
  directory: string
): Promise<PackageDownloadReceipt> {
  const version = await openNewestVersionDetail(page, service)
  if (!version) {
    throw new PackagePipelineError('version-not-found', `服务 ${service} 暂无制品包，没有可下载的文件`)
  }
  // The download icon exchanges a signed URL first; the browser then emits the
  // download event, which saveAs redirects into the user-chosen directory.
  const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_EVENT_TIMEOUT_MS })
  try {
    await page.locator('d-icon#artifact_artifactDownloadId').first().click({
      timeout: TABLE_RENDER_TIMEOUT_MS
    })
  } catch {
    throw new PackagePipelineError('download-click-failed', '制品包下载按钮不可用，页面结构可能已变化')
  }
  let download: Download
  try {
    download = await downloadPromise
  } catch {
    throw new PackagePipelineError('download-timeout', '制品包下载未在预期时间内开始，请稍后重试')
  }
  const file = path.join(directory, download.suggestedFilename())
  try {
    await download.saveAs(file)
  } catch (error) {
    throw new PackagePipelineError(
      'save-failed',
      `保存制品包失败：${error instanceof Error ? error.message : String(error)}`
    )
  }
  return { file, bytes: (await stat(file)).size }
}

// One launch at a time: double-clicking 出包 must not start the pipeline twice.
let launchInFlight: Promise<PackageLaunchReceipt> | null = null

export function packagePipelineService(): PackagePipelinePort {
  return {
    async list({ scope }): Promise<PackagePipelineCatalog> {
      assertLocalHost(scope)
      const pipelines = await withCloudDragonPage((page) => listPipelinesOnPage(page))
      return { scope, pipelines }
    },
    async latest({ scope, pipeline }): Promise<PackageLatest | null> {
      assertLocalHost(scope)
      return withCloudDragonPage(async (page) => {
        const version = await openNewestVersionDetail(page, pipeline)
        if (!version) {
          return null
        }
        const detail = await readVersionDetail(page)
        return { project: pipeline, version, created: detail.created, files: detail.files }
      })
    },
    async launch({ scope, pipeline }): Promise<PackageLaunchReceipt> {
      assertLocalHost(scope)
      if (launchInFlight) {
        throw new PackagePipelineError('launch-busy', '已有一次流水线启动正在进行，请稍候')
      }
      const run = (async () => {
        await withCloudDragonPage((page) => launchPipelineOnPage(page, pipeline))
        return { pipeline, launchedAt: new Date().toISOString() }
      })()
      launchInFlight = run
      try {
        return await run
      } finally {
        launchInFlight = null
      }
    },
    async download({ scope, pipeline, directory }): Promise<PackageDownloadReceipt> {
      assertLocalHost(scope)
      return withCloudDragonPage((page) => downloadOnPage(page, pipeline, directory))
    }
  }
}
