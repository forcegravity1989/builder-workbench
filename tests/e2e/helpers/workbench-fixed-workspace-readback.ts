import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'
import type { FixedWorkspaceRemote } from './workbench-fixed-workspace-fixture'

export async function prepareVersion(
  page: Page,
  scope: { repoId: string; hostId: string },
  version: string
) {
  return page.evaluate(
    async ({ scope, version }) => {
      const result = await window.api.runtime.call({
        method: 'workbench.versionWorkspace.prepare',
        params: { repoId: scope.repoId, hostId: scope.hostId, version }
      })
      if (!result.ok) {
        throw new Error(JSON.stringify(result.error))
      }
      return result.result as {
        ok: boolean
        value: { problems: unknown[]; steps: { state: string; worktreeId: string }[] }
      }
    },
    { scope, version }
  )
}

export function git(repo: string, args: string[]) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

export function config(repo: string, key: string) {
  try {
    return git(repo, ['config', '--local', '--get', key])
  } catch {
    return null
  }
}

export function readTracking(repo: string, branches: readonly { branch: string }[]) {
  const upstreams = Object.fromEntries(
    branches.map(({ branch }) => {
      try {
        return [branch, git(repo, ['rev-parse', '--symbolic-full-name', `${branch}@{upstream}`])]
      } catch {
        return [branch, null]
      }
    })
  )
  return {
    upstreams,
    fetchSpecs: git(repo, ['config', '--get-all', 'remote.origin.fetch']).split(/\r?\n/)
  }
}

export async function readNativeTrees(page: Page, repoId: string) {
  return page.evaluate(async (id) => {
    return (await window.api.worktrees.list({ repoId: id })).map((tree) => ({
      id: tree.id,
      branch: tree.branch.replace(/^refs\/heads\//, ''),
      path: tree.path,
      baseRef: tree.baseRef ?? null
    }))
  }, repoId)
}

export async function recordWorkspaceInventory(
  page: Page,
  repoPath: string,
  info: TestInfo,
  stage: string
) {
  const native = await page.evaluate(async (root) => {
    const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase()
    const repo = window
      .__store!.getState()
      .repos.find((item) => normalize(item.path) === normalize(root))
    if (!repo) {
      throw new Error('Inventory repository is not registered')
    }
    return {
      registered: await window.api.worktrees.list({ repoId: repo.id }),
      detected: await window.api.worktrees.listDetected({ repoId: repo.id })
    }
  }, repoPath)
  writeFileSync(
    info.outputPath(`workspace-inventory-${stage}.json`),
    JSON.stringify(
      {
        refs: git(repoPath, ['for-each-ref', '--format=%(refname) %(objectname) %(upstream)']),
        treeGraph: git(repoPath, ['worktree', 'list', '--porcelain']),
        native
      },
      null,
      2
    )
  )
}

export function readTrees(repoPath: string) {
  return git(repoPath, ['worktree', 'list', '--porcelain'])
    .split(/\r?\n\r?\n/)
    .flatMap((block) => {
      const directory = /^worktree (.+)$/m.exec(block)?.[1]?.trim()
      const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1]?.trim()
      if (!directory || !branch) {
        return []
      }
      const marker = path.join(directory, 'fixed-workspace-marker.txt')
      return [
        {
          branch,
          path: directory,
          head: git(directory, ['rev-parse', 'HEAD']),
          marker: existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null
        }
      ]
    })
}

export async function verifyFreshVersion(
  page: Page,
  scope: { repoId: string; hostId: string },
  repoPath: string,
  info: TestInfo,
  repeated: unknown
) {
  const newVersion = 'v9.10'
  const created = await prepareVersion(page, scope, newVersion)
  expect(created.ok).toBe(true)
  expect(created.value.problems).toEqual([])
  expect(created.value.steps.map((step) => step.state)).toEqual(['created', 'created'])
  const after = readTrees(repoPath)
  const registered = await readNativeTrees(page, scope.repoId)
  const creationConfig = git(repoPath, ['config', '--local', '--list'])
  const reentered = await prepareVersion(page, scope, newVersion)
  expect(reentered.ok).toBe(true)
  expect(reentered.value.steps.map((step) => step.state)).toEqual(['existing', 'existing'])
  expect(await readNativeTrees(page, scope.repoId)).toEqual(registered)
  expect(git(repoPath, ['config', '--local', '--list'])).toBe(creationConfig)
  const fresh = ['plan', 'acceptance'].map((workflow) => {
    const branch = `bw/${newVersion}/${workflow}`
    return {
      branch,
      tree: after.filter((tree) => tree.branch === branch),
      native: registered.find((tree) => tree.branch === branch),
      base: config(repoPath, `branch.${branch}.base`),
      remote: config(repoPath, `branch.${branch}.remote`),
      merge: config(repoPath, `branch.${branch}.merge`)
    }
  })
  const creationEvidence = {
    repeated,
    created: created.value,
    reentered: reentered.value,
    fresh,
    pushAutoSetupRemote: config(repoPath, 'push.autoSetupRemote')
  }
  writeFileSync(
    info.outputPath('fixed-workspaces-reentry-and-new.json'),
    `${JSON.stringify(creationEvidence, null, 2)}\n`
  )
  for (const item of fresh) {
    expect(item.tree).toHaveLength(1)
    expect(item.tree[0].head).toBe(git(repoPath, ['rev-parse', 'refs/remotes/origin/main']))
    expect(item.native?.baseRef).toBe('refs/remotes/origin/main')
    expect(item.base).toBe('refs/remotes/origin/main')
    expect(item.remote).toBeNull()
    expect(item.merge).toBeNull()
  }
  expect(creationEvidence.pushAutoSetupRemote).toBe('true')
}

export async function verifyFetchAfterRemoteDelete(
  page: Page,
  fixture: FixedWorkspaceRemote,
  info: TestInfo
) {
  const branch = 'bw/v9.9/acceptance'
  const bare = path.join(fixture.root, 'origin.git')
  git(bare, ['update-ref', '-d', `refs/heads/${branch}`])
  await page.evaluate((worktreePath) => window.api.git.fetch({ worktreePath }), fixture.repoPath)
  const evidence = {
    deletedRemoteBranch: git(bare, ['for-each-ref', '--format=%(refname)', `refs/heads/${branch}`]),
    remoteTrackingRef: git(fixture.repoPath, [
      'for-each-ref',
      '--format=%(refname)',
      `refs/remotes/origin/${branch}`
    ]),
    localHead: git(fixture.repoPath, ['rev-parse', `refs/heads/${branch}`]),
    ordinaryFetch: 'succeeded'
  }
  writeFileSync(
    info.outputPath('fixed-workspaces-fetch-after-remote-delete.json'),
    `${JSON.stringify(evidence, null, 2)}\n`
  )
  expect(evidence.deletedRemoteBranch).toBe('')
  expect(evidence.remoteTrackingRef).toBe('')
  expect(evidence.localHead).toBe(fixture.commits[branch])
}
