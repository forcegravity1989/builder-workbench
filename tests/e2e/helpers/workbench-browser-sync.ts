import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import { expect, test } from './workbench-app'
import { startLocalHttpsServer } from './local-https-test-server'
import { captureBrowserCompositionEvidence } from './browser-composition-evidence'

const PROFILE = 'BW browser acceptance'
const ACCOUNT = 'bw-browser-fixture@example.invalid'
const PASSWORD = 'fixture-only-BW-582!'
const SITE = 'bw-browser-fixture.invalid'
const NOT_SECURE = /Connection isn't secure|连接不安全/
const PROCEED = /Proceed Anyway|仍然继续/

export const browserSyncTest = test.extend({
  minimumSeededWorktreeCount: 1,
  workbenchAppExtraArgs: [
    '-r',
    path.join(process.cwd(), 'tests/e2e/helpers/real-password-storage.cjs')
  ],
  workbenchAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  }
})

type Restart = () => Promise<{ electronApp: ElectronApplication; page: Page }>

async function openBrowserSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^(Settings|设置)$/ }).click()
  await page.getByRole('button', { name: /^(Browser|浏览器)$/ }).click()
  await expect(page.locator('#browser-session-cookies')).toBeVisible()
  await expect(page.locator('#browser-passwords')).toBeVisible()
}

function profileRow(page: Page, label: string) {
  return page
    .locator('#browser-session-cookies [role="button"]')
    .filter({
      has: page.getByText(label, { exact: true })
    })
    .first()
}

async function capture(page: Page, info: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: info.outputPath(`${name}.png`) })
}

async function recordEvidence(info: TestInfo, name: string, value: unknown): Promise<void> {
  const evidencePath = info.outputPath(`${name}.json`)
  writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`)
  await info.attach(name, { path: evidencePath, contentType: 'application/json' })
}

async function requireRealPasswordStorage(
  app: ElectronApplication,
  info: TestInfo,
  phase: 'before-restart' | 'after-restart'
): Promise<void> {
  const storage = await app.evaluate(({ app, safeStorage }) => ({
    available: safeStorage.isEncryptionAvailable(),
    useMockKeychain: app.commandLine.hasSwitch('use-mock-keychain'),
    passwordStore: app.commandLine.getSwitchValue('password-store'),
    backend:
      process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform,
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome
  }))
  await recordEvidence(info, `browser-password-storage-${phase}`, storage)
  expect(
    storage.useMockKeychain,
    'Mock keychains cannot establish OS-backed password storage'
  ).toBe(false)
  expect(
    storage.passwordStore,
    'The basic password store cannot establish OS-backed storage'
  ).not.toBe('basic')
  expect(storage.available, 'The runner must provide a real unlocked OS keyring').toBe(true)
  if (process.platform === 'linux') {
    expect(storage.backend).toBe('gnome_libsecret')
  }
}

async function importSyntheticPassword(page: Page, app: ElectronApplication, info: TestInfo) {
  await openBrowserSettings(page)
  await page
    .locator('#browser-session-cookies')
    .getByRole('button', {
      name: /Add Profile|添加个人资料/
    })
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill(PROFILE)
  await dialog.getByRole('button', { name: /^(Create|创建)$/ }).click()
  await expect(dialog).toHaveCount(0)
  await profileRow(page, PROFILE).click()
  await expect(profileRow(page, PROFILE)).toContainText(/Active|使用中|已启用|当前|活动/)

  const csvPath = info.outputPath('synthetic-passwords.csv')
  writeFileSync(
    csvPath,
    `name,url,username,password\nBW fixture,https://${SITE}/login,${ACCOUNT},${PASSWORD}\n`
  )
  // The native chooser is the only substituted boundary. The UI, import IPC, parser and OS vault run normally.
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] })
  }, csvPath)
  const passwords = page.locator('#browser-passwords')
  await passwords.getByRole('button', { name: /^(Import|导入)$/ }).click()
  await page.getByRole('menuitem', { name: /CSV/ }).click()
  await expect(passwords.getByText(ACCOUNT, { exact: true })).toBeVisible()
  await expect(passwords.getByText(SITE, { exact: true })).toBeVisible()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await passwords.scrollIntoViewIfNeeded()
  await expect(passwords.getByText(ACCOUNT, { exact: true })).toBeInViewport({ ratio: 1 })
  await capture(page, info, 'browser-password-csv-imported')

  const defaultLabel = await page.evaluate(() => {
    const profile = window.__store
      ?.getState()
      .browserSessionProfiles.find((entry) => entry.id === 'default')
    if (!profile) {
      throw new Error('Default browser profile not loaded')
    }
    return profile.label
  })
  await profileRow(page, defaultLabel).click()
  await expect(profileRow(page, defaultLabel)).toContainText(/Active|当前/)
  await expect(passwords.getByText(/^(No saved passwords yet|尚未保存密码)$/)).toBeVisible()
  await expect(passwords.getByText(ACCOUNT, { exact: true })).toHaveCount(0)
  await profileRow(page, PROFILE).click()
  await expect(passwords.getByText(ACCOUNT, { exact: true })).toBeVisible()
}

