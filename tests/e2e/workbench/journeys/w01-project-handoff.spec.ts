import path from 'node:path'
import { test as baseTest, expect } from '../../helpers/workbench-app'
import { getGoldenStubAgentLaunchEnv } from '../../helpers/golden-stub-agent'

const test = baseTest.extend({ launchEnv: getGoldenStubAgentLaunchEnv() })

test.use({
  workbenchAppExtraEnv: {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  }
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
    await expect(title).toHaveText(/How do you want to work with agents|如何.*智能体/)
    await onboarding.getByRole('radio', { name: /Terminal|终端/ }).click()
    await next.click()
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

    const wallGuide = workbenchPage.locator('[data-contextual-tour-panel]')
    const wallHelp = wall.getByRole('button', { name: '项目墙帮助', exact: true })
    await expect(wallGuide.getByText('找到项目', { exact: true })).toBeVisible()
    await wallGuide.locator('[data-contextual-tour-skip]').click()
    await expect(wallGuide).toBeHidden()
    await expect
      .poll(() =>
        workbenchPage.evaluate(async () =>
          (await window.api.ui.get()).contextualToursSeenIds?.includes('workbench-wall')
        )
      )
      .toBe(true)
    await wallHelp.click()
    await expect(wallGuide.getByText('找到项目', { exact: true })).toBeVisible()
    await wallGuide.locator('[data-contextual-tour-skip]').click()

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
