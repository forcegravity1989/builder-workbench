import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'
import {
  fixedWorkspaceBranches,
  fixedWorkspaceVersion,
  type FixedWorkspaceRemote
} from './workbench-fixed-workspace-fixture'
import {
  git,
  prepareVersion,
  readNativeTrees,
  readTrees,
  readTracking,
  verifyFetchAfterRemoteDelete,
  verifyFreshVersion
} from './workbench-fixed-workspace-readback'

async function scopeFor(page: Page, repoPath: string) {
  return page.evaluate(async (root) => {
    const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase()
    const store = window.__store!
    const repo = store.getState().repos.find((item) => normalize(item.path) === normalize(root))
    if (!repo) {
      throw new Error('Fixed workspace fixture repo is not registered')
    }
    await store.getState().fetchWorktrees(repo.id)
    const main = store
      .getState()
      .allWorktrees()
      .find((item) => item.repoId === repo.id && item.isMainWorktree)
    if (!main) {
      throw new Error('Fixture primary worktree is missing')
    }
    return { projectId: main.projectId || repo.id, repoId: repo.id, hostId: 'local' }
  }, repoPath)
}

async function ensureRendererTree(
  page: Page,
  scope: Awaited<ReturnType<typeof scopeFor>>,
  branch: string,
  name: string
) {
  const candidates = readdirSync(path.join(process.cwd(), 'out/renderer/assets')).filter((file) =>
    /^native-workspace-.*\.js$/.test(file)
  )
  expect(
    candidates,
    'The production fixed-workspace module must have one built entry'
  ).toHaveLength(1)
  return page.evaluate(
    async ({ entry, scope, branch, name }) => {
      const exports = await import(new URL(`./assets/${entry}`, location.href).href)
      // Import the real entry used by project and metrics; no replacement creation flow.
      const functions = Object.values(exports).filter(
        (value) => typeof value === 'function' && value.length === 3
      )
      if (functions.length !== 1) {
        throw new Error('Cannot identify the built ensureNamedWorktree export')
      }
      return (
        functions[0] as (scope: unknown, branch: string, name: string) => Promise<{ id: string }>
      )(scope, branch, name)
    },
    { entry: candidates[0], scope, branch, name }
  )
}