async function createBrowser(page: Page, url: string, splitSource?: string) {
  return page.evaluate(
    ({ url, splitSource }) => {
      const state = window.__store?.getState()
      const worktreeId = state?.activeWorktreeId
      if (!state || !worktreeId) {
        throw new Error('Active test worktree is unavailable')
      }
      const browser = state.createBrowserTab(worktreeId, url, {
        activate: true,
        ...(splitSource
          ? { split: { sourceGroupId: splitSource, splitDirection: 'right' as const } }
          : {})
      })
      const tab = window
        .__store!.getState()
        .unifiedTabsByWorktree[worktreeId]?.find(
          (entry) => entry.contentType === 'browser' && entry.entityId === browser.id
        )
      if (!tab) {
        throw new Error('Browser tab was not placed')
      }
      return { id: browser.id, groupId: tab.groupId }
    },
    { url, splitSource }
  )
}

function slot(page: Page, id: string) {
  return page.locator(`[data-browser-overlay-tab-id="${id}"]`)
}

async function guestHeading(page: Page, id: string): Promise<string | null> {
  return page.evaluate(async (tabId) => {
    const element = [...document.querySelectorAll('[data-browser-overlay-tab-id]')].find(
      (candidate) => candidate.getAttribute('data-browser-overlay-tab-id') === tabId
    )
    const webview = element?.querySelector('webview') as Electron.WebviewTag | null
    try {
      return (
        (await webview?.executeJavaScript('document.querySelector("h1")?.textContent ?? null')) ??
        null
      )
    } catch {
      return null
    }
  }, id)
}

