import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect, type ElectronApplication } from '@stablyai/playwright-test'
import {
  overviewVersions,
  overviewFlowPaths,
  overviewPinnedTitle,
  overviewLatestTitle,
  snapshotOverviewMaterials,
  bindOverviewFlowsAndRead
} from './workbench-version-overview-fixture'
import { verifyOverviewRestart } from './workbench-overview-restart'

export async function verifyVersionOverview(
  page: Page,
  app: ElectronApplication,
  root: string,
  info: TestInfo
) {
  const materialsBefore = snapshotOverviewMaterials(root)
  const open = async (version: string, afterBackgroundReload = false) => {
    const group = page.locator('.wb-version-group', {
      has: page.getByRole('button', { name: `${version} 展开或收起`, exact: true })
    })
    const overview = group.getByRole('button', { name: '总览', exact: true })
    const toggle = group.getByRole('button', { name: `${version} 展开或收起`, exact: true })
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
      await toggle.click({ force: afterBackgroundReload })
    }
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(overview).toBeVisible()
    await expect(overview).toBeEnabled()
    // A background reload has no animation frames for Playwright's stability check.
    await overview.click({ force: afterBackgroundReload })
    await expect(
      page.getByRole('heading', { name: `${version} 版本总览`, exact: true })
    ).toBeVisible()
  }
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  await verifyDraftAcceptanceSource(page, root, info, open)
  const provider = JSON.parse(
    execFileSync(
      'gh',
      [
        'issue',
        'view',
        '334',
        '--repo',
        'forcegravity1989/builder-workbench',
        '--json',
        'number,title,labels,state,url'
      ],
      { encoding: 'utf8', timeout: 30_000 }
    )
  )
  expect(provider.labels.some((label: { name: string }) => label.name === '特性')).toBe(true)
  await info.attach('readonly-provider-source', {
    body: JSON.stringify(provider),
    contentType: 'application/json'
  })
  await open(overviewVersions.current)
  const board = page.locator('.bwo-page')
  await expect(board.getByText(/计划 PR 合入/).first()).toBeVisible()
  await expect(board.getByRole('button', { name: '#446 ↗', exact: true }).first()).toBeVisible()
  await expect(
    board.getByRole('heading', { name: '当前目标 · 版本总览开发', exact: true })
  ).toBeVisible()
  await expect(board.getByText('未关联目标 · 1 项')).toBeVisible()
  const feature = board.locator('.bwo-feature').first()
  await expect(feature).toContainText(provider.title, { timeout: 90_000 })
  await expect(feature.getByRole('button', { name: /开发 PR #474/ }).first()).toBeVisible({
    timeout: 90_000
  })
  console.info('[overview] formal plan and native Issue/PR evidence read successfully')
  const productivity = board.locator('section[aria-label="AI workflow 生产力"]')
  await expect(productivity).toContainText('本版目标内 2 项 Issue')
  await expect(productivity.getByRole('button', { name: '刷新指标', exact: true })).toBeEnabled({
    timeout: 180_000
  })
  await expect(productivity.locator('.bwo-productivity > div')).toHaveCount(6)
  await productivity.getByText(/^报告来源与未读取范围/).click()
  await expect(
    productivity.getByRole('button', { name: '指标评论 ↗', exact: true }).first()
  ).toBeVisible({ timeout: 180_000 })
  const ask = productivity.locator('.bwo-productivity > div').filter({ hasText: 'AskUser' })
  await expect(ask).toContainText(/\d+\/\d+/)
  await productivity.getByRole('button', { name: '刷新指标', exact: true }).click()
  await expect(productivity.getByRole('button', { name: '刷新指标', exact: true })).toBeEnabled({
    timeout: 180_000
  })
  await expect(ask).toContainText(/\d+\/\d+/)
  await expect(productivity.locator('.text-destructive')).toHaveCount(0)
  await expect(productivity).not.toContainText('刷新失败')
  await info.attach('workflow-native-display', {
    body: await productivity.innerText(),
    contentType: 'text/plain'
  })
  console.info('[overview] goal-scoped real workflow comments and independent refresh verified')
  await expect(feature.locator('.bwo-timeline-marker')).not.toHaveCount(0)
  await feature.locator('.bwo-feature-heading').click()
  await expect(feature.getByText('特性历程与版本交付', { exact: true })).toHaveCount(0)
  await feature.locator('.bwo-feature-heading').click()
  await feature.locator('.bwo-stage-range').filter({ hasText: 'Deploy' }).hover()
  await expect(page.getByRole('tooltip')).toHaveText('部署时间 · 未跟踪；规划未读回，使用默认长度')
  await expect(
    feature.locator('.bwo-source-row, .bwo-stage-legend, .bwo-untracked-stage')
  ).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: '成果节点', exact: true })).toHaveCount(0)
  await expect(feature.getByRole('button', { name: /工作会话/ })).toHaveCount(0)
  for (const width of [1360, 1000]) {
    await app.evaluate(({ BrowserWindow }, target) => {
      BrowserWindow.getAllWindows()[0]!.setSize(target, 900)
    }, width)
    await expect
      .poll(() =>
        app.evaluate(
          ({ BrowserWindow }, target) =>
            Math.abs(BrowserWindow.getAllWindows()[0]!.getSize()[0]! - target),
          width
        )
      )
      .toBeLessThanOrEqual(4)
    await info.attach(`window-${width}`, {
      body: JSON.stringify(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getBounds())
      ),
      contentType: 'application/json'
    })
    await feature.locator('.bwo-axis-scroll').evaluate((node) => {
      node.scrollLeft = 0
    })
    await page.screenshot({ path: info.outputPath(`overview-${width}.png`) })
    expect(await board.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  }
  await open(overviewVersions.current)
  await board.getByRole('button', { name: '目标任务 · 1 项 ↗', exact: true }).first().click()
  await expect(page.getByRole('button', { name: '移除目标筛选', exact: true })).toBeVisible()
  await expect(page.getByText('目标 当前目标 · 版本总览开发', { exact: true })).toBeVisible()
  await expect(page.getByText(provider.title, { exact: true }).last()).toBeVisible({
    timeout: 90_000
  })
  console.info('[overview] native goal task filtering and actual Issue row verified')
  await open(overviewVersions.current)
  await expect(feature).toContainText(provider.title, { timeout: 90_000 })
  await feature.getByRole('button', { name: overviewVersions.history, exact: true }).click()
  await expect(
    page.getByRole('heading', { name: `${overviewVersions.history} 版本总览`, exact: true })
  ).toBeVisible()
  await expect(
    board.getByRole('heading', { name: '历史目标 · 保留当时范围', exact: true })
  ).toBeVisible({ timeout: 90_000 })
  await expect(board.getByRole('button', { name: '未达 ↗', exact: true })).toBeVisible()
  await expect(board.getByText('后续处理 · 后续版本继续', { exact: true })).toBeVisible()
  console.info('[overview] historical pinned plan and human conclusion verified')
  await expect(board.locator('.bwo-feature').first()).toContainText('历史记录', { timeout: 90_000 })
  await expect(board).not.toContainText('开发 PR #474')
  await page.screenshot({ path: info.outputPath('overview-history.png') })
  await open(overviewVersions.error)
  await expect(board.getByText('状态未知', { exact: true })).toBeVisible()
  await expect(board.getByRole('alert')).toBeVisible()
  await expect(board.getByText('指标待定', { exact: true })).toHaveCount(0)
  await expect(board.getByText('统计范围未知', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '新建版本', exact: true }).click()
  await page.getByLabel('版本名').fill('v0.336')
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本计划', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await open('v0.336')
  await expect(board.getByRole('button', { name: '开始制定版本计划', exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('overview-unplanned.png') })
  console.info('[overview] invalid material and unstarted version verified')
  await open(overviewVersions.current)
  await expect(feature.locator('.bwo-stage-range')).not.toHaveCount(0, { timeout: 90_000 })
  await page.getByRole('button', { name: '项目总览', exact: true }).click()
  await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: `进入 ${overviewVersions.current} 版本总览`, exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: `${overviewVersions.current} 版本总览`, exact: true })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '← 返回项目里程碑', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '← 返回项目里程碑', exact: true }).click()
  await expect(page.getByRole('heading', { name: '总览', exact: true })).toBeVisible()
  console.info('[overview] version header navigation and milestone source return verified')
  await open(overviewVersions.current)
  await page.reload()
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 120_000 })
  await open(overviewVersions.current, true)
  await expect(
    page.getByRole('heading', { name: '当前目标 · 版本总览开发', exact: true })
  ).toBeVisible()
  expect(snapshotOverviewMaterials(root)).toEqual(materialsBefore)
  await info.attach('independent-file-readback', {
    body: JSON.stringify({ materialsBefore, unchanged: true }),
    contentType: 'application/json'
  })
  await verifyOverviewRestart(app, info)
  expect(snapshotOverviewMaterials(root)).toEqual(materialsBefore)
}

