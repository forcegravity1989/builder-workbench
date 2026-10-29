import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { getDefaultWorkspaceSession } from '../../src/shared/constants'
import { buildRuntimeSessionPlaceholders } from '../../src/renderer/src/store/terminals/workspace-terminal-placeholders'
import { DEFAULT_LOCAL_ORCA_PROFILE_ID } from '../../src/shared/orca-profiles'
import { test, expect } from './helpers/workbench-app'
import { launchHeadlessPairedRuntimeHost } from './helpers/headless-paired-runtime-host'
import {
  launchPairedElectronClient,
  type PairedElectronClient
} from './helpers/paired-electron-client'
import { closeElectronAppForE2E } from './helpers/electron-process-shutdown'

// Exercises real Electron startup and a real loopback runtime catalog. The old session is
// seeded into this test's isolated client profile after shutdown, as if retained from an older run.
test('stale runtime session remains durable without becoming a project', async ({
  testRepoPath
}, testInfo) => {
  test.setTimeout(300_000)
  const host = await launchHeadlessPairedRuntimeHost({ pinnedServePort: true })
  let client: PairedElectronClient | undefined
  try {
    await host.client.call('repo.add', { path: testRepoPath, kind: 'git' })
    client = await launchPairedElectronClient(host.offer, testInfo, '476 test host', {
      extraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' }
    })
    const environmentId = client.environmentId
    const hostId = `runtime:${environmentId}`
    const dataPath = path.join(
      client.userDataDir,
      'profiles',
      DEFAULT_LOCAL_ORCA_PROFILE_ID,
      'orca-data.json'
    )
    const profile = client.userDataDir
    await closeElectronAppForE2E(client.app)
    client = undefined
    const tree = '476-stale-repo::/476/orphan-476'
    const paneKey = '476-tab:7af1e2b3-45c6-4789-8abc-123456789abc'
    const session = {
      ...getDefaultWorkspaceSession(),
      activeRepoId: '476-stale-repo',
      activeWorktreeId: tree,
      activeWorkspaceKey: `worktree:${tree}`,
      activeWorkspaceExecutionHostId: hostId,
      activeTabId: '476-tab',
      tabsByWorktree: {
        [tree]: [
          {
            id: '476-tab',
            worktreeId: tree,
            ptyId: null,
            title: '476 retained',
            customTitle: null,
            color: null,
            sortOrder: 0,
            createdAt: 1
          }
        ]
      },
      openFilesByWorktree: {
        [tree]: [
          {
            filePath: '/476/orphan-476/readme.md',
            relativePath: 'readme.md',
            worktreeId: tree,
            language: 'markdown'
          }
        ]
      },
      terminalLayoutsByTabId: {
        '476-tab': {
          root: { type: 'leaf', leafId: '7af1e2b3-45c6-4789-8abc-123456789abc' },
          activeLeafId: '7af1e2b3-45c6-4789-8abc-123456789abc',
          expandedLeafId: null
        }
      },
      unifiedTabs: {
        [tree]: [
          {
            id: '476-tab',
            entityId: '476-tab',
            groupId: '476-group',
            worktreeId: tree,
            contentType: 'terminal',
            label: '476 retained',
            customLabel: null,
            color: null,
            sortOrder: 0,
            createdAt: 1
          },
          {
            id: '/476/orphan-476/readme.md',
            entityId: '/476/orphan-476/readme.md',
            groupId: '476-group',
            worktreeId: tree,
            contentType: 'editor',
            label: 'readme.md',
            customLabel: null,
            color: null,
            sortOrder: 1,
            createdAt: 2
          }
        ]
      },
      tabGroups: {
        [tree]: [
          {
            id: '476-group',
            worktreeId: tree,
            activeTabId: '476-tab',
            tabOrder: ['476-tab', '/476/orphan-476/readme.md'],
            recentTabIds: ['476-tab', '/476/orphan-476/readme.md']
          }
        ]
      },
      activeGroupIdByWorktree: { [tree]: '476-group' },
      tabGroupLayouts: { [tree]: { type: 'leaf', groupId: '476-group' } },
      defaultTerminalTabsAppliedByWorktreeId: { [tree]: true },
      sleepingAgentSessionsByPaneKey: {
        [paneKey]: {
          paneKey,
          tabId: '476-tab',
          worktreeId: tree,
          agent: 'codex',
          providerSession: { key: 'session_id', id: '476-session' },
          prompt: 'continue',
          state: 'working',
          capturedAt: 1,
          updatedAt: 1
        }
      }
    }
    const data = JSON.parse(readFileSync(dataPath, 'utf8'))
    data.workspaceSessionsByHostId = { ...data.workspaceSessionsByHostId, [hostId]: session }
    writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`)
    client = await launchPairedElectronClient(host.offer, testInfo, '476 test host', {
      reuseUserDataDir: profile,
      extraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' }
    })
    const page = client.page
    await expect
      .poll(() =>
        page.evaluate(
          (id) => window.__store?.getState().worktreesByRepo[id]?.[0]?.runtimeSessionPlaceholder,
          '476-stale-repo'
        )
      )
      .toBe(true)
    const placeholderRepo = buildRuntimeSessionPlaceholders({
      repos: [],
      runtimeHostIdByWorkspaceSessionKey: { [tree]: hostId },
      worktreesByRepo: {}
    }).repos[0]
    // Force the restoration to finish before the catalog response. The session and host
    // mapping are the seeded profile data; the controlled catalog reset orders the race.
    await page.evaluate(
      ({ savedSession, workspace, host }) => {
        const store = window.__store!
        const catalogs = { ...store.getState().runtimeRepoCatalogIdsByHost }
        delete catalogs[host]
        store.setState({ runtimeRepoCatalogIdsByHost: catalogs })
        store.getState().hydrateWorkspaceSession(savedSession, {
          runtimeHostIdByWorkspaceSessionKey: { [workspace]: host }
        })
        store.getState().hydrateTabsSession(savedSession)
        store.getState().hydrateEditorSession(savedSession)
      },
      { savedSession: session, workspace: tree, host: hostId }
    )
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
      .toBe(tree)
    await page.screenshot({ path: testInfo.outputPath('476-active-before-catalog.png') })
    await page.evaluate(
      (id) => window.__store!.getState().fetchRuntimeEnvironmentRepos(id),
      environmentId
    )
    await expect
      .poll(() =>
        page.evaluate(
          (host) => window.__store?.getState().runtimeRepoCatalogIdsByHost[host],
          hostId
        )
      )
      .toBeDefined()
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
      .not.toBe(tree)
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeRepoId))
      .not.toBe('476-stale-repo')
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeWorkspaceKey))
      .not.toBe(`worktree:${tree}`)
    await expect(page.locator('[data-screen="wall"]')).toBeVisible()
    await expect(page.getByText('orphan-476', { exact: true })).toHaveCount(0)
    await expect(page.getByText('其他项目', { exact: true })).toHaveCount(0)
    const persisted = await page.evaluate((host) => window.api.session.get(host), hostId)
    expect(persisted.tabsByWorktree[tree]?.map((tab) => tab.id)).toContain('476-tab')
    expect(persisted.openFilesByWorktree?.[tree]?.[0]?.relativePath).toBe('readme.md')
    expect(persisted.sleepingAgentSessionsByPaneKey?.[paneKey]?.providerSession.id).toBe(
      '476-session'
    )
    await page.screenshot({ path: testInfo.outputPath('476-stale-project-hidden.png') })
    // Opposite ordering: catalog is already authoritative when old session hydration arrives.
    await page.evaluate(
      ({ savedSession, workspace, host }) => {
        window.__store!.getState().hydrateWorkspaceSession(savedSession, {
          runtimeHostIdByWorkspaceSessionKey: { [workspace]: host }
        })
        window.__store!.getState().hydrateTabsSession(savedSession)
        window.__store!.getState().hydrateEditorSession(savedSession)
      },
      { savedSession: session, workspace: tree, host: hostId }
    )
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeWorktreeId))
      .not.toBe(tree)
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeRepoId))
      .not.toBe('476-stale-repo')
    await expect
      .poll(() => page.evaluate(() => window.__store!.getState().activeWorkspaceKey))
      .not.toBe(`worktree:${tree}`)
    await expect(page.locator('[data-screen="wall"]')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('476-hydration-after-catalog.png') })

    // Simulate an offline restoration with the captured placeholder and no authoritative catalog.
    await page.evaluate(
      ({ id, host, repo }) => {
        const store = window.__store!
        const statuses = new Map(store.getState().runtimeStatusByEnvironmentId)
        statuses.set(id, { status: null, checkedAt: Date.now() })
        const catalogs = { ...store.getState().runtimeRepoCatalogIdsByHost }
        delete catalogs[host]
        store.setState({
          runtimeStatusByEnvironmentId: statuses,
          runtimeRepoCatalogIdsByHost: catalogs,
          repos: [...store.getState().repos.filter((entry) => entry.id !== repo!.id), repo!],
          worktreesByRepo: {
            ...store.getState().worktreesByRepo,
            [repo!.id]: store
              .getState()
              .worktreesByRepo[repo!.id].map((tree) => ({ ...tree, isPinned: true }))
          }
        })
      },
      { id: environmentId, host: hostId, repo: placeholderRepo }
    )
    await page.getByText('其他项目', { exact: true }).click()
    await expect(page.getByText('orphan-476', { exact: true }).first()).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('476-offline-unknown.png') })
    await closeElectronAppForE2E(client.app)
    client = undefined
    client = await launchPairedElectronClient(host.offer, testInfo, '476 test host', {
      reuseUserDataDir: profile,
      extraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' }
    })
    const reopened = await client.page.evaluate((host) => window.api.session.get(host), hostId)
    expect(reopened.tabsByWorktree[tree]?.map((tab) => tab.id)).toContain('476-tab')
    expect(reopened.unifiedTabs?.[tree]?.map((tab) => tab.id)).toContain('476-tab')
    expect(reopened.unifiedTabs?.[tree]?.map((tab) => tab.id)).toContain(
      '/476/orphan-476/readme.md'
    )
    expect(reopened.openFilesByWorktree?.[tree]?.[0]?.relativePath).toBe('readme.md')
    expect(reopened.sleepingAgentSessionsByPaneKey?.[paneKey]?.providerSession.id).toBe(
      '476-session'
    )
    await expect(client.page.getByText('orphan-476', { exact: true })).toHaveCount(0)
  } finally {
    if (client) {
      await client.dispose()
    }
    await host.dispose()
  }
})
