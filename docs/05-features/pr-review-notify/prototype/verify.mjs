import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const file = pathToFileURL(path.resolve('index.html')).href
const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch())
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') {
    errors.push(m.text())
  }
})
page.on('pageerror', (e) => errors.push(String(e)))

const checks = []
const check = async (name, fn) => { await fn(); checks.push(name) }
const openLocalPanel = async () => {
  if ((await page.locator('[data-testid="ct-panel"]').count()) === 0) {
    await page.locator('[data-testid="ct-fab"]').click()
    await page.waitForSelector('[data-testid="ct-panel"]')
  }
}

await page.goto(file)
await page.waitForSelector('.shell')

await check('基底是现行壳：侧栏含项目墙/项目总览/任务/自动化/知识库与版本区', async () => {
  const nav = await page.locator('.sidebar').innerText()
  for (const k of ['项目墙', '项目总览', '任务', '自动化', '知识库', '版本']) {
    assert.ok(nav.includes(k), `侧栏缺少 ${k}`)
  }
  assert.match(nav, /Orca 项目工作区/)
})

await check('评审状态不再显示在左侧栏', async () => {
  assert.equal(await page.locator('[data-testid^="review-state-"]').count(), 0)
  assert.equal(await page.locator('.native-host-meta .review-pill').count(), 0)
})

await check('两个悬浮球：本机评审通知 6 条，另一台主机初始无通知', async () => {
  assert.equal(await page.locator('[data-testid="ct-fab"]').isVisible(), true)
  assert.equal(await page.locator('[data-testid="remote-fab"]').isVisible(), true)
  assert.match(await page.locator('[data-testid="ct-fab"] .ct-dot').innerText(), /6/)
  assert.equal(await page.locator('[data-testid="remote-fab"] .rp-dot').count(), 0)
  assert.match(await page.locator('.journey-step.active').innerText(), /1\. 右键发送评审/)
})

await check('右键 #383 工作树 → 菜单出现「发送评审」', async () => {
  await page
    .locator('.native-worktree-card[data-branch="bw/v0.7/issue-383"] .native-worktree-heading')
    .click({ button: 'right' })
  assert.equal(await page.locator('.binding-context-menu').isVisible(), true)
  const send = page.locator('[data-testid="send-review"]')
  assert.equal(await send.isVisible(), true)
  assert.equal(await send.isDisabled(), false)
})

