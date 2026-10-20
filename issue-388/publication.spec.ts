import { writeFileSync } from 'node:fs'
import { test, expect } from '../../tests/e2e/helpers/workbench-app'

test('host publication excludes a mirrored SKILL.md while publishing an ordinary editor', async ({
  workbenchPage: page
}, testInfo) => {
  test.setTimeout(180_000)
  await expect(page.locator('[data-workbench-nav]')).toBeVisible()
  const fixture = await page.evaluate(() => {
    const store = window.__store!
    const state = store.getState()
    const worktree = state.allWorktrees().find((row) => row.id === state.activeWorktreeId)!
    const localFileId = state.openFile({
      filePath: `${worktree.path.replace(/\\/g, '/')}/README.md`,
      relativePath: 'README.md',
      worktreeId: worktree.id,
      language: 'markdown',
      mode: 'edit'
    })
    const current = store.getState()
    const localFile = current.openFiles.find((file) => file.id === localFileId)!
    const localTab = current.unifiedTabsByWorktree[worktree.id]!.find(
      (tab) => tab.entityId === localFileId
    )!
    const mirroredFile = {
      ...localFile,
      id: 'issue-388-mirrored-file',
      filePath: `${worktree.path}/standard/skills/version-acceptance/SKILL.md`,
      relativePath: 'standard/skills/version-acceptance/SKILL.md',
      runtimeEnvironmentId: 'issue-388-fixture-host',
      mirroredFromRuntimeSession: true
    }
    const mirroredTab = {
      ...localTab,
      id: 'issue-388-mirrored-tab',
      entityId: mirroredFile.id,
      label: 'SKILL.md',
      executionHostId: 'runtime:issue-388-fixture-host'
    }
    store.setState({
      openFiles: [...current.openFiles, mirroredFile],
      unifiedTabsByWorktree: {
        ...current.unifiedTabsByWorktree,
        [worktree.id]: [...current.unifiedTabsByWorktree[worktree.id]!, mirroredTab]
      },
      groupsByWorktree: {
        ...current.groupsByWorktree,
        [worktree.id]: current.groupsByWorktree[worktree.id]!.map((group) =>
          group.id === localTab.groupId
            ? { ...group, tabOrder: [...group.tabOrder, mirroredTab.id] }
            : group
        )
      }
    })
    return { worktreeId: worktree.id, localTabId: localTab.id, localFileId }
  })

  const readSnapshot = () =>
    page.evaluate(async (worktreeId) => {
      const response = await window.api.runtime.call({
        method: 'session.tabs.list',
        params: { worktree: `id:${worktreeId}` }
      })
      if (!response.ok) throw new Error(response.error.message)
      return response.result as { tabs: { id: string; type: string }[] }
    }, fixture.worktreeId)

  await expect.poll(async () => (await readSnapshot()).tabs.some(
    (tab) => tab.id === fixture.localTabId
  )).toBe(true)
  const snapshot = await readSnapshot()
  expect(snapshot.tabs.some((tab) => tab.id === 'issue-388-mirrored-tab')).toBe(false)
  expect(await page.evaluate(() => window.__store!.getState().openFiles.some(
    (file) => file.id === 'issue-388-mirrored-file'
  ))).toBe(true)
  writeFileSync(testInfo.outputPath('publication.json'), JSON.stringify({ fixture, snapshot }, null, 2))
  await page.screenshot({ path: testInfo.outputPath('publication.png') })
  await page.evaluate((fileId) => window.__store!.getState().closeFile(fileId), fixture.localFileId)
  await expect.poll(async () => (await readSnapshot()).tabs.some(
    (tab) => tab.type === 'markdown' || tab.type === 'file'
  )).toBe(false)
})
