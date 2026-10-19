import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getE2ECompletedOnboardingProfile } from '../../tests/e2e/helpers/e2e-completed-onboarding-profile'
import { getWorkbenchElectronLaunchArgs } from '../../tests/e2e/helpers/workbench-launch-args'
import { createElectronHomeIsolation, assertElectronResolvedIsolatedHome } from '../../tests/e2e/helpers/electron-home-isolation'
import { closeElectronAppForE2E } from '../../tests/e2e/helpers/electron-process-shutdown'

const root = process.cwd()
const evidence = join(root, 'test-results/issue-372')
const key = 'orca.runtime-pairing-link-reference.v1'
test('generated link survives process restart, copying and revocation', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'bw-372-recall-'))
  const seed = getE2ECompletedOnboardingProfile()
  seed.settings = { ...seed.settings, uiLanguage: 'en' } as typeof seed.settings
  writeFileSync(join(profile, 'orca-data.json'), JSON.stringify(seed))
  const { ELECTRON_RUN_AS_NODE, ...inheritedEnv } = process.env
  const isolation = createElectronHomeIsolation({ inheritedEnv, launchEnv: {}, extraEnv: { ORCA_BACKGROUND_LAUNCH: '1', ORCA_E2E_HEADLESS: '1', ORCA_E2E_RUNTIME_WS_PORT: '0', NODE_ENV: 'development', WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' }, userDataDir: profile })
  let app: ElectronApplication | undefined
  let originalClipboard: string | undefined
  const launch = async (): Promise<Page> => {
    app = await electron.launch({ args: getWorkbenchElectronLaunchArgs(join(root, 'out/main/index.js'), false), env: isolation.env })
    assertElectronResolvedIsolatedHome(await app.evaluate(({ app }) => app.getPath('home')), isolation)
    const page = await app.firstWindow()
    page.setDefaultTimeout(60000)
    page.on("pageerror", e => appendFileSync(join(evidence,"app-errors.log"), String(e) + "\n"))
    app.process().stderr?.on("data", data => appendFileSync(join(evidence,"app-errors.log"), data))
    console.log("renderer URL: " + page.url())
    await page.waitForFunction(() => Boolean((window as any).__store?.getState().openSettingsPage), undefined, { polling: 200 })
    await page.evaluate(() => {
      const state = (window as any).__store.getState()
      state.setSettingsSearchQuery('')
      state.openSettingsPage()
    })
    await page.getByText('Remote Orca Servers', { exact: true }).click({ force: true })
    await page.getByRole('button', { name: /Share this host/ }).click({ force: true, timeout: 15000 }).catch(async (error) => { console.log('SETTINGS DOM: '+await page.locator('body').innerText()); await page.screenshot({path:join(evidence,'settings-debug.png')}); throw error })
    await expect(page.getByRole('button', { name: 'Generate Access Link', exact: true })).toBeVisible()
    return page
  }
  const linkRow = (page: Page) => page.locator('code').filter({ hasText: /^orca:\/\// })
  const shot = async (page: Page, name: string) => {
    await page.getByRole('button', { name: 'Generate Access Link', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(evidence, name), mask: [page.locator('code'), page.locator('#runtime-pairing-address')] })
  }
  try {
    let page = await launch()
    originalClipboard = await app!.evaluate(({ clipboard }) => clipboard.readText())
    await page.locator('input[name="runtime-pairing-intent"][value="local"]').check({ force: true })
    await page.getByRole('button', { name: 'Generate Access Link', exact: true }).click({ force: true })
    await expect(linkRow(page)).toHaveCount(1)
    const originalLink = await linkRow(page).textContent()
    const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key)
    expect(Object.keys(saved).sort()).toEqual(['address','deviceId','endpoint','intent','publicKeyB64','version','webClientAvailable'].sort())
    const registryBefore = readFileSync(join(profile, 'orca-devices.json'), 'utf8')
    const identityBefore = readFileSync(join(profile, 'orca-e2ee-keypair.json'), 'utf8')
    await expect(page.getByText(/^Saved access link\. Current connectivity has not been verified\./)).toBeVisible()
    await shot(page, 'generated.png')
    await closeElectronAppForE2E(app!)
    app = undefined
    page = await launch()
    await expect.poll(async () => (await linkRow(page).textContent()) === originalLink).toBe(true)
    await expect(page.locator('input[name="runtime-pairing-intent"][value="local"]')).toBeChecked()
    expect(readFileSync(join(profile,'orca-devices.json'),'utf8') === registryBefore).toBe(true)
    expect(readFileSync(join(profile,'orca-e2ee-keypair.json'),'utf8') === identityBefore).toBe(true)
    await linkRow(page).locator('..').getByRole('button').click({ force: true })
    expect(await app!.evaluate(({ clipboard }) => clipboard.readText()) === originalLink).toBe(true)
    expect(readFileSync(join(profile,'orca-devices.json'),'utf8') === registryBefore).toBe(true)
    await expect(page.getByText(/^Saved access link\. Current connectivity has not been verified\./)).toBeVisible()
    await shot(page,'restarted-copied.png')
    await page.locator('input[name="runtime-pairing-intent"][value="custom"]').check({ force: true })
    await page.locator('#runtime-pairing-custom-address').fill('builder.example.test:443')
    await page.getByRole('button', { name: /Connect to a host/ }).click({ force: true })
    await page.getByRole('button', { name: /Share this host/ }).click({ force: true })
    await expect(page.locator('#runtime-pairing-custom-address')).toHaveValue('builder.example.test:443')
    await page.locator('input[name="runtime-pairing-intent"][value="local"]').check({ force: true })
    await expect.poll(async () => (await linkRow(page).textContent()) === originalLink).toBe(true)
    // Controlled interface response in the real Electron process, not an actual OS network change.
    await page.locator('input[name="runtime-pairing-intent"][value="another"]').check({ force: true })
    await page.getByRole('button', { name: 'Generate Access Link', exact: true }).click({ force: true })
    await expect(linkRow(page)).toHaveCount(1)
    await app!.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('mobile:listNetworkInterfaces')
      ipcMain.handle('mobile:listNetworkInterfaces', () => ({ interfaces: [{ name: 'changed-test-interface', address: '192.0.2.254' }] }))
    })
    await page.getByRole('button', { name: 'Refresh connection addresses', exact: true }).click({ force: true })
    await expect(page.getByText(/The connection address changed\./)).toBeVisible()
    await expect(linkRow(page)).toHaveCount(0)
    await shot(page, 'address-changed.png')
    const revoke = page.getByRole('button', { name: /^Revoke / })
    // Force skips animation-frame stability in a hidden window; still verify real hit targeting.
    await revoke.evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await expect.poll(() => revoke.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })).toBe(true)
    await revoke.click({ force: true })
    await expect(page.getByText('Shared access revoked.', { exact: true })).toBeVisible({ timeout: 60000 })
    await expect(linkRow(page)).toHaveCount(0)
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), key)).toBeNull()
    await closeElectronAppForE2E(app!)
    app = undefined
    page = await launch()
    await expect(page.getByText('No shared server access yet.', { exact: true })).toBeVisible()
    await expect(linkRow(page)).toHaveCount(0)
    await shot(page,'revoked-restarted.png')
    console.log('PASS: exact link recalled across full Electron restart; clipboard matches; credential files unchanged; revoked link stays absent; profile=' + profile)
  } finally {
    if (app) {
      if (originalClipboard !== undefined) await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), originalClipboard).catch(() => {})
      await closeElectronAppForE2E(app)
    }
  }
})

