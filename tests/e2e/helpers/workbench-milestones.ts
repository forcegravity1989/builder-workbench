import { defaultMilestoneStages } from '../../../src/shared/workbench/milestone-sdlc'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'

async function moveNode(page: Page, node: Locator, delta: number) {
  await node.scrollIntoViewIfNeeded()
  const source = await node.boundingBox()
  if (!source) {
    throw new Error('Timeline node or version window is not visible')
  }
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + delta, source.y + source.height / 2, {
    steps: 12
  })
  await page.mouse.up()
}

/** Real Electron, pointer input, native RPC and Git; deliberately no remote PR. */
export async function verifyMilestones(page: Page, repoPath: string, info: TestInfo) {
  await page.setViewportSize({ width: 1280, height: 850 })
  const git = (args: string[]) =>
    execFileSync('git', args, { cwd: repoPath, encoding: 'utf8' }).trim()
  await page.getByRole('button', { name: '项目总览', exact: true }).click()
  const board = page.locator('.wb-ml')
  const windows = board.locator('.wb-ml-window:not(.wb-ml-unused-week)')
  await expect(board.getByText('还没有里程碑')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: info.outputPath('milestones-empty.png') })
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await expect(board.getByRole('button', { name: '登记版本', exact: true })).toHaveCount(0)
  await expect(board.getByLabel('规划月份', { exact: true })).toHaveCount(0)
  await board.getByRole('button', { name: '添加特性', exact: true }).click()
  await board.getByLabel('特性名称', { exact: true }).fill('就地安排首个特性')
  await board.getByLabel('负责人', { exact: true }).fill('Builder')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true })).toHaveValue('')
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true })).toHaveValue('Builder')
  await board.getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true }).click()

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
        summary: { progress: '', risks: '' },
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
    schema_version: 2,
    months: [{ month: '2026-11', outcome: '协作能力形成可用闭环' }],
    features: ['消息与通知', '工程能力观测'].map((title, i) => ({
      id: `feature-${i}`,
      month: '2026-11',
      title,
      owner: `Builder ${i + 1}`,
      deliveries: [0, 1].map((index) => ({
        id: `delivery-${i}-${index}`,
        version: ref(index),
        stages: defaultMilestoneStages(
          {
            ...ref(index),
            timeWindow: {
              start: `2026-11-${index ? '09' : '02'}`,
              end: `2026-11-${index ? '15' : '08'}`
            }
          },
          index > 0
        )
      }))
    }))
  }
  writeFileSync(materialPath, JSON.stringify(material))
  git(['add', '.bw/planning', '.bw/milestones.json'])
  git(['commit', '-m', 'seed dated milestone materials'])
  const formalHead = git(['rev-parse', 'HEAD'])
  await board.getByRole('button', { name: '刷新里程碑与评审', exact: true }).click()
  await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('消息与通知')
  await expect(windows).toHaveCount(2)
  await expect(board.getByRole('navigation')).not.toContainText('v1.0.0')
  await expect(windows.first()).toContainText('11-02 — 11-08')
  await board.getByRole('button', { name: '定位里程碑 2026-11', exact: true }).click()
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  const rows = board.locator('.wb-ml-row')
  await rows.first().getByLabel('负责人', { exact: true }).fill('临时负责人')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await board.getByRole('button', { name: '刷新里程碑与评审', exact: true }).click()
  await expect(board.getByRole('button', { name: '重做', exact: true })).toBeEnabled()
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await expect(rows.first().getByLabel('负责人', { exact: true })).toHaveValue('临时负责人')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await rows.first().getByLabel('特性名称', { exact: true }).fill('临时输入')
  await rows.first().getByLabel('特性名称', { exact: true }).press('Escape')
  await expect(rows.first().getByLabel('特性名称', { exact: true })).toHaveValue('消息与通知')
  await rows.first().getByLabel('负责人', { exact: true }).fill('评审 Builder  ')
  await rows.first().getByLabel('负责人', { exact: true }).press('Tab')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows.first().getByLabel('负责人', { exact: true })).toHaveValue('Builder 1')
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await board.getByRole('button', { name: '添加特性', exact: true }).click()
  await rows.last().getByLabel('特性名称', { exact: true }).fill('知识库')
  await rows.last().getByLabel('负责人', { exact: true }).fill('Builder 3  ')
  await expect(rows).toHaveCount(3)
  await rows
    .last()
    .getByRole('button', { name: '排序 知识库' })
    .dragTo(rows.first().locator('.wb-ml-label'))
  await expect(rows.first().getByLabel('特性名称', { exact: true })).toHaveValue('知识库')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows.last().getByLabel('特性名称', { exact: true })).toHaveValue('知识库')
  await expect(rows.last().getByLabel('负责人', { exact: true })).toHaveValue('Builder 3')
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await rows.first().getByRole('button', { name: '移除 知识库' }).click()
  await expect(rows).toHaveCount(2)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows.first().getByLabel('特性名称', { exact: true })).toHaveValue('知识库')
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows).toHaveCount(3)

  const notification = rows.filter({
    has: page.getByLabel('特性名称', { exact: true }).and(page.locator('[value="消息与通知"]'))
  })
  const planBar = notification.locator('.wb-phase-plan .wb-ml-phase-body')
  const initialStage = await planBar.getAttribute('title')
  await moveNode(page, planBar, 22)
  await expect(planBar).toHaveAttribute('title', /2026-11-02 12:00/)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(planBar).toHaveAttribute('title', initialStage!)
  await planBar.focus()
  await planBar.press('ArrowRight')
  await expect(planBar).toHaveAttribute('title', /2026-11-02 12:00/)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  const boundary = windows
    .first()
    .getByRole('button', { name: 'v1.0.0 结束：拖动或方向键调整一天', exact: true })
  await boundary.press('ArrowLeft')
  await expect(windows.first()).toContainText('11-02 — 11-07')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(windows.first()).toContainText('11-02 — 11-08')
  await expect(board.getByRole('button', { name: '工作日历', exact: true })).toHaveCount(0)
  await expect(notification.getByRole('button', { name: /版本总览/ })).toHaveCount(0)
  await board.getByLabel('版本名称 2026-11-23', { exact: true }).fill('v1.0.2')
  await board.getByLabel('版本名称 2026-11-23', { exact: true }).press('Enter')
  await expect(windows).toHaveCount(3)
  await expect(windows.last()).toContainText('11-23 — 11-27')
  expect(git(['worktree', 'list', '--porcelain'])).not.toContain('bw/v1.0.2/plan')
  await board.getByRole('button', { name: '定位里程碑 2026-11', exact: true }).click()
  await windows
    .nth(1)
    .getByRole('button', { name: '进入 v1.0.1 版本总览', exact: true })
    .scrollIntoViewIfNeeded()
  const scrollBounds = await board.locator('.wb-ml-scroll').boundingBox()
  if (!scrollBounds) {
    throw new Error('Timeline viewport is not visible')
  }
  await page.mouse.move(scrollBounds.x + scrollBounds.width - 40, scrollBounds.y + 120)
  await page.mouse.wheel(40, 0)
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
  await page.screenshot({ path: info.outputPath('milestones-edited.png') })
  const nodeBounds = await windows
    .nth(1)
    .getByRole('button', { name: '进入 v1.0.1 版本总览', exact: true })
    .boundingBox()
  if (!nodeBounds) {
    throw new Error('Version entry node is not visible')
  }
  await page.mouse.move(nodeBounds.x + nodeBounds.width / 2, nodeBounds.y + nodeBounds.height / 2)
  await page.mouse.down()
  // Pointer-up opens the version; capture its actual source after native focus, without locator auto-scroll.
  const beforeNavigate = await viewport()
  expect(beforeNavigate.x).toBeGreaterThan(0)
  await page.mouse.up()
  await info.attach('milestone-origin-viewport', {
    body: JSON.stringify(beforeNavigate),
    contentType: 'application/json'
  })
  await expect(page.getByRole('heading', { name: 'v1.0.1 版本总览' })).toBeVisible({
    timeout: 60_000
  })
  await page.getByRole('button', { name: '← 返回项目里程碑' }).click()
  await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('知识库')
  await expect(notification.getByLabel('负责人', { exact: true })).toHaveValue('评审 Builder')
  await expect(planBar).toHaveAttribute('title', initialStage!)
  await expect.poll(viewport).toEqual(beforeNavigate)
  await board.getByRole('button', { name: '提交评审', exact: true }).click()
  await expect(page.getByText('本次改动', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认提交', exact: true }).click()
  await expect(board.getByRole('alert')).toContainText('未确认远端身份', { timeout: 120_000 })
  await expect(notification.getByLabel('负责人', { exact: true })).toHaveValue('评审 Builder')
  await page.screenshot({ path: info.outputPath('milestones-submit-retained.png') })
  expect(git(['rev-parse', 'HEAD'])).toBe(formalHead)
  expect(JSON.parse(readFileSync(materialPath, 'utf8'))).toEqual(material)
  await board.getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '项目总览', exact: true }).click()
  await expect(board.getByText('消息与通知', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(board.getByText('工程能力观测', { exact: true })).toBeVisible()
  await expect(board.getByText('知识库', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('milestones-reloaded.png') })
  const startedPlanPath = path.join(repoPath, '.bw/planning/v1.0.0/data.json')
  const startedPlan = JSON.parse(readFileSync(startedPlanPath, 'utf8'))
  startedPlan.summary.progress = '已开始制定计划'
  writeFileSync(startedPlanPath, JSON.stringify(startedPlan))
  git(['add', '.bw/planning/v1.0.0/data.json'])
  git(['commit', '-m', 'start version planning'])
  await board.getByRole('button', { name: '刷新里程碑与评审', exact: true }).click()
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await expect(board.getByRole('button', { name: '已开始制定计划，保留原计划' })).toHaveCount(2)
  await expect(
    board.getByRole('button', { name: '已开始制定计划，保留原计划' }).first()
  ).toBeDisabled()
  await expect(board.getByRole('button', { name: /Plan 开始：/ })).toHaveCount(0)
  await board.getByLabel('显示计划', { exact: true }).check()
  await expect(board.locator('.wb-ml-phase-group.ghost')).toHaveCount(2)
  const future = board.getByRole('button', { name: /Maintain 结束：/ }).first()
  await expect(future).toBeVisible()
  await future.press('ArrowLeft')
  await expect(board.getByRole('button', { name: '撤销', exact: true })).toBeEnabled()
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await board.getByLabel('负责人', { exact: true }).first().fill('重启后恢复的草案')
  await board.getByLabel('负责人', { exact: true }).first().press('Tab')
  await expect(board.getByText('本机草案已保存', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '项目总览', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true }).first()).toHaveValue('重启后恢复的草案')
  await expect(board.getByText('本机草案已保存', { exact: true })).toBeVisible()
  expect(JSON.parse(readFileSync(materialPath, 'utf8'))).toEqual(material)
}
