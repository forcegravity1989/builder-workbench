import { writeFileSync } from 'node:fs'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import { expect, test } from './workbench-app'
import { startLocalHttpsServer } from './local-https-test-server'

const PROFILE = 'BW browser acceptance'
const ACCOUNT = 'bw-browser-fixture@example.invalid'
const PASSWORD = 'fixture-only-BW-582!'
const SITE = 'bw-browser-fixture.invalid'
const NOT_SECURE = /Connection isn't secure|连接不安全/
const PROCEED = /Proceed Anyway|仍然继续/

export const browserSyncTest = test.extend({
  minimumSeededWorktreeCount: 1,
  workbenchAppExtraArgs: process.platform === 'linux' ? ['--password-store=gnome-libsecret'] : [],
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

async function requireRealPasswordStorage(app: ElectronApplication, info: TestInfo): Promise<void> {
  const storage = await app.evaluate(({ safeStorage }) => ({
    available: safeStorage.isEncryptionAvailable(),
    backend:
      process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform,
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome
  }))
  await info.attach('browser-password-storage', {
    body: JSON.stringify(storage),
    contentType: 'application/json'
  })
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

export async function verifyBrowserSync(
  page: Page,
  app: ElectronApplication,
  restart: Restart,
  info: TestInfo
): Promise<void> {
  await requireRealPasswordStorage(app, info)
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
    await capture(page, info, 'browser-approved-session-split')

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
    await requireRealPasswordStorage(after.electronApp, info)
    await openBrowserSettings(after.page)
    await expect(profileRow(after.page, PROFILE)).toContainText(/Active|使用中|已启用|当前|活动/)
    const passwords = after.page.locator('#browser-passwords')
    await expect(passwords.getByText(ACCOUNT, { exact: true })).toBeVisible()
    await passwords
      .getByRole('button', { name: new RegExp(`^(Edit|编辑).*${ACCOUNT.replace('.', '\\.')}`) })
      .click()
    await expect(after.page.locator('#browser-password-password')).toHaveValue(PASSWORD)
    await after.page.keyboard.press('Escape')
    await capture(after.page, info, 'browser-profile-password-after-process-restart')
    await info.attach('browser-process-restart', {
      body: JSON.stringify({
        beforePid,
        afterPid,
        sameUserData: true,
        certificateApprovalReset: true,
        passwordSource: 'synthetic CSV only',
        platform: process.platform,
        sourceHead: process.env.GITHUB_SHA
      }),
      contentType: 'application/json'
    })
  } finally {
    await server.close()
  }
}
