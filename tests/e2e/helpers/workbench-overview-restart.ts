import path from 'node:path'
import { _electron as electron, expect, type ElectronApplication } from '@stablyai/playwright-test'
import type { TestInfo } from '@playwright/test'
import {
  createElectronHomeIsolation,
  assertElectronResolvedIsolatedHome
} from './electron-home-isolation'
import { closeElectronAppForE2E, forceQuitElectronAppForE2E } from './electron-process-shutdown'
import { getWorkbenchElectronLaunchArgs } from './workbench-launch-args'

export async function verifyOverviewRestart(previous: ElectronApplication, info: TestInfo) {
  const profile = await previous.evaluate(({ app }) => app.getPath('userData'))
  const previousPid = previous.process().pid
  const { ELECTRON_RUN_AS_NODE: _unused, ...inheritedEnv } = process.env
  void _unused
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: {},
    userDataDir: profile
  })
  await forceQuitElectronAppForE2E(previous)
  const restarted = await electron.launch({
    args: getWorkbenchElectronLaunchArgs(path.join(process.cwd(), 'out/main/index.js'), false),
    env: {
      ...isolation.env,
      NODE_ENV: 'development',
      WORKBENCH_SHELL: '1',
      VITE_WORKBENCH_SHELL: '1',
      ORCA_PRODUCT_NAME: 'Workbench',
      ORCA_BACKGROUND_LAUNCH: '1',
      ORCA_E2E_HEADLESS: '1'
    }
  })
  try {
    assertElectronResolvedIsolatedHome(
      await restarted.evaluate(({ app }) => app.getPath('home')),
      isolation
    )
    expect(restarted.process().pid).not.toBe(previousPid)
    const page = await restarted.firstWindow({ timeout: 120_000 })
    await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 120_000 })
    const group = page.locator('.wb-version-group', {
      has: page.getByRole('button', { name: 'v0.334 展开或收起', exact: true })
    })
    const overview = group.getByRole('button', { name: '总览', exact: true })
    const toggle = group.getByRole('button', { name: 'v0.334 展开或收起', exact: true })
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click({ force: true })
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await overview.click({ force: true })
    await expect(page.getByRole('heading', { name: 'v0.334 版本总览', exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: '当前目标 · 版本总览开发', exact: true })
    ).toBeVisible()
    await expect(page.locator('.bwo-feature').first()).toContainText('#334', { timeout: 90_000 })
    await info.attach('overview-process-restart', {
      body: JSON.stringify({
        previousPid,
        restartedPid: restarted.process().pid,
        isolatedProfile: profile
      }),
      contentType: 'application/json'
    })
    await page.screenshot({ path: info.outputPath('overview-restarted.png') })
  } finally {
    await closeElectronAppForE2E(restarted)
  }
}
