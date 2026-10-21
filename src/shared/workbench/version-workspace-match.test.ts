import { expect, it } from 'vitest'
import type { Worktree } from '../worktree/types'
import type { TaskSourceContext } from '../task-source-context'
import {
  findGoalParentSuggestion,
  findVersionFlowWorktrees,
  findVersionGoalWorktrees,
  findVersionTaskWorktrees
} from './version-workspace-match'

/**
 * G2 统一 Start/Open 解析核的协议看护（环 4「精确任务关联」，#383 P4）：
 * 同号不同来源、同 Issue 两版不串开；多候选全部返回（绝不取数组第一棵）；
 * 归属只认绑定与原生 linked 字段，脏绑定/归档树不入候选。
 */

const source = (repoId: string, projectId = 'project-a'): TaskSourceContext => ({
  kind: 'task-source',
  provider: 'github',
  projectId,
  hostId: 'local',
  projectHostSetupId: null,
  repoId,
  providerIdentity: null,
  accountLabel: null
})

const linked = (number: number, repoId: string) => ({
  provider: 'github' as const,
  type: 'issue' as const,
  number,
  title: `issue ${number}`,
  url: `https://github.example/issues/${number}`,
  repoId
})

const row = (id: string, fields: Partial<Worktree>): Worktree =>
  ({
    id,
    repoId: 'repo-a',
    isArchived: false,
    ...fields
  }) as Worktree

it('同号不同来源与同 Issue 两版各按绑定证明命中，无绑定旧树不猜归属', () => {
  const trees = [
    row('tree-a', {
      repoId: 'repo-a',
      linkedWorkItem: linked(5, 'repo-a'),
      workbenchVersionBinding: {
        schema: 1,
        version: 'v0.7',
        workflow: 'issue',
        taskSource: source('repo-a')
      }
    }),
    row('tree-b', {
      repoId: 'repo-b',
      linkedWorkItem: linked(5, 'repo-b'),
      workbenchVersionBinding: {
        schema: 1,
        version: 'v0.7',
        workflow: 'issue',
        taskSource: source('repo-b')
      }
    }),
    row('tree-c', {
      repoId: 'repo-a',
      linkedWorkItem: linked(5, 'repo-a'),
      workbenchVersionBinding: {
        schema: 1,
        version: 'v0.8',
        workflow: 'issue',
        taskSource: source('repo-a')
      }
    }),
    // 旧原生附件树（linkedIssue 同号）没有绑定：BW 解析不认领、不猜归属。
    row('tree-legacy', { repoId: 'repo-a', linkedWorkItem: linked(5, 'repo-a') })
  ]
  expect(
    findVersionTaskWorktrees(trees, { version: 'v0.7', number: 5, source: source('repo-a') }).map(
      (tree) => tree.id
    )
  ).toEqual(['tree-a'])
  expect(
    findVersionTaskWorktrees(trees, { version: 'v0.7', number: 5, source: source('repo-b') }).map(
      (tree) => tree.id
    )
  ).toEqual(['tree-b'])
  expect(
    findVersionTaskWorktrees(trees, { version: 'v0.8', number: 5, source: source('repo-a') }).map(
      (tree) => tree.id
    )
  ).toEqual(['tree-c'])
})

it('跨宿主实例同绑定时多候选全部返回且稳定排序，归档与脏绑定不入候选', () => {
  const binding = {
    schema: 1 as const,
    version: 'v0.7',
    workflow: 'issue' as const,
    taskSource: source('repo-a')
  }
  const trees = [
    row('repo-a::/f', {
      linkedWorkItem: linked(5, 'repo-a'),
      workbenchVersionBinding: binding,
      hostId: 'ssh:build',
      runtimeOwnerEnvironmentId: 'env-1'
    }),
    row('repo-a::/e', { linkedWorkItem: linked(5, 'repo-a'), workbenchVersionBinding: binding }),
    row('repo-a::/archived', {
      linkedWorkItem: linked(5, 'repo-a'),
      workbenchVersionBinding: binding,
      isArchived: true
    }),
    row('repo-a::/dirty', {
      linkedWorkItem: linked(5, 'repo-a'),
      // 未知 schema/脏数据：读回规范化为未绑定，不部分采纳（故意脏，cast 绕过类型）。
      workbenchVersionBinding: {
        schema: 99,
        version: 'v0.7',
        workflow: 'issue'
      } as unknown as Worktree['workbenchVersionBinding']
    })
  ]
  const matches = findVersionTaskWorktrees(trees, {
    version: 'v0.7',
    number: 5,
    source: source('repo-a')
  })
  expect(matches.map((tree) => tree.id)).toEqual(['repo-a::/e', 'repo-a::/f'])
})

it('目标树/流程树按绑定匹配，父级建议只在唯一合法同项目同宿主时给出', () => {
  const goalBinding = {
    schema: 1 as const,
    version: 'v0.7',
    workflow: 'goal' as const,
    goalId: 'g-1'
  }
  const goalLocal = row('goal-local', {
    workbenchVersionBinding: goalBinding,
    projectId: 'project-a',
    hostId: 'local'
  })
  const trees = [
    goalLocal,
    row('goal-remote', {
      workbenchVersionBinding: goalBinding,
      projectId: 'project-a',
      hostId: 'ssh:build'
    }),
    row('goal-other-project', {
      workbenchVersionBinding: goalBinding,
      projectId: 'project-b',
      hostId: 'local'
    }),
    row('plan-07', {
      workbenchVersionBinding: { schema: 1, version: 'v0.7', workflow: 'plan' }
    }),
    row('acceptance-07', {
      workbenchVersionBinding: { schema: 1, version: 'v0.7', workflow: 'acceptance' }
    })
  ]
  expect(
    findVersionGoalWorktrees(trees, { version: 'v0.7', goalId: 'g-1' }).map((tree) => tree.id)
  ).toEqual(['goal-local', 'goal-other-project', 'goal-remote'])
  expect(
    findVersionFlowWorktrees(trees, { version: 'v0.7', workflow: 'plan' }).map((tree) => tree.id)
  ).toEqual(['plan-07'])
  // 已清理/未准备版本：空集如实返回，由调用方走只读来源，不在此补树。
  expect(findVersionFlowWorktrees(trees, { version: 'v0.9', workflow: 'plan' })).toEqual([])
  // 唯一合法（同项目同宿主）才建议；两棵同宿主合法树即不唯一，一律不建议。
  expect(
    findGoalParentSuggestion({
      version: 'v0.7',
      goalId: 'g-1',
      worktrees: [goalLocal],
      home: { repoId: 'repo-a', projectId: 'project-a', hostId: 'local' }
    })
  ).toBe('goal-local')
  const goalLocalSecond = row('goal-local-2', {
    workbenchVersionBinding: goalBinding,
    projectId: 'project-a',
    hostId: 'local'
  })
  expect(
    findGoalParentSuggestion({
      version: 'v0.7',
      goalId: 'g-1',
      worktrees: [goalLocal, goalLocalSecond],
      home: { repoId: 'repo-a', projectId: 'project-a', hostId: 'local' }
    })
  ).toBeNull()
  // 跨项目实例不计入「同项目同宿主」候选。
  expect(
    findGoalParentSuggestion({
      version: 'v0.7',
      goalId: 'g-1',
      worktrees: trees,
      home: { repoId: 'repo-a', projectId: 'project-a', hostId: 'local' }
    })
  ).toBe('goal-local')
})