await check('发送评审后：另一台主机收到通知，本机通知持续保留', async () => {
  await page.locator('[data-testid="send-review"]').click()
  assert.equal(await page.locator('.binding-context-menu').count(), 0)
  assert.match(await page.locator('[data-testid="remote-fab"] .rp-dot').innerText(), /1/)
  assert.match(await page.locator('[data-testid="ct-fab"] .ct-dot').innerText(), /7/)
  assert.match(await page.locator('.journey-step.active').innerText(), /3\. 评审人评论\/合入/)

  await openLocalPanel()
  const out = page.locator('[data-testid="ct-outgoing"]')
  assert.equal(await out.isVisible(), true)
  const text = await out.innerText()
  assert.match(text, /请求评审 PR #383 · 第 1 轮/)
  assert.match(text, /自动同步/)
  assert.match(text, /开放/)
  assert.match(text, /通过/)
  assert.equal(await page.locator('[data-testid="ct-outgoing-comments"]').count(), 0)
})

await check('本机悬浮球里的评审任务点击后进入对应 PR 详情页', async () => {
  await page.locator('[data-testid="ct-panel"] .ct-item[data-item]').first().click()
  assert.equal(await page.locator('[data-testid="ct-panel"]').count(), 0)
  assert.equal(await page.locator('[data-testid="pr-page"]').isVisible(), true)
  assert.match(await page.locator('.pr-page h1').innerText(), /PR #378/)
  assert.match(await page.locator('.pr-kicker').innerText(), /Builder Workbench/)
  assert.match(await page.locator('[data-testid="pr-comment-count"]').innerText(), /1/)
  assert.equal(await page.locator('[data-testid="pr-merge"]').isVisible(), true)
  assert.doesNotMatch(await page.locator('.workspace-body').innerText(), /版本任务/)
})

await check('自己发出的 PR #383 详情页只读，不给作者评审操作', async () => {
  await page.locator('.breadcrumb button').first().click()
  await page.locator('[data-testid="ct-fab"]').click()
  await page.locator('[data-testid="ct-outgoing-open"]').click()
  assert.match(await page.locator('.pr-page h1').innerText(), /PR #383/)
  assert.equal(await page.locator('[data-testid="pr-merge"]').count(), 0)
  assert.equal(await page.locator('[data-testid="pr-comment-submit"]').count(), 0)
})

await check('另一台主机打开评审请求并提交检视意见，本机通知出现意见数', async () => {
  await page.locator('[data-testid="remote-fab"]').click()
  assert.match(await page.locator('[data-testid="remote-panel"]').innerText(), /PR #383 · 第 1 轮/)
  await page.locator('[data-testid="remote-note-1"]').click()
  assert.equal(await page.locator('[data-testid="pr-page"]').isVisible(), true)
  assert.match(await page.locator('.pr-note').innerText(), /另一台主机的评审人视角/)
  await page.locator('textarea[aria-label="检视意见"]').fill('建议把重试上限抽成常量。')
  await page.locator('[data-testid="pr-comment-submit"]').click()
  assert.match(await page.locator('[data-testid="pr-comment-count"]').innerText(), /1/)
  assert.match(await page.locator('.pr-comments').innerText(), /周工/)
  assert.match(await page.locator('.pr-comments').innerText(), /重试上限/)

  await openLocalPanel()
  const comments = page.locator('[data-testid="ct-outgoing-comments"]')
  assert.match(await comments.innerText(), /1/)
  assert.match(await comments.getAttribute('title'), /未解决检视意见 1 条/)
  assert.equal(await page.locator('[data-testid="ct-resend"]').isVisible(), true)
})

await check('解决检视意见后可再发起评审：意见清零并生成第 2 轮通知', async () => {
  await page.locator('[data-testid="ct-resend"]').click()
  assert.match(await page.locator('[data-testid="ct-outgoing"]').innerText(), /第 2 轮/)
  assert.equal(await page.locator('[data-testid="ct-outgoing-comments"]').count(), 0)
  assert.match(await page.locator('[data-testid="remote-fab"] .rp-dot').innerText(), /2/)
  await page.locator('[data-testid="ct-outgoing-open"]').click()
  assert.match(await page.locator('.pr-comments').innerText(), /建议把重试上限抽成常量/)
  assert.match(await page.locator('.pr-comments').innerText(), /已解决/)
  assert.match(await page.locator('[data-testid="pr-comment-count"]').innerText(), /1/)
  await page.locator('.breadcrumb button').first().click()
  await page.locator('[data-testid="remote-fab"]').click()
  assert.equal(await page.locator('[data-testid="remote-note-2"]').isVisible(), true)
})

await check('评审人合入 PR 后，本机通知显示该 PR 已合入', async () => {
  await page.locator('[data-testid="remote-note-2"]').click()
  await page.locator('[data-testid="pr-merge"]').click()
  assert.match(await page.locator('[data-testid="pr-state"]').innerText(), /已合入/)
  await openLocalPanel()
  assert.match(await page.locator('[data-testid="ct-outgoing-merged"]').innerText(), /已合入/)
  assert.equal(await page.locator('[data-testid="ct-resend"]').count(), 0)
})

await check('本机通知可删除；删除后角标回到 6', async () => {
  await page.locator('[data-testid="ct-outgoing-delete"]').click()
  assert.equal(await page.locator('[data-testid="ct-outgoing"]').count(), 0)
  assert.match(await page.locator('[data-testid="ct-fab"] .ct-dot').innerText(), /6/)
})

await check('无关联 PR 的工作树，「发送评审」不可用', async () => {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '当前原生项目展开或收起' }).click()
  await page
    .locator('.native-worktree-card[data-branch="feature/notes"] .native-worktree-heading')
    .click({ button: 'right' })
  assert.equal(await page.locator('[data-testid="send-review"]').isDisabled(), true)
  await page.keyboard.press('Escape')
})

await check('重置评审演示：清空两边的通知', async () => {
  await page.getByRole('button', { name: '重置评审演示' }).click()
  assert.equal(await page.locator('[data-testid="remote-fab"] .rp-dot').count(), 0)
  assert.match(await page.locator('[data-testid="ct-fab"] .ct-dot').innerText(), /6/)
  assert.match(await page.locator('.journey-step.active').innerText(), /1\. 右键发送评审/)
  assert.equal(await page.locator('[data-testid="pr-page"]').count(), 0)
})

await check('本机通知面板：六条待评审 PR 跨三个项目，宽 320px 且列表内滚动', async () => {
  await openLocalPanel()
  const head = await page.locator('[data-testid="ct-panel"] .ct-head').innerText()
  assert.match(head, /6 条/)
  const items = page.locator('[data-testid="ct-panel"] .ct-item')
  assert.equal(await items.count(), 6)
  assert.match(await page.locator('[data-testid="ct-panel"]').innerText(), /待我评审/)
  const first = items.first()
  const text = await first.innerText()
  assert.match(text, /Builder Workbench/)
  assert.match(text, /PR #378/)
  assert.match(text, /林工/)
  assert.match(text, /14:32/)
  assert.match(text, /开放/)
  assert.match(text, /通过/)
  assert.doesNotMatch(text, /\d{1,2}:\d{2} 前|截止/)
  assert.equal(await first.locator('button').count(), 0)

  const second = await page.locator('[data-item="pr112"]').innerText()
  assert.match(second, /失败/)
  assert.match(second, /第 2 轮/)
  assert.match(second, /3/)

  const box = await page.locator('[data-testid="ct-panel"]').boundingBox()
  assert.equal(Math.round(box.width), 320)
  const list = page.locator('[data-testid="ct-panel"] .ct-list')
  const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight
  }))
  assert.ok(scrollHeight > clientHeight + 1, `期望列表可滚动，实际 ${scrollHeight}/${clientHeight}`)
})

await check('不接 WeLink：页面无 WeLink 群面板、无 IM 卡片', async () => {
  assert.equal(await page.locator('[data-testid="ct-im"]').count(), 0)
  assert.equal(await page.locator('.chat-panel').count(), 0)
})

await check('切换侧栏页面后两个悬浮球仍在', async () => {
  await page.keyboard.press('Escape')
  await page.locator('.sidebar').getByText('知识库', { exact: true }).click()
  assert.equal(await page.locator('[data-testid="ct-fab"]').isVisible(), true)
  assert.equal(await page.locator('[data-testid="remote-fab"]').isVisible(), true)
})

await check('无 console / page error', async () => {
  assert.deepEqual(errors, [])
})

await browser.close()
console.log(`PASS ${checks.length} checks`)
for (const c of checks) {
  console.log(`  ✓ ${c}`)
}
