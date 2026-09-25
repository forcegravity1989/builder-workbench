// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AcceptanceMaterial,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { AcceptanceGoalResult } from './AcceptanceGoalResult'
import { AcceptancePreparation } from './AcceptancePreparation'
import { AcceptanceTasks } from './AcceptanceTasks'
import type { TaskOrigin, TaskPort } from '../version-cycle/ports'
import { recordHumanDecision } from './acceptance-decision'
import type { AcceptanceCandidatePort, CandidateCheck } from './acceptance-candidate-port'

const plan: PlanningMaterial = {
  schema_version: 3,
  version: 'v0.5',
  cycleId: 'plan-cycle',
  summary: { progress: '', risks: '' },
  goals: [{ goalId: 'g1', title: '交付展示', metricTargets: [] }],
  tasks: []
}
function material(): AcceptanceMaterial {
  return {
    schema_version: 3,
    version: plan.version,
    cycleId: 'acceptance-cycle',
    planRef: {
      kind: 'committed',
      version: plan.version,
      cycleId: plan.cycleId,
      sourceCommit: '1'.repeat(40),
      revision: `sha256:${'a'.repeat(64)}`
    },
    candidateRef: {
      repository: 'github.com/team/repo',
      version: plan.version,
      commit: '2'.repeat(40)
    },
    preparedArtifacts: [],
    results: [{ goalId: 'g1', deliveries: [], readings: [], note: '', nextStep: '' }]
  }
}
let container: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('acceptance interactions', () => {
  it('retains the selected conclusion and asks for a new human confirmation after a candidate change', async () => {
    const original = await recordHumanDecision({
      document: material(),
      plan,
      goalId: 'g1',
      outcome: 'met',
      source: '验收界面选择',
      reason: '已演示',
      recordedAt: '2026-09-25T01:00:00Z'
    })
    const changed = {
      ...original,
      candidateRef: { ...original.candidateRef!, commit: '3'.repeat(40) }
    }
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <AcceptanceGoalResult
          document={changed}
          plan={plan}
          goal={plan.goals[0]}
          decisionSource="验收界面选择"
          disabled={false}
          onChange={onChange}
          onFollowUp={vi.fn()}
        />
      )
    })
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(container.textContent).toContain('证据已变化')
    })
    expect(container.querySelector('select')!.value).toBe('met')
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === '重新确认此结论')!
        .click()
    })
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(onChange).toHaveBeenCalledOnce()
    })
    const updated = onChange.mock.calls[0][0] as AcceptanceMaterial
    expect(updated.results[0].decision!.outcome).toBe('met')
    expect(updated.results[0].decision!.materialRevision).not.toBe(
      original.results[0].decision!.materialRevision
    )
  })

  it('does not show or propagate verification returned for a replaced candidate', async () => {
    const pending = Promise.withResolvers<CandidateCheck>()
    const original = material()
    const onCandidateCheck = vi.fn()
    const port: AcceptanceCandidatePort = {
      check: () => pending.promise,
      inspect: vi.fn(),
      openFile: vi.fn()
    }
    await act(async () => {
      root.render(
        <AcceptancePreparation
          document={original}
          port={port}
          onPrepare={vi.fn()}
          onCandidateCheck={onCandidateCheck}
        />
      )
    })
    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === '核对材料来源')!
        .click()
    })
    const changed = {
      ...original,
      candidateRef: { ...original.candidateRef!, commit: '3'.repeat(40) }
    }
    await act(async () => {
      root.render(
        <AcceptancePreparation
          document={changed}
          port={port}
          onPrepare={vi.fn()}
          onCandidateCheck={onCandidateCheck}
        />
      )
    })
    await act(async () => {
      pending.resolve({
        candidate: original.candidateRef!,
        kind: 'verified',
        checkedAt: '2026-09-25T01:00:00Z'
      })
    })
    expect(onCandidateCheck).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('已核对')
    expect(container.textContent).toContain(changed.candidateRef.commit)
  })

  it('shows the adopted Issue snapshot after a material reload instead of a previous refresh cache', async () => {
    const reference = {
      provider: 'github',
      repository: 'github.com/team/repo',
      number: 1,
      goalId: 'g1'
    }
    const task = {
      reference,
      source: {
        kind: 'task-source' as const,
        provider: 'github' as const,
        projectId: 'project',
        hostId: 'local' as const
      },
      iid: 1,
      title: '刷新时的标题',
      state: 'opened',
      url: 'https://github.com/team/repo/issues/1',
      readAt: '2026-09-25T01:00:00Z'
    }
    const port: TaskPort = {
      listVersion: vi.fn(),
      refresh: async () => [{ kind: 'ready', reference, task }],
      openDetail: vi.fn()
    }
    const origin: TaskOrigin = {
      projectId: 'project',
      repoId: 'repo',
      hostId: 'local',
      workflow: 'acceptance',
      page: 'acceptance',
      version: plan.version,
      cycleId: 'cycle',
      worktreeId: 'tree',
      scrollTop: 0,
      draftKey: 'draft'
    }
    const onSnapshot = vi.fn()
    const props = {
      plan: { ...plan, tasks: [reference] },
      port,
      origin,
      disabled: false,
      getScrollTop: () => 0,
      onSnapshot
    }
    await act(async () => root.render(<AcceptanceTasks {...props} />))
    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(onSnapshot).toHaveBeenCalledOnce()
    await act(async () =>
      root.render(
        <AcceptanceTasks
          {...props}
          snapshot={[{ kind: 'ready', ...task, title: '远端已保存的标题' }]}
        />
      )
    )
    expect(container.textContent).toContain('远端已保存的标题')
    expect(container.textContent).not.toContain('刷新时的标题')
  })
})
