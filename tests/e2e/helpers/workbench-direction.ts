import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

export type DirectionObserver = {
  chapter?(index: number): Promise<void>
  point?(target: Locator): Promise<void>
  result?(name: string): Promise<void>
}

export function readDirectionResult(repoPath: string, remote = false) {
  const entries = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8'
  }).split(/\r?\n\r?\n/)
  const project = entries.find((entry) => entry.includes('branch refs/heads/bw/project'))
  const workingPath = project?.match(/^worktree (.+)$/m)?.[1]?.trim()
  if (!workingPath) {
    throw new Error('Missing native bw/project material worktree')
  }
  const charter = readFileSync(
    path.join(remote ? workingPath : repoPath, '.bw/project.toml'),
    'utf8'
  )
  const milestones = JSON.parse(readFileSync(path.join(workingPath, '.bw/milestones.json'), 'utf8'))
  expect(charter).toContain('运营看板')
  expect(milestones.milestones).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ date: '2026-11-27', outcome: '首版运营看板上线' })
    ])
  )
  expect(milestones.features).toEqual(
    expect.arrayContaining([expect.objectContaining({ title: '运营数据汇总', owner: '运营小组' })])
  )
  return { workingPath, charter, milestones }
}

export async function runDirectionJourney(
  page: Page,
  repoId: string,
  options: { observer?: DirectionObserver; submit?: boolean; vision?: string } = {}
) {
  const observer = options.observer ?? {}
  const click = async (target: Locator) => {
    await expect(target).toBeVisible()
    await observer.point?.(target)
    await target.click()
  }
  const fill = async (target: Locator, value: string) => {
    await observer.point?.(target)
    await target.fill(value)
  }
  const dismissGuide = async () => {
    const skip = page.locator('[data-contextual-tour-skip]')
    if (await skip.isVisible()) {
      await skip.click()
    }
  }
  const board = page.locator('.wb-ml')
  const card = page.locator(`[data-workbench-project-id="${repoId}"]`)
  await click(page.getByRole('button', { name: '项目墙', exact: true }))
  await click(page.getByRole('button', { name: '刷新项目目录和墙卡信息', exact: true }))
  await page.getByRole('textbox', { name: '搜索项目', exact: true }).fill('运营看板')
  await expect(card).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-workbench-project-id]')).toHaveCount(1)
  await dismissGuide()
  await observer.chapter?.(0)
  await expect(page.locator('[data-workbench-versions]')).toBeHidden()
  await click(card.locator('[data-workbench-open-overview]'))
  await expect(board).toBeVisible({ timeout: 60_000 })
  await dismissGuide()
  await observer.result?.('wall-to-overview')

  await observer.chapter?.(1)
  const charter = page.locator('#project-card')
  await click(charter.getByRole('button', { name: '运营看板', exact: true }))
  await click(charter.getByRole('button', { name: '编辑项目信息', exact: true }))
  const vision = options.vision ?? '让运营每天看清变化，及时安排跟进'
  await fill(page.getByRole('textbox', { name: '愿景', exact: true }), vision)
  await click(
    page.locator('.wb-project-settings').getByRole('button', { name: /^(保存|提交评审)$/ })
  )
  const review = page.getByRole('dialog', { name: '确认项目信息变更' })
  await expect(review).toContainText(vision)
  await click(review.getByRole('button', { name: /^(确认保存|确认提交)$/ }))
  await expect(review).toBeHidden({ timeout: 120_000 })
  await expect(page.getByRole('button', { name: '关闭项目设置', exact: true })).toBeEnabled({
    timeout: 240_000
  })
  await expect(
    page.locator('.wb-project-settings').getByRole('button', { name: /^(保存|提交评审)$/ })
  ).toHaveCount(0)
  await observer.result?.('charter-saved')
  await click(page.getByRole('button', { name: '关闭项目设置', exact: true }))
  await click(charter.getByRole('button', { name: '运营看板', exact: true }))

  await observer.chapter?.(2)
  await click(board.getByRole('button', { name: '规划里程碑', exact: true }))
  await dismissGuide()
  await board.getByLabel('定位日期', { exact: true }).fill('2026-11-23')
  await click(board.getByRole('button', { name: '添加里程碑', exact: true }))
  const milestone = page.getByRole('dialog', { name: '添加里程碑', exact: true })
  await fill(milestone.getByLabel('日期', { exact: true }), '2026-11-27')
  await fill(milestone.getByLabel('预期成果'), '首版运营看板上线')
  await click(milestone.getByRole('button', { name: '添加', exact: true }))
  await click(board.getByRole('button', { name: '添加特性', exact: true }))
  await fill(board.getByLabel('特性名称', { exact: true }).first(), '运营数据汇总')
  await fill(board.getByLabel('负责人', { exact: true }).first(), '运营小组')
  await board.getByLabel('负责人', { exact: true }).first().press('Tab')
  await board.getByLabel('定位日期', { exact: true }).fill('2026-11-23')
  await board.getByLabel('定位日期', { exact: true }).press('Tab')
  await expect(board).toHaveAttribute('data-draft-persistence', 'saved', { timeout: 30_000 })
  await expect(page.locator('[data-workbench-versions]')).toBeHidden()
  await observer.result?.('milestones-saved')

  await observer.chapter?.(3)
  await click(board.getByRole('button', { name: /^(提交评审|更新评审)$/ }))
  await expect(page.locator('.wb-ml-review')).toContainText('本次改动')
  await observer.result?.('review-summary')
  if (options.submit) {
    await click(page.getByRole('button', { name: '确认提交', exact: true }))
    await expect(board.getByRole('button', { name: '查看评审', exact: true })).toBeVisible({
      timeout: 120_000
    })
    await expect(page.getByText('里程碑已提交评审', { exact: true })).toBeVisible({
      timeout: 120_000
    })
    await observer.result?.('review-submitted')
  }
}
