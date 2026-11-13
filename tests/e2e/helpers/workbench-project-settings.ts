import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'
import { test } from './workbench-app'

export const projectSettingsTest = test.extend({
  minimumSeededWorktreeCount: 1,
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'bw-config-e2e-'))
    const repoPath = path.join(fixtureRoot, 'app')
    mkdirSync(repoPath)
    mkdirSync(path.join(fixtureRoot, 'notes'))
    registerPostElectronShutdownCleanup(async () => {
      rmSync(fixtureRoot, { recursive: true, force: true })
    })
    const git = (args: string[]) => execFileSync('git', args, { cwd: repoPath })
    git(['init', '--initial-branch=main'])
    git(['config', 'user.name', 'Workbench E2E'])
    git(['config', 'user.email', 'e2e@test.local'])
    writeFileSync(path.join(repoPath, 'README.md'), '# Isolated project configuration fixture\n')
    git(['add', 'README.md'])
    git(['commit', '-m', 'seed isolated project'])
    await provideFixture(repoPath)
  }
})

/** Exercises real renderer → charter RPC → owning-host filesystem, without a remote. */
export async function verifyProjectSettings(page: Page, repoPath: string, info: TestInfo) {
  const name = '配置真壳项目'
  const file = path.join(repoPath, '.bw', 'project.toml')
  const original = [
    '# 保留这段注释',
    `name = "${name}"`,
    'brief = "配置真壳验证"',
    'benchmark = "原对标"',
    'north_star = "原愿景"',
    'custom = "未知字段保留"',
    '',
    '[chat]',
    'channel = "keep-me"',
    'group_id = "1000123456" # 保留群号注释',
    ''
  ].join('\n')
  const openWall = async () => {
    await page.getByRole('button', { name: '项目墙', exact: true }).click()
    await expect(page.getByRole('heading', { name: /^项目墙/ })).toBeVisible()
  }
  const openConfig = async () => {
    await page
      .locator('[data-workbench-project-key]')
      .filter({ hasText: name })
      .locator('[data-workbench-edit-charter]')
      .click()
    await expect(page.getByRole('button', { name: '编辑项目信息', exact: true })).toBeEnabled()
  }
  await expect(page.locator('[data-workbench-rail]')).toBeVisible({ timeout: 180_000 })
  await openWall()
  const toolbar = page.getByRole('group', { name: '项目墙操作' })
  for (const label of ['刷新项目目录和墙卡信息', '批量导入主机', '添加项目', '关闭项目墙']) {
    await expect(toolbar.getByRole('button', { name: label, exact: true })).toHaveText('')
  }
  const registered = (await page.evaluate(() => window.api.repos.list())).find(
    (repo) => path.resolve(repo.path) === path.resolve(repoPath)
  )
  expect(registered).toBeDefined()
  const repoId = registered!.id
  const card = page.locator(`[data-workbench-project-id="${repoId}"]`)
  expect(existsSync(file)).toBe(false)
  await expect(card.locator('.pcard-name')).toHaveText(registered!.displayName)
  await expect(card.locator('.pcard-owner')).toContainText('—')
  const wallGuide = page.locator('[data-contextual-tour-panel]')
  await expect(wallGuide.getByText('找到项目', { exact: true })).toBeVisible()
  await expect(card.locator('[data-repo-header-action]')).toBeVisible()
  await card.locator('[data-repo-header-action]').click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('bw-wall-native-menu.jpg')
  })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  const previousWorkspace = await page.evaluate((id) => {
    const state = window.__store!.getState()
    const tree = state.worktreesByRepo[id].find((item) => item.isMainWorktree)!
    return {
      worktreeId: tree.id,
      tabIds: (state.tabsByWorktree[tree.id] ?? []).map((tab) => tab.id)
    }
  }, repoId)
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('bw-wall-without-charter.jpg')
  })
  await card.locator('.pcard-name').click()
  await expect(page.locator('[data-screen="wall"]')).toHaveCount(0)
  await page.waitForFunction(() => window.__store?.getState().activeView === 'terminal')
  expect(
    await page.evaluate(() => {
      const state = window.__store!.getState()
      return {
        repoId: state.activeRepoId,
        worktreeId: state.activeWorktreeId,
        hostId: state.activeWorkspaceExecutionHostId,
        tabIds: (state.tabsByWorktree[state.activeWorktreeId!] ?? []).map((tab) => tab.id)
      }
    })
  ).toEqual({ repoId, hostId: 'local', ...previousWorkspace })
  expect(existsSync(file)).toBe(false)
  await openWall()
  await wallGuide.locator('[data-contextual-tour-skip]').click()
  await expect(wallGuide).toBeHidden()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, original)
  execFileSync('git', ['add', '.bw/project.toml'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'seed project settings verification'], { cwd: repoPath })
  const refreshWall = toolbar.getByRole('button', { name: '刷新项目目录和墙卡信息', exact: true })
  const cachedName = '项目墙上次读取的名称'
  writeFileSync(file, original.replace(name, cachedName))
  await refreshWall.click()
  await expect(card.locator('.pcard-name')).toHaveText(cachedName)
  await toolbar.getByRole('button', { name: '关闭项目墙', exact: true }).click()
  await expect(page.locator('[data-screen="wall"]')).toHaveCount(0)
  writeFileSync(file, original)
  await openWall()
  await expect(card.locator('.pcard-name')).toHaveText(cachedName)
  await expect(refreshWall).toBeEnabled()
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-wall-reopened.jpg') })
  writeFileSync(file, Buffer.from([0, 1, 2, 3]))
  await refreshWall.click()
  await expect(page.getByText('部分墙卡信息未更新', { exact: true })).toBeVisible()
  await expect(card.locator('.pcard-name')).toHaveText(cachedName)
  writeFileSync(file, original)
  await refreshWall.click()
  await expect(card.locator('.pcard-name')).toHaveText(name)
  await expect(page.getByText('部分墙卡信息未更新', { exact: true })).toHaveCount(0)
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-wall-refreshed.jpg') })
  await openConfig()
  const gitBeforeType = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8'
  })
  const headBeforeType = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8'
  })
  await expect(page.locator('#project-visibility')).toHaveText('个人项目')
  await page.locator('#project-visibility').click()
  await page.getByRole('option', { name: '团队项目', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await window.api.repos.list()).find((repo) => repo.id === id)?.projectVisibility,
        repoId
      )
    )
    .toBe('team')
  expect(readFileSync(file, 'utf8')).toBe(original)
  expect(execFileSync('git', ['status', '--porcelain'], { cwd: repoPath, encoding: 'utf8' })).toBe(
    gitBeforeType
  )
  expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf8' })).toBe(
    headBeforeType
  )
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-config-sidebar.jpg') })
  await page.getByRole('button', { name: '编辑项目信息', exact: true }).click()
  await page.getByRole('textbox', { name: '对标', exact: true }).fill('新对标')
  await page.getByRole('textbox', { name: '愿景', exact: true }).fill('新愿景')
  await page.getByRole('textbox', { name: '项目负责人', exact: true }).fill('负责人甲')
  await page.getByRole('textbox', { name: '项目群', exact: true }).fill('1000123457')
  await page.getByRole('button', { name: '关闭项目设置', exact: true }).click()
  const guard = page.getByRole('dialog', { name: '还有未提交的修改' })
  await expect(guard).toBeVisible()
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('bw-config-dirty-guard.jpg')
  })
  await guard.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '愿景', exact: true })).toHaveValue('新愿景')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const review = page.getByRole('dialog', { name: '确认项目信息变更' })
  for (const value of ['新对标', '新愿景', '负责人甲', '1000123457']) {
    await expect(review).toContainText(value)
  }
  await expect(review.getByRole('button', { name: '确认保存', exact: true })).toBeEnabled()
  expect(readFileSync(file, 'utf8')).toBe(original)
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-config-review.jpg') })

  // Another writer changes the read revision before submit; the host must reject it.
  const concurrent = `${original}# 外部写入后保留\n`
  writeFileSync(file, concurrent)
  await review.getByRole('button', { name: '确认保存', exact: true }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '项目信息操作失败' })
  ).toContainText('项目信息已变化')
  await expect(page.getByRole('button', { name: '开会话处理', exact: true })).toBeVisible()
  expect(readFileSync(file, 'utf8')).toBe(concurrent)
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-config-conflict.jpg') })
  await expect(page.getByRole('textbox', { name: '愿景', exact: true })).toHaveValue('新愿景')
  await page.getByRole('button', { name: '关闭项目设置', exact: true }).click()
  await guard.getByRole('button', { name: '丢弃并离开', exact: true }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '项目信息操作失败' })
  ).toHaveCount(0)
  await openConfig()
  await expect(page.locator('#project-visibility')).toHaveText('团队项目')
  await page.getByRole('button', { name: '编辑项目信息', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '愿景', exact: true })).toHaveValue('原愿景')
  await page.getByRole('textbox', { name: '项目负责人', exact: true }).fill('负责人甲')
  await page.getByRole('textbox', { name: '项目群', exact: true }).fill('1000123457')
  await page.getByRole('textbox', { name: '对标', exact: true }).fill('新对标')
  await page.getByRole('textbox', { name: '愿景', exact: true }).fill('新愿景')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await review.getByRole('button', { name: '确认保存', exact: true }).click()
  await expect(review).not.toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('已保存到本机，尚未共享', { exact: true })).toBeVisible()
  const savedNotice = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: '已保存到本机，尚未共享' })
  await expect(savedNotice).not.toContainText('项目信息已变化')
  await expect(savedNotice.getByRole('button', { name: '重试', exact: true })).toHaveCount(0)
  await expect(savedNotice.getByRole('button', { name: '开会话处理', exact: true })).toHaveCount(0)
  const saved = readFileSync(file, 'utf8')
  for (const preserved of [
    'owner = "负责人甲"',
    'benchmark = "新对标"',
    'north_star = "新愿景"',
    'custom = "未知字段保留"',
    '[chat]\nchannel = "keep-me"',
    'group_id = "1000123457" # 保留群号注释',
    '# 外部写入后保留'
  ]) {
    expect(saved).toContain(preserved)
  }
  expect(saved).not.toContain('opportunity =')
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-config-saved.jpg') })
  await page.reload()
  await expect(page.locator('[data-workbench-rail]')).toBeVisible({ timeout: 180_000 })
  await openWall()
  await openConfig()
  await expect(page.locator('.wb-config-facts')).toContainText('新愿景')
  await expect(page.locator('.wb-config-footer')).toHaveCount(0)
  await expect(page.locator('.wb-config-facts')).toContainText('负责人甲')
  expect(readFileSync(file, 'utf8')).toBe(saved)
  await page.screenshot({ animations: 'disabled', path: info.outputPath('bw-config-reloaded.jpg') })
  await page.getByRole('button', { name: '关闭项目设置', exact: true }).click()
  await card.locator('[data-workbench-open-overview]').click()
  const overviewCharter = page.locator('#project-card')
  await overviewCharter.getByRole('button', { name }).click()
  await expect(overviewCharter.locator('.status-dot')).toHaveCount(0)
  await expect(overviewCharter.locator('.detail-k')).toHaveText([
    '项目负责人',
    '想做什么',
    '对标',
    '愿景',
    '项目群'
  ])
  await expect(overviewCharter.locator('.detail-v').last()).toHaveText('1000123457')
  await overviewCharter.getByRole('button', { name: '编辑项目信息', exact: true }).click()
  const overviewSettings = page.locator('.wb-project-settings')
  await expect(overviewSettings).toBeVisible()
  await expect(overviewSettings.getByLabel('项目负责人', { exact: true })).toHaveValue('负责人甲')
  await expect(overviewSettings.getByLabel('项目群', { exact: true })).toHaveValue('1000123457')
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('bw-overview-shared-editor.jpg')
  })
  await page.getByRole('button', { name: '关闭项目设置', exact: true }).click()
  const folderPath = path.join(path.dirname(repoPath), 'notes')
  const folderId = await page.evaluate(async (folderPath) => {
    const result = await window.api.repos.add({
      path: folderPath,
      kind: 'folder',
      displayName: '普通文件夹'
    })
    if ('error' in result) {
      throw new Error(result.error)
    }
    return result.repo.id
  }, folderPath)
  await openWall()
  const folderCard = page.locator(`[data-workbench-project-id="${folderId}"]`)
  await expect(folderCard.locator('.pcard-name')).toHaveText('普通文件夹')
  await expect(folderCard.locator('[data-workbench-open-overview]')).toHaveCount(0)
  await folderCard.locator('[data-workbench-edit-charter]').click()
  await expect(page.locator('.wb-project-settings')).toBeVisible()
  await expect(
    page.locator('.wb-project-settings').getByRole('button', { name: '编辑项目信息', exact: true })
  ).toHaveCount(0)
  await page.locator('#project-visibility').click()
  await page.getByRole('option', { name: '团队项目', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        async (id) =>
          (await window.api.repos.list()).find((repo) => repo.id === id)?.projectVisibility,
        folderId
      )
    )
    .toBe('team')
  expect(existsSync(path.join(folderPath, '.bw', 'project.toml'))).toBe(false)
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('bw-folder-native-settings.jpg')
  })
  await page.getByRole('button', { name: '关闭项目设置', exact: true }).click()
  await folderCard.locator('.pcard-name').click()
  await expect(page.locator('[data-screen="wall"]')).toHaveCount(0)
  await page.waitForFunction((id) => {
    const state = window.__store?.getState()
    return (
      state?.activeRepoId === id &&
      state.activeView === 'terminal' &&
      state.worktreesByRepo[id]?.some((tree) => tree.id === state.activeWorktreeId)
    )
  }, folderId)
  const folderSidebar = page.locator('[data-workbench-version-section]')
  await expect(folderSidebar).toHaveText('工作区')
  await expect(folderSidebar.getByRole('button', { name: '新建版本', exact: true })).toHaveCount(0)
  expect(existsSync(path.join(folderPath, '.git'))).toBe(false)
  expect(existsSync(path.join(folderPath, '.bw', 'project.toml'))).toBe(false)
  await page.screenshot({
    animations: 'disabled',
    path: info.outputPath('bw-folder-continued.jpg')
  })
}
