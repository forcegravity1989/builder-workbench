// #461 CI 部署原型 DOM 断言验证：元素存在、三阶段六步流程条、两模式与版本选择、
// 四场景灯态（灰/黄/绿/红）、执行瞬态与逐步点亮、从失败步重试（已完成步不重跑）、
// 日志折叠展开、报错筛选、递交 prompt 一致性、console/page error 监听。
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

  // 骨架与入口（单模块、无模块导航、页头两动作）
  check('root 渲染部署卡（单模块）', (await page.locator('.ci-module').count()) === 1)
  check('无模块导航（收敛后移除）', (await page.locator('.g3-journey').count()) === 0)
  check('侧栏 CI 选中项', (await page.locator('.g3-nav-selected').textContent()).trim() === 'CI')
  check('页头标题 CI', (await page.locator('.g3-header h1').textContent()) === 'CI')
  check(
    '页头两动作（收折会话/更新代码）',
    (await page.locator('.g3-header-actions button').count()) === 2
  )
  check('记录区存在', (await page.locator('#records').count()) === 1)
  check('四场景选项', (await page.locator('.g3-scene option').count()) === 4)

  // 场景一：首次进入（灰）——无流程条无模式行，只有事实与生成入口
  check('首次进入灯灰(未接入)', (await page.locator(cardState()).textContent()).includes('未接入'))
  check(
    '灰态卡虚线+未见脚本事实行',
    (await page.locator('#deploy .ci-card.gray').count()) === 1 &&
      (await page.locator('#deploy .ci-hint').textContent()).includes('主分支未见脚本')
  )
  check(
    '灰态按钮=生成部署脚本',
    (await page.locator('#deploy .ci-actions button').textContent()).trim() === '生成部署脚本'
  )
  check('灰态无流程条（无脚本不摆流程）', (await page.locator('#deploy .ci-flow').count()) === 0)
  check('灰态无模式行', (await page.locator('#deploy .ci-mode-row').count()) === 0)
  check(
    '首次进入记录区空态',
    (await page.locator('.ci-records-empty').textContent()).includes('尚无执行记录')
  )

  // 生成脚本递交 prompt 与 skill-deploy.md 逐字一致（含软件包准备在清场之前的排序原则）
  await page.click('#deploy .ci-actions button:has-text("生成部署脚本")')
  const genFooter = await page.locator('.g3-footer').textContent()
  check(
    '生成 prompt 含勘察与复用',
    genFooter.includes('按 ci-ops skill 为本项目生成') && genFooter.includes('已有资产编排复用')
  )
  check(
    '生成 prompt 含六步骨架与排序原则',
    genFooter.includes('软件包准备→预检→清场→部署→验证→记录') &&
      genFooter.includes('软件包准备必须在清场之前')
  )
  check(
    '会话区递交指令预览',
    (await page.locator('.ci-session-draft').count()) === 1 &&
      (await page.locator('.ci-session-draft').textContent()).includes('独立读回')
  )

  // 更新代码演示灰→黄；黄态出现模式行与全待执行流程条（先收起 handoff，footer 回 notice）
  await page.click('.g3-footer-handoff button')
  await page.click('.g3-header-actions button:has-text("更新代码")')
  await page.waitForTimeout(100)
  check(
    '更新代码后灯黄(已接入·待执行)',
    (await page.locator(cardState()).textContent()).includes('已接入 · 待执行')
  )
  check('footer 说明灰→黄', (await page.locator('.g3-footer').textContent()).includes('灯灰→黄'))
  check(
    '流程条六步名称顺序',
    (await page.locator('.ci-flow-step .ci-flow-name').allTextContents()).join('|') ===
      '软件包准备|预检|清场|部署|验证|记录'
  )
  check(
    '三阶段分组标签',
    (await page.locator('.ci-flow-phase').allTextContents()).join('|') ===
      '部署前准备|开始部署|部署后验证'
  )
  check('黄态六步全待执行', (await page.locator('.ci-flow-step.pending').count()) === 6)
  check(
    '默认开发模式选中',
    (await page.locator('.ci-mode-toggle button.on').textContent()) === '开发'
  )
  check('开发模式无版本选择', (await page.locator('.ci-version').count()) === 0)

  // 切上线：版本选择出现、默认最新、包不存在灰掉；服务器信息只显示已配置事实
  await page.click('.ci-mode-toggle button:has-text("上线")')
  check('上线模式版本选择出现', (await page.locator('.ci-version').count()) === 1)
  check(
    '版本默认最新 1.4.201',
    (await page.locator('.ci-version select').inputValue()) === '1.4.201'
  )
  check(
    '包不存在版本灰掉并标注',
    (await page.locator('.ci-version select option:disabled').count()) === 1 &&
      (await page.locator('.ci-version select option:disabled').textContent()).includes(
        '包不存在'
      )
  )
  check(
    '服务器信息只显示已配置事实',
    (await page.locator('#deploy .ci-config-fact').textContent()).includes('服务器信息 已配置')
  )
  await page.click('.ci-mode-toggle button:has-text("开发")')
  check('切回开发版本选择消失', (await page.locator('.ci-version').count()) === 0)

  // 开发部署执行：瞬态 + 流程条逐步点亮 → 六步全过绿 + 新记录（mode=dev）
  await page.click('#deploy .ci-actions button:has-text("部署")')
  check(
    '执行中瞬态',
    (await page.locator('#deploy .ci-actions button').textContent()).includes('部署中')
  )
  await page.waitForTimeout(300)
  check(
    '执行中流程条逐步点亮（软件包准备进行中）',
    (await page.locator('.ci-flow-step.current').count()) === 1 &&
      (await page.locator('.ci-flow-step.current .ci-flow-name').textContent()) === '软件包准备'
  )
  check(
    '递交 prompt 带 --mode=dev',
    (await page.locator('.g3-footer').textContent()).includes('--mode=dev')
  )
  await page.waitForTimeout(4600)
  check(
    '执行完成灯绿(最近一次成功)',
    (await page.locator(cardState()).textContent()).includes('最近一次成功')
  )
  check('六步全过', (await page.locator('.ci-flow-step.ok').count()) === 6)
  check(
    '新记录入列且带开发模式',
    (await page.locator('.ci-record').count()) === 1 &&
      (await page.locator('.ci-record-mode').textContent()) === '开发'
  )
  await page.click('.g3-footer-handoff button')
  check(
    'footer 成功说明六步全过',
    (await page.locator('.g3-footer').textContent()).includes('六步全过')
  )

  // 场景三：部署成功（绿·历史保留）
  await page.selectOption('.g3-scene select', 'success')
  await page.waitForTimeout(100)
  check('成功场景灯绿', (await page.locator(cardState()).textContent()).includes('最近一次成功'))
  check(
    '最近执行读数行（上线·版本）',
    (await page.locator('#deploy .ci-last').textContent()).includes('版本 1.4.201')
  )
  check('成功场景六步全过', (await page.locator('.ci-flow-step.ok').count()) === 6)
  check('记录 4 条', (await page.locator('.ci-record').count()) === 4)
  check('绿态历史报错保留', (await page.locator('.ci-record.error').count()) === 1)
  check(
    '绿态历史报错提示行',
    (await page.locator('#deploy .ci-errors-muted').textContent()).includes('历史报错 1 条')
  )
  check(
    '记录行含开发/上线模式 chip',
    (await page.locator('.ci-record-mode').allTextContents()).includes('上线') &&
      (await page.locator('.ci-record-mode').allTextContents()).includes('开发')
  )

  // 上线部署执行：递交 prompt 带 --mode=release --version=所选版本
  await page.click('.ci-mode-toggle button:has-text("上线")')
  await page.selectOption('.ci-version select', '1.4.199')
  await page.click('#deploy .ci-actions button:has-text("再次部署")')
  const relFooter = await page.locator('.g3-footer').textContent()
  check(
    '上线递交 prompt 带模式与所选版本',
    relFooter.includes('--mode=release --version=1.4.199')
  )
  await page.waitForTimeout(4600)
  check(
    '上线执行完成回绿',
    (await page.locator(cardState()).textContent()).includes('最近一次成功')
  )
  check('上线新记录入列', (await page.locator('.ci-record').count()) === 5)

  // 场景四：最近失败（红）——失败步定位、已完成步保留
  await page.selectOption('.g3-scene select', 'failed')
  await page.waitForTimeout(100)
  check('失败场景灯红(最近一次失败)', (await page.locator(cardState()).textContent()).includes('最近一次失败'))
  check(
    '失败步=部署(第4步)红叉',
    (await page.locator('.ci-flow-step.fail').count()) === 1 &&
      (await page.locator('.ci-flow-step.fail .ci-flow-name').textContent()) === '部署'
  )
  check(
    '失败前已完成步保留',
    (await page.locator('.ci-flow-step.ok').count()) === 3
  )
  check(
    '最近读数含失败步定位',
    (await page.locator('#deploy .ci-last').textContent()).includes('第 4 步「部署」失败')
  )
  check(
    '红态双按钮（从失败步重试+报错记录）',
    (await page.locator('#deploy .ci-actions button').count()) === 2
  )

  // 报错条目默认折叠，展开页内回显日志原文（含步骤标记协议输出）
  check('日志默认折叠', (await page.locator('.ci-record-log').count()) === 0)
  await page.click('.ci-record.error .ci-record-toggle')
  check(
    '展开后日志回显步骤标记',
    (await page.locator('.ci-record-log').count()) === 1 &&
      (await page.locator('.ci-record-log').textContent()).includes('[ci-step] deploy fail')
  )
  await page.click('.ci-record.error .ci-record-toggle')
  check('再点收起日志', (await page.locator('.ci-record-log').count()) === 0)

  // 报错记录按钮定位 + 只看报错筛选
  await page.click('#deploy .ci-actions button:has-text("报错记录")')
  await page.waitForTimeout(200)
  check('筛选后只剩报错', (await page.locator('.ci-record').count()) === 2)
  check('footer 定位说明', (await page.locator('.g3-footer').textContent()).includes('只看报错'))
  await page.click('.ci-filter button:has-text("全部")')
  check('恢复全部筛选', (await page.locator('.ci-record').count()) === 4)

  // 从失败步重试：递交 prompt 带 --from=失败步；已完成步不重跑；完成后回绿
  await page.click('#deploy .ci-actions button:has-text("从失败步重试")')
  check(
    '重试递交 prompt 带 --from=deploy',
    (await page.locator('.g3-footer').textContent()).includes('--from=deploy')
  )
  await page.waitForTimeout(200)
  check(
    '重试中：已完成步不重跑（清场仍✓，部署进行中）',
    (await page.locator('.ci-flow-step.ok').count()) === 3 &&
      (await page.locator('.ci-flow-step.current .ci-flow-name').textContent()) === '部署'
  )
  await page.waitForTimeout(2800)
  check(
    '重试完成回绿',
    (await page.locator(cardState()).textContent()).includes('最近一次成功')
  )
  check('重试后六步全过', (await page.locator('.ci-flow-step.ok').count()) === 6)
  await page.click('.g3-footer-handoff button')
  check(
    'footer 重试说明（之前步骤未重跑）',
    (await page.locator('.g3-footer').textContent()).includes('之前步骤未重跑')
  )
  check('重试新记录入列', (await page.locator('.ci-record').count()) === 5)

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
    '设计说明展开（含两模式与六步流程）',
    notes.includes('定位与边界') && notes.includes('两种模式与版本') && notes.includes('三阶段六步流程')
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
