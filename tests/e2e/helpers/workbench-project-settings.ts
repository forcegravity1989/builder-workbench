import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'
import { test } from './workbench-app'

export const projectSettingsTest = test.extend({
  minimumSeededWorktreeCount: 1,
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const repoPath = mkdtempSync(path.join(os.tmpdir(), 'bw-config-e2e-'))
    registerPostElectronShutdownCleanup(async () => {
      rmSync(repoPath, { recursive: true, force: true })
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
    ''
  ].join('\n')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, original)
  execFileSync('git', ['add', '.bw/project.toml'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'seed project settings verification'], { cwd: repoPath })
  const openWall = async () => {
    await page.locator('[data-workbench-project-wall]').click()
    await expect(page.getByRole('heading', { name: '项目墙', exact: true })).toBeVisible()
  }
  const openConfig = async () => {
    await page.getByRole('button', { name: `配置 ${name}`, exact: true }).click()
    await expect(page.getByRole('button', { name: '编辑项目信息', exact: true })).toBeEnabled()
  }
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await openWall()
  const toolbar = page.getByRole('group', { name: '项目墙操作' })
  for (const label of ['刷新项目墙', '导入 Builder 主机', '接入项目', '关闭项目墙']) {
    await expect(toolbar.getByRole('button', { name: label, exact: true })).toHaveText('')
  }
  await openConfig()
  await page.screenshot({ path: info.outputPath('bw-config-sidebar.jpg') })
  await page.getByRole('button', { name: '编辑项目信息', exact: true }).click()
  await page.getByLabel('对标', { exact: true }).fill('新对标')
  await page.getByLabel('愿景', { exact: true }).fill('新愿景')
  await expect(page.getByText('2 项变更未提交', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭项目配置', exact: true }).click()
  const guard = page.getByRole('dialog', { name: '还有未提交的变更' })
  await expect(guard).toBeVisible()
  await page.screenshot({ path: info.outputPath('bw-config-dirty-guard.jpg') })
  await guard.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByLabel('愿景', { exact: true })).toHaveValue('新愿景')
  await page.getByRole('button', { name: '查看变更', exact: true }).click()
  const review = page.getByRole('dialog', { name: '确认项目信息变更' })
  for (const value of ['原对标', '新对标', '原愿景', '新愿景']) {
    await expect(review).toContainText(value)
  }
  await expect(review.getByRole('button', { name: '保存到主机', exact: true })).toBeEnabled()
  expect(readFileSync(file, 'utf8')).toBe(original)
  await page.screenshot({ path: info.outputPath('bw-config-review.jpg') })

  // Another writer changes the read revision before submit; the host must reject it.
  const concurrent = `${original}# 外部写入后保留\n`
  writeFileSync(file, concurrent)
  await review.getByRole('button', { name: '保存到主机', exact: true }).click()
  await expect(review.getByRole('alert')).toContainText('项目信息已变化')
  expect(readFileSync(file, 'utf8')).toBe(concurrent)
  await page.screenshot({ path: info.outputPath('bw-config-conflict.jpg') })
  await review.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(page.getByLabel('愿景', { exact: true })).toHaveValue('新愿景')
  await page.getByRole('button', { name: '重新读取项目信息', exact: true }).click()
  await guard.getByRole('button', { name: '丢弃并离开', exact: true }).click()
  await expect(page.getByLabel('愿景', { exact: true })).toHaveValue('原愿景')
  await page.getByLabel('对标', { exact: true }).fill('新对标')
  await page.getByLabel('愿景', { exact: true }).fill('新愿景')
  await page.getByRole('button', { name: '查看变更', exact: true }).click()
  await review.getByRole('button', { name: '保存到主机', exact: true }).click()
  await expect(review).not.toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('已保存到本机，尚未共享', { exact: true })).toBeVisible()
  const saved = readFileSync(file, 'utf8')
  for (const preserved of [
    'benchmark = "新对标"',
    'north_star = "新愿景"',
    'custom = "未知字段保留"',
    '[chat]\nchannel = "keep-me"',
    '# 外部写入后保留'
  ]) {
    expect(saved).toContain(preserved)
  }
  expect(saved).not.toContain('opportunity =')
  await page.screenshot({ path: info.outputPath('bw-config-saved.jpg') })
  await page.reload()
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await openWall()
  await openConfig()
  await expect(page.locator('.wb-config-facts')).toContainText('新愿景')
  await expect(page.getByText('没有待提交的变更', { exact: true })).toBeVisible()
  expect(readFileSync(file, 'utf8')).toBe(saved)
  await page.screenshot({ path: info.outputPath('bw-config-reloaded.jpg') })
}
