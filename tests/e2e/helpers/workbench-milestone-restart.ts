import path from 'node:path'
import { readFileSync } from 'node:fs'
import { _electron as electron, expect, type ElectronApplication } from '@stablyai/playwright-test'
import type { TestInfo } from '@playwright/test'
import {
  createElectronHomeIsolation,
  assertElectronResolvedIsolatedHome
} from './electron-home-isolation'
import { closeElectronAppForE2E, forceQuitElectronAppForE2E } from './electron-process-shutdown'
import { getWorkbenchElectronLaunchArgs } from './workbench-launch-args'
import { openMilestoneOverview } from './workbench-milestones'

export async function verifyMilestoneRestart(
  previous: ElectronApplication,
  info: TestInfo,
  workingPath: string
) {
  const profile = await previous.evaluate(({ app }) => app.getPath('userData'))
  const previousPid = previous.process().pid
  const readMaterial = () => readFileSync(workingPath, 'utf8')
  const previousPage = await previous.firstWindow()
  await expect(previousPage.locator('.wb-ml')).toHaveAttribute('data-draft-persistence', 'saved')
  const materialBefore = readMaterial()
  expect(JSON.parse(materialBefore).features[0]?.owner).toBe('重启后恢复的草案')
  const before = await previousPage.evaluate(() => ({
    url: location.href,
    activeWorktree: window.__store?.getState().activeWorktreeId
  }))
  await info.attach('milestone-before-force-quit', {
    body: JSON.stringify({ profile, previousPid, before, materialBefore }),
    contentType: 'application/json'
  })
  const { ELECTRON_RUN_AS_NODE: _unused, ...inheritedEnv } = process.env
  void _unused
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' },
    userDataDir: profile
  })
  await forceQuitElectronAppForE2E(previous)
  // Independently read disk bytes after process death, before a new renderer can write anything.
  expect(readMaterial()).toEqual(materialBefore)
  const restarted = await electron.launch({
    args: getWorkbenchElectronLaunchArgs(path.join(process.cwd(), 'out/main/index.js'), false),
    env: {
      ...isolation.env,
      NODE_ENV: 'development',
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
    expect(await restarted.evaluate(({ app }) => app.getPath('userData'))).toBe(profile)
    const page = await restarted.firstWindow({ timeout: 120_000 })
    await page.waitForFunction(
      () => window.__store?.getState().workspaceSessionReady === true,
      null,
      { polling: 100 }
    )
    // Background restart has no animation frames for click stability; force only skips that check.
    await openMilestoneOverview(page, true)
    const board = page.locator('.wb-ml')
    try {
      await expect(board.getByText('已保存 · 未提交', { exact: true })).toBeVisible({
        timeout: 60_000
      })
      await board.getByRole('button', { name: '规划里程碑', exact: true }).click({ force: true })
      await expect(board.getByLabel('负责人', { exact: true }).first()).toHaveValue(
        '重启后恢复的草案',
        { timeout: 60_000 }
      )
    } catch (error) {
      await page.screenshot({ path: info.outputPath('milestone-restarted-failure.png') })
      await info.attach('milestone-restarted-failure', {
        body: JSON.stringify({
          process: await restarted.evaluate(({ app }) => ({
            userData: app.getPath('userData'),
            home: app.getPath('home')
          })),
          material: readMaterial(),
          page: await page.evaluate(() => ({
            url: location.href,
            body: document.body.innerText,
            activeWorktree: window.__store?.getState().activeWorktreeId,
            worktrees: window.__store
              ?.getState()
              .allWorktrees()
              .map(({ id, path }) => ({ id, path }))
          }))
        }),
        contentType: 'application/json'
      })
      throw error
    }
    await page.screenshot({ path: info.outputPath('milestones-restarted-recovered.png') })
    await board
      .getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true })
      .click({ force: true })
    await expect(board.getByLabel('负责人', { exact: true }).first()).toHaveValue('Builder 1')
    await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('消息与通知')
    await expect(board.getByLabel('特性名称', { exact: true }).nth(1)).toHaveValue('工程能力观测')
    await expect(board.getByText('知识库', { exact: true })).toHaveCount(0)
    await expect(board.locator('.wb-ml-row')).toHaveCount(2)
    await expect.poll(() => JSON.parse(readMaterial()).features[0]?.owner).toBe('Builder 1')
    await info.attach('milestone-process-restart', {
      body: JSON.stringify({
        previousPid,
        restartedPid: restarted.process().pid,
        formalFeatures: 2,
        workingCopyReopened: true,
        durableBytesSurvivedForceQuit: true,
        discardRestoredCommittedMaterial: true
      }),
      contentType: 'application/json'
    })
  } finally {
    await closeElectronAppForE2E(restarted)
  }
}
