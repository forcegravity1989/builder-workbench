import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/workbench-app'
import type { Page } from '@playwright/test'

/**
 * BW main-chain smoke (G2 journey): the version workspace entry must prepare the
 * bound plan/acceptance flow trees through workbench.versionWorkspace.prepare,
 * mount the plan board beside the native terminal, keep material edits on the
 * bound tree's own disk path (binding-fenced authorization), survive a renderer
 * reload from the sidebar version row (binding = version authority, no second
 * preference store), and reach the acceptance board + real-data overview.
 * Metrics stay honestly Unknown without configuration — no demo values.
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

test('BW cycle main chain: bound flow trees via new-version prepare, material save and independent read-back', async ({
  workbenchPage,
  testRepoPath
}, testInfo) => {
  test.setTimeout(900_000)
  void testRepoPath

  // The workbench chrome is the readiness signal for the BW shell; the helper
  // already seeded the project repo and its worktrees.
  await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })

  // ---- 新建版本：轻表单 → prepare 两棵绑定流程树 → 进入计划屏 ----
  await workbenchPage.getByRole('button', { name: '新建版本', exact: true }).click()
  await workbenchPage.getByLabel('版本名').fill('v9.9')
  await workbenchPage.getByRole('button', { name: '创建并进入计划', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 180_000
  })
  const planTreePath = await waitForFixedWorktree(workbenchPage, 'bw/v9.9/plan')
  await expect
    .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  // G3 板面：唯一会话发起入口=目标区空板卡（仅无计划时显示）；prepare 不启动
  // 任何会话/agent，空板卡在场即其反证。
  await expect(
    workbenchPage.getByRole('button', { name: '与计划助手新建计划', exact: true })
  ).toBeVisible()
  await expect
    .poll(
      () =>
        workbenchPage.evaluate(() => {
          const store = window.__store
          return store ? store.getState().activeWorktreeId : null
        }),
      {
        timeout: 60_000,
        message: 'bound plan tree was never formally selected'
      }
    )
    .not.toBeNull()
  // prepare 的空计划是 create-only 初始化；绑定树无屏内选版，页头只读回显绑定版本。
  await expect(workbenchPage.locator('.g3-version-bound')).toHaveText('v9.9', { timeout: 60_000 })

  // The conversation/CLI creates materials in product use. Seed only this test
  // version on the bound tree's real path; listing and editing remain UI work.
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
  // The board polls the host; the seeded goal card proves the re-read happened
  // before we edit (autosave must carry the fresh revision). G3 目标卡：标题在
  // 卡头 strong 回显，行内编辑经「编辑目标」进入、无保存按钮（自动保存）。
  await expect(workbenchPage.locator('.g3-goal-toggle strong')).toHaveText('验证计划材料保存', {
    timeout: 60_000
  })
  await workbenchPage.getByRole('button', { name: '展开 G1' }).click()
  await workbenchPage.getByRole('button', { name: '编辑目标', exact: true }).click()
  await workbenchPage.getByLabel('G1 目标').fill('验证计划材料保存·烟测')
  await workbenchPage.getByRole('button', { name: '结束编辑目标', exact: true }).click()
  await expect(workbenchPage.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)

  // Iron-law read-back: the material exists on the bound worktree's own disk path.
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
        return `${parsed.version}:${parsed.goals[0]?.title ?? ''}`
      },
      { timeout: 30_000, message: 'plan material never landed on disk' }
    )
    .toBe('v9.9:验证计划材料保存·烟测')
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-plan-saved.png') })

  // ---- 重载读回：绑定即版本正本，侧栏版本行重新进屏，材料从宿主恢复 ----
  await workbenchPage.reload()
  await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await workbenchPage.getByRole('button', { name: '计划', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 60_000
  })
  await expect(workbenchPage.locator('.g3-version-bound')).toHaveText('v9.9', {
    timeout: 120_000
  })
  await expect(workbenchPage.locator('.g3-goal-toggle strong')).toHaveText(
    '验证计划材料保存·烟测',
    { timeout: 60_000 }
  )

  // ---- 验收屏：同一 prepare 交付的绑定验收树挂载 ----
  await workbenchPage.getByRole('button', { name: '验收', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本验收' })).toBeVisible({
    timeout: 60_000
  })
  await waitForFixedWorktree(workbenchPage, 'bw/v9.9/acceptance')
  await expect
    .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  await expect(
    workbenchPage.getByRole('button', { name: '新建验收', exact: true }).first()
  ).toBeVisible()
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-acceptance-mounted.png') })

  // ---- 总览：真实数据，未配置保持 Unknown，无演示值 ----
  await workbenchPage.getByRole('button', { name: '项目总览', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '总览', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(workbenchPage.getByText('未配置北极星指标')).toBeVisible({
    timeout: 60_000
  })
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-overview-real.png') })

  // ---- 版本级清理确认单：本机实例默认勾选；删除执行沿 Orca 原生确认单，
  // 破坏性步骤不进 CI（J9 归人验证），此处只核对清单结构与取消路径。----
  await workbenchPage.getByRole('button', { name: '清理 v9.9 工作树' }).click()
  const cleanup = workbenchPage.getByRole('dialog').filter({ hasText: '清理 v9.9 工作树' })
  await expect(cleanup.getByRole('checkbox')).toHaveCount(2, { timeout: 60_000 })
  await expect(cleanup.getByRole('checkbox').first()).toBeChecked()
  await expect(cleanup.getByRole('button', { name: /删除所勾选（2）/ })).toBeEnabled()
  await cleanup.getByRole('button', { name: '取消' }).click()
  await expect(cleanup).toHaveCount(0)

  // ---- 版本总览（P6）：每版「总览」行挂载表格页；未提交材料如实缺失，不装绿 ----
  const v99Group = workbenchPage.locator('.wb-version-group', {
    has: workbenchPage.getByRole('button', { name: 'v9.9 展开或收起' })
  })
  await v99Group.getByRole('button', { name: '总览', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: 'v9.9 版本总览' })).toBeVisible({
    timeout: 60_000
  })
  await expect(workbenchPage.getByText('主干没有 v9.9 的已提交计划材料。')).toBeVisible({
    timeout: 60_000
  })
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-version-overview.png') })
})
