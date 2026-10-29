// #461 CI 部署原型 DOM 断言验证：进入即全量形态（无场景切换）、竖排四阶段六步流程列表
// （阶段标签居中加粗、组间虚线分割、数字标序、每步读数、块级日志开关）、两种模式与版本选择、统一配置入口与配置事实、
// 执行瞬态与逐步点亮（读数随完成进板面）、记录区默认收起与展开、报错筛选、
// 递交 prompt 一致性、console/page error 监听。
// 截图只存临时目录供人查看，不进上下文（AGENTS 硬约束）。
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { chromium } = require('playwright')

// 本机 ms-playwright 里已装的 Chromium 版本号与仓内 playwright 期望不一致时，
// 直接复用已装可执行文件，不重复下载浏览器。
function resolveChromium() {
  const root = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright')
  if (!fs.existsSync(root)) {
    return undefined
  }
  const dirs = fs
    .readdirSync(root)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .toReversed()
  for (const dir of dirs) {
    const exe = path.join(root, dir, 'chrome-win64', 'chrome.exe')
    if (fs.existsSync(exe)) {
      return exe
    }
  }
  return undefined
}

const pageUrl = `file:///${path.join(__dirname, '..', 'prototype.html').replace(/\\/g, '/')}`
const cardState = () => '#deploy .ci-state'

