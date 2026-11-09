import path from 'node:path'
import { _electron as electron, expect, type ElectronApplication } from '@stablyai/playwright-test'
import type { Locator, Page, TestInfo } from '@playwright/test'
import {
  createElectronHomeIsolation,
  assertElectronResolvedIsolatedHome
} from './electron-home-isolation'
import { closeElectronAppForE2E, forceQuitElectronAppForE2E } from './electron-process-shutdown'
import { getWorkbenchElectronLaunchArgs } from './workbench-launch-args'

export async function openVersionOverview(
  page: Page,
  version: string,
  afterBackgroundReload = false
) {
  await page.getByRole('button', { name: '版本工作区', exact: true }).click({
    force: afterBackgroundReload
  })
  const group = page.locator('.wb-version-group', {
    has: page.getByRole('button', { name: `${version} 展开或收起`, exact: true })
  })
  const overview = group.getByRole('button', { name: '总览', exact: true })
  const toggle = group.getByRole('button', { name: `${version} 展开或收起`, exact: true })
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click({ force: afterBackgroundReload })
  }
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(overview).toBeVisible()
  await expect(overview).toBeEnabled()
  // A background reload has no animation frames for Playwright's stability check.
  await overview.click({ force: afterBackgroundReload })
  await expect(
    page.getByRole('heading', { name: `${version} 版本总览`, exact: true })
  ).toBeVisible()
}

export async function enableProjectStats(page: Page, info: TestInfo, issueState: string) {
  const board = page.locator('.bwo-page')
  const feature = board.locator('.bwo-feature').first()
  const productivity = board.locator('section[aria-label="AI workflow 生产力"]')
  const goalTasks = board
    .locator('.bwo-goal')
    .filter({ has: page.getByRole('heading', { name: '当前目标 · 版本总览开发', exact: true }) })
    .getByRole('button', {
      name: `目标任务 · 1 项 · 未完成 ${issueState === 'OPEN' ? 1 : 0} 项 ↗`,
      exact: true
    })
  await expect(goalTasks).toBeVisible({ timeout: 90_000 })
  await expect(feature).toHaveCount(0)
  await expect(productivity).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('overview-default-off.png') })
  await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    state.openSettingsTarget({
      pane: 'experimental',
      repoId: null,
      sectionId: 'workbench-overview-experiments'
    })
    state.openSettingsPage()
  })
  const settings = page.locator('#workbench-overview-experiments')
  for (const name of ['SDLC 实际过程统计', 'AI 生产力统计']) {
    const control = settings.getByRole('switch', { name, exact: true })
    await expect(control).not.toBeChecked()
    await control.click()
    await expect(control).toBeChecked()
  }
  await page.evaluate(() => window.__store?.getState().closeSettingsPage())
  await expect(goalTasks).toBeVisible({ timeout: 90_000 })
  return { feature, productivity, goalTasks }
}

export async function verifyGoalTaskEntry(
  page: Page,
  goalTasks: Locator,
  version: string,
  title: string
) {
  const savedQuery = 'is:issue is:open label:bw:plan:v0.5'
  await page.evaluate(
    (query) =>
      window.__store?.getState().setTaskResumeState({
        githubMode: 'items',
        githubItemsPreset: null,
        githubItemsQuery: query
      }),
    savedQuery
  )
  await goalTasks.click()
  const range = page.getByRole('group', { name: '任务范围', exact: true })
  await expect(range.getByText(`版本 ${version}`, { exact: true })).toBeVisible()
  const search = page.locator('[data-github-items-search-input]')
  await expect(search).toHaveValue('')
  await expect(page.getByRole('button', { name: '移除目标筛选', exact: true })).toBeVisible()
  await expect(range.getByText('目标 G1 · 当前目标 · 版本总览开发', { exact: true })).toBeVisible()
  await expect(page.getByText(title, { exact: true }).last()).toBeVisible({
    timeout: 90_000
  })
  await search.fill('is:pr')
  await search.press('Enter')
  await expect(page.getByText(title, { exact: true }).last()).toHaveCount(0)
  await search.fill('is:issue')
  await search.press('Enter')
  await expect(page.getByText(title, { exact: true }).last()).toBeVisible()
  await expect(range).toBeVisible()
  expect(
    await page.evaluate(() => window.__store?.getState().taskResumeState?.githubItemsQuery)
  ).toBe(savedQuery)
  console.info('[overview] native goal task filtering and actual Issue row verified')
}

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
    await expect(page.locator('[data-workbench-rail]')).toBeVisible({ timeout: 120_000 })
    await openVersionOverview(page, 'v0.334', true)
    await expect(
      page.getByRole('heading', { name: '当前目标 · 版本总览开发', exact: true })
    ).toBeVisible()
    await expect(page.locator('.bwo-feature').first()).toContainText('#334', { timeout: 90_000 })
    await expect(
      page.getByRole('heading', { name: 'AI workflow 生产力', exact: true })
    ).toBeVisible()
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
