import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test, expect } from './helpers/workbench-app'
import type { Page } from '@playwright/test'
import { projectSettingsTest, verifyProjectSettings } from './helpers/workbench-project-settings'

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

/**
 * The native setup-script prompt card floats above the sidebar bottom
 * (bottom-full) and can cover the version-row entries once the async
 * inspection lands (seeded repos have no setup script, so it always does
 * after a reload/worktree activation re-runs it). Dismiss the card when
 * present, then click; one dismiss is persistent per repo, so later sidebar
 * clicks stay uncovered.
 */
async function clickVersionRowEntry(page: Page, name: string): Promise<void> {
  await expect(async () => {
    const dismissSetupCard = page.getByRole('button', { name: '关闭安装脚本' })
    if (await dismissSetupCard.isVisible().catch(() => false)) {
      await dismissSetupCard.click()
    }
    await page.getByRole('button', { name, exact: true }).click({ timeout: 5_000 })
  }).toPass({ timeout: 60_000 })
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
  await workbenchPage.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 180_000
  })
  const planTreePath = await waitForFixedWorktree(workbenchPage, 'bw/v9.9/plan')
  await expect
    .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  // prepare 只初始化空计划，不启动 agent；未开始卡在真实会话启动或材料形成后展开。
  await expect(workbenchPage.getByRole('button', { name: '开始计划', exact: true })).toBeVisible({
    timeout: 60_000
  })
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
  await expect(workbenchPage.getByRole('button', { name: '添加目标', exact: true })).toBeVisible()
  await workbenchPage.getByRole('button', { name: '展开 G1' }).click()
  await workbenchPage.getByRole('button', { name: '编辑目标', exact: true }).click()
  await workbenchPage
    .getByRole('textbox', { name: 'G1 目标', exact: true })
    .fill('验证计划材料保存·烟测')
  // 行内编辑聚焦时和弦不触发（isEditableTarget 守卫，#444）。
  await workbenchPage.keyboard.press('Alt+A')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toHaveCount(0)
  await workbenchPage.getByRole('button', { name: '结束编辑目标', exact: true }).click()
  await expect(workbenchPage.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)

  // ---- 批注模式同键进出（#444）：Alt+A ≡ 点页头按钮，再按退出 ----
  const annotateEntry = workbenchPage.locator('.g3-annotate-entry')
  await expect(annotateEntry).toBeVisible()
  await workbenchPage.keyboard.press('Alt+A')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toBeVisible()
  await expect(annotateEntry).toHaveAttribute('aria-pressed', 'true')
  await expect(annotateEntry).toHaveAttribute('title', expect.stringMatching(/Alt\+A|⌥A/))
  // Esc 不再退出模式（2026-10-29 拍板）：无小窗时按 Esc 模式保持，横幅不提 Esc。
  await workbenchPage.keyboard.press('Escape')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toBeVisible()
  await expect(annotateEntry).toHaveAttribute('aria-pressed', 'true')
  await expect(workbenchPage.locator('.g3-annotate-banner')).not.toContainText('Esc')
  await workbenchPage.keyboard.press('Alt+A')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toHaveCount(0)
  await expect(annotateEntry).toHaveAttribute('aria-pressed', 'false')

  // 改绑生效：store 走与设置录制相同的保存链；新和弦进出、旧和弦失效后恢复默认。
  await workbenchPage.evaluate(async () => {
    await window.__store
      ?.getState()
      .setKeybindingOverride('workbench.toggleAnnotationMode', ['Alt+Shift+A'])
  })
  await workbenchPage.keyboard.press('Alt+Shift+A')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toBeVisible()
  await workbenchPage.keyboard.press('Alt+A')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toBeVisible()
  await workbenchPage.keyboard.press('Alt+Shift+A')
  await expect(workbenchPage.locator('.g3-annotate-banner')).toHaveCount(0)
  await workbenchPage.evaluate(async () => {
    await window.__store?.getState().resetKeybindingOverride('workbench.toggleAnnotationMode')
  })

  // 终端聚焦时和弦流向 TUI（getKeybindingContext 守卫）；终端缺席则降级人工项。
  const terminalInput = workbenchPage.locator('.xterm-helper-textarea').first()
  if (
    await terminalInput.waitFor({ state: 'visible', timeout: 15_000 }).then(
      () => true,
      () => false
    )
  ) {
    await terminalInput.focus()
    await workbenchPage.keyboard.press('Alt+A')
    await expect(workbenchPage.locator('.g3-annotate-banner')).toHaveCount(0)
  }

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
  await clickVersionRowEntry(workbenchPage, '计划')
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
  await clickVersionRowEntry(workbenchPage, '验收')
  await expect(workbenchPage.getByRole('heading', { name: '版本验收' })).toBeVisible({
    timeout: 60_000
  })
  await waitForFixedWorktree(workbenchPage, 'bw/v9.9/acceptance')
  await expect
    .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
    .toBe('terminal')
  // 计划尚未合入也可开始会话；材料创建仍须核验固定计划，本用例不启动 agent。
  await expect(workbenchPage.locator('.acc-empty-board')).toBeVisible({ timeout: 60_000 })
  // 空板无批注入口，和弦无反应（条件可用性负例，#444）。
  await workbenchPage.keyboard.press('Alt+A')
  await expect(workbenchPage.locator('.acc-annotate-banner')).toHaveCount(0)
  await expect(workbenchPage.locator('.acc-annotate-entry')).toHaveCount(0)
  await expect(
    workbenchPage.getByRole('button', { name: '开始验收', exact: true }).first()
  ).toBeVisible({ timeout: 60_000 })
  await expect(workbenchPage.getByRole('button', { name: '开始验收', exact: true })).toBeEnabled()
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-acceptance-mounted.jpg') })

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

  // ---- 设置页 Shortcuts 收录与搜索（#444 走原生键位体系）----
  // 打开方式不是判据，走 store action 直达 shortcuts pane（与菜单/侧栏按钮同链切
  // activeView）。不点 i18n 按钮：原生 UI 文案随系统 locale，CI Linux 是英文，
  // 中文 accessible name 在 CI 上必超时（本地中文 Windows 曾误绿）。
  await workbenchPage.evaluate(() => {
    const store = window.__store?.getState()
    store?.openSettingsPage()
    store?.openSettingsTarget({ pane: 'shortcuts', repoId: null })
  })
  await workbenchPage.locator('#shortcut-filter-search').fill('批注')
  await expect(workbenchPage.getByText('Toggle Board Annotation Mode')).toBeVisible()
  await expect(workbenchPage.getByRole('heading', { name: 'Workbench' })).toBeVisible()
})
