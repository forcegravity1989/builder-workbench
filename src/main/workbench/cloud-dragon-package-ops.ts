import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { Download, Page } from 'playwright-core'
import type { PackageDownloadReceipt, PackageLatest } from '../../shared/workbench/package-pipeline'
import { runOnCloudDragonPage } from './cloud-dragon-session'
import { PackagePipelineError, failureText } from './package-pipeline-error'

/**
 * CloudDragon 出包页面操作：列表/启动在流水线列表页，制品包在制品仓库服务
 * 页。选择器与链路均经真实页面验证：启动走 #startLaunch_<流水线> →
 * 执行方案启动 → pr_pipeline；下载走 d-icon#artifact_artifactDownloadId
 * 换签名 URL 后由浏览器下载。浏览器会话管理在 cloud-dragon-session。
 */

// Why: CloudDragon 项目 ID 属于组织侧配置，当前接入 gtsllm-dfx 所在项目；
// 配置化（随项目设置存储）是后续任务，不在此扩展协议。
const CLOUDDRAGON_PROJECT_ID = 'ga751ea99cf714cb1914e68639ac89123'
const LIST_URL = `https://clouddragon.huawei.com/pipeline/project/${CLOUDDRAGON_PROJECT_ID}/pipeline/list`
const SERVICES_URL = `https://clouddragon.huawei.com/artifact/project/${CLOUDDRAGON_PROJECT_ID}/services`

const RENDER_POLL_INTERVAL_MS = 500
const TABLE_RENDER_TIMEOUT_MS = 20_000
const DIALOG_ACTION_TIMEOUT_MS = 10_000
const LAUNCH_CONFIRM_TIMEOUT_MS = 30_000
const DOWNLOAD_EVENT_TIMEOUT_MS = 120_000

const CURRENT_PROJECT_SCOPE = '当前项目下的流水线'

// The per-row run button id carries the pipeline name, so the button list is
// the name list — no text scraping of table cells needed.
async function readStartIds(page: Page): Promise<string[]> {
  return page.evaluate<string[]>(`(() => {
    return Array.from(document.querySelectorAll('button[id^="startLaunch_"]'))
      .map((button) => button.id.slice('startLaunch_'.length))
      .filter(Boolean)
  })()`)
}

async function readScopeValue(page: Page): Promise<string> {
  return page.evaluate<string>(`(() => {
    const input = document.querySelector('input.devui-select-input')
    return input ? input.value : ''
  })()`)
}

/**
 * 切换前的基线必须是一份「已渲染稳定」的表格快照：页面初始表格属于账号
 * 默认范围（我关注的流水线），空快照会让这份初始渲染冒充切换后的结果。
 * 一直为空的表格（账号没有关注任何流水线）返回空基线，正确性由切换后的
 * 非空等待承担。
 */
