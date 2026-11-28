import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test as baseTest, expect } from '../../helpers/workbench-app'
import type { Page } from '@playwright/test'
import type { Automation } from '../../../../src/shared/automations/automation-definition'
import type { RuntimeRpcResponse } from '../../../../src/shared/remote-runtime/rpc/runtime-rpc-envelope'
import {
  configureGoldenStubAgent,
  getGoldenStubAgentLaunchEnv
} from '../../helpers/golden-stub-agent'
import { recordWorkspaceInventory } from '../../helpers/workbench-fixed-workspace-readback'
import { verifyWorkflowDraft } from '../../helpers/workbench-workflow-draft'

const test = baseTest.extend({ launchEnv: getGoldenStubAgentLaunchEnv() })

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

async function readCycleAutomations(page: Page): Promise<Automation[]> {
  return page.evaluate(async () => {
    const result = (await window.api.runtime.call({
      method: 'automation.list'
    })) as RuntimeRpcResponse<{ automations: Automation[] }>
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    return result.result.automations.filter((item) => item.creationKey?.startsWith('bw-cycle:'))
  })
}

async function enterCycleScreen(page: Page, label: '计划' | '验收'): Promise<void> {
  await page.getByRole('button', { name: '版本工作区', exact: true }).click()
  await clickVersionRowEntry(page, label)
  await expect(page.getByRole('heading', { name: `版本${label}`, exact: true })).toBeVisible()
  await expect(page.locator('.g3-version-bound, .acc-version-bound')).toHaveText('v9.9')
}

async function verifyNoImplicitCycleAutomation(page: Page, evidencePath: string): Promise<void> {
  await page.getByRole('button', { name: '自动化', exact: true }).click()
  await expect(page.locator('[data-automations-page-search]')).toBeVisible()
  await expect(page.locator('[data-automation-row-id]')).toHaveCount(0)
  expect(await readCycleAutomations(page)).toEqual([])
  await page.screenshot({ path: evidencePath })
}

async function createPlanAutomation(page: Page, name: string): Promise<Automation> {
  const editor = page.getByRole('dialog', { name: /^(Create automation|创建自动化)$/i })
  await expect(editor.getByRole('textbox', { name: /Automation name|自动化名称/i })).toHaveValue(
    '每周版本计划'
  )
  await editor.getByRole('textbox', { name: /Automation name|自动化名称/i }).fill(name)
  await editor.getByRole('combobox', { name: /Cadence|节奏/i }).click()
  await page.getByRole('option', { name: /Custom cron|自定义 cron/i }).click()
  const month = ((new Date().getMonth() + 2) % 12) + 1
  await editor.getByPlaceholder('0 9 * * 1-5', { exact: true }).fill(`0 0 1 ${month} *`)
  await editor.getByRole('button', { name: /^(Create|创建)$/i }).click()
  await expect(editor).toBeHidden()
  await expect.poll(() => readCycleAutomations(page)).toMatchObject([{ name }])
  const [saved] = await readCycleAutomations(page)
  return saved
}

