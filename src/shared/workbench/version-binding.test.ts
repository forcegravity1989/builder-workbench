import { describe, expect, it } from 'vitest'
import {
  VersionBindingSetSchema,
  WorkbenchVersionBindingSchema,
  areWorkbenchVersionBindingsEqual,
  normalizeStoredWorkbenchVersionBinding
} from './version-binding'

/** 环 4 数据协议看护：绑定契约的写入校验与读回规范化（G2 P1a）。 */

const taskSource = { provider: 'github', projectId: 'proj-1', repoId: 'repo-1' }
const base = { schema: 1 as const, version: 'v0.7' }

describe('WorkbenchVersionBindingSchema workflow coherence', () => {
  it('accepts each coherent purpose and rejects cross-purpose payloads', () => {
    // 四种合法形态：计划/验收属于版本本身；目标树带稳定 goalId；Issue 树带任务来源。
    expect(WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'plan' }).success).toBe(
      true
    )
    expect(
      WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'acceptance' }).success
    ).toBe(true)
    expect(
      WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'goal', goalId: 'G1' }).success
    ).toBe(true)
    const issue = WorkbenchVersionBindingSchema.safeParse({
      ...base,
      workflow: 'issue',
      goalId: 'G1',
      taskSource
    })
    expect(issue.success).toBe(true)
    // taskSource 过既有来源上下文规范化：hostId 补齐为 local。
    expect(
      issue.success &&
        issue.data.taskSource?.hostId === 'local' &&
        issue.data.taskSource?.kind === 'task-source'
    ).toBe(true)
    // 混用一律拒绝：流程树不带目标/来源，目标树不带单一来源，Issue 树必须带来源。
    expect(
      WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'plan', taskSource }).success
    ).toBe(false)
    expect(
      WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'acceptance', goalId: 'G1' })
        .success
    ).toBe(false)
    expect(WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'goal' }).success).toBe(
      false
    )
    expect(
      WorkbenchVersionBindingSchema.safeParse({
        ...base,
        workflow: 'goal',
        goalId: 'G1',
        taskSource
      }).success
    ).toBe(false)
    expect(WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'issue' }).success).toBe(
      false
    )
    // 未知 schema 版本、未知键、非法版本目录名都拒绝。
    expect(
      WorkbenchVersionBindingSchema.safeParse({ schema: 2, version: 'v0.7', workflow: 'plan' })
        .success
    ).toBe(false)
    expect(
      WorkbenchVersionBindingSchema.safeParse({ ...base, workflow: 'plan', extra: 1 }).success
    ).toBe(false)
    expect(
      WorkbenchVersionBindingSchema.safeParse({ schema: 1, version: '../escape', workflow: 'plan' })
        .success
    ).toBe(false)
    // set 请求：binding null 表示清除，对象必须过同一契约。
    const scope = { repoId: 'repo-1', worktreeId: 'repo-1::/wt', hostId: 'local' }
    expect(VersionBindingSetSchema.safeParse({ ...scope, binding: null }).success).toBe(true)
    expect(
      VersionBindingSetSchema.safeParse({ ...scope, binding: { ...base, workflow: 'plan' } })
        .success
    ).toBe(true)
    expect(
      VersionBindingSetSchema.safeParse({ ...scope, binding: { ...base, workflow: 'nope' } })
        .success
    ).toBe(false)
    expect(VersionBindingSetSchema.safeParse({ ...scope }).success).toBe(false)
    const linkedWorkItem = {
      provider: 'github',
      type: 'issue',
      number: 439,
      title: 'A',
      url: 'https://github.com/example/repo/issues/439',
      repoId: 'repo-1'
    }
    const request = {
      ...scope,
      binding: { ...base, workflow: 'issue', taskSource },
      linkedWorkItem
    }
    expect(VersionBindingSetSchema.safeParse(request).success).toBe(true)
    expect(VersionBindingSetSchema.safeParse({ ...request, binding: null }).success).toBe(false)
    expect(
      VersionBindingSetSchema.safeParse({
        ...request,
        linkedWorkItem: { ...linkedWorkItem, repoId: 'another-repo' }
      }).success
    ).toBe(false)
  })
})

describe('normalizeStoredWorkbenchVersionBinding read-back', () => {
  it('keeps valid stored bindings and reads anything else as unbound', () => {
    const normalized = normalizeStoredWorkbenchVersionBinding({
      ...base,
      workflow: 'issue',
      taskSource
    })
    expect(normalized?.workflow).toBe('issue')
    expect(normalized?.taskSource?.provider).toBe('github')
    // 没数据/脏数据就是 Unknown（未绑定），不是绿：null、undefined、坏 workflow、
    // 非对象、混用形态、未来 schema 全部读回 null，不部分采纳。
    expect(normalizeStoredWorkbenchVersionBinding(null)).toBeNull()
    expect(normalizeStoredWorkbenchVersionBinding(undefined)).toBeNull()
    expect(normalizeStoredWorkbenchVersionBinding('v0.7')).toBeNull()
    expect(
      normalizeStoredWorkbenchVersionBinding({ schema: 1, version: 'v0.7', workflow: 'unknown' })
    ).toBeNull()
    expect(
      normalizeStoredWorkbenchVersionBinding({
        schema: 1,
        version: 'v0.7',
        workflow: 'plan',
        goalId: 'G1'
      })
    ).toBeNull()
    expect(
      normalizeStoredWorkbenchVersionBinding({ schema: 3, version: 'v0.7', workflow: 'plan' })
    ).toBeNull()
    // 读回确认用的等值：同一绑定等值，绑定与清除不等值，null/undefined 同为未绑定。
    expect(areWorkbenchVersionBindingsEqual(normalized, normalized)).toBe(true)
    expect(areWorkbenchVersionBindingsEqual(normalized, null)).toBe(false)
    expect(areWorkbenchVersionBindingsEqual(null, undefined)).toBe(true)
    expect(areWorkbenchVersionBindingsEqual(normalized, { ...normalized!, version: 'v0.8' })).toBe(
      false
    )
  })
})
