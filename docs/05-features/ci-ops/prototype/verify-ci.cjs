// #461 CI 部署原型 DOM 断言验证：元素存在、四场景灯态（灰/黄/绿/红）、执行瞬态、
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

  // 骨架与入口（收敛后：单模块、无模块导航、页头两动作）
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

  // 场景一：首次进入（灰）
  check(
    '首次进入灯灰(未接入)',
    (await page.locator(cardState()).textContent()).includes('未接入')
  )
  check(
    '灰态卡虚线+未见脚本事实行',
    (await page.locator('#deploy .ci-card.gray').count()) === 1 &&
      (await page.locator('#deploy .ci-hint').textContent()).includes('主分支未见脚本')
  )
  check(
    '灰态按钮=生成部署脚本',
    (await page.locator('#deploy .ci-actions button').textContent()).trim() === '生成部署脚本'
  )
  check(
    '首次进入记录区空态',
    (await page.locator('.ci-records-empty').textContent()).includes('尚无执行记录')
  )

  // 更新代码演示灰→黄
  await page.click('.g3-header-actions button:has-text("更新代码")')
  await page.waitForTimeout(100)
  check(
    '更新代码后灯黄(已接入·待执行)',
    (await page.locator(cardState()).textContent()).includes('已接入 · 待执行')
  )
  check('footer 说明灰→黄', (await page.locator('.g3-footer').textContent()).includes('灯灰→黄'))

  // 部署单次执行：执行中瞬态 → 绿 + 新记录
  await page.click('#deploy .ci-actions button:has-text("部署")')
  check(
    '执行中瞬态',
    (await page.locator('#deploy .ci-actions button').textContent()).includes('部署中')
  )
  await page.waitForTimeout(1800)
  check(
    '执行完成灯绿(最近一次成功)',
    (await page.locator(cardState()).textContent()).includes('最近一次成功')
  )
  check('新记录入列', (await page.locator('.ci-record').count()) === 1)

  // 场景三：部署成功（绿·历史保留）
  await page.selectOption('.g3-scene select', 'success')
  await page.waitForTimeout(100)
  check(
    '成功场景灯绿',
    (await page.locator(cardState()).textContent()).includes('最近一次成功')
  )
  check('最近执行读数行', (await page.locator('#deploy .ci-last').textContent()).includes('版本 1.4.198'))
  check('记录 3 条', (await page.locator('.ci-record').count()) === 3)
  check('绿态历史报错保留', (await page.locator('.ci-record.error').count()) === 1)
  check(
    '绿态历史报错提示行',
    (await page.locator('#deploy .ci-errors-muted').textContent()).includes('历史报错 1 条')
  )

  // 场景四：最近失败（红）
  await page.selectOption('.g3-scene select', 'failed')
  await page.waitForTimeout(100)
  check(
    '失败场景灯红(最近一次失败)',
    (await page.locator(cardState()).textContent()).includes('最近一次失败')
  )
  check(
    '红态双按钮（重新部署+报错记录）',
    (await page.locator('#deploy .ci-actions button').count()) === 2
  )
  check('失败场景记录 2 条', (await page.locator('.ci-record').count()) === 2)

  // 报错条目默认折叠，展开页内回显日志
  check('日志默认折叠', (await page.locator('.ci-record-log').count()) === 0)
  await page.click('.ci-record.error .ci-record-toggle')
  check(
    '展开后日志回显',
    (await page.locator('.ci-record-log').count()) === 1 &&
      (await page.locator('.ci-record-log').textContent()).includes('FAIL')
  )

  // 报错记录按钮定位 + 只看报错筛选
  await page.click('#deploy .ci-actions button:has-text("报错记录")')
  await page.waitForTimeout(200)
  check('筛选后只剩报错', (await page.locator('.ci-record').count()) === 1)
  check('footer 定位说明', (await page.locator('.g3-footer').textContent()).includes('只看报错'))
  await page.click('.ci-filter button:has-text("全部")')
  check('恢复全部筛选', (await page.locator('.ci-record').count()) === 2)

  // 重新部署：footer 回显真实递交 prompt（与 skill-deploy.md 逐字一致的可视证据）
  await page.click('#deploy .ci-actions button:has-text("重新部署")')
  check(
    'footer 回显真实部署 prompt',
    (await page.locator('.g3-footer').textContent()).includes('执行本项目的 .bw/ci/deploy.sh')
  )
  check(
    '会话区递交指令预览',
    (await page.locator('.ci-session-draft').count()) === 1 &&
      (await page.locator('.ci-session-draft').textContent()).includes('独立读回')
  )

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
  check(
    '设计说明展开',
    (await page.locator('.g3-design-notes').textContent()).includes('定位与边界')
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
