import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Page, TestInfo } from '@playwright/test'
import { expect } from '@stablyai/playwright-test'
import type { FixedWorkspaceRemote } from './workbench-fixed-workspace-fixture'
import { git } from './workbench-fixed-workspace-readback'

function commitFile(cwd: string, file: string, content: string, message: string): string {
  writeFileSync(path.join(cwd, file), content)
  git(cwd, ['add', '--', file])
  git(cwd, ['commit', '-m', message])
  return git(cwd, ['rev-parse', 'HEAD'])
}

export async function verifyFlowTrunkSync(
  page: Page,
  fixture: FixedWorkspaceRemote,
  info: TestInfo,
  plan: { path: string; branch: string }
): Promise<void> {
  const seed = path.join(fixture.root, 'seed')
  const upstream = 'team/review-plan'
  const material = '.bw/planning/v9.9/data.json'
  const goal = '远端上游的最新计划'
  const update = page.getByRole('button', { name: '更新代码', exact: true })
  const toasts = page.locator('[data-sonner-toast]')

  git(seed, ['switch', 'main'])
  commitFile(seed, 'trunk-sync.txt', 'latest trunk\n', 'Advance trunk')
  git(seed, ['push', 'origin', 'main'])
  git(seed, ['switch', '-c', upstream, plan.branch])
  git(seed, ['merge', '--no-edit', 'main'])
  const materialText = readFileSync(path.join(seed, material), 'utf8')
  const upstreamHead = commitFile(
    seed,
    material,
    materialText.replace('保留远端计划内容', goal),
    'Publish updated plan'
  )
  git(seed, ['push', 'origin', upstream])
  git(plan.path, [
    'config',
    '--add',
    'remote.origin.fetch',
    `+refs/heads/${upstream}:refs/remotes/origin/${upstream}`
  ])
  git(plan.path, ['config', `branch.${plan.branch}.merge`, `refs/heads/${upstream}`])

  await update.click()
  await expect(toasts.filter({ hasText: `已更新到 ${plan.branch}` })).toBeVisible({
    timeout: 180_000
  })
  expect(git(plan.path, ['rev-parse', 'HEAD'])).toBe(upstreamHead)
  expect(readFileSync(path.join(plan.path, 'trunk-sync.txt'), 'utf8')).toContain('latest trunk')
  await expect(page.locator('.g3-goal-toggle strong')).toHaveText(goal, { timeout: 60_000 })
  await page.screenshot({ path: info.outputPath('flow-sync-fast-forward.png') })

  const localHead = commitFile(plan.path, 'flow-conflict.txt', 'local draft\n', 'Local plan draft')
  commitFile(seed, 'flow-conflict.txt', 'shared draft\n', 'Remote plan draft')
  git(seed, ['push', 'origin', upstream])
  git(seed, ['switch', 'main'])
  commitFile(seed, 'trunk-later.txt', 'trunk only\n', 'Advance trunk again')
  git(seed, ['push', 'origin', 'main'])
  const localStatus = git(plan.path, ['status', '--porcelain'])

  await update.click()
  await expect(toasts.filter({ hasText: `合并 origin/${upstream} 时发生冲突` })).toBeVisible({
    timeout: 180_000
  })
  expect(git(plan.path, ['rev-parse', 'HEAD'])).toBe(localHead)
  expect(git(plan.path, ['status', '--porcelain'])).toBe(localStatus)
  expect(existsSync(path.join(plan.path, 'trunk-later.txt'))).toBe(false)
  expect(readFileSync(path.join(plan.path, 'flow-conflict.txt'), 'utf8')).toContain('local draft')
  await expect(page.locator('.g3-goal-toggle strong')).toHaveText(goal)
  await page.screenshot({ path: info.outputPath('flow-sync-upstream-conflict.png') })
}
