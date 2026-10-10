import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { test, expect } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { waitForSessionReady, waitForStartupWorktreeRefresh } from './helpers/store'
import { parseWeeklyReport, weeklyReportPeriod } from '../../src/shared/workbench/weekly-report'

const repository = 'github.com/forcegravity1989/builder-workbench'
const cloneUrl = 'https://github.com/forcegravity1989/builder-workbench.git'

test.setTimeout(300_000)

test.use({
  seededRepoPath: async ({ registerPostElectronShutdownCleanup }, provideFixture) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'bw-weekly-report-journey-'))
    registerPostElectronShutdownCleanup(async () => {
      await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
    })
    const repoPath = path.join(root, 'builder-workbench')
    const sourceRepo = process.env.BW_WEEKLY_REPORT_E2E_SOURCE_REPO
    let sourceHead: string | null = null
    if (sourceRepo) {
      const sourceRemote = execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: sourceRepo,
        encoding: 'utf8'
      }).trim()
      expect(sourceRemote).toBe(cloneUrl)
      sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: sourceRepo,
        encoding: 'utf8'
      }).trim()
    }
    const cloneArgs = sourceRepo
      ? ['clone', '--local', '--no-hardlinks', sourceRepo, repoPath]
      : ['clone', '--depth', '1', '--no-tags', cloneUrl, repoPath]
    execFileSync('git', cloneArgs, {
      timeout: 120_000,
      stdio: 'pipe'
    })
    if (sourceRepo) {
      execFileSync('git', ['remote', 'set-url', 'origin', cloneUrl], {
        cwd: repoPath,
        stdio: 'pipe'
      })
    }
    const treePath = path.join(root, 'weekly-report')
    execFileSync('git', ['worktree', 'add', '-b', 'bw/weekly-report', treePath, 'HEAD'], {
      cwd: repoPath,
      timeout: 120_000,
      stdio: 'pipe'
    })
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim()
    if (sourceHead) {
      expect(commit).toBe(sourceHead)
    }
    const subject = execFileSync('git', ['log', '-1', '--format=%s'], {
      cwd: repoPath,
      encoding: 'utf8'
    }).trim()
    const period = weeklyReportPeriod()
    const reportDir = path.join(treePath, '.bw', 'weekly-reports', period.start)
    mkdirSync(reportDir, { recursive: true })
    const raw = JSON.stringify(
      {
        schemaVersion: 1,
        project: { name: 'builder-workbench', repository },
        period,
        version: null,
        generatedAt: new Date().toISOString(),
        sections: {
          goals: [],
          progress: [['仓库当前状态', `${subject}（HEAD ${commit}）`, '未知']],
          risks: [],
          milestones: [],
          requirements: [],
          problems: [],
          members: []
        },
        problemSummary: '新增：未知；关闭：未知；未关闭：未知',
        sources: [
          {
            url: `https://github.com/forcegravity1989/builder-workbench/commit/${commit}`,
            summary: '本次真实克隆的当前 HEAD，不推断周期内交付或验收结果。'
          }
        ],
        manual: {}
      },
      null,
      2
    )
    parseWeeklyReport(raw)
    writeFileSync(path.join(reportDir, `${randomUUID()}.json`), raw, 'utf8')
    await provideFixture(repoPath)
  }
})