test('BW cycle main chain: bound flow trees via new-version prepare, material save and independent read-back', async ({
  workbenchPage,
  seededRepoPath
}, testInfo) => {
  test.setTimeout(900_000)

  // The workbench chrome is the readiness signal for the BW shell; the helper
  // already seeded the project repo and its worktrees.
  await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await recordWorkspaceInventory(workbenchPage, seededRepoPath, testInfo, 'initial')

  await workbenchPage.evaluate(() => {
    const state = window.__store?.getState()
    const repoId = state?.activeRepoId ?? state?.repos[0]?.id
    if (!repoId) {
      throw new Error('active project unavailable')
    }
    localStorage.setItem(`workbench.version-expanded:${repoId}`, '[]')
  })
  await workbenchPage.reload()
  await expect(workbenchPage.locator('[data-workbench-rail]')).toBeVisible({ timeout: 180_000 })
  await workbenchPage.getByRole('button', { name: '版本工作区', exact: true }).click()
  await workbenchPage.getByRole('button', { name: /^(查看活动|View activity)$/ }).click()
  await expect(workbenchPage.locator('[data-workbench-versions]')).toHaveCount(0)
  await workbenchPage.getByRole('button', { name: '版本工作区', exact: true }).click()
  await expect(workbenchPage.locator('[data-workbench-versions]')).toBeVisible()

  // ---- 新建版本：轻表单 → prepare 两棵绑定流程树 → 进入计划屏 ----
  const versionGuide = workbenchPage.locator('[data-contextual-tour-panel]')
  const dismissVersionGuide = versionGuide.locator('[data-contextual-tour-skip]')
  if (await dismissVersionGuide.isVisible()) {
    await dismissVersionGuide.click()
  }
  await workbenchPage.getByRole('button', { name: '新建版本', exact: true }).press('Enter')
  await workbenchPage.getByLabel('版本名').fill('v9.9')
  await workbenchPage.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 180_000
  })
  const planGuide = workbenchPage.locator('[data-contextual-tour-panel]')
  await expect(planGuide.getByText('开始或继续计划', { exact: true })).toBeVisible()
  await planGuide.locator('[data-contextual-tour-skip]').click()
  await expect(planGuide).toBeHidden()
  await expect
    .poll(() =>
      workbenchPage.evaluate(async () =>
        (await window.api.ui.get()).contextualToursSeenIds?.includes('workbench-plan')
      )
    )
    .toBe(true)
  await workbenchPage.getByRole('button', { name: '版本计划帮助', exact: true }).click()
  await expect(planGuide.getByText('开始或继续计划', { exact: true })).toBeVisible()
  await planGuide.locator('[data-contextual-tour-skip]').click()
  const createdVersionToggle = workbenchPage.getByRole('button', {
    name: 'v9.9 展开或收起',
    exact: true
  })
  await expect(createdVersionToggle).toHaveAttribute('aria-expanded', 'true')
  await createdVersionToggle.press('Enter')
  await expect(createdVersionToggle).toHaveAttribute('aria-expanded', 'false')
  await createdVersionToggle.press('Enter')
  await expect(createdVersionToggle).toHaveAttribute('aria-expanded', 'true')
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
  await recordWorkspaceInventory(workbenchPage, seededRepoPath, testInfo, 'prepared')
  await configureGoldenStubAgent(workbenchPage, { agentArgs: '--codex-draft' })
  await verifyNoImplicitCycleAutomation(
    workbenchPage,
    testInfo.outputPath('bw-plan-automation-empty.png')
  )
  await enterCycleScreen(workbenchPage, '计划')
  await workbenchPage.getByRole('button', { name: '开始计划', exact: true }).click()
  await verifyWorkflowDraft(workbenchPage, 'week-planning', testInfo)

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
  // The plan guide yields while autosave is writing. Start replay after the edit settles.
  await expect(workbenchPage.locator('.vp-title-row').getByRole('status')).toHaveText('已保存')

  // ---- 批注模式同键进出（#444）：Alt+A ≡ 点页头按钮，再按退出 ----
  const annotateEntry = workbenchPage.locator('.g3-annotate-entry')
  await expect(annotateEntry).toBeVisible()
  const planHelp = workbenchPage.getByRole('button', { name: '版本计划帮助', exact: true })
  await expect(workbenchPage.locator('.g3-header-tools + button')).toHaveAttribute(
    'aria-label',
    '版本计划帮助'
  )
  await planHelp.click()
  await planGuide.getByRole('button', { name: /^(Next|下一步)$/ }).press('Enter')
  await expect(planGuide.getByRole('heading', { name: '给计划留下评审意见' })).toBeVisible()
  await planGuide.getByRole('button', { name: /^(Next|下一步)$/ }).press('Enter')
  await expect(planGuide.getByRole('heading', { name: '评审后归档' })).toBeVisible()
  await planGuide.locator('[data-contextual-tour-skip]').click()
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
  // 计划尚未合入也可打开草稿；fixture agent 不执行模型动作，材料仍须核验固定计划。
  await expect(workbenchPage.locator('.acc-empty-board')).toBeVisible({ timeout: 60_000 })
  // 空板无批注入口，和弦无反应（条件可用性负例，#444）。
  await workbenchPage.keyboard.press('Alt+A')
  await expect(workbenchPage.locator('.acc-annotate-banner')).toHaveCount(0)
  await expect(workbenchPage.locator('.acc-annotate-entry')).toHaveCount(0)
  await expect(
    workbenchPage.getByRole('button', { name: '开始验收', exact: true }).first()
  ).toBeVisible({ timeout: 60_000 })
  await expect(workbenchPage.getByRole('button', { name: '开始验收', exact: true })).toBeEnabled()
  await workbenchPage.getByRole('button', { name: '开始验收', exact: true }).click()
  await verifyWorkflowDraft(workbenchPage, 'version-acceptance', testInfo)
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-acceptance-mounted.jpg') })

  await test.step('Cycle automation is created only through the native editor', async () => {
    await verifyNoImplicitCycleAutomation(
      workbenchPage,
      testInfo.outputPath('bw-acceptance-automation-empty.png')
    )
    const configure = workbenchPage.getByRole('button', { name: '配置自动化', exact: true })
    const createEditor = workbenchPage.getByRole('dialog', {
      name: /^(Create automation|创建自动化)$/i
    })
    const editEditor = workbenchPage.getByRole('dialog', {
      name: /^(Edit automation|编辑自动化)$/i
    })
    const nameLabel = /Automation name|自动化名称/i
    const cancelLabel = /^(Cancel|取消)$/i
    await enterCycleScreen(workbenchPage, '验收')
    await configure.click()
    await expect(createEditor.getByRole('textbox', { name: nameLabel })).toHaveValue('每周版本验收')
    await workbenchPage.screenshot({
      path: testInfo.outputPath('bw-acceptance-automation-configure.png')
    })
    await createEditor.getByRole('button', { name: cancelLabel }).click()
    expect(await readCycleAutomations(workbenchPage)).toEqual([])

    await enterCycleScreen(workbenchPage, '计划')
    const planWorktreeId = await workbenchPage.evaluate(
      () => window.__store?.getState().activeWorktreeId
    )
    await configure.click()
    expect(await readCycleAutomations(workbenchPage)).toEqual([])
    const name = 'W02 manually configured plan'
    const existing = await createPlanAutomation(workbenchPage, name)
    expect(existing).toMatchObject({
      workspaceId: planWorktreeId,
      workspaceMode: 'existing',
      reuseSession: false,
      prompt: expect.stringContaining('v9.9')
    })
    expect(existing.creationKey).toMatch(/:plan:v9\.9$/)

    await enterCycleScreen(workbenchPage, '计划')
    await configure.click()
    await expect(editEditor.getByRole('textbox', { name: nameLabel })).toHaveValue(name)
    await workbenchPage.screenshot({ path: testInfo.outputPath('bw-plan-automation-edit.png') })
    await editEditor.getByRole('button', { name: cancelLabel }).click()
    const [current] = await readCycleAutomations(workbenchPage)
    expect(current).toMatchObject({
      id: existing.id,
      enabled: existing.enabled,
      rrule: existing.rrule,
      timezone: existing.timezone,
      agentId: existing.agentId,
      reuseSession: existing.reuseSession
    })
    const row = workbenchPage.locator('[data-automation-row-id]').filter({ hasText: name })
    await row.click({ button: 'right' })
    const deleteLabel = /^(Delete|删除)$/i
    await workbenchPage.getByRole('menuitem', { name: deleteLabel }).click()
    await workbenchPage
      .getByRole('dialog', { name: deleteLabel })
      .getByRole('button', { name: deleteLabel })
      .click()
    await expect.poll(() => readCycleAutomations(workbenchPage)).toEqual([])

    await enterCycleScreen(workbenchPage, '计划')
    await configure.click()
    await expect(createEditor.getByRole('textbox', { name: nameLabel })).toHaveValue('每周版本计划')
    await workbenchPage.screenshot({ path: testInfo.outputPath('bw-plan-automation-recreate.png') })
    const replacement = await createPlanAutomation(workbenchPage, `${name} recreated`)
    expect(replacement.id).not.toBe(existing.id)
    expect(replacement.creationKey).toBe(existing.creationKey)
    expect(replacement.workspaceId).toBe(planWorktreeId)
    writeFileSync(
      testInfo.outputPath('bw-cycle-automation-readback.json'),
      JSON.stringify({ existing, replacement }, null, 2)
    )
  })

  // ---- 墙卡和总览名片使用同一个在制版本，包含只有草稿的版本。----
  await workbenchPage.getByRole('button', { name: '项目墙', exact: true }).click()
  const versionCard = workbenchPage.locator('[data-workbench-project-key]').filter({
    has: workbenchPage.locator('.pcard-version').getByText('v9.9', { exact: true })
  })
  const savedGoal = '验证计划材料保存·烟测'
  const updatedGoal = '回到项目墙后静默更新的目标'
  const planFile = path.join(materialDirectory, 'data.json')
  const savedPlan = readFileSync(planFile, 'utf8')
  await expect(versionCard.locator('.pcard-delivery li')).toHaveText(savedGoal)
  const wallRepoId = await versionCard.getAttribute('data-workbench-project-id')
  await workbenchPage.getByRole('button', { name: '关闭项目墙', exact: true }).click()
  await expect(workbenchPage.locator('[data-screen="wall"]')).toHaveCount(0)
  await workbenchPage.evaluate((id) => {
    const observer = new MutationObserver(() => {
      const delivery = document.querySelector(
        `[data-workbench-project-id="${CSS.escape(id ?? '')}"] .pcard-delivery`
      )
      if (delivery) {
        document.documentElement.dataset.firstWallDelivery = delivery.textContent ?? ''
        observer.disconnect()
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  }, wallRepoId)
  try {
    writeFileSync(planFile, savedPlan.replace(savedGoal, updatedGoal))
    await workbenchPage.getByRole('button', { name: '项目墙', exact: true }).click()
    await expect(workbenchPage.locator('html')).toHaveAttribute(
      'data-first-wall-delivery',
      new RegExp(savedGoal)
    )
    await expect(versionCard.locator('.pcard-delivery li')).toHaveText(updatedGoal)
  } finally {
    writeFileSync(planFile, savedPlan)
  }
  await versionCard.locator('[data-workbench-open-overview]').click({ timeout: 60_000 })
  await expect(workbenchPage.getByRole('heading', { name: '总览', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(workbenchPage.locator('#project-card')).toContainText('v9.9', {
    timeout: 60_000
  })
  await expect(workbenchPage.getByText('未配置北极星指标')).toHaveCount(0)
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-overview-real.png') })

  // ---- 版本级清理确认单：本机实例默认勾选；删除执行沿 Orca 原生确认单，
  // 破坏性步骤不进 CI（J9 归人验证），此处只核对清单结构与取消路径。----
  await expect(workbenchPage.locator('[data-workbench-versions]')).toHaveCount(0)
  await workbenchPage.getByRole('button', { name: '版本工作区', exact: true }).click()
  await expect(workbenchPage.locator('[data-workbench-versions]')).toBeVisible()
  await workbenchPage.getByRole('button', { name: '清理 v9.9 工作树' }).click()
  const cleanup = workbenchPage.getByRole('dialog').filter({ hasText: '清理 v9.9 工作树' })
  await expect(cleanup.getByRole('checkbox')).toHaveCount(2, { timeout: 60_000 })
  await expect(cleanup.getByRole('checkbox').first()).toBeChecked()
  await expect(cleanup.getByRole('button', { name: /删除所勾选（2）/ })).toBeEnabled()
  await cleanup.getByRole('button', { name: '取消' }).click()
  await expect(cleanup).toHaveCount(0)

  // The saved bound-tree plan is visible as a draft; it is not a formal plan or acceptance.
  const v99Group = workbenchPage.locator('.wb-version-group', {
    has: workbenchPage.getByRole('button', { name: 'v9.9 展开或收起' })
  })
  await v99Group.getByRole('button', { name: '总览', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: 'v9.9 版本总览' })).toBeVisible({
    timeout: 60_000
  })
  await expect(
    workbenchPage.locator('.bwo-header').getByText('计划草稿', { exact: true })
  ).toBeVisible({
    timeout: 60_000
  })
  await expect(
    workbenchPage.getByRole('heading', { name: '验证计划材料保存·烟测', exact: true })
  ).toBeVisible()
  await expect(
    workbenchPage.getByRole('button', { name: '未记录验收 ↗', exact: true })
  ).toBeVisible()
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-version-overview.png') })

  await workbenchPage.getByRole('button', { name: '项目总览', exact: true }).click()
  await workbenchPage.getByRole('button', { name: '配置指标', exact: true }).first().click()
  await verifyWorkflowDraft(workbenchPage, 'metrics-refresh', testInfo)

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
  await recordWorkspaceInventory(workbenchPage, seededRepoPath, testInfo, 'final')
})
