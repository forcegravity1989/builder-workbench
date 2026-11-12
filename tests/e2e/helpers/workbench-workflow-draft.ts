import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'
import { focusActiveTerminalInput, getTerminalContent } from './terminal'

/** Real native launch with the existing interactive agent fixture; no model or provider writes. */
export async function verifyWorkflowDraft(page: Page, topic: string, testInfo: TestInfo) {
  await expect
    .poll(() => getTerminalContent(page), { timeout: 120_000 })
    .toContain(`${topic}/SKILL.md`)
  const text = (await getTerminalContent(page)).replace(/\r?\n/g, '')
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
  await expect.poll(() => getTerminalContent(page)).toContain('User-added context.')
  expect(await getTerminalContent(page)).not.toContain('GOLDEN_STUB_AGENT_SUBMITTED')
  await page.keyboard.press('Enter')
  await expect.poll(() => getTerminalContent(page)).toContain('GOLDEN_STUB_AGENT_SUBMITTED')
  const submitted = (await getTerminalContent(page)).split('GOLDEN_STUB_AGENT_SUBMITTED')[1]
  expect(submitted).toContain(`${topic}/SKILL.md`)
  expect(submitted).toContain('User-added context.')
}