let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) {
    failures++
  }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: resolveChromium() })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const consoleErrors = []
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', (e) => consoleErrors.push(String(e)))
  await page.goto(pageUrl)
  await page.waitForSelector('.ci-module', { timeout: 8000 })

  // 骨架与入口（单模块、无模块导航、页头两动作、无场景切换）
  check('root 渲染部署卡（单模块）', (await page.locator('.ci-module').count()) === 1)
  check('无模块导航（收敛后移除）', (await page.locator('.g3-journey').count()) === 0)
  check('无场景切换（评审反馈：进入即全量）', (await page.locator('.g3-scene').count()) === 0)
  check('侧栏 CI 选中项', (await page.locator('.g3-nav-selected').textContent()).trim() === 'CI')
  check('页头标题 CI', (await page.locator('.g3-header h1').textContent()) === 'CI')
  check(
    '页头两动作（收折会话/更新代码）',
    (await page.locator('.g3-header-actions button').count()) === 2
  )
  check('记录区存在', (await page.locator('#records').count()) === 1)

  // 进入即全量：已接入后的成熟状态（绿·上线模式·六步全过·每步读数·记录收起）
  check('进入灯绿(最近一次成功)', (await page.locator(cardState()).textContent()).includes('最近一次成功'))
  check(
    '默认上线模式选中',
    (await page.locator('.ci-mode-toggle button.on').textContent()) === '上线'
  )
  check(
    '版本选择出现且默认最新 1.4.201',
    (await page.locator('.ci-version select').inputValue()) === '1.4.201'
  )
  check(
    '包不存在版本灰掉并标注',
    (await page.locator('.ci-version select option:disabled').count()) === 1 &&
      (await page.locator('.ci-version select option:disabled').textContent()).includes(
        '包不存在'
      )
  )
  const facts = await page.locator('.ci-config-fact').allTextContents()
  check(
    '配置事实随模式显示（服务器信息/探针 已配置）',
    facts.join('|').includes('服务器信息 已配置') && facts.join('|').includes('探针 已配置')
  )
  check('统一配置按钮存在', (await page.locator('#deploy .ci-config-button').count()) === 1)

  // 竖排流程列表（板面核心）：六步名称、数字标序、四阶段分组、每步读数
  check(
    '六步名称顺序',
    (await page.locator('.ci-flow-step .ci-flow-name').allTextContents()).join('|') ===
      '软件包准备|预检|清场|部署|验证|记录'
  )
  check(
    '数字徽章标序 1–6（完成绿色实心）',
    (await page.locator('.ci-flow-step .ci-flow-badge').allTextContents()).join('|') ===
      '1|2|3|4|5|6'
  )
  check(
    '四阶段分组标签（含归档）',
    (await page.locator('.ci-flow-phase').allTextContents()).join('|') ===
      '部署前准备|开始部署|部署后验证|归档'
  )
  const phaseStyle = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.ci-flow-phase'))
    return { weight: cs.fontWeight, size: cs.fontSize, align: cs.textAlign }
  })
  check(
    '阶段标签放大加粗居中（13px/600/center）',
    phaseStyle.size === '13px' && phaseStyle.weight === '600' && phaseStyle.align === 'center'
  )
  const sepOk = await page.evaluate(() => {
    const seps = document.querySelectorAll('.ci-flow-group + .ci-flow-group')
    return (
      document.querySelectorAll('.ci-flow-group').length === 4 &&
      seps.length === 3 &&
      Array.from(seps).every((g) => getComputedStyle(g).borderTopStyle === 'dashed')
    )
  })
  check('组间灰色虚线分割（4 组 3 条）', sepOk)
  check('初始六步全过', (await page.locator('.ci-flow-step.ok').count()) === 6)
  const readings = await page.locator('.ci-flow-reading').allTextContents()
  check(
    '每步读数内联（6 步，验证步含探针与版本核对）',
    readings.length === 6 &&
      readings.join('|').includes('/healthz 200') &&
      readings.join('|').includes('版本 1.4.201 = 所选 1.4.201')
  )
  const headText = await page.locator('.ci-flow-head').textContent()
  check(
    '最近一次块头（时间·上线·版本·耗时）',
    headText.includes('最近一次 10-29 09:41') && headText.includes('版本 1.4.201')
  )
  check('流程块日志默认收起', (await page.locator('.ci-flow-log').count()) === 0)
  await page.click('.ci-flow-logtoggle')
  check(
    '展开流程块日志回显步骤标记',
    (await page.locator('.ci-flow-log').count()) === 1 &&
      (await page.locator('.ci-flow-log').textContent()).includes('[ci-step] verify ok')
  )
  await page.click('.ci-flow-logtoggle')
  check('再点收起流程块日志', (await page.locator('.ci-flow-log').count()) === 0)

  // 记录区降位：默认收起为一行摘要，展开回显完整列表
  check('记录区默认收起（无记录行）', (await page.locator('.ci-record').count()) === 0)
  const counts = await page.locator('.ci-records-counts').textContent()
  check('摘要行含全部与报错计数', counts.includes('全部 4') && counts.includes('报错 1'))
  await page.click('.ci-records-head')
  check('展开后记录 4 条', (await page.locator('.ci-record').count()) === 4)
  check('历史报错保留', (await page.locator('.ci-record.error').count()) === 1)
  check(
    '报错记录定位带步序（第 4 步）',
    (await page.locator('.ci-record.error .ci-record-detail').textContent()).includes('第 4 步')
  )
  check(
    '记录行含开发/上线模式 chip',
    (await page.locator('.ci-record-mode').allTextContents()).includes('上线') &&
      (await page.locator('.ci-record-mode').allTextContents()).includes('开发')
  )
  check(
    '绿态按钮（再次部署+报错记录）',
    (await page.locator('#deploy .ci-actions button').count()) === 2
  )

  // 统一配置入口：递交 prompt 与 skill-deploy.md 逐字一致
  await page.click('#deploy .ci-config-button')
  const cfgFooter = await page.locator('.g3-footer').textContent()
  check(
    '配置 prompt 含资产清单与会话确认',
    cfgFooter.includes('按 ci-ops skill 配置本项目部署所需资产') &&
      cfgFooter.includes('已有配置先从项目资产读出来给我确认')
  )
  check('配置 prompt 明确密码不进配置', cfgFooter.includes('密码不进配置'))
  check(
    '会话区递交指令预览（配置请求）',
    (await page.locator('.ci-session-draft').count()) === 1 &&
      (await page.locator('.ci-session-draft').textContent()).includes('配置')
  )
  await page.click('.g3-footer-handoff button')

  // 上线部署执行：瞬态 + 自上而下逐步点亮 + 读数随完成进板面 → 六步全过绿 + 新记录
  await page.click('#deploy .ci-actions button:has-text("再次部署")')
  check(
    '执行中瞬态',
    (await page.locator('#deploy .ci-actions button', { hasText: '部署中' }).count()) === 1
  )
  await page.waitForTimeout(300)
  check(
    '执行中流程逐步点亮（软件包准备进行中）',
    (await page.locator('.ci-flow-step.current').count()) === 1 &&
      (await page.locator('.ci-flow-step.current .ci-flow-name').textContent()) === '软件包准备'
  )
  check(
    '执行中当前步徽章带序号',
    (await page.locator('.ci-flow-step.current .ci-flow-badge').textContent()) === '1'
  )
  check(
    '执行中读数未提前出现（随完成进板面）',
    (await page.locator('.ci-flow-reading').count()) === 0
  )
  const liveHead = await page.locator('.ci-flow-head').textContent()
  check(
    '执行中块头显示执行中与版本',
    liveHead.includes('执行中') && liveHead.includes('1.4.201')
  )
  check(
    '上线递交 prompt 带模式与所选版本',
    (await page.locator('.g3-footer').textContent()).includes('--mode=release --version=1.4.201')
  )
  await page.waitForTimeout(4600)
  check(
    '上线执行完成回绿',
    (await page.locator(cardState()).textContent()).includes('最近一次成功')
  )
  check('六步全过', (await page.locator('.ci-flow-step.ok').count()) === 6)
  check(
    '完成后数字标序保留',
    (await page.locator('.ci-flow-step .ci-flow-badge').allTextContents()).join('|') ===
      '1|2|3|4|5|6'
  )
  check('完成后每步读数更新（6 步）', (await page.locator('.ci-flow-reading').count()) === 6)
  check('上线新记录入列', (await page.locator('.ci-record').count()) === 5)
  await page.click('.g3-footer-handoff button')
  check(
    'footer 成功说明六步全过',
    (await page.locator('.g3-footer').textContent()).includes('六步全过')
  )

  // 切开发模式：版本选择消失、配置事实切换、执行带 --mode=dev、读数换本地口径
  await page.click('.ci-mode-toggle button:has-text("开发")')
  check('开发模式无版本选择', (await page.locator('.ci-version').count()) === 0)
  const devFacts = (await page.locator('.ci-config-fact').allTextContents()).join('|')
  check(
    '配置事实切换为开发项（启动命令，无服务器信息）',
    devFacts.includes('启动命令 已配置') && !devFacts.includes('服务器信息')
  )
  await page.click('#deploy .ci-actions button:has-text("再次部署")')
  check(
    '开发递交 prompt 带 --mode=dev',
    (await page.locator('.g3-footer').textContent()).includes('--mode=dev')
  )
  await page.waitForTimeout(4600)
  check('开发新记录入列', (await page.locator('.ci-record').count()) === 6)
  check(
    '开发读数进流程（本地探针）',
    (await page.locator('.ci-flow-reading').allTextContents()).join('|').includes('本地探针')
  )
  await page.click('.g3-footer-handoff button')
  await page.click('.ci-mode-toggle button:has-text("上线")')
  check('切回上线版本选择恢复', (await page.locator('.ci-version').count()) === 1)

  // 报错定位 + 只看报错筛选 + 日志页内展开
  await page.click('#deploy .ci-actions button:has-text("报错记录")')
  await page.waitForTimeout(200)
  check('筛选后只剩报错', (await page.locator('.ci-record').count()) === 1)
  check('footer 定位说明', (await page.locator('.g3-footer').textContent()).includes('只看报错'))
  check('日志默认折叠', (await page.locator('.ci-record-log').count()) === 0)
  await page.click('.ci-record.error .ci-record-toggle')
  check(
    '展开后日志回显步骤标记',
    (await page.locator('.ci-record-log').count()) === 1 &&
      (await page.locator('.ci-record-log').textContent()).includes('[ci-step] deploy fail')
  )
  await page.click('.ci-record.error .ci-record-toggle')
  check('再点收起日志', (await page.locator('.ci-record-log').count()) === 0)
  await page.click('.ci-filter button:has-text("全部")')
  check('恢复全部筛选', (await page.locator('.ci-record').count()) === 6)

  // 深浅切换 + 会话收折
  await page.click('.g3-demo-bar button:has-text("深色")')
  check(
    '深色主题切换',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark'
  )
  await page.click('.g3-session-chip')
  check('会话收折成 rail', (await page.locator('.g3-session.rail').count()) === 1)
  await page.click('.g3-session-chip')
  check('会话再展开', (await page.locator('.g3-session.expanded').count()) === 1)

  // 设计说明
  await page.click('.g3-demo-bar button:has-text("设计说明")')
  const notes = await page.locator('.g3-design-notes').textContent()
  check(
    '设计说明展开（含统一配置入口、竖排读数与全量呈现）',
    notes.includes('定位与边界') &&
      notes.includes('统一配置入口') &&
      notes.includes('每步读数') &&
      notes.includes('进入即见全部')
  )

  check('无 console/page error', consoleErrors.length === 0)
  if (consoleErrors.length) {
    console.log(consoleErrors.join('\n'))
  }

  await page.screenshot({ path: path.join(os.tmpdir(), 'ci-prototype-shots.png'), fullPage: true })
  console.log(
    `截图存 ${path.join(os.tmpdir(), 'ci-prototype-shots.png')}（供人工查看，不进上下文）`
  )
  await browser.close()
  console.log(failures ? `\n${failures} 项失败` : '\n全部断言通过')
  process.exitCode = failures ? 1 : 0
})().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
