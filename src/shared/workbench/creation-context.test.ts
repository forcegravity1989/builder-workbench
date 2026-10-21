import { expect, it } from 'vitest'
import type { TaskSourceContext } from '../task-source-context'
import { resolveWorkbenchCreationBinding } from './creation-context'

/**
 * G2 创建上下文 → 绑定解析的协议看护（环 4「创建结果绑定/取消/重试」的数据
 * 面，#383 P4）：goal/issue 各得其形；仓库变更即失效（不把旧上下文绑到不
 * 匹配的工作区）；证明缺失（issue 无来源、goal 无 goalId）一律不绑定；
 * 同一上下文重复解析幂等（重试安全）。
 */

const source: TaskSourceContext = {
  kind: 'task-source',
  provider: 'github',
  projectId: 'project-a',
  hostId: 'local',
  projectHostSetupId: null,
  repoId: 'repo-a',
  providerIdentity: null,
  accountLabel: null
}

it('创建上下文按最终仓库与来源解析：goal/issue 各得其形，失效与缺证明不绑定，重试幂等', () => {
  const goalContext = {
    version: 'v0.9',
    workflow: 'goal' as const,
    goalId: 'g-1',
    repoId: 'repo-a'
  }
  expect(
    resolveWorkbenchCreationBinding(goalContext, { repoId: 'repo-a', taskSourceContext: null })
  ).toEqual({
    schema: 1,
    version: 'v0.9',
    workflow: 'goal',
    goalId: 'g-1'
  })

  const issueContext = {
    version: 'v0.9',
    workflow: 'issue' as const,
    goalId: 'g-1',
    repoId: 'repo-a'
  }
  const issueBinding = resolveWorkbenchCreationBinding(issueContext, {
    repoId: 'repo-a',
    taskSourceContext: source
  })
  expect(issueBinding).toEqual({
    schema: 1,
    version: 'v0.9',
    workflow: 'issue',
    goalId: 'g-1',
    taskSource: source
  })
  // 重试幂等：同一上下文与提交事实重复解析结果一致（绑定写入可安全重放）。
  expect(
    resolveWorkbenchCreationBinding(issueContext, { repoId: 'repo-a', taskSourceContext: source })
  ).toEqual(issueBinding)

  // 用户在创建器里改了仓库：上下文整体失效，不产生绑定（取消/改选零绑定）。
  expect(
    resolveWorkbenchCreationBinding(issueContext, { repoId: 'repo-b', taskSourceContext: source })
  ).toBeNull()
  expect(
    resolveWorkbenchCreationBinding(goalContext, { repoId: 'repo-b', taskSourceContext: null })
  ).toBeNull()
  // 证明缺失一律不绑定：issue 无最终任务来源、goal 无 goalId、无上下文。
  expect(
    resolveWorkbenchCreationBinding(issueContext, { repoId: 'repo-a', taskSourceContext: null })
  ).toBeNull()
  expect(
    resolveWorkbenchCreationBinding(
      { version: 'v0.9', workflow: 'goal', repoId: 'repo-a' },
      { repoId: 'repo-a', taskSourceContext: null }
    )
  ).toBeNull()
  expect(
    resolveWorkbenchCreationBinding(null, { repoId: 'repo-a', taskSourceContext: source })
  ).toBeNull()
})