test('WJ01 real repository report reads, saves a revision, and survives restart', async ({
  seededRepoPath
}, testInfo) => {
  const session = createRestartSession(testInfo, {
    WORKBENCH_SHELL: '1',
    VITE_WORKBENCH_SHELL: '1',
    ORCA_PRODUCT_NAME: 'Workbench'
  })
  let activeApp: Awaited<ReturnType<typeof session.launch>>['app'] | null = null
  let activePage: Awaited<ReturnType<typeof session.launch>>['page'] | null = null
  try {
    const initial = await session.launch()
    activeApp = initial.app
    activePage = initial.page
    const orcaPage = initial.page
    await waitForSessionReady(orcaPage)
    await waitForStartupWorktreeRefresh(orcaPage)
    const primaryId = await attachRepoAndOpenTerminal(orcaPage, seededRepoPath)
    await expect
      .poll(
        () =>
          orcaPage.evaluate(async (primaryId) => {
            const state = window.__store!.getState()
            const repoId = state.allWorktrees().find((tree) => tree.id === primaryId)!.repoId
            await state.fetchWorktrees(repoId)
            return window.__store!.getState().worktreesByRepo[repoId]?.map((tree) => tree.branch)
          }, primaryId),
        { timeout: 30_000 }
      )
      .toContain('refs/heads/bw/weekly-report')
    const period = weeklyReportPeriod()
    const treePath = path.join(path.dirname(seededRepoPath), 'weekly-report')
    const reportDir = path.join(treePath, '.bw', 'weekly-reports', period.start)
    const originalName = readdirSync(reportDir).find((name) => name.endsWith('.json'))!
    const originalRaw = readFileSync(path.join(reportDir, originalName), 'utf8')
    const original = parseWeeklyReport(originalRaw)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: seededRepoPath,
      encoding: 'utf8'
    }).trim()

    await orcaPage.getByRole('button', { name: '周报', exact: true }).click()
    const report = orcaPage.getByRole('article', { name: '项目周报' })
    await expect(report).toContainText(head, { timeout: 60_000 })
    await expect(report.locator('section')).toHaveCount(7)
    await expect(report.locator('table')).toHaveCount(7)
    await expect(report).toContainText('未关闭：未知')
    await expect(report.getByRole('cell', { name: '已完成', exact: true })).toHaveCount(0)
    await orcaPage.screenshot({ path: testInfo.outputPath('WJ01-real-report.png') })

    await orcaPage.getByRole('button', { name: '补充或修正', exact: true }).click()
    const editor = orcaPage.getByRole('dialog')
    await editor.getByRole('combobox', { name: '栏目', exact: true }).selectOption('progress')
    await editor.getByRole('combobox', { name: '方式', exact: true }).selectOption('correct')
    const revisionText = `已读取仓库 HEAD ${head}；交付验收待确认。<script>window.injected=true</script>`
    await editor.getByLabel('补充或修正内容', { exact: true }).fill(revisionText)
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0, { timeout: 60_000 })
    await expect(report).toContainText(revisionText)
    await expect(report.locator('script')).toHaveCount(0)
    await expect
      .poll(() => readdirSync(reportDir).filter((name) => name.endsWith('.json')).length)
      .toBe(2)
    expect(readFileSync(path.join(reportDir, originalName), 'utf8')).toBe(originalRaw)
    const revisedName = readdirSync(reportDir).find(
      (name) => name.endsWith('.json') && name !== originalName
    )!
    const revised = parseWeeklyReport(readFileSync(path.join(reportDir, revisedName), 'utf8'))
    expect(revised.manual.progress).toEqual({ text: revisionText, mode: 'correct' })
    expect(revised.sources).toEqual(original.sources)
    expect(revised.sections).toEqual(original.sections)
    expect(revised.origin).toBe('manual')

    const nextConversationName = `${randomUUID()}.json`
    const nextConversationRaw = JSON.stringify(
      { ...original, origin: 'conversation', manual: {}, generatedAt: new Date().toISOString() },
      null,
      2
    )
    writeFileSync(path.join(reportDir, nextConversationName), nextConversationRaw, 'utf8')
    await expect(orcaPage.getByLabel('周报版本').locator('option')).toHaveCount(3, {
      timeout: 30_000
    })
    await expect(report).toContainText(revisionText)
    expect(
      parseWeeklyReport(readFileSync(path.join(reportDir, nextConversationName), 'utf8')).manual
    ).toEqual({})
    expect(readFileSync(path.join(reportDir, originalName), 'utf8')).toBe(originalRaw)

    await orcaPage.getByRole('button', { name: '补充或修正', exact: true }).click()
    await editor.getByRole('combobox', { name: '栏目', exact: true }).selectOption('progress')
    const reconciledText = `${revisionText} 已核对新版本后保留人工修正。`
    await editor.getByLabel('补充或修正内容', { exact: true }).fill(reconciledText)
    const concurrentName = `${randomUUID()}.json`
    const concurrentRaw = JSON.stringify(
      { ...original, origin: 'conversation', manual: {}, generatedAt: new Date().toISOString() },
      null,
      2
    )
    writeFileSync(path.join(reportDir, concurrentName), concurrentRaw, 'utf8')
    await expect(orcaPage.getByLabel('周报版本').locator('option')).toHaveCount(4)
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor.getByRole('alert')).toHaveText(
      '周报已更新，已读取最新内容，请核对后再次保存'
    )
    await expect(editor.getByLabel('补充或修正内容', { exact: true })).toHaveValue(reconciledText)
    expect(readdirSync(reportDir).filter((name) => name.endsWith('.json'))).toHaveLength(4)
    expect(readFileSync(path.join(reportDir, concurrentName), 'utf8')).toBe(concurrentRaw)
    await orcaPage.screenshot({ path: testInfo.outputPath('WJ01-conflict-input-retained.png') })
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(editor).toHaveCount(0, { timeout: 60_000 })
    await expect(report).toContainText(reconciledText)
    await expect(orcaPage.getByLabel('周报版本').locator('option')).toHaveCount(5)
    expect(readFileSync(path.join(reportDir, concurrentName), 'utf8')).toBe(concurrentRaw)
    expect(readFileSync(path.join(reportDir, revisedName), 'utf8')).toContain(revisionText)
    await orcaPage.screenshot({ path: testInfo.outputPath('WJ01-conflict-reconciled.png') })

    await session.close(activeApp)
    activeApp = null
    const restarted = await session.launch()
    activeApp = restarted.app
    activePage = restarted.page
    await waitForSessionReady(restarted.page)
    await waitForStartupWorktreeRefresh(restarted.page)
    await expect(restarted.page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 120_000 })
    await restarted.page.getByRole('button', { name: '周报', exact: true }).click()
    const restoredReport = restarted.page.getByRole('article', { name: '项目周报' })
    await expect(restoredReport).toContainText(reconciledText, { timeout: 60_000 })
    await expect(restarted.page.getByLabel('周报版本').locator('option')).toHaveCount(5)
    await restarted.page.screenshot({ path: testInfo.outputPath('WJ01-restored-manual.png') })
    const historicPath = `.bw/weekly-reports/${period.start}/${originalName}`
    await restarted.page.getByLabel('周报版本').selectOption(historicPath)
    await expect(restoredReport).toContainText(original.sections.progress[0][1])
    await expect(restoredReport).not.toContainText(revisionText)
    await restarted.page.screenshot({ path: testInfo.outputPath('WJ01-restored-history.png') })
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await testInfo.attach('WJ01 failure', {
        body: await activePage.screenshot(),
        contentType: 'image/png'
      })
    }
    throw error
  } finally {
    if (activeApp) {
      await session.close(activeApp)
    }
    await session.dispose()
  }
})
