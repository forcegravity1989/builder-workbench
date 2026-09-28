import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import type { Page } from '@playwright/test'

/**
 * BW main-chain smoke: the workbench shell must formally select the fixed
 * plan/acceptance worktrees, create and save version material through the real
 * host RPC, persist the workflow version preference, and read everything back
 * independently from disk after a renderer reload. Metrics stay honestly
 * Unknown without configuration — no demo values may appear.
 *
 * Requires a workbench build: VITE_WORKBENCH_SHELL=1 baked at `electron-vite
 * build` time (the E2E globalSetup build picks it up from the environment).
 */
test.use({
  orcaAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  }
})

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
  orcaPage,
  testRepoPath
}, testInfo) => {
  test.setTimeout(900_000)
  void testRepoPath

  // The workbench chrome is the readiness signal for the BW shell; the helper
  // already seeded the project repo and its worktrees.
  await expect(orcaPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })

  // ---- 计划屏：固定树正式选择 + 明确新建版本 + 保存 + 磁盘独立读回 ----
  await orcaPage.getByRole('button', { name: '计划', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: '版本计划' })).toBeVisible({ timeout: 60_000 })
  const planTreePath = await waitForFixedWorktree(orcaPage, 'bw/week-plan')
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  await expect(
    orcaPage.getByRole('button', { name: '新建计划', exact: true }).first()
  ).toBeVisible()
  await expect(orcaPage.locator('.vc-chat')).toHaveCount(0)
  await expect
    .poll(
      () =>
        orcaPage.evaluate(() => {
          const store = window.__store
          return store ? store.getState().activeWorktreeId : null
        }),
      {
        timeout: 60_000,
        message: 'plan fixed tree was never formally selected'
      }
    )
    .not.toBeNull()

  await orcaPage.getByRole('button', { name: '新建版本' }).click()
  await orcaPage.getByPlaceholder('例如 v0.5').fill('v9.9')
  await orcaPage.getByRole('button', { name: '创建计划草稿' }).click()

  const progress = orcaPage.locator('.vp-preparation textarea').first()
  await expect(progress).toBeEnabled({ timeout: 60_000 })
  await progress.fill('烟测进展：主链接通')
  await orcaPage.getByRole('button', { name: '保存草稿' }).click()
  await expect(orcaPage.getByText('草稿已保存')).toBeVisible({ timeout: 60_000 })

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
          summary: { progress: string }
        }
        return `${parsed.version}:${parsed.summary.progress}`
      },
      { timeout: 30_000, message: 'plan material never landed on disk' }
    )
    .toBe('v9.9:烟测进展：主链接通')
  await orcaPage.screenshot({ path: testInfo.outputPath('bw-plan-saved.png') })

  // ---- 重载读回：流程选版偏好与材料都从宿主恢复 ----
  await orcaPage.reload()
  await expect(orcaPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await orcaPage.getByRole('button', { name: '计划', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: '版本计划' })).toBeVisible({ timeout: 60_000 })
  await expect
    .poll(
      () =>
        orcaPage
          .getByLabel('计划版本')
          .inputValue()
          .catch(() => ''),
      { timeout: 120_000, message: 'version preference did not survive reload' }
    )
    .toBe('v9.9')
  await expect(orcaPage.locator('.vp-preparation textarea').first()).toHaveValue(
    '烟测进展：主链接通',
    { timeout: 60_000 }
  )

  // ---- 验收屏：独立固定树挂载 ----
  await orcaPage.getByRole('button', { name: '验收', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: '版本验收' })).toBeVisible({ timeout: 60_000 })
  await waitForFixedWorktree(orcaPage, 'bw/week-acceptance')
  await expect
    .poll(() => orcaPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  await expect(
    orcaPage.getByRole('button', { name: '新建验收', exact: true }).first()
  ).toBeVisible()
  await orcaPage.screenshot({ path: testInfo.outputPath('bw-acceptance-mounted.png') })

  // ---- 总览：真实数据，未配置保持 Unknown，无演示值 ----
  await orcaPage.getByRole('button', { name: '总览', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: '总览', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(orcaPage.getByText('未配置北极星指标')).toBeVisible({
    timeout: 60_000
  })
  await orcaPage.screenshot({ path: testInfo.outputPath('bw-overview-real.png') })
})