async function verifyDraftAcceptanceSource(
  page: Page,
  root: string,
  info: TestInfo,
  open: (version: string, afterBackgroundReload?: boolean) => Promise<void>
) {
  const flows = overviewFlowPaths(root)
  const version = overviewVersions.draftAcceptance
  const materialPath = (directory: string, file: string) =>
    path.join(directory, '.bw', 'planning', version, file)
  const acceptance = JSON.parse(
    readFileSync(materialPath(flows.acceptance, 'acceptance.json'), 'utf8')
  )
  const latestBytes = readFileSync(materialPath(flows.plan, 'data.json'))
  const latest = JSON.parse(latestBytes.toString('utf8'))
  const fixedBytes = execFileSync(
    'git',
    ['show', `${acceptance.planRef.sourceCommit}:.bw/planning/${version}/data.json`],
    { cwd: flows.acceptance }
  )
  expect(existsSync(materialPath(root, 'data.json'))).toBe(false)
  expect(existsSync(materialPath(root, 'acceptance.json'))).toBe(false)
  expect(acceptance.planRef.kind).toBe('committed')
  expect(acceptance.planRef.cycleId).toBe(latest.cycleId)
  expect(acceptance.planRef.version).toBe(latest.version)
  expect(`sha256:${createHash('sha256').update(fixedBytes).digest('hex')}`).toBe(
    acceptance.planRef.revision
  )
  expect(`sha256:${createHash('sha256').update(latestBytes).digest('hex')}`).not.toBe(
    acceptance.planRef.revision
  )
  const reachability = [root, flows.plan, flows.acceptance].map((directory) => ({
    directory,
    reachable:
      spawnSync('git', ['merge-base', '--is-ancestor', acceptance.planRef.sourceCommit, 'HEAD'], {
        cwd: directory
      }).status === 0
  }))
  expect(reachability.map((entry) => entry.reachable)).toEqual([false, false, true])
  const before = snapshotOverviewMaterials(root)
  try {
    const nativeReads = await bindOverviewFlowsAndRead(page, root, acceptance.planRef)
    expect(nativeReads.acceptance.ok).toBe(true)
    expect(nativeReads.acceptance.value?.document.goals[0]?.title).toBe(overviewPinnedTitle)
    expect(nativeReads.home.error?.code).toBe('unverified-source')
    expect(nativeReads.plan.error?.code).toBe('unverified-source')
    await info.attach('draft-acceptance-fixture-proof', {
      body: JSON.stringify({
        provider: 'not used in this scenario (no mock)',
        version,
        reachability,
        nativeReads,
        before
      }),
      contentType: 'application/json'
    })
    console.info(
      '[overview] draft acceptance fixture verified: fixed plan is reachable only in its native acceptance scope'
    )
    await open(version)
    const board = page.locator('.bwo-page')
    await expect(board.locator('.bwo-header .bwo-badge')).not.toHaveText('读取中', {
      timeout: 90_000
    })
    await expect(board.getByText('正在读取版本材料…', { exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('overview-draft-acceptance.png') })
    await info.attach('draft-acceptance-observation', {
      body: await board.innerText(),
      contentType: 'text/plain'
    })
    await expect(
      board.getByRole('heading', { name: overviewPinnedTitle, exact: true })
    ).toBeVisible()
    await expect(
      board.getByRole('heading', { name: overviewLatestTitle, exact: true })
    ).toHaveCount(0)
    await expect(board.getByRole('button', { name: '未达 ↗', exact: true })).toBeVisible()
    await expect(board.getByText('后续处理 · 保留原人工结论后继续', { exact: true })).toBeVisible()
    await expect(board.getByRole('alert')).toHaveCount(0)
    await expect(board).not.toContainText('已有正式验收')
    await expect(board).not.toContainText('已归档')
    console.info(
      '[overview] draft acceptance retains fixed scope and human conclusion without claiming formal acceptance'
    )
  } finally {
    const after = snapshotOverviewMaterials(root)
    await info.attach('draft-acceptance-independent-readback', {
      body: JSON.stringify({
        before,
        after,
        unchanged: JSON.stringify(before) === JSON.stringify(after)
      }),
      contentType: 'application/json'
    })
    expect(after).toEqual(before)
  }
}
