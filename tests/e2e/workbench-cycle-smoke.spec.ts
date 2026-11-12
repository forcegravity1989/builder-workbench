import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test as baseTest, expect } from './helpers/workbench-app'
import type { Page } from '@playwright/test'
import {
  projectSettingsTest as isolatedProjectTest,
  verifyProjectSettings
} from './helpers/workbench-project-settings'
import { verifyMilestones } from './helpers/workbench-milestones'
import { verifyMilestoneRestart } from './helpers/workbench-milestone-restart'
import { fixedWorkspaceTest } from './helpers/workbench-fixed-workspace-fixture'
import { verifyFixedWorkspaceRemoteReuse } from './helpers/workbench-fixed-workspace'
import { recordWorkspaceInventory } from './helpers/workbench-fixed-workspace-readback'
import { configureGoldenStubAgent, getGoldenStubAgentLaunchEnv } from './helpers/golden-stub-agent'
import { verifyWorkflowDraft } from './helpers/workbench-workflow-draft'

/**
 * BW main-chain smoke (G2 journey): creating a version must prepare the
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
const test = baseTest.extend({ launchEnv: getGoldenStubAgentLaunchEnv() })

test.use({
  workbenchAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  }
})

test('explores work journeys and reuses feature demonstrations from Help', async ({
  workbenchPage
}, testInfo) => {
  const help = workbenchPage.locator('[data-workbench-rail]').getByRole('button', {
    name: /^(Help|帮助)$/
  })
  const exploreName = /^(Explore BW|探索 BW)$/
  const dialog = workbenchPage.getByRole('dialog', { name: exploreName })
  const features = dialog.getByRole('tab', { name: /^(Features|功能)$/ })
  const journeys = dialog.getByRole('tab', { name: /^(Work journeys|工作旅程)$/ })
  const workspaceDemo = dialog.locator('[data-ws-id]').first()

  await help.click()
  await workbenchPage.getByRole('menuitem', { name: exploreName }).click()
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect(features).toHaveAttribute('aria-selected', 'true')
  await expect(workspaceDemo).toBeVisible()
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-explore-features.png') })

  await features.focus()
  await workbenchPage.keyboard.press('ArrowLeft')
  await expect(journeys).toHaveAttribute('aria-selected', 'true')
  const journeyNav = dialog.getByRole('navigation', { name: /^(Work journeys|工作旅程)$/ })
  await expect(journeyNav.getByRole('button')).toHaveCount(7)
  await expect(journeyNav.getByText(/^(In development|建设中)$/)).toHaveCount(2)
  const maintenance = /^(Keep the project maintainable|让项目持续可维护)$/
  await journeyNav
    .getByRole('button', { name: /Keep the project maintainable|让项目持续可维护/ })
    .click()
  const maintenanceContent = dialog.getByRole('region', { name: maintenance })
  await expect(maintenanceContent.getByRole('heading', { name: maintenance })).toBeVisible()
  await expect(maintenanceContent.getByText(/^(In development|建设中)$/)).toBeVisible()
  await journeyNav
    .getByRole('button', { name: /Take a task through review|把问题推进到可信交付/ })
    .click()
  await expect(dialog.getByText(/^(Content in preparation|内容准备中)$/)).toBeVisible()
  await expect(workspaceDemo).toHaveCount(0)
  await workbenchPage.screenshot({ path: testInfo.outputPath('bw-explore-journey.png') })

  await dialog
    .getByRole('button', { name: /^(Review notifications and shared hosts|评审通知与共享主机)$/ })
    .click()
  await expect(features).toHaveAttribute('aria-selected', 'true')
  await expect(
    dialog.getByRole('heading', {
      name: /^(Review notifications and shared hosts|评审通知与共享主机)$/
    })
  ).toBeVisible()
  await expect(workspaceDemo).toHaveCount(0)
  await dialog.getByRole('button', { name: /^(Browser and annotations|内置浏览器与批注)$/ }).click()
  await expect(dialog.getByRole('heading', { name: /^(Browser|浏览器)$/ })).toBeVisible()

  await workbenchPage.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await help.click()
  await workbenchPage.getByRole('menuitem', { name: exploreName }).click()
  await expect(workspaceDemo).toBeVisible()
})

test.describe('BW first-run project handoff', () => {
  test.use({ dismissOnboarding: false, seedTestRepo: false })

  test('stays on the project wall after cancel and first add until the user opens the project', async ({
    electronApp,
    seededRepoPath,
    workbenchPage
  }, testInfo) => {
    const onboarding = workbenchPage.locator('[data-onboarding-modal]')
    const title = onboarding.getByRole('heading', { level: 1 })
    const next = onboarding.locator('footer').getByRole('button', { name: /^(Continue|继续)/ })
    const addFirstProject = onboarding.locator('footer').getByRole('button', {
      name: /^(Add your first project|添加第一个项目)/
    })
    await expect(title).toHaveText(/Pick your default agent|选择默认智能体/)
    for (let step = 0; step < 4 && !(await addFirstProject.isVisible()); step++) {
      const previousTitle = await title.innerText()
      await next.click()
      await expect(title).not.toHaveText(previousTitle)
    }
    await addFirstProject.click()

    const wall = workbenchPage.locator('[data-screen="wall"]')
    const dialog = workbenchPage.getByRole('dialog', { name: /^(Add a project|添加项目)$/ })
    await expect(dialog).toBeVisible()
    await expect(wall.getByText('从一个项目开始', { exact: true })).toBeVisible()
    await workbenchPage.screenshot({ path: testInfo.outputPath('bw-first-run-add-project.png') })

    await workbenchPage.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(wall.getByRole('heading', { name: '从一个项目开始' })).toBeVisible()
    await workbenchPage.screenshot({ path: testInfo.outputPath('bw-first-run-cancel-add.png') })

    const help = workbenchPage.locator('[data-workbench-rail]').getByRole('button', {
      name: /^(Help|帮助)$/
    })
    const gettingStartedName = /^(Getting Started with BW|BW 入门)$/
    await help.click()
    await workbenchPage.getByRole('menuitem', { name: gettingStartedName }).click()
    const gettingStarted = workbenchPage.getByRole('dialog', { name: gettingStartedName })
    await expect(gettingStarted.locator('[data-setup-guide-step]')).toHaveCount(7)
    await expect(
      gettingStarted.locator('[data-setup-guide-step="agent-capabilities"]')
    ).toHaveCount(0)
    await expect(gettingStarted.locator('[data-setup-guide-step="two-worktrees"]')).toBeVisible()
    await expect(gettingStarted.locator('[data-setup-guide-step="browser"]')).toBeVisible()
    await expect(
      gettingStarted.getByLabel(/of 7 setup steps complete|7 设置步骤中的/)
    ).toBeVisible()
    const integrationStep = gettingStarted.getByRole('button', {
      name: /Connect integrations|连接集成服务/
    })
    await integrationStep.click()
    await expect(
      gettingStarted.getByRole('heading', { name: /^(Code hosting|代码托管)$/ })
    ).toBeVisible()
    await expect(gettingStarted.getByText('GitHub', { exact: true })).toHaveCount(1)
    await expect(gettingStarted.getByText('CodeHub', { exact: true })).toHaveCount(1)
    const optionalReports = gettingStarted.getByRole('heading', {
      name: /^(Reports and diagnostics \(optional\)|报告与诊断（可选）)$/
    })
    const weLink = gettingStarted.getByText('WeLink', { exact: true })
    await expect(optionalReports).toBeVisible()
    await expect(weLink).toHaveCount(1)
    await expect(
      gettingStarted.getByText(/^(GitLab|Bitbucket|Azure DevOps|Gitea|Linear|Jira|CloudBuild)$/)
    ).toHaveCount(0)
    await integrationStep.focus()
    await expect(workbenchPage.getByRole('tooltip')).toBeHidden()
    await workbenchPage.screenshot({
      path: testInfo.outputPath('bw-getting-started-integrations.png')
    })
    await optionalReports.scrollIntoViewIfNeeded()
    await weLink.scrollIntoViewIfNeeded()
    await expect(optionalReports).toBeInViewport()
    await expect(weLink).toBeInViewport()
    await workbenchPage.screenshot({
      path: testInfo.outputPath('bw-getting-started-optional-reports.png')
    })
    await gettingStarted.getByRole('button', { name: /^(Close|关闭)$/ }).click()
    await expect(gettingStarted).toBeHidden()

    await workbenchPage
      .locator('[data-workbench-rail]')
      .getByRole('button', { name: /^(Settings|设置)$/ })
      .click()
    const setupGuideSettingsRow = workbenchPage.getByRole('button', {
      name: /^(Getting Started with BW,|BW 入门，)/
    })
    await expect(setupGuideSettingsRow).toHaveAttribute('aria-label', /of 7 complete|\/ 7 项/)
    await setupGuideSettingsRow.click()
    const embeddedGuide = workbenchPage.locator('[data-settings-section="setup-guide"]')
    await expect(embeddedGuide.locator('[data-setup-guide-step]')).toHaveCount(7)
    await expect(embeddedGuide.locator('[data-setup-guide-step="agent-capabilities"]')).toHaveCount(
      0
    )
    await expect(embeddedGuide.locator('[data-setup-guide-step="two-worktrees"]')).toBeVisible()
    await expect(embeddedGuide.locator('[data-setup-guide-step="browser"]')).toBeVisible()
    await workbenchPage.screenshot({ path: testInfo.outputPath('bw-settings-getting-started.png') })
    await workbenchPage.getByRole('button', { name: /^(Back to app|返回应用)$/ }).click()
    await workbenchPage
      .locator('[data-workbench-rail]')
      .getByRole('button', { name: '项目墙', exact: true })
      .click()
    await expect(wall.getByRole('heading', { name: '从一个项目开始' })).toBeVisible()

    await electronApp.evaluate(({ dialog: nativeDialog, ipcMain }, folderPath) => {
      nativeDialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [folderPath],
        bookmarks: []
      })
      const probe = globalThis as typeof globalThis & { firstProjectCheckoutHandoffDone?: boolean }
      probe.firstProjectCheckoutHandoffDone = false
      ipcMain.removeHandler('telemetry:track')
      ipcMain.handle('telemetry:track', (_event, name) => {
        if (name === 'add_repo_default_checkout_handoff') {
          probe.firstProjectCheckoutHandoffDone = true
        }
      })
    }, seededRepoPath)
    await wall.locator('.empty-center').getByRole('button', { name: '添加项目' }).click()
    await dialog.getByRole('button', { name: /Browse folder|浏览文件夹/ }).click()
    await expect(dialog).toBeHidden()

    // Why: the dialog closes before checkout preparation finishes. Wait for that
    // handoff before clicking the card, so a late auto-activation cannot pass.
    await expect
      .poll(
        () =>
          electronApp.evaluate(
            () =>
              (globalThis as typeof globalThis & { firstProjectCheckoutHandoffDone?: boolean })
                .firstProjectCheckoutHandoffDone
          ),
        { message: 'Wait for the first project checkout handoff', timeout: 30_000 }
      )
      .toBe(true)
    const card = wall.locator('[data-workbench-project-id]')
    const project = card.getByRole('button', { name: path.basename(seededRepoPath), exact: true })
    await expect(project).toBeVisible()
    await expect
      .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeWorktreeId))
      .toBeNull()
    const addedRepoId = await card.getAttribute('data-workbench-project-id')
    await workbenchPage.screenshot({
      path: testInfo.outputPath('bw-first-run-project-on-wall.png')
    })
    await project.click()
    await expect(wall).toBeHidden()
    await expect
      .poll(() =>
        workbenchPage.evaluate((repoId) => {
          const state = window.__store?.getState()
          return Boolean(
            state &&
            repoId &&
            state.worktreesByRepo[repoId]?.some((tree) => tree.id === state.activeWorktreeId)
          )
        }, addedRepoId)
      )
      .toBe(true)
  })
})

isolatedProjectTest(
  'BW project settings: reviewed edits, conflict protection and filesystem read-back',
  async ({ workbenchPage, seededRepoPath }, testInfo) => {
    test.setTimeout(300_000)
    await verifyProjectSettings(workbenchPage, seededRepoPath, testInfo)
  }
)

fixedWorkspaceTest(
  'BW fixed workspaces: restore remote branches with narrow fetch and existing reviews',
  async ({ workbenchPage, fixedRemote }, testInfo) => {
    test.setTimeout(900_000)
    await verifyFixedWorkspaceRemoteReuse(workbenchPage, fixedRemote, testInfo)
  }
)

isolatedProjectTest(
  'BW milestones: real editing, pointer drag, source return and safe submit failure @headful',
  async ({ workbenchPage, seededRepoPath, electronApp }, testInfo) => {
    test.setTimeout(300_000)
    await verifyMilestones(workbenchPage, seededRepoPath, testInfo)
    await verifyMilestoneRestart(electronApp, testInfo)
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
  await workbenchPage.getByRole('button', { name: '新建版本', exact: true }).press('Enter')
  await workbenchPage.getByLabel('版本名').fill('v9.9')
  await workbenchPage.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
    timeout: 180_000
  })
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