async function readSettledStartIds(page: Page): Promise<string[]> {
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  let previous: string[] = []
  while (Date.now() < deadline) {
    const ids = await readStartIds(page)
    if (ids.length > 0 && JSON.stringify(ids) === JSON.stringify(previous)) {
      return ids
    }
    previous = ids
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  return previous
}

/**
 * CloudDragon 把范围选择记在浏览器 localStorage（按用户名）：同一常驻会话
 * 里第一次切换后，后续页面加载会异步恢复记住的范围（input 先空、再默认
 * 值、最后恢复值，实测 ~750ms），表格直接按记住的范围加载。页面打开后
 * 立刻读 scope 必然落在恢复完成前，会把「已是目标范围的表格」误判成切换
 * 前基线，之后的「等表格变化」永远等不到。所以先等 scope 值稳定（连续
 * 两次一致）再决策：稳定值是目标就直接用（省掉切换，实测热会话 ~1.6s
 * 出全表），不是才走切换。
 */
async function readSettledScopeValue(page: Page): Promise<string> {
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  let previous = ''
  while (Date.now() < deadline) {
    const value = await readScopeValue(page)
    if (value && value === previous) {
      return value
    }
    previous = value
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  return previous
}

/**
 * The scope dropdown commits its displayed value before the pipeline table
 * re-renders (measured ~1s lag on the real page): reading rows right after
 * the click returns the previous scope's pipelines. Skip the switch when the
 * settled scope already reads right, and after switching wait until the table
 * content actually differs from the settled pre-switch baseline.
 */
async function ensureCurrentProjectScope(page: Page): Promise<void> {
  if ((await readSettledScopeValue(page)) === CURRENT_PROJECT_SCOPE) {
    return
  }
  const previousIds = await readSettledStartIds(page)
  try {
    await page
      .locator('input.devui-select-input')
      .first()
      .click({ timeout: TABLE_RENDER_TIMEOUT_MS })
    await page.getByText(CURRENT_PROJECT_SCOPE, { exact: true }).click({
      timeout: DIALOG_ACTION_TIMEOUT_MS
    })
  } catch {
    throw new PackagePipelineError(
      'scope-switch-failed',
      '流水线列表页范围切换失败，页面结构可能已变化'
    )
  }
  const selectionDeadline = Date.now() + DIALOG_ACTION_TIMEOUT_MS
  while ((await readScopeValue(page)) !== CURRENT_PROJECT_SCOPE) {
    if (Date.now() >= selectionDeadline) {
      throw new PackagePipelineError(
        'scope-switch-failed',
        '流水线列表页范围切换未生效，请稍后重试'
      )
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  const tableDeadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  while (Date.now() < tableDeadline) {
    const ids = await readStartIds(page)
    if (ids.length > 0 && JSON.stringify(ids) !== JSON.stringify(previousIds)) {
      return
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  throw new PackagePipelineError(
    'scope-switch-failed',
    '流水线列表未按当前项目范围刷新，请稍后重试'
  )
}

async function listPipelinesOnPage(page: Page): Promise<string[]> {
  await ensureCurrentProjectScope(page)
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const names = await readStartIds(page)
    if (names.length > 0) {
      return names
    }
    await page.waitForTimeout(RENDER_POLL_INTERVAL_MS)
  }
  throw new PackagePipelineError('pipeline-list-empty', '当前项目下的流水线列表为空或加载超时')
}

async function launchPipelineOnPage(page: Page, pipeline: string): Promise<void> {
  await ensureCurrentProjectScope(page)
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
    throw new PackagePipelineError(
      'launch-dialog-failed',
      '启动弹窗未按预期展开执行方案，页面结构可能已变化'
    )
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
 * Navigate to the newest software version detail of a service (the page is
 * already open on the services list). Version links are listed newest-first;
 * a service with no versions yields null (the panel shows 暂无制品包) instead
 * of an error.
 */
async function openNewestVersionDetail(page: Page, service: string): Promise<string | null> {
  try {
    await page
      .getByText(service, { exact: true })
      .first()
      .click({ timeout: TABLE_RENDER_TIMEOUT_MS })
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

/**
 * 版本详情表是 DevUI 表格：单元格把完整文本放在 title 属性里，列序为
 * # / 服务包 / 类型 / 创建时间 / 修改时间，所以第一个日期时间样式的 title
 * 就是创建时间。
 */
async function readVersionDetail(page: Page): Promise<{ created: string; files: string[] }> {
  const deadline = Date.now() + TABLE_RENDER_TIMEOUT_MS
  while (Date.now() < deadline) {
    const detail = await page.evaluate<{ created: string; files: string[] }>(`(() => {
      const titles = Array.from(document.querySelectorAll('[title]'))
        .map((node) => node.getAttribute('title') || '')
      const files = Array.from(new Set(titles.filter((title) => /\\.(7z|hwp7s)$/i.test(title))))
      const created = titles.find((title) => /^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/.test(title)) || ''
      return { files, created }
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
    throw new PackagePipelineError(
      'version-not-found',
      `服务 ${service} 暂无制品包，没有可下载的文件`
    )
  }
  // The download icon exchanges a signed URL first; the browser then emits the
  // download event, which saveAs redirects into the user-chosen directory.
  const downloadPromise = page.waitForEvent('download', { timeout: DOWNLOAD_EVENT_TIMEOUT_MS })
  try {
    await page.locator('d-icon#artifact_artifactDownloadId').first().click({
      timeout: TABLE_RENDER_TIMEOUT_MS
    })
  } catch {
    throw new PackagePipelineError(
      'download-click-failed',
      '制品包下载按钮不可用，页面结构可能已变化'
    )
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
    throw new PackagePipelineError('save-failed', `保存制品包失败：${failureText(error)}`)
  }
  return { file, bytes: (await stat(file)).size }
}

export function listCloudDragonPipelines(): Promise<string[]> {
  return runOnCloudDragonPage(LIST_URL, (page) => listPipelinesOnPage(page))
}

export function launchCloudDragonPipeline(pipeline: string): Promise<void> {
  return runOnCloudDragonPage(LIST_URL, (page) => launchPipelineOnPage(page, pipeline))
}

export function readCloudDragonLatest(pipeline: string): Promise<PackageLatest | null> {
  return runOnCloudDragonPage(SERVICES_URL, async (page) => {
    const version = await openNewestVersionDetail(page, pipeline)
    if (!version) {
      return null
    }
    const detail = await readVersionDetail(page)
    return { project: pipeline, version, created: detail.created, files: detail.files }
  })
}

export function downloadCloudDragonPackage(
  pipeline: string,
  directory: string
): Promise<PackageDownloadReceipt> {
  return runOnCloudDragonPage(SERVICES_URL, (page) => downloadOnPage(page, pipeline, directory))
}
