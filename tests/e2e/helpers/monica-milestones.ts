import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'

export async function openMilestoneOverview(page: Page, force = false) {
  const entry = page.getByRole('button', { name: '项目总览', exact: true })
  await expect(entry).toBeVisible({ timeout: 60_000 })
  if ((await entry.getAttribute('aria-current')) !== 'page') {
    await entry.click({ force, timeout: 60_000 })
  }
  await expect(page.locator('.monica-ml')).toBeVisible({ timeout: 60_000 })
}

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
  await openMilestoneOverview(page)
  const board = page.locator('.monica-ml')
  const windows = board.locator('.monica-ml-window:not(.monica-ml-unused-week)')
  await expect(board.getByText('还没有里程碑')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: info.outputPath('milestones-empty.png') })
  await page.getByRole('button', { name: '项目总览帮助', exact: true }).click()
  await page.getByRole('menuitem', { name: '里程碑引导', exact: true }).click()
  const guide = page.locator('[data-contextual-tour-panel]')
  await expect(guide.getByText('添加与编排', { exact: true })).toBeVisible()
  await guide.locator('[data-contextual-tour-skip]').click()
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await board.getByRole('button', { name: '添加特性', exact: true }).click()
  await board.getByRole('button', { name: '提交评审', exact: true }).click()
  await expect(board.getByLabel('特性名称', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true'
  )
  await expect(windows).toHaveCount(0)
  await board.getByLabel('特性名称', { exact: true }).fill('就地安排首个特性')
  await board.getByRole('button', { name: '提交评审', exact: true }).click()
  await expect(page.getByText('本次改动', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await board.getByLabel('负责人', { exact: true }).fill('Builder')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true })).toHaveValue('')
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true })).toHaveValue('Builder')
  await board.getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true }).click()

  await expect(board).toHaveAttribute('data-draft-persistence', 'saved')
  const projectTree = await page.evaluate(() => {
    const tree = window.__store
      ?.getState()
      .allWorktrees()
      .find((item) => item.branch?.replace('refs/heads/', '') === 'bw/project')
    if (!tree) {
      throw new Error('Project material worktree was not prepared')
    }
    return tree.path
  })
  const projectGit = (args: string[]) =>
    execFileSync('git', args, { cwd: projectTree, encoding: 'utf8' }).trim()
  const versions = ['v1.0.0', 'v1.0.1', 'v0.7.0']
  const ref = (i: number) => ({ version: versions[i], cycleId: `milestone-e2e-${i}` })
  for (const [i, version] of versions.entries()) {
    const directory = path.join(projectTree, '.bw/planning', version)
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
  const workingPath = path.join(projectTree, '.bw/milestones.json')
  const material = {
    schema_version: 3,
    milestones: [{ id: 'launch', date: '2026-11-05', outcome: '协作能力形成可用闭环' }],
    features: ['消息与通知', '工程能力观测'].map((title, i) => ({
      id: `feature-${i}`,
      month: '2026-11',
      title,
      owner: `Builder ${i + 1}`,
      deliveries: [0, 1].map((index) => ({
        id: `delivery-${i}-${index}`,
        version: ref(index),
        stages: [
          {
            phase: index ? 'Maintain' : 'Build',
            start: index ? '2026-11-09T00:00' : '2026-11-02T00:00',
            end: index ? '2026-11-14T00:00' : '2026-11-09T00:00'
          }
        ]
      }))
    }))
  }
  writeFileSync(workingPath, JSON.stringify(material))
  projectGit(['add', '.bw/planning', '.bw/milestones.json'])
  projectGit(['commit', '-m', 'seed dated milestone materials'])
  git(['merge', '--ff-only', 'bw/project'])
  const formalHead = git(['rev-parse', 'HEAD'])
  await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('消息与通知', {
    timeout: 40_000
  })
  await board.getByLabel('特性显示范围').selectOption('all')
  await board.getByLabel('定位日期', { exact: true }).fill('2026-11-01')
  await expect(board.getByLabel('特性名称', { exact: true }).first()).toHaveValue('消息与通知')
  await expect(windows).toHaveCount(2)
  await expect(windows.first()).toContainText('11-02 — 11-08')
  const roadmap = board.locator('.monica-ml-roadmap')
  await roadmap.getByRole('button', { name: '添加里程碑', exact: true }).click()
  const add = page.getByRole('dialog', { name: '添加里程碑' })
  await add.getByLabel('日期', { exact: true }).fill('2026-11-05')
  await add.getByLabel('预期成果').fill('正式推广')
  await add.getByRole('button', { name: '添加', exact: true }).click()
  const sameDay = roadmap.getByRole('button', { name: '2026-11-05 2 个里程碑', exact: true })
  await sameDay.click()
  const detail = page.getByRole('dialog', { name: '里程碑详情' })
  await detail.getByRole('button', { name: '删除里程碑：正式推广' }).click()
  await expect(
    roadmap.getByRole('button', { name: '2026-11-05 协作能力形成可用闭环' })
  ).toBeVisible()
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(sameDay).toBeVisible()
  await board.getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true }).click()
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  const rows = board.locator('.monica-ml-row')
  await rows.first().getByLabel('负责人', { exact: true }).fill('临时负责人')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(board.getByRole('button', { name: '重做', exact: true })).toBeEnabled()
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await expect(rows.first().getByLabel('负责人', { exact: true })).toHaveValue('临时负责人')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await rows.first().getByLabel('负责人', { exact: true }).fill('评审 Builder  ')
  await rows.first().getByLabel('负责人', { exact: true }).press('Tab')
  await board.getByRole('button', { name: '结束编辑，返回项目里程碑', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true })).toHaveCount(0)
  await expect(board).toHaveAttribute('data-draft-persistence', 'saved')
  expect(JSON.parse(readFileSync(workingPath, 'utf8')).features[0].owner).toBe('评审 Builder')
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await expect(rows.first().getByLabel('负责人', { exact: true })).toHaveValue('评审 Builder')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(rows.first().getByLabel('负责人', { exact: true })).toHaveValue('Builder 1')
  await board.getByRole('button', { name: '重做', exact: true }).click()
  await board.getByRole('button', { name: '添加特性', exact: true }).click()
  await rows.first().getByLabel('特性名称', { exact: true }).fill('知识库')
  await rows.first().getByLabel('负责人', { exact: true }).fill('Builder 3  ')
  await expect(rows).toHaveCount(3)
  await rows.first().getByRole('button', { name: '删除特性', exact: true }).click()
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
  const deliveryBar = notification.locator('.monica-ml-delivery-body').first()
  await board.getByLabel('定位日期', { exact: true }).fill('2026-11-01')
  await expect
    .poll(() =>
      deliveryBar.evaluate((node) => {
        const rect = node.getBoundingClientRect()
        return node.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        )
      })
    )
    .toBe(true)
  const initialDelivery = await deliveryBar.getAttribute('title')
  await moveNode(page, deliveryBar, 252)
  await expect(deliveryBar).toHaveAttribute('title', /2026-11-09 00:00 — 2026-11-16 00:00/)
  await expect(notification.locator('.monica-ml-delivery-body').last()).toHaveAttribute(
    'title',
    /2026-11-16 00:00 — 2026-11-21 00:00/
  )
  await expect(windows).toHaveCount(2)
  await expect(windows.nth(1)).toContainText('11-09 — 11-15')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(deliveryBar).toHaveAttribute('title', initialDelivery!)
  const boundary = notification.getByRole('button', {
    name: '消息与通知 Build 结束：拖动或方向键调整半天',
    exact: true
  })
  await boundary.press('ArrowRight')
  await expect(notification.locator('.monica-ml-delivery-body').last()).toHaveAttribute(
    'title',
    /2026-11-09 12:00 — 2026-11-14 12:00/
  )
  await expect(windows.first()).toContainText('11-02 — 11-08')
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await notification.getByRole('button', { name: '添加 Maintain', exact: true }).click()
  await expect(notification.locator('.monica-ml-delivery')).toHaveCount(3)
  await notification.locator('.monica-ml-delivery-body').last().hover()
  await notification.getByRole('button', { name: '删除此段 Maintain', exact: true }).last().click()
  await expect(notification.locator('.monica-ml-delivery')).toHaveCount(2)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(notification.locator('.monica-ml-delivery')).toHaveCount(3)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await windows
    .first()
    .getByRole('button', { name: 'v1.0.0 结束日期：拖动或方向键调整一天', exact: true })
    .press('ArrowRight')
  await expect(windows.first()).toContainText('11-02 — 11-08')
  await expect(
    page.getByText('v1.0.0 与 v1.0.1 日期重叠，请调整相关版本', { exact: true })
  ).toBeVisible()
  await expect(deliveryBar).toHaveAttribute('title', initialDelivery!)
  await board.getByLabel('版本名称 2026-11-23', { exact: true }).fill('v1.0.2')
  await board.getByLabel('版本名称 2026-11-23', { exact: true }).press('Enter')
  await expect(windows).toHaveCount(3)
  await expect(windows.last()).toContainText('11-23 — 11-27')
  expect(git(['worktree', 'list', '--porcelain'])).not.toContain('bw/v1.0.2/plan')
  await windows
    .nth(1)
    .getByRole('button', { name: '进入 v1.0.1 版本总览', exact: true })
    .scrollIntoViewIfNeeded()
  const scrollBounds = await board.locator('.monica-ml-scroll').boundingBox()
  if (!scrollBounds) {
    throw new Error('Timeline viewport is not visible')
  }
  await page.mouse.move(scrollBounds.x + scrollBounds.width - 40, scrollBounds.y + 120)
  await page.mouse.wheel(40, 0)
  const viewport = () =>
    board.evaluate((element) => {
      const scroll = element.querySelector('.monica-ml-scroll')!
      return {
        date: (element.querySelector('[aria-label="定位日期"]') as HTMLInputElement).value,
        x: scroll.scrollLeft % 36,
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
  await expect(deliveryBar).toHaveAttribute('title', initialDelivery!)
  await expect.poll(viewport).toEqual(beforeNavigate)
  await board.getByRole('button', { name: '提交评审', exact: true }).click()
  await expect(page.getByText('本次改动', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认提交', exact: true }).click()
  const failure = board.locator('details').filter({ hasText: '里程碑提交失败' })
  await expect(failure.locator('summary')).toBeVisible({ timeout: 120_000 })
  await failure.locator('summary').click()
  await expect(failure).toContainText('未确认代码仓远端')
  await expect(failure.getByRole('button', { name: '重试提交' })).toBeEnabled()
  await expect(notification.getByLabel('负责人', { exact: true })).toHaveValue('评审 Builder')
  await page.screenshot({ path: info.outputPath('milestones-submit-retained.png') })
  expect(git(['rev-parse', 'HEAD'])).toBe(formalHead)
  expect(JSON.parse(readFileSync(materialPath, 'utf8'))).toEqual(material)
  await board.getByRole('button', { name: '放弃本次修改，恢复最近提交', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await expect(board.getByRole('button', { name: '提交评审', exact: true })).toBeDisabled()
  expect(projectGit(['status', '--porcelain', '--', '.bw/milestones.json'])).toBe('')
  await board.getByRole('button', { name: '结束编辑，返回项目里程碑', exact: true }).click()
  await page.reload()
  await openMilestoneOverview(page)
  await expect(board.getByText('消息与通知', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(board.getByText('工程能力观测', { exact: true })).toBeVisible()
  await expect(board.getByText('知识库', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('milestones-reloaded.png') })
  const remote = path.join(repoPath, '.git', 'milestones-remote.git')
  execFileSync('git', ['init', '--bare', '--initial-branch=main', remote])
  git(['remote', 'add', 'origin', remote])
  git(['push', '-u', 'origin', 'HEAD:main'])
  projectGit(['push', '-u', 'origin', 'bw/project'])

  const startedPlanPath = path.join(repoPath, '.bw/planning/v1.0.0/data.json')
  const startedPlan = JSON.parse(readFileSync(startedPlanPath, 'utf8'))
  startedPlan.summary.progress = '已开始制定计划'
  writeFileSync(startedPlanPath, JSON.stringify(startedPlan))
  git(['add', '.bw/planning/v1.0.0/data.json'])
  git(['commit', '-m', 'start version planning'])
  git(['push', 'origin', 'HEAD:main'])
  const mainHead = git(['rev-parse', 'HEAD'])
  const peer = path.join(repoPath, '.git', 'milestones-peer')
  git(['clone', '--branch', 'bw/project', remote, peer])
  const peerGit = (args: string[]) =>
    execFileSync('git', args, { cwd: peer, encoding: 'utf8' }).trim()
  writeFileSync(path.join(peer, 'review-notes.md'), 'Unrelated peer change for sync\n')
  peerGit(['add', 'review-notes.md'])
  peerGit([
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-m',
    'unrelated peer change'
  ])
  peerGit(['push'])
  const update = board.getByRole('button', { name: '更新代码 · 项目材料工作树', exact: true })
  await update.click()
  const updated = page.getByText('项目材料工作树已更新', { exact: true })
  const updateRefused = board.getByText('项目材料工作树未更新 · 查看详情', { exact: true })
  await expect(updated.or(updateRefused)).toBeVisible({ timeout: 120_000 })
  if (await updateRefused.isVisible()) {
    await updateRefused.click()
    throw new Error(await updateRefused.locator('..').innerText())
  }
  expect(readFileSync(path.join(projectTree, 'review-notes.md'), 'utf8')).toContain(
    'Unrelated peer change'
  )
  expect(git(['rev-parse', 'HEAD'])).toBe(mainHead)
  await page.screenshot({ path: info.outputPath('milestones-project-updated.png') })
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await windows
    .first()
    .getByRole('button', {
      name: 'v1.0.0 开始日期：拖动或方向键调整一天',
      exact: true
    })
    .press('ArrowLeft')
  await expect(windows.first()).toContainText('11-01 — 11-08')
  await board.getByLabel('显示实际', { exact: true }).check()
  await expect(windows.first()).toContainText('规划 11-01 — 11-08')
  await expect(windows.first()).toContainText('实际 11-02 — 11-08', { timeout: 60_000 })
  await expect(board.locator('.monica-ml-delivery-body')).toHaveCount(0)
  await expect(board.locator('.monica-ml-result-bar')).toHaveCount(0)
  await board.getByLabel('显示实际', { exact: true }).uncheck()
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(windows.first()).toContainText('11-02 — 11-08')
  await boundary.press('ArrowLeft')
  await expect(deliveryBar).toHaveAttribute('title', /2026-11-08 12:00/)
  await board.getByRole('button', { name: '撤销', exact: true }).click()
  await board.getByLabel('负责人', { exact: true }).first().fill('重启后恢复的草案')
  await board.getByLabel('负责人', { exact: true }).first().press('Tab')
  await expect(board).toHaveAttribute('data-draft-persistence', 'saved')
  const local = readFileSync(workingPath, 'utf8')
  expect(JSON.parse(local).features[0].owner).toBe('重启后恢复的草案')
  const peerPath = path.join(peer, '.bw/milestones.json')
  const peerInput = JSON.parse(readFileSync(peerPath, 'utf8'))
  peerInput.features[0].owner = '另一位 Builder'
  writeFileSync(peerPath, JSON.stringify(peerInput))
  peerGit(['add', '.bw/milestones.json'])
  peerGit([
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.com',
    'commit',
    '-m',
    'update same milestone'
  ])
  peerGit(['push'])
  await update.click()
  await expect(board.getByText('项目材料工作树未更新 · 查看详情', { exact: true })).toBeVisible({
    timeout: 120_000
  })
  expect(readFileSync(workingPath, 'utf8')).toBe(local)
  expect(git(['rev-parse', 'HEAD'])).toBe(mainHead)
  await page.screenshot({ path: info.outputPath('milestones-project-conflict.png') })

  await page.reload()
  await openMilestoneOverview(page)
  await expect(board.getByText('已保存 · 未提交', { exact: true })).toBeVisible()
  await board.getByRole('button', { name: '规划里程碑', exact: true }).click()
  await expect(board.getByLabel('负责人', { exact: true }).first()).toHaveValue('重启后恢复的草案')
  await expect(board).toHaveAttribute('data-draft-persistence', 'saved')
  expect(JSON.parse(readFileSync(materialPath, 'utf8'))).toEqual(material)
  return workingPath
}
