/**
 * Hidden Workbench fidelity smoke: overview + Monday plan journey via CDP screenshots.
 * Requires ORCA_BACKGROUND_LAUNCH=1. Does not steal focus.
 */
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

if (process.env.ORCA_BACKGROUND_LAUNCH !== '1') {
  throw new Error('Requires ORCA_BACKGROUND_LAUNCH=1')
}

const root = '/Users/dong/projects/orca'
const appBin = join(root, 'dist/mac-arm64/Workbench.app/Contents/MacOS/Workbench')
const outDir = join(root, '.bench-fixtures/workbench-fidelity')
mkdirSync(outDir, { recursive: true })
const port = 9337

const report = {
  ok: false,
  checks: /** @type {string[]} */ ([]),
  failures: /** @type {string[]} */ ([]),
  error: /** @type {string | null} */ (null)
}

function check(name, cond) {
  if (cond) {
    report.checks.push(name)
  } else {
    report.failures.push(name)
  }
}

function log(...args) {
  console.error(...args)
}

await new Promise((resolve) => {
  const k = spawn('pkill', ['-9', '-f', 'dist/mac-arm64/Workbench.app'], { stdio: 'ignore' })
  k.on('exit', () => resolve(undefined))
})
await sleep(800)

log('launching', appBin)
const child = spawn(
  appBin,
  [
    `--remote-debugging-port=${port}`,
    '--password-store=basic',
    '--use-mock-keychain',
    '-ApplePersistenceIgnoreState',
    'YES'
  ],
  {
    env: {
      ...process.env,
      ORCA_BACKGROUND_LAUNCH: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true
  }
)
child.stderr?.on('data', (d) => log('[wb-stderr]', String(d).slice(0, 400)))
child.stdout?.on('data', (d) => log('[wb-stdout]', String(d).slice(0, 400)))
child.unref()

async function waitCdp(ms = 90000) {
  const start = Date.now()
  let last = ''
  while (Date.now() - start < ms) {
    try {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
      return browser
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
      await sleep(750)
    }
  }
  throw new Error(`CDP not ready: ${last}`)
}

/** @type {import('playwright-core').Browser | undefined} */
let browser
try {
  browser = await waitCdp()
  log('cdp connected')
  const context = browser.contexts()[0]
  if (!context) {
    throw new Error('No browser context')
  }
  let page = context.pages().find((p) => !p.url().startsWith('devtools://')) ?? context.pages()[0]
  for (let i = 0; i < 60 && (!page || page.url() === 'about:blank'); i++) {
    await sleep(500)
    page = context.pages().find((p) => !p.url().startsWith('devtools://')) ?? context.pages()[0]
  }
  if (!page) {
    throw new Error('No renderer page')
  }
  log('page url', page.url())

  await page.waitForLoadState('domcontentloaded')
  await sleep(3000)

  // Wait for workbench nav (shell flag must be on)
  try {
    await page.locator('[data-workbench-nav]').waitFor({ timeout: 30000 })
  } catch {
    const body = await page
      .locator('body')
      .innerText()
      .catch(() => '')
    throw new Error(`workbench nav missing. body snippet: ${body.slice(0, 500)}`)
  }

  for (const label of [
    'Skip',
    '跳过',
    'Continue',
    '继续',
    'Get started',
    'Not now',
    '稍后',
    'Close'
  ]) {
    const btn = page.getByRole('button', { name: label })
    if ((await btn.count()) > 0) {
      try {
        await btn.first().click({ timeout: 800 })
      } catch {
        /* ignore */
      }
    }
  }

  async function shot(name) {
    const cdp = await page.context().newCDPSession(page)
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'))
    await cdp.detach()
    log('shot', name)
  }

  const overviewNav = page.locator('[data-workbench-nav]').getByRole('button', { name: '总览' })
  check('nav-overview-visible', (await overviewNav.count()) > 0)
  await overviewNav.click()
  await sleep(1000)
  await shot('01-overview')

  const ovText = await page
    .locator('.wb-ov')
    .innerText()
    .catch(() => '')
  check('overview-root', ovText.includes('总览'))
  check('overview-north-star', ovText.includes('北极星指标'))
  check('overview-version-plan', ovText.includes('版本计划与进展'))
  check('overview-charter', ovText.includes('想做什么'))
  check('overview-not-placeholder', !ovText.includes('本轮占位'))

  await page.locator('[data-workbench-nav]').getByRole('button', { name: '计划' }).click()
  await sleep(1200)
  await shot('02-plan-step1')

  const plan = page.locator('.wb-plan')
  check('plan-root', (await plan.count()) > 0)
  let planText = await plan.innerText()
  check('plan-title', (await plan.locator('h1').first().innerText()) === '计划')
  check(
    'plan-v7-tabs',
    planText.includes('上周结果') &&
      planText.includes('总结与评审') &&
      planText.includes('本周计划')
  )
  check('plan-no-journey-coach', !planText.includes('下一步') && !planText.includes('周一对齐'))
  check('plan-step1-goals', planText.includes('上周目标 · 完成情况'))
  check('plan-chat', planText.includes('bw/week-plan') || planText.includes('Claude Code'))
  check('plan-not-placeholder', !planText.includes('本轮不做落盘'))

  await plan.locator('.foot-s1').getByRole('button', { name: '总结与评审' }).click()
  await sleep(700)
  await shot('03-plan-step2')
  planText = await plan.innerText()
  check('plan-step2-agenda', planText.includes('总结三段'))
  check('plan-step2-minutes', planText.includes('会议评审记录') || planText.includes('会议纪要'))

  // V7 soft gate: foot CTA disabled; tab click stays on review and pulses minutes
  const goWeek = plan.locator('.foot-s2').getByRole('button', { name: '本周计划' })
  check('plan-week-foot-gated', await goWeek.isDisabled())
  const tabWeek = plan.locator('.plan-tabs [data-goto="3"]')
  check(
    'plan-week-tab-locked',
    (await tabWeek.getAttribute('class'))?.includes('is-locked') === true
  )
  await tabWeek.click()
  await sleep(500)
  planText = await plan.innerText()
  check(
    'plan-week-soft-gate-stays-review',
    planText.includes('总结三段') && !planText.includes('本周目标')
  )
  check('plan-minutes-need', (await plan.locator('#minutes-card.is-need').count()) > 0)

  await plan.getByRole('button', { name: '用示例纪要' }).click()
  await sleep(500)
  check('plan-week-unlocked', !(await goWeek.isDisabled()))
  await goWeek.click()
  await sleep(1200)
  await shot('04-plan-step3')
  planText = await plan.innerText()
  check('plan-step3-goals', planText.includes('本周目标'))
  check('plan-step3-tasks-host', planText.includes('本周任务') || planText.includes('Orca Tasks'))
  check('plan-step3-foot', planText.includes('确认本周计划'))

  // Knowledge
  await page.locator('[data-workbench-nav]').getByRole('button', { name: '知识库' }).click()
  await sleep(1000)
  await shot('05-knowledge-docs')
  const kb = page.locator('.wb-kb')
  check('kb-root', (await kb.count()) > 0)
  let kbText = await kb.innerText()
  check('kb-title', kbText.includes('知识库'))
  check('kb-v7-tabs', kbText.includes('文档') && kbText.includes('代码') && kbText.includes('对账'))
  check('kb-docs-flow', kbText.includes('愿景和原则') && kbText.includes('该维护的清单'))
  check('kb-not-stub', !kbText.includes('保真还在改'))

  await kb.locator('.seg-opt').filter({ hasText: '代码' }).click()
  await sleep(400)
  await shot('06-knowledge-code')
  kbText = await kb.innerText()
  check('kb-code-structure', kbText.includes('代码结构') && kbText.includes('大文件榜'))
  check('kb-41-unknown', kbText.includes('Kruchten 4+1') && kbText.includes('尚未交付'))

  await kb.locator('.seg-opt').filter({ hasText: '对账' }).click()
  await sleep(400)
  await shot('07-knowledge-audit')
  kbText = await kb.innerText()
  check('kb-audit', kbText.includes('一致性') && kbText.includes('上次盘点'))
  check('kb-rescan-cta', (await kb.locator('[data-workbench-kb-rescan]').count()) > 0)

  // Project wall via project icon
  await page.locator('[data-workbench-project-wall]').click()
  await sleep(700)
  await shot('08-project-wall')
  const wall = page.locator('.wb-wall-overlay')
  check('wall-open', (await wall.count()) > 0)
  const wallText = await wall.innerText()
  check('wall-title', wallText.includes('项目墙'))
  check('wall-health', wallText.includes('健康概览'))
  check(
    'wall-cards-or-empty',
    wallText.includes('还没有接入') ||
      wallText.includes('当前') ||
      wallText.includes('版本未定') ||
      /共 \d+ 个项目/.test(wallText)
  )
  const repoSlots = wall.locator('[data-workbench-repo-slots]')
  const slotCount = await repoSlots.count()
  if (slotCount > 0) {
    check('wall-repo-slots', true)
    check(
      'wall-add-repo-cta',
      (await wall.locator('[data-workbench-add-repo]').count()) > 0 && wallText.includes('+ 代码仓')
    )
    check('wall-remove-repo-cta', (await wall.locator('[data-workbench-remove-repo]').count()) > 0)
    check('wall-repo-links', (await wall.locator('.pcard-repo-link').count()) > 0)
  } else {
    check('wall-empty-no-slots', wallText.includes('还没有接入'))
  }

  // Onboard overlay from wall CTA
  await wall.getByRole('button', { name: '+ 接入项目' }).first().click()
  await sleep(600)
  await shot('09-onboard')
  const onboard = page.locator('.wb-onboard-overlay')
  check('onboard-open', (await onboard.count()) > 0)
  let obText = await onboard.innerText()
  check('onboard-title', obText.includes('接入项目'))
  check('onboard-modes', obText.includes('打开本地仓') && obText.includes('克隆远端仓'))
  check('onboard-step1', obText.includes('① 项目地址'))
  await onboard.getByRole('button', { name: '← 项目墙' }).click()
  await sleep(500)
  check('onboard-back-to-wall', (await page.locator('.wb-wall-overlay').count()) > 0)
  check('onboard-closed', (await page.locator('.wb-onboard-overlay').count()) === 0)

  // Add-repo slot opens attach onboard when a card exists
  const wall2 = page.locator('.wb-wall-overlay')
  const addRepoBtn = wall2.locator('[data-workbench-add-repo]').first()
  if ((await addRepoBtn.count()) > 0) {
    await addRepoBtn.click()
    await sleep(700)
    await shot('09b-add-repo-slot')
    const attachOb = page.locator('.wb-onboard-overlay')
    const attachText = await attachOb.innerText().catch(() => '')
    check('add-repo-onboard', (await attachOb.count()) > 0)
    check('add-repo-title', attachText.includes('增加代码仓'))
    await attachOb.getByRole('button', { name: '← 项目墙' }).click()
    await sleep(500)
    check('add-repo-back-wall', (await page.locator('.wb-wall-overlay').count()) > 0)
  }

  // Switch project if cards exist (click main area, not repo controls)
  const wall3 = page.locator('.wb-wall-overlay')
  const cards = wall3.locator('[data-workbench-project-id]')
  const cardCount = await cards.count()
  if (cardCount >= 1) {
    const firstId = await cards.nth(0).getAttribute('data-workbench-project-id')
    await cards.nth(0).locator('.pcard-main').click()
    await sleep(1200)
    await shot('10-switched-overview')
    check('wall-closed-after-switch', (await page.locator('.wb-wall-overlay').count()) === 0)
    const ov = await page
      .locator('.wb-ov')
      .innerText()
      .catch(() => '')
    check('switch-lands-overview', ov.includes('总览'))
    check('switch-had-card', Boolean(firstId))
  }

  await page
    .locator('[data-workbench-project-wall]')
    .click()
    .catch(() => {})
  await sleep(400)
  if ((await page.locator('.wb-wall-overlay').count()) > 0) {
    await page.locator('.wb-wall-overlay').getByRole('button', { name: '关闭' }).click()
    await sleep(300)
  }
  check('wall-closed', (await page.locator('.wb-wall-overlay').count()) === 0)

  report.ok = report.failures.length === 0
} catch (e) {
  report.error = e instanceof Error ? (e.stack ?? e.message) : String(e)
  log('ERROR', report.error)
} finally {
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  try {
    await browser?.close()
  } catch {
    /* ignore */
  }
  spawn('pkill', ['-9', '-f', 'dist/mac-arm64/Workbench.app'], { stdio: 'ignore' })
  process.exitCode = report.ok ? 0 : 1
}
