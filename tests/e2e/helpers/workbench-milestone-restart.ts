import path from 'node:path'
import { _electron as electron, expect, type ElectronApplication } from '@stablyai/playwright-test'
import type { TestInfo } from '@playwright/test'
import {
  createElectronHomeIsolation,
  assertElectronResolvedIsolatedHome
} from './electron-home-isolation'
import { closeElectronAppForE2E, forceQuitElectronAppForE2E } from './electron-process-shutdown'
import { getWorkbenchElectronLaunchArgs } from './workbench-launch-args'

export async function verifyMilestoneRestart(previous: ElectronApplication, info: TestInfo) {
  const profile = await previous.evaluate(({ app }) => app.getPath('userData'))
  const previousPid = previous.process().pid
  const { ELECTRON_RUN_AS_NODE: _unused, ...inheritedEnv } = process.env
  void _unused
  const isolation = createElectronHomeIsolation({
    inheritedEnv,
    launchEnv: {},
    extraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' },
    userDataDir: profile
  })
  await forceQuitElectronAppForE2E(previous)
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
    const page = await restarted.firstWindow({ timeout: 120_000 })
    await page.waitForFunction(() => window.__store?.getState().workspaceSessionReady === true)
    // Background restart has no animation frames for click stability; force only skips that check.
    await page.getByRole('button', { name: '项目总览', exact: true }).click({ force: true })
    const board = page.locator('.wb-ml')
    await expect(board.getByLabel('负责人', { exact: true }).first()).toHaveValue(
      '重启后恢复的草案',
      { timeout: 60_000 }
    )
    await board
      .getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true })
      .click({ force: true })
    await expect(board.getByLabel('负责人', { exact: true }).first()).toHaveValue('Builder 1')
    await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('消息与通知')
    await expect(board.getByLabel('特性名称', { exact: true }).nth(1)).toHaveValue('工程能力观测')
    await expect(board.getByText('知识库', { exact: true })).toHaveCount(0)
    await expect(board.locator('.wb-ml-row')).toHaveCount(2)
    await info.attach('milestone-process-restart', {
      body: JSON.stringify({
        previousPid,
        restartedPid: restarted.process().pid,
        formalFeatures: 2,
        unsentDraftRecovered: true
      }),
      contentType: 'application/json'
    })
  } finally {
    await closeElectronAppForE2E(restarted)
  }
}
