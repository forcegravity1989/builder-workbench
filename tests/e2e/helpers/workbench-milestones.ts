import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'

async function moveNode(page: Page, node: Locator, window: Locator) {
  await node.scrollIntoViewIfNeeded()
  const source = await node.boundingBox()
  const target = await window.boundingBox()
  if (!source || !target) {
    throw new Error('Timeline node or version window is not visible')
  }
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, source.y + source.height / 2, { steps: 12 })
  await page.mouse.up()
}

/** Real Electron, pointer input, native RPC and Git; deliberately no remote PR. */
export async function verifyMilestones(page: Page, repoPath: string, info: TestInfo) {
  await page.setViewportSize({ width: 1280, height: 850 })
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim()
  await page.getByRole('button', { name: '项目总览', exact: true }).click()
  const board = page.locator('.wb-ml')
  await expect(board.getByText('还没有月度里程碑')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: info.outputPath('milestones-empty.png') })
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await board.getByRole('button', { name: '添加特性', exact: true }).click()
  await board.getByLabel('特性名称', { exact: true }).fill('没有版本也能开始讨论')
  await board.getByLabel('负责人', { exact: true }).fill('Builder')
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  await board.getByRole('button', { name: '还原修改', exact: true }).click()
  await board.getByRole('button', { name: '查看正式安排', exact: true }).click()

  const versions = ['v1.0.0', 'v1.0.1', 'v0.7.0']
  const ref = (i: number) => ({ version: versions[i], cycleId: `milestone-e2e-${i}` })
  for (const [i, version] of versions.entries()) {
    const directory = path.join(repoPath, '.bw/planning', version)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      path.join(directory, 'data.json'),
      JSON.stringify({
        schema_version: 3,
        ...ref(i),
        summary: { progress: i === 0 ? '保持实际计划内容' : '', risks: '' },
        goals: [],
        tasks: [],
        ...(i < 2
          ? {
              timeWindow: { start: `2026-11-${i ? '09' : '02'}`, end: `2026-11-${i ? '15' : '08'}` }
            }
          : {})
      })
    )
  }
  const materialPath = path.join(repoPath, '.bw/milestones.json')
  const material = {
    schema_version: 1,
    months: [{ month: '2026-11', outcome: '协作能力形成可用闭环' }],
    features: ['消息与通知', '工程能力观测'].map((title, i) => ({
      id: `feature-${i}`,
      month: '2026-11',
      title,
      owner: `Builder ${i + 1}`,
      pre: ref(0),
      release: ref(1)
    }))
  }
  writeFileSync(materialPath, JSON.stringify(material))
  git(['add', '.bw/planning', '.bw/milestones.json'])
  git(['commit', '-m', 'seed dated milestone materials'])
  const formalHead = git(['rev-parse', 'HEAD'])
  await board.getByRole('button', { name: '刷新里程碑与评审' }).click()
  await expect(board.getByText('消息与通知', { exact: true })).toBeVisible()
  await expect(board.locator('.wb-ml-window')).toHaveCount(2)
  await expect(board.getByRole('navigation')).toContainText('11-02 — 11-08')
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  const rows = board.locator('.wb-ml-row')
  await rows.first().getByLabel('特性名称', { exact: true }).fill('临时输入')
  await rows.first().getByLabel('特性名称', { exact: true }).press('Escape')
  await expect(rows.first().getByLabel('特性名称', { exact: true })).toHaveValue('消息与通知')
  await rows.first().getByLabel('负责人', { exact: true }).fill('评审 Builder')
  await board.getByRole('button', { name: '添加特性', exact: true }).click()
  await rows.last().getByLabel('特性名称', { exact: true }).fill('知识库')
  await rows.last().getByLabel('负责人', { exact: true }).fill('Builder 3')
  await expect(rows).toHaveCount(3)
  await rows
    .last()
    .getByRole('button', { name: '排序 知识库' })
    .dragTo(rows.first().locator('.wb-ml-label'))
  await expect(rows.first().getByLabel('特性名称', { exact: true })).toHaveValue('知识库')
  await rows.first().getByRole('button', { name: '移除 知识库' }).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows.first().getByLabel('特性名称', { exact: true })).toHaveValue('知识库')

  const notification = rows.filter({
    has: page.getByLabel('特性名称', { exact: true }).and(page.locator('[value="消息与通知"]'))
  })
  await moveNode(page, notification.locator('.pre'), board.locator('.wb-ml-window').nth(1))
  await expect(notification.locator('.pre')).toContainText('v1.0.1')
  await moveNode(page, notification.locator('.release'), board.locator('.wb-ml-window').first())
  await expect(page.getByText('Pre 不能晚于 Release，已保留原安排')).toBeVisible()
  await expect(notification.locator('.release')).toContainText('v1.0.1')
  await board.getByRole('button', { name: '版本与日期', exact: true }).click()
  await page.getByLabel('v1.0.1 结束日期', { exact: true }).fill('2026-11-16')
  await page.getByRole('button', { name: '登记版本', exact: true }).click()
  await page
    .locator('.wb-ml-version-edit')
    .last()
    .getByLabel('版本名称', { exact: true })
    .fill('v1.0.2')
  await page.getByLabel('v1.0.2 开始日期', { exact: true }).fill('2026-11-23')
  await page.getByLabel('v1.0.2 结束日期', { exact: true }).fill('2026-11-29')
  await board.getByRole('button', { name: '版本与日期', exact: true }).click()
  await expect(board.locator('.wb-ml-window').nth(1)).toContainText('11-09 — 11-16')
  await expect(board.locator('.wb-ml-window')).toHaveCount(3)
  expect(git(['worktree', 'list', '--porcelain'])).not.toContain('bw/v1.0.2/plan')
  await board
    .getByRole('navigation')
    .getByRole('button', { name: /v1.0.2/ })
    .click()
  await notification.locator('.pre').scrollIntoViewIfNeeded()
  const scrollBounds = await board.locator('.wb-ml-scroll').boundingBox()
  if (!scrollBounds) {
    throw new Error('Timeline viewport is not visible')
  }
  await page.mouse.move(scrollBounds.x + scrollBounds.width - 40, scrollBounds.y + 120)
  await page.mouse.wheel(120, 0)
  const viewport = () =>
    board.evaluate((element) => {
      const scroll = element.querySelector('.wb-ml-scroll')!
      return {
        x: scroll.scrollLeft,
        y: scroll.scrollTop,
        page: element.closest('.content')?.scrollTop ?? 0
      }
    })
  await expect.poll(async () => (await viewport()).x).toBeGreaterThan(0)
  const beforeNavigate = await viewport()
  await info.attach('milestone-origin-viewport', {
    body: JSON.stringify(beforeNavigate),
    contentType: 'application/json'
  })
  await page.screenshot({ path: info.outputPath('milestones-edited.png') })
  await notification.locator('.pre').click()
  await expect(page.getByRole('heading', { name: 'v1.0.1 版本总览' })).toBeVisible({
    timeout: 60_000
  })
  await page.getByRole('button', { name: '← 返回项目里程碑' }).click()
  await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('知识库')
  await expect(notification.getByLabel('负责人', { exact: true })).toHaveValue('评审 Builder')
  await expect(notification.locator('.pre')).toContainText('v1.0.1')
  await expect.poll(viewport).toEqual(beforeNavigate)
  await board.getByRole('button', { name: '提交评审', exact: true }).click()
  await expect(page.getByText('本次改动', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认提交', exact: true }).click()
  await expect(board.getByRole('alert')).toContainText('未确认远端身份', { timeout: 120_000 })
  await expect(notification.getByLabel('负责人', { exact: true })).toHaveValue('评审 Builder')
  await page.screenshot({ path: info.outputPath('milestones-submit-retained.png') })
  expect(git(['rev-parse', 'HEAD'])).toBe(formalHead)
  expect(JSON.parse(readFileSync(materialPath, 'utf8'))).toEqual(material)
  await board.getByRole('button', { name: '还原修改', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '项目总览', exact: true }).click()
  await expect(board.getByText('消息与通知', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(board.getByText('工程能力观测', { exact: true })).toBeVisible()
  await expect(board.getByText('知识库', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('milestones-reloaded.png') })
}