export async function verifyFixedWorkspaceRemoteReuse(
  page: Page,
  fixture: FixedWorkspaceRemote,
  info: TestInfo
) {
  const initialRefs = git(fixture.repoPath, [
    'for-each-ref',
    '--format=%(refname)',
    'refs/heads',
    'refs/remotes'
  ])
  for (const item of fixedWorkspaceBranches) {
    expect(initialRefs).not.toContain(item.branch)
  }
  const fetchSpec = git(fixture.repoPath, ['config', '--get-all', 'remote.origin.fetch'])
  expect(fetchSpec).toBe('+refs/heads/main:refs/remotes/origin/main')
  await expect(page.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  const scope = await scopeFor(page, fixture.repoPath)
  const reviews = await page.evaluate(
    async ({ repoPath, repoId, branches }) => {
      const result: { branch: string; number: number | null }[] = []
      for (const branch of branches) {
        const pr = await window.api.gh.prForBranch({ repoPath, repoId, branch })
        result.push({ branch, number: pr?.number ?? null })
      }
      return result
    },
    {
      repoPath: fixture.repoPath,
      repoId: scope.repoId,
      branches: fixedWorkspaceBranches.map((item) => item.branch)
    }
  )
  writeFileSync(
    info.outputPath('fixed-workspaces-preconditions.json'),
    JSON.stringify(
      {
        reviews,
        remoteUrl: git(fixture.repoPath, ['remote', 'get-url', 'origin']),
        ghCalls: existsSync(fixture.ghLog)
          ? readFileSync(fixture.ghLog, 'utf8')
              .trim()
              .split('\n')
              .map((line) => JSON.parse(line))
          : []
      },
      null,
      2
    )
  )
  for (const item of fixedWorkspaceBranches) {
    expect(
      Boolean(reviews.find((review) => review.branch === item.branch)?.number),
      `Controlled review lookup for ${item.branch}`
    ).toBe(item.hasPr)
  }
  const errors: { kind: string; message: string }[] = []
  for (const item of fixedWorkspaceBranches.filter(
    (item) => item.kind === 'project' || item.kind === 'metrics'
  )) {
    try {
      await ensureRendererTree(page, scope, item.branch, item.name)
    } catch (error) {
      errors.push({
        kind: item.kind,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const dismissSetup = page.getByRole('button', { name: '关闭安装脚本' })
  if (await dismissSetup.isVisible().catch(() => false)) {
    await dismissSetup.click()
  }
  await page.getByRole('button', { name: '新建版本', exact: true }).click()
  await page.getByLabel('版本名').fill(fixedWorkspaceVersion)
  await page.getByRole('button', { name: '创建版本', exact: true }).click()
  await expect
    .poll(
      async () => {
        const report = await page
          .getByText(`版本 ${fixedWorkspaceVersion} 创建结果`, { exact: true })
          .isVisible()
          .catch(() => false)
        const mounted = await page
          .locator('.g3-version-bound')
          .textContent()
          .catch(() => '')
        return report || mounted?.trim() === fixedWorkspaceVersion
      },
      {
        timeout: 240_000,
        message: 'Version preparation neither completed nor reported its failure'
      }
    )
    .toBeTruthy()
  await page.screenshot({ path: info.outputPath('fixed-workspaces-remote-result.png') })

  const trees = readTrees(fixture.repoPath)
  const nativeTrees = await readNativeTrees(page, scope.repoId)
  const tracking = readTracking(fixture.repoPath, fixedWorkspaceBranches)
  const evidence = {
    sourceCommit: git(process.cwd(), ['rev-parse', 'HEAD']),
    fetchSpec,
    initialRefs,
    reviews,
    errors,
    trees,
    nativeTrees,
    tracking,
    expectedCommits: fixture.commits,
    ghCalls: existsSync(fixture.ghLog)
      ? readFileSync(fixture.ghLog, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [],
    gitCalls: existsSync(fixture.gitLog)
      ? readFileSync(fixture.gitLog, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : []
  }
  writeFileSync(
    info.outputPath('fixed-workspaces-remote-result.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  )
  await info.attach('fixed-workspaces-remote-readback', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json'
  })
  expect
    .soft(errors, 'Renderer fixed-workspace entries must reuse the original remote branches')
    .toEqual([])
  for (const item of fixedWorkspaceBranches) {
    const found = trees.filter((tree) => tree.branch === item.branch)
    expect
      .soft(found, `${item.kind} must have exactly one worktree on the fixed branch`)
      .toHaveLength(1)
    expect
      .soft(found[0]?.head, `${item.kind} must preserve the original remote commit`)
      .toBe(fixture.commits[item.branch])
    expect
      .soft(found[0]?.marker, `${item.kind} must preserve its remote contents`)
      .toBe(item.branch)
    expect
      .soft(nativeTrees.find((tree) => tree.branch === item.branch)?.baseRef)
      .toBe(`refs/remotes/origin/${item.branch}`)
    expect.soft(tracking.upstreams[item.branch]).toBe(`refs/remotes/origin/${item.branch}`)
  }
  expect
    .soft(tracking.fetchSpecs.sort())
    .toEqual(
      [
        fetchSpec,
        ...fixedWorkspaceBranches.map(
          ({ branch }) => `+refs/heads/${branch}*:refs/remotes/origin/${branch}*`
        )
      ].sort()
    )
  expect
    .soft(
      trees.filter((tree) => /^bw\/.+-\d+$/.test(tree.branch)),
      'No suffixed fixed worktree may remain'
    )
    .toEqual([])
  if (
    errors.length ||
    fixedWorkspaceBranches.some(
      (item) =>
        !trees.some(
          (tree) => tree.branch === item.branch && tree.head === fixture.commits[item.branch]
        )
    )
  ) {
    return
  }

  const before = trees.map((tree) => ({ branch: tree.branch, path: tree.path }))
  for (const item of fixedWorkspaceBranches.filter(
    (item) => item.kind === 'project' || item.kind === 'metrics'
  )) {
    const repeated = await Promise.all([
      ensureRendererTree(page, scope, item.branch, item.name),
      ensureRendererTree(page, scope, item.branch, item.name)
    ])
    expect(repeated[0].id).toBe(repeated[1].id)
  }
  const prepared = await prepareVersion(page, scope, fixedWorkspaceVersion)
  expect(prepared.ok).toBe(true)
  expect(prepared.value.problems).toEqual([])
  expect(prepared.value.steps.map((step) => step.state)).toEqual(['existing', 'existing'])
  expect(
    readTrees(fixture.repoPath).map((tree) => ({ branch: tree.branch, path: tree.path }))
  ).toEqual(before)
  await expect(page.locator('.g3-goal-toggle strong')).toHaveText('保留远端计划内容', {
    timeout: 60_000
  })
  if (await dismissSetup.isVisible().catch(() => false)) {
    await dismissSetup.click()
  }
  await page.getByRole('button', { name: '验收', exact: true }).click()
  await expect(page.getByRole('heading', { name: '版本验收', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await page.screenshot({ path: info.outputPath('fixed-workspaces-acceptance-bound.png') })

  await verifyFreshVersion(page, scope, fixture.repoPath, info, prepared.value)
  await verifyFetchAfterRemoteDelete(page, fixture, info)
}
