import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { Download, Page } from 'playwright-core'
import type { PackageDownloadReceipt, PackageLatest } from '../../shared/workbench/package-pipeline'
import { runOnCloudDragonPage } from './cloud-dragon-session'
import { PackagePipelineError, failureText } from './package-pipeline-error'

/**
 * CloudDragon 出包的制品面：最新包读取与安装包下载在制品仓库服务页，走
 * cloud-dragon-session 的常驻浏览器会话（CLI 没有制品仓库能力）。执行面
 * （list/launch）已改走本机 cloudbuild CLI，见 cloud-dragon-cli-ops。选择器
 * 与链路均经真实页面验证：版本链接按 semver 前缀取最新，下载走
 * d-icon#artifact_artifactDownloadId 换签名 URL 后由浏览器下载。
 */

// Why: CloudDragon 项目 ID 属于组织侧配置，当前接入 gtsllm-dfx 所在项目；
// 配置化（随项目设置存储）是后续任务，不在此扩展协议。CLI 侧（执行面）
// 以同一 ID 作 --group。
export const CLOUDDRAGON_PROJECT_ID = 'ga751ea99cf714cb1914e68639ac89123'
const SERVICES_URL = `https://clouddragon.huawei.com/artifact/project/${CLOUDDRAGON_PROJECT_ID}/services`

const RENDER_POLL_INTERVAL_MS = 500
const TABLE_RENDER_TIMEOUT_MS = 20_000
const DIALOG_ACTION_TIMEOUT_MS = 10_000
const DOWNLOAD_EVENT_TIMEOUT_MS = 120_000

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
