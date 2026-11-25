import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { focusActiveTerminalInput, resolveActiveTabId } from './terminal'

async function getRenderedDraftText(page: Page): Promise<string> {
  const tabId = await resolveActiveTabId(page)
  if (!tabId) {
    return ''
  }
  return page.evaluate((id) => {
    const manager = window.__paneManagers?.get(id)
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0]
    if (!pane) {
      return ''
    }
    // SerializeAddon emits replay instructions, including cursor moves to restore wrapped rows.
    const { buffer, cols, rows } = pane.terminal
    const rendered: string[] = []
    const screen = buffer.active
    for (let row = screen.viewportY; row < screen.viewportY + rows; row++) {
      const line = screen.getLine(row)
      if (!line) {
        break
      }
      if (rendered.length > 0 && !line.isWrapped) {
        rendered.push('\n')
      }
      rendered.push(line.translateToString(true, 0, cols))
    }
    return rendered.join('')
  }, tabId)
}

/** Real native launch with the existing interactive agent fixture; no model or provider writes. */
export async function verifyWorkflowDraft(page: Page, topic: string, testInfo: TestInfo) {
  await expect
    .poll(() => getRenderedDraftText(page), { timeout: 120_000 })
    .toContain(`${topic}/SKILL.md`)
  const text = await getRenderedDraftText(page)
  expect(text).not.toContain('GOLDEN_STUB_AGENT_SUBMITTED')
  const skillPath = text.match(/完整读取并使用「([^」]+)」/)?.[1]
  expect(skillPath).toBeTruthy()
  const body = readFileSync(skillPath!, 'utf8')
  expect(body).toContain('references/shared/execution.md')
  expect(body).not.toContain('skills get')
  expect(
    readFileSync(path.join(path.dirname(skillPath!), 'references/shared/execution.md'), 'utf8')
  ).toContain('AGENTS.md')
  await page.screenshot({ path: testInfo.outputPath(`bw-${topic}-editable-draft.png`) })
  await focusActiveTerminalInput(page)
  await page.keyboard.type(' User-added context.')
  await expect.poll(() => getRenderedDraftText(page)).toContain('User-added context.')
  expect(await getRenderedDraftText(page)).not.toContain('GOLDEN_STUB_AGENT_SUBMITTED')
  await page.keyboard.press('Enter')
  await expect.poll(() => getRenderedDraftText(page)).toContain('GOLDEN_STUB_AGENT_SUBMITTED')
  const submitted = (await getRenderedDraftText(page)).split('GOLDEN_STUB_AGENT_SUBMITTED')[1]
  expect(submitted).toContain(`${topic}/SKILL.md`)
  expect(submitted).toContain('User-added context.')
}
