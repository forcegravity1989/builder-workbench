import { test, expect } from '../../../../tests/e2e/helpers/workbench-app'
import { writeFileSync } from 'node:fs'
import type { Page, TestInfo } from '@playwright/test'

test.use({ workbenchAppExtraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' } })

async function preparePlan(page: Page) {
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 120000 })
  await page.evaluate(async () => { await window.__store!.getState().updateSettings({ defaultTuiAgent: 'claude' }) })
  await page.getByRole('button', { name: '新建版本', exact: true }).click()
  await page.getByLabel('版本名').fill('v4.69')
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本计划' })).toBeVisible({ timeout: 120000 })
  await expect(page.getByRole('button', { name: '开始计划', exact: true })).toBeEnabled({ timeout: 90000 })
  console.log('PLAN_READY_WITH_CLAUDE_DEFAULT')
}

async function workflowPage(page: Page, workflow: '计划' | '验收') {
  const setupCardClose = page.getByRole('button', { name: '关闭安装脚本', exact: true })
  if (await setupCardClose.isVisible()) await setupCardClose.click()
  await page.getByRole('button', { name: workflow, exact: true }).click()
  await expect(page.getByRole('heading', { name: `版本${workflow}` })).toBeVisible({ timeout: 90000 })
}

async function readBack(page: Page, info: TestInfo, filename: string) {
  const readback = await page.evaluate(async () => {
    const settings = await window.api.settings.get()
    const response = await window.api.runtime.call({ method: 'automation.list', params: { selector: { kind: 'self' } } })
    if (!response.ok) throw new Error(response.error.message)
    const result = response.result as { automations: Record<string, unknown>[] }
    const fields = ['id', 'name', 'agentId', 'precheck', 'projectId', 'workspaceMode', 'workspaceId', 'baseBranch', 'setupDecision', 'reuseSession', 'timezone', 'rrule', 'dtstart', 'enabled', 'missedRunGraceMinutes']
    return { defaultTuiAgent: settings.defaultTuiAgent, automations: result.automations.map((item) => Object.fromEntries(fields.filter((key) => item[key] !== undefined).map((key) => [key, item[key]]))) }
  })
  writeFileSync(info.outputPath(filename), JSON.stringify(readback, null, 2))
  console.log(filename, JSON.stringify(readback))
  return readback
}

function withoutAgent(item: Record<string, unknown>) {
  const { agentId, ...rest } = item
  void agentId
  return rest
}

async function verifyStart(page: Page, info: TestInfo, workflow: '计划' | '验收') {
  await page.getByRole('button', { name: '配置自动化', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox').filter({ hasText: 'Claude' }).first()).toBeVisible()
  writeFileSync(info.outputPath('before-start-editor.txt'), await dialog.innerText())
  await page.screenshot({ path: info.outputPath('before-start-saved-claude.jpg') })
  const before = await readBack(page, info, 'before-start-readback.json')
  const target = before.automations.find((row) => String(row.name).includes(`版本${workflow}`))!
  expect(before.defaultTuiAgent).toBe('codex')
  expect(target.agentId).toBe('claude')
  expect(target.enabled).toBe(false)
  await page.keyboard.press('Escape')
  await workflowPage(page, workflow)
  await page.getByRole('button', { name: `开始${workflow}`, exact: true }).first().click()
  try {
    await expect(page.locator('[data-testid="sortable-tab"][data-active="true"] [data-agent-icon="codex"]').first()).toBeVisible({ timeout: 90000 })
    await page.screenshot({ path: info.outputPath('after-start-codex-session.jpg') })
    const after = await readBack(page, info, 'after-start-readback.json')
    const updated = after.automations.find((row) => row.id === target.id)!
    expect(updated.agentId).toBe('codex')
    expect(updated.enabled).toBe(false)
    expect(withoutAgent(updated)).toEqual(withoutAgent(target))
    const unrelatedBefore = before.automations.filter((row) => row.id !== target.id)
    const unrelatedAfter = after.automations.filter((row) => row.id !== target.id)
    expect(unrelatedAfter).toEqual(unrelatedBefore)
    console.log(`VERIFIED_${workflow}_CODEX_ONLY_AGENTID_CHANGED`)
  } finally {
    await page.screenshot({ path: info.outputPath('after-start.jpg') })
    writeFileSync(info.outputPath('after-start-body.txt'), await page.locator('body').innerText())
    writeFileSync(info.outputPath('after-start-tabs.json'), JSON.stringify(await page.locator('[data-testid="sortable-tab"]').evaluateAll((elements) => elements.map((el) => ({ title: el.getAttribute('data-tab-title'), active: el.getAttribute('data-active'), text: el.textContent, agents: [...el.querySelectorAll('[data-agent-icon]')].map((icon) => icon.getAttribute('data-agent-icon')) }))), null, 2))
  }
}

test('Fix-plan: same saved-Claude path starts and persists configured Codex', async ({ workbenchPage: page }, info) => {
  await preparePlan(page)
  await page.getByRole('button', { name: '配置自动化', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('combobox').filter({ hasText: 'Claude' }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(async () => { await window.__store!.getState().updateSettings({ defaultTuiAgent: 'codex' }) })
  await workflowPage(page, '计划')
  await verifyStart(page, info, '计划')
})

test('Fix-acceptance: saved acceptance Claude starts and persists configured Codex', async ({ workbenchPage: page }, info) => {
  await preparePlan(page)
  await workflowPage(page, '验收')
  await expect(page.getByRole('button', { name: '开始验收', exact: true }).first()).toBeEnabled({ timeout: 90000 })
  await page.getByRole('button', { name: '配置自动化', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('combobox').filter({ hasText: 'Claude' }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(async () => { await window.__store!.getState().updateSettings({ defaultTuiAgent: 'codex' }) })
  await workflowPage(page, '验收')
  await verifyStart(page, info, '验收')
})