async function expectBrowserInPane(
  page: Page,
  app: ElectronApplication,
  id: string,
  groupId: string,
  info: TestInfo,
  side: 'left' | 'right'
): Promise<void> {
  const pane = page.locator(`[data-tab-group-body-id="${groupId}"]`)
  const overlay = slot(page, id)
  const viewport = overlay.locator('[data-browser-page-viewport-id]')
  const guest = overlay.locator('webview')
  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveCSS('opacity', '1')
  await expect(overlay).toHaveCSS('pointer-events', 'auto')
  await expect(viewport).toBeVisible()
  await expect(viewport).toHaveCSS('opacity', '1')
  await expect(viewport).toHaveCSS('pointer-events', 'auto')
  await expect(viewport).not.toHaveAttribute('aria-hidden', 'true')
  await expect(guest).toBeVisible()
  await expect(guest).toHaveCSS('visibility', 'visible')
  await expect(guest).toHaveCSS('pointer-events', 'auto')
  await expect(async () => {
    const body = await pane.boundingBox()
    const browser = await overlay.boundingBox()
    const content = await guest.boundingBox()
    if (!body || !browser || !content) {
      throw new Error('A browser split lost its visible pane or guest')
    }
    // The native overlay anchors to the entire TabGroupPanel body; its guest sits below the chrome.
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(browser[dimension] - body[dimension])).toBeLessThanOrEqual(2)
    }
    expect(content.width).toBeGreaterThan(100)
    expect(content.height).toBeGreaterThan(100)
    expect(content.x).toBeGreaterThanOrEqual(body.x - 2)
    expect(content.y).toBeGreaterThanOrEqual(body.y - 2)
    expect(content.x + content.width).toBeLessThanOrEqual(body.x + body.width + 2)
    expect(content.y + content.height).toBeLessThanOrEqual(body.y + body.height + 2)
  }).toPass({ timeout: 10_000 })
  await expect(async () => {
    const viewportSize = await guest.evaluate(async (element) => {
      const webview = element as Electron.WebviewTag
      const rendered = (await webview.executeJavaScript(`new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Guest did not paint')), 2000)
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(timeout)
          const serializeRect = (rect) => ({
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left
          })
          const heading = document.querySelector('h1')
          const headingStyle = heading ? getComputedStyle(heading) : null
          const headingRange = document.createRange()
          if (heading) headingRange.selectNodeContents(heading)
          const viewport = window.visualViewport
          resolve({
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
            documentElement: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth
            },
            body: document.body ? {
              rect: serializeRect(document.body.getBoundingClientRect()),
              scrollWidth: document.body.scrollWidth
            } : null,
            h1: heading && headingStyle ? {
              text: heading.textContent,
              rect: serializeRect(heading.getBoundingClientRect()),
              computed: {
                whiteSpace: headingStyle.whiteSpace,
                width: headingStyle.width,
                minWidth: headingStyle.minWidth,
                overflow: headingStyle.overflow,
                fontSize: headingStyle.fontSize
              },
              rangeClientRects: Array.from(headingRange.getClientRects(), serializeRect)
            } : null,
            visualViewport: viewport ? {
              width: viewport.width,
              height: viewport.height,
              scale: viewport.scale,
              offsetLeft: viewport.offsetLeft,
              offsetTop: viewport.offsetTop,
              pageLeft: viewport.pageLeft,
              pageTop: viewport.pageTop
            } : null
          })
        }))
      })`)) as { width: number; height: number; dpr: number }
      const bounds = webview.getBoundingClientRect()
      return {
        rendered,
        width: bounds.width,
        height: bounds.height,
        hostDpr: window.devicePixelRatio,
        webContentsId: webview.getWebContentsId(),
        zoomLevel: webview.getZoomLevel(),
        zoomFactor: webview.getZoomFactor()
      }
    })
    await recordEvidence(info, `browser-split-viewport-${side}`, viewportSize)
    const ratio = viewportSize.rendered.dpr / viewportSize.hostDpr
    expect(Math.abs(viewportSize.rendered.width * ratio - viewportSize.width)).toBeLessThanOrEqual(
      2
    )
    expect(
      Math.abs(viewportSize.rendered.height * ratio - viewportSize.height)
    ).toBeLessThanOrEqual(2)
  }).toPass({ timeout: 10_000 })
  await capture(page, info, `browser-split-before-guest-capture-${side}`)
  const captureName = `browser-split-guest-${side}`
  try {
    const webContentsId = await guest.evaluate((element) =>
      (element as Electron.WebviewTag).getWebContentsId()
    )
    const image = await app.evaluate(async ({ webContents }, targetId) => {
      const contents = webContents.fromId(targetId)
      if (!contents || contents.isDestroyed()) {
        throw new Error(`Missing guest webContents ${targetId}`)
      }
      let timeout: ReturnType<typeof setTimeout> | undefined
      const screenshot = await Promise.race([
        contents.capturePage(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Guest capture timed out')), 5000)
        })
      ]).finally(() => clearTimeout(timeout))
      return {
        pngBase64: screenshot.toPNG().toString('base64'),
        webContentsId: contents.id,
        url: contents.getURL(),
        size: screenshot.getSize(),
        scaleFactors: screenshot.getScaleFactors(),
        empty: screenshot.isEmpty()
      }
    }, webContentsId)
    const { pngBase64, ...metadata } = image
    const screenshotPath = info.outputPath(`${captureName}.png`)
    writeFileSync(screenshotPath, Buffer.from(pngBase64, 'base64'))
    await info.attach(captureName, { path: screenshotPath, contentType: 'image/png' })
    await recordEvidence(info, captureName, { status: 'captured', ...metadata })
  } catch (error) {
    // Capture is diagnostic; report its failure without changing the acceptance assertions.
    await recordEvidence(info, captureName, {
      status: 'capture-failed',
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function verifyBrowserSync(
  page: Page,
  app: ElectronApplication,
  restart: Restart,
  info: TestInfo
): Promise<void> {
  await requireRealPasswordStorage(app, info, 'before-restart')
  await importSyntheticPassword(page, app, info)
  // Setup a native browser pane; assertions below read the actual rendered guest and split panes.
  await page.evaluate(() => window.__store!.getState().closeSettingsPage())
  const server = await startLocalHttpsServer()
  try {
    const first = await createBrowser(page, server.secureUrl)
    await expect(slot(page, first.id).getByRole('heading', { name: NOT_SECURE })).toBeVisible()
    await capture(page, info, 'browser-certificate-refused')
    await slot(page, first.id).getByRole('button', { name: PROCEED }).click()
    await expect
      .poll(() => guestHeading(page, first.id), { timeout: 20_000 })
      .toMatch(/^Local HTTPS request /)
    const second = await createBrowser(page, server.secureUrl, first.groupId)
    await expect
      .poll(() => guestHeading(page, second.id), { timeout: 20_000 })
      .toMatch(/^Local HTTPS request /)
    await expect(slot(page, second.id).getByRole('heading', { name: NOT_SECURE })).toHaveCount(0)
    const firstPane = page.locator(`[data-tab-group-body-id="${first.groupId}"]`)
    const secondPane = page.locator(`[data-tab-group-body-id="${second.groupId}"]`)
    await expect(firstPane).toBeVisible()
    await expect(secondPane).toBeVisible()
    await expect(async () => {
      const left = await firstPane.boundingBox()
      const right = await secondPane.boundingBox()
      expect(left).not.toBeNull()
      expect(right).not.toBeNull()
      expect(right!.x).toBeGreaterThan(left!.x + left!.width - 2)
    }).toPass()
    await expectBrowserInPane(page, app, first.id, first.groupId, info, 'left')
    await expectBrowserInPane(page, app, second.id, second.groupId, info, 'right')
    await capture(page, info, 'browser-approved-session-split')
    await captureBrowserCompositionEvidence(app, page, info)

    const beforePid = app.process().pid
    const profile = await app.evaluate(({ app }) => app.getPath('userData'))
    const after = await restart()
    const afterPid = after.electronApp.process().pid
    expect(afterPid).not.toBe(beforePid)
    expect(await after.electronApp.evaluate(({ app }) => app.getPath('userData'))).toBe(profile)
    // The exact endpoint and leaf have not changed. Only the Electron session was replaced.
    await expect(
      slot(after.page, second.id).getByRole('heading', { name: NOT_SECURE })
    ).toBeVisible({ timeout: 30_000 })
    await expect(slot(after.page, second.id).getByRole('button', { name: PROCEED })).toBeVisible()
    await capture(after.page, info, 'browser-certificate-restart-prompts-again')
    await requireRealPasswordStorage(after.electronApp, info, 'after-restart')
    await openBrowserSettings(after.page)
    await expect(profileRow(after.page, PROFILE)).toContainText(/Active|使用中|已启用|当前|活动/)
    const passwords = after.page.locator('#browser-passwords')
    await expect(passwords.getByText(ACCOUNT, { exact: true })).toBeVisible()
    await passwords
      .getByRole('button', { name: new RegExp(`^(Edit|编辑).*${ACCOUNT.replace('.', '\\.')}`) })
      .click()
    await expect(after.page.locator('#browser-password-password')).toHaveValue(PASSWORD)
    await after.page.keyboard.press('Escape')
    await expect(after.page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0)
    await passwords.scrollIntoViewIfNeeded()
    await expect(passwords.getByText(ACCOUNT, { exact: true })).toBeInViewport({ ratio: 1 })
    await capture(after.page, info, 'browser-profile-password-after-process-restart')
    await recordEvidence(info, 'browser-process-restart', {
      beforePid,
      afterPid,
      sameUserData: true,
      certificateApprovalReset: true,
      passwordSource: 'synthetic CSV only',
      platform: process.platform,
      sourceHead: process.env.GITHUB_SHA
    })
  } finally {
    await server.close()
  }
}
