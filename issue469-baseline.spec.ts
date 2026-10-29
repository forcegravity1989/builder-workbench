import { test, expect } from '../../../../tests/e2e/helpers/workbench-app'
import { writeFileSync } from 'node:fs'
import type { Page, TestInfo } from '@playwright/test'

test.use({ workbenchAppExtraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' } })

async function preparePlan(page: Page, agent: 'claude' | 'codex') {
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 120000 })
  await page.evaluate(async (agent) => {
    await window.__store!.getState().updateSettings({ defaultTuiAgent: agent })
  }, agent)
  console.log('SETUP_DEFAULT', agent)
  await page.getByRole('button', { name: '新建版本', exact: true }).click()
  await page.getByLabel('版本名').fill('v4.69')
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本计划' })).toBeVisible({ timeout: 120000 })
  await expect(page.getByRole('button', { name: '开始计划', exact: true })).toBeEnabled({ timeout: 90000 })
  console.log('PLAN_READY')
}

async function returnPlan(page: Page) {
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '计划', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本计划' })).toBeVisible()
}

async function readBack(page: Page, info: TestInfo, name: string) {
  const readback = await page.evaluate(async () => {
    const settings = await window.api.settings.get()
    const response = await window.api.runtime.call({ method: 'automation.list', params: { selector: { kind: 'self' } } })
    if (!response.ok) throw new Error(response.error.message)
    const result = response.result as { automations: { id: string; name: string; agentId: string; enabled: boolean; workspaceId: string }[] }
    return {
      defaultTuiAgent: settings.defaultTuiAgent,
      automations: result.automations.map(({ id, name, agentId, enabled, workspaceId }) => ({ id, name, agentId, enabled, workspaceId }))
    }
  })
  writeFileSync(info.outputPath(name), JSON.stringify(readback, null, 2))
  console.log('INDEPENDENT_READBACK', JSON.stringify(readback))
  return readback
}

test('A: fresh configured Codex is used by the plan automation', async ({ workbenchPage: page }, info) => {
  await preparePlan(page, 'codex')
  await page.getByRole('button', { name: '配置自动化', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox').filter({ hasText: 'Codex' }).first()).toBeVisible()
  writeFileSync(info.outputPath('A-editor.txt'), await dialog.innerText())
  await page.screenshot({ path: info.outputPath('A-fresh-default-codex.jpg') })
  await readBack(page, info, 'A-independent-readback.json')
})

test('B: saved Claude remains selected after the global default changes to Codex', async ({ workbenchPage: page }, info) => {
  await preparePlan(page, 'claude')
  await page.getByRole('button', { name: '配置自动化', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('combobox').filter({ hasText: 'Claude' }).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(async () => { await window.__store!.getState().updateSettings({ defaultTuiAgent: 'codex' }) })
  await page.getByRole('button', { name: '计划', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本计划' })).toBeVisible()
  await page.getByRole('button', { name: '配置自动化', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox').filter({ hasText: 'Claude' }).first()).toBeVisible()
  writeFileSync(info.outputPath('B-editor.txt'), await dialog.innerText())
  await page.screenshot({ path: info.outputPath('B-saved-claude-default-codex.jpg') })
  await readBack(page, info, 'B-independent-readback.json')
  console.log('SAVED_CLAUDE_WITH_GLOBAL_CODEX_CONFIRMED')
  await returnPlan(page)
  await page.getByRole('button', { name: '开始计划', exact: true }).click()
  try {
    await expect(page.locator('[data-testid="sortable-tab"][data-active="true"] [data-agent-icon="claude"]').first()).toBeVisible({ timeout: 60000 })
    await page.screenshot({ path: info.outputPath('B-launch-saved-claude.jpg') })
    console.log('CLAUDE_SESSION_ICON_VISIBLE')
  } finally {
    await page.screenshot({ path: info.outputPath('B-after-start.jpg') })
    writeFileSync(info.outputPath('B-after-start-body.txt'), await page.locator('body').innerText())
    writeFileSync(info.outputPath('B-after-start-tabs.json'), JSON.stringify(await page.locator('[data-testid="sortable-tab"]').evaluateAll((elements) => elements.map((el) => ({ title: el.getAttribute('data-tab-title'), active: el.getAttribute('data-active'), text: el.textContent, agents: [...el.querySelectorAll('[data-agent-icon]')].map((icon) => icon.getAttribute('data-agent-icon')) }))), null, 2))
  }
})
