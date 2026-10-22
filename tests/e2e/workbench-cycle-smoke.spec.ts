import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/workbench-app'
import type { Page } from '@playwright/test'
import { projectSettingsTest, verifyProjectSettings } from './helpers/workbench-project-settings'

/**
 * BW main-chain smoke: the workbench shell must formally select the fixed
 * plan/acceptance worktrees, select a real file fixture and autosave edits through
 * host RPC, persist the workflow version preference, and read everything back
 * independently from disk after a renderer reload. Metrics stay honestly
 * Unknown without configuration — no demo values may appear.
 *
 * Requires a workbench build: VITE_WORKBENCH_SHELL=1 baked at `electron-vite
 * build` time (the E2E globalSetup build picks it up from the environment).
 */
test.use({
  workbenchAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  }
})

projectSettingsTest(
  'BW project settings: reviewed edits, conflict protection and filesystem read-back',
  async ({ workbenchPage, seededRepoPath }, testInfo) => {
    test.setTimeout(300_000)
    await verifyProjectSettings(workbenchPage, seededRepoPath, testInfo)
  }
)

async function waitForFixedWorktree(page: Page, branch: string): Promise<string> {
  await expect
    .poll(
      () =>
        page.evaluate((target) => {
          const store = window.__store
          if (!store) {
            return null
          }
          return (
            store
              .getState()
              .allWorktrees()
              .find(
                (item: { branch: string }) => item.branch?.replace('refs/heads/', '') === target
              )?.path ?? null
          )
        }, branch),
      { timeout: 180_000, message: `fixed worktree ${branch} never appeared` }
    )
    .not.toBeNull()
  return page.evaluate((target) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    return store
      .getState()
      .allWorktrees()
      .find((item: { branch: string }) => item.branch?.replace('refs/heads/', '') === target)
      ?.path as string
  }, branch)
}

test('BW cycle main chain: fixed trees, version material save and independent read-back', async ({
  workbenchPage,
  testRepoPath
}, testInfo) => {
  test.setTimeout(900_000)
  void testRepoPath

  // The workbench chrome is the readiness signal for the BW shell; the helper
  // already seeded the project repo and its worktrees.
  await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })

  // ---- 计划屏：固定树正式选择 + 选择真实文件材料 + 自动保存 + 磁盘独立读回 ----
  await workbenchPage.getByRole('button', { name: '计划', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 60_000
  })
  const planTreePath = await waitForFixedWorktree(workbenchPage, 'bw/week-plan')
  await expect
    .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  await expect(
    workbenchPage.getByRole('button', { name: '与计划助手新建计划', exact: true }).first()
  ).toBeVisible()
  await expect(workbenchPage.locator('.vc-chat')).toHaveCount(0)
  await expect
    .poll(
      () =>
        workbenchPage.evaluate(() => {
          const store = window.__store
          return store ? store.getState().activeWorktreeId : null
        }),
      {
        timeout: 60_000,
        message: 'plan fixed tree was never formally selected'
      }
    )
    .not.toBeNull()

  // The conversation/CLI creates materials in product use. Seed only this test
  // version on the real fixed tree; listing, selection and editing remain UI work.
  const materialDirectory = path.join(planTreePath, '.bw', 'planning', 'v9.9')
  mkdirSync(materialDirectory, { recursive: true })
  writeFileSync(
    path.join(materialDirectory, 'data.json'),
    JSON.stringify({
      schema_version: 3,
      version: 'v9.9',
      cycleId: 'smoke-plan',
      summary: { progress: '', risks: '' },
      goals: [
        {
          goalId: 'smoke-goal',
          title: '验证计划材料保存',
          deliverable: '文件独立读回',
          metricTargets: []
        }
      ],
      tasks: []
    }),
    'utf8'
  )
  const versionSelect = workbenchPage.getByLabel('计划版本')
  await expect(versionSelect.locator('option[value="v9.9"]')).toBeAttached({ timeout: 30_000 })
  await versionSelect.selectOption('v9.9')

  const goal = workbenchPage.locator('[data-goal-id="smoke-goal"]')
  await expect(goal).toBeVisible({ timeout: 60_000 })
  const expand = goal.getByRole('button', { name: '展开 G1', exact: true })
  if (await expand.count()) {
    await expand.click()
  }
  await goal.getByRole('button', { name: '编辑目标', exact: true }).click()
  await goal.getByRole('textbox', { name: 'G1 目标', exact: true }).fill('烟测目标：主链接通')
  await expect(workbenchPage.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)

  // Iron-law read-back: the material exists on the fixed worktree's own disk path.
  await expect
    .poll(
      () => {
        const file = path.join(planTreePath, '.bw', 'planning', 'v9.9', 'data.json')
        if (!existsSync(file)) {
          return null
        }
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
          version: string
          goals: { title: string }[]
        }
        return `${parsed.version}:${parsed.goals[0].title}`
      },
      { timeout: 30_000, message: 'plan material never landed on disk' }
    )
    .toBe('v9.9:烟测目标：主链接通')
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-plan-saved.png') })

  // ---- 重载读回：流程选版偏好与材料都从宿主恢复 ----
  await workbenchPage.reload()
  await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await workbenchPage.getByRole('button', { name: '计划', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 60_000
  })
  await expect
    .poll(
      () =>
        workbenchPage
          .getByLabel('计划版本')
          .inputValue()
          .catch(() => ''),
      { timeout: 120_000, message: 'version preference did not survive reload' }
    )
    .toBe('v9.9')
  await expect(workbenchPage.locator('[data-goal-id="smoke-goal"]')).toContainText(
    '烟测目标：主链接通',
    { timeout: 60_000 }
  )

  // ---- 验收屏：独立固定树挂载 ----
  await workbenchPage.getByRole('button', { name: '验收', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本验收' })).toBeVisible({
    timeout: 60_000
  })
  await waitForFixedWorktree(workbenchPage, 'bw/week-acceptance')
  await expect
    .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  await expect(
    workbenchPage.getByRole('button', { name: '新建验收', exact: true }).first()
  ).toBeVisible()
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-acceptance-mounted.png') })

  // ---- 总览：真实数据，未配置保持 Unknown，无演示值 ----
  await workbenchPage.getByRole('button', { name: '总览', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '总览', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(workbenchPage.getByText('未配置北极星指标')).toBeVisible({
    timeout: 60_000
  })
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-overview-real.png') })
})
