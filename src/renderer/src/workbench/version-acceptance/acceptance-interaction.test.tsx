// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AcceptanceMaterial,
  MetricReadingEvidence,
  PlanningMaterial
} from '../../../../shared/workbench/version-material'
import { AcceptanceGoalResult } from './AcceptanceGoalResult'
import { AcceptanceSources } from './AcceptanceSources'
import { AcceptanceTasks } from './AcceptanceTasks'
import type { TaskOrigin, TaskPort } from '../version-cycle/ports'
import { recordHumanDecision } from './acceptance-decision'
import type { AcceptanceCandidatePort, CandidateCheck } from './acceptance-candidate-port'
import { AcceptanceMetricWindow } from './AcceptanceMetricWindow'
import { AcceptanceMetrics } from './AcceptanceMetrics'
import type { MetricCatalog, MetricWindow, MetricsPort } from '../../../../shared/workbench/metrics'

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
  it('collects current and newly added metrics without rewriting adopted evidence or plan baselines', async () => {
    const ref = {
      name: '交付数量',
      definitionHash: `sha256:${'a'.repeat(64)}`,
      configurationCommit: '1'.repeat(40)
    }
    const currentRef = {
      ...ref,
      definitionHash: `sha256:${'b'.repeat(64)}`,
      configurationCommit: '2'.repeat(40)
    }
    const addedRef = { ...currentRef, name: '验收数量', definitionHash: `sha256:${'c'.repeat(64)}` }
    const reading = (value: number): MetricReadingEvidence => ({
      ref,
      value,
      unit: '项',
      source: '真实采集入口',
      collectedAt: '2026-09-25T01:00:00Z',
      collectorRevision: '2'.repeat(40),
      observation: { kind: 'instant', observedAt: '2026-09-25T01:00:00Z' }
    })
    const ready = {
      status: 'ready' as const,
      readings: [
        {
          ...reading(10),
          ref: currentRef,
          observation: {
            kind: 'window' as const,
            start: '2026-08-31T16:00:00Z',
            end: '2026-09-01T16:00:00Z',
            granularity: 'day' as const,
            timezone: 'Asia/Shanghai'
          }
        }
      ],
      run: {
        runId: 'run',
        startedAt: '2026-09-25T01:00:00Z',
        finishedAt: '2026-09-25T01:00:00Z',
        collectorRevision: '2'.repeat(40),
        dataTarget: { repository: 'github.com/team/repo', commit: '2'.repeat(40), hostId: 'local' }
      }
    }
    const refresh = vi
      .fn()
      .mockResolvedValueOnce(ready)
      .mockResolvedValueOnce({
        status: 'error',
        reason: { code: 'offline', message: '采集源不可用' },
        previous: ready
      })
      .mockResolvedValueOnce({
        ...ready,
        readings: [{ ...ready.readings[0], ref: addedRef, value: 7 }]
      })
    const currentCatalog: MetricCatalog = {
      scope: { repoId: 'repo', worktreeId: 'tree', hostId: 'local' },
      configurationCommit: currentRef.configurationCommit,
      configurationRef: 'main',
      timezone: 'Asia/Shanghai',
      problems: [],
      definitions: [
        {
          ref: currentRef,
          name: currentRef.name,
          role: 'lagging',
          def: 'count',
          target: '',
          unit: '项',
          feature: '',
          collect: { kind: 'script', run: ['node', 'collect.mjs'], retro: true }
        }
      ]
    }
    const list = vi.fn(async (): Promise<MetricCatalog> => currentCatalog)
    const port: MetricsPort = {
      list,
      read: vi.fn(),
      refresh
    }
    const props = {
      goal: { ...plan.goals[0], metricTargets: [{ ref, target: '12', baseline: reading(3) }] },
      materialKey: 'test',
      port,
      scope: { repoId: 'repo', worktreeId: 'tree', hostId: 'local' },
      window: {
        kind: 'range' as const,
        since: '2026-09-01',
        until: '2026-09-02',
        granularity: 'day' as const,
        timezone: 'Asia/Shanghai'
      },
      disabled: false,
      onReadings: vi.fn()
    }
    const savedGoal = structuredClone(props.goal)
    await act(async () => root.render(<AcceptanceMetrics {...props} readings={[reading(3)]} />))
    await act(async () =>
      [...container.querySelectorAll('button')].find((item) => item.textContent === '采集')!.click()
    )
    expect(refresh).toHaveBeenNthCalledWith(1, {
      scope: props.scope,
      ref: currentRef,
      window: props.window
    })
    expect(props.onReadings).toHaveBeenCalledExactlyOnceWith(ref, ready.readings)
    await act(async () => root.render(<AcceptanceMetrics {...props} readings={[reading(3)]} />))
    expect(container.textContent).toContain('3项')
    expect(container.querySelector('.wb-metric-value')?.textContent).toBe('3项')
    await act(async () =>
      [...container.querySelectorAll('button')].find((item) => item.textContent === '采集')!.click()
    )
    expect(container.textContent).toContain('采集源不可用')
    expect(container.querySelector('.wb-metric-value')?.textContent).toBe('3项')
    expect(container.textContent).toContain('2026-09-25')
    expect(props.onReadings).toHaveBeenCalledTimes(1)

    list.mockResolvedValue({
      ...currentCatalog,
      definitions: [
        ...currentCatalog.definitions,
        { ...currentCatalog.definitions[0], ref: addedRef, name: addedRef.name }
      ]
    })
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-label="刷新指标目录"]')!.click()
    )
    const select = container.querySelector<HTMLSelectElement>('[aria-label="交付展示 验收指标"]')!
    expect([...select.options].map((option) => option.value)).toContain(addedRef.name)
    await act(async () => {
      select.value = addedRef.name
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () =>
      [...container.querySelectorAll('button')].find((item) => item.textContent === '采集')!.click()
    )
    expect(refresh).toHaveBeenLastCalledWith({
      scope: props.scope,
      ref: addedRef,
      window: props.window
    })
    expect(props.onReadings).toHaveBeenLastCalledWith(addedRef, [
      { ...ready.readings[0], ref: addedRef, value: 7 }
    ])
    expect(props.goal).toEqual(savedGoal)
  })
  it('explains invalid weekly boundaries and allows the same date range to be collected by day', async () => {
    const refresh = vi.fn(async () => ({
      status: 'unknown' as const,
      reason: { code: 'no-data', message: '暂无数据' }
    }))
    const goal = {
      ...plan.goals[0],
      metricTargets: [
        {
          ref: {
            name: '交付数量',
            definitionHash: `sha256:${'a'.repeat(64)}`,
            configurationCommit: '1'.repeat(40)
          },
          target: '1'
        }
      ]
    }
    const port: MetricsPort = {
      list: vi.fn(async (): Promise<MetricCatalog> => ({
        scope: { repoId: 'repo', worktreeId: 'tree', hostId: 'local' },
        configurationCommit: goal.metricTargets[0].ref.configurationCommit,
        configurationRef: 'main',
        timezone: 'Asia/Shanghai',
        problems: [],
        definitions: [
          {
            ref: goal.metricTargets[0].ref,
            name: '交付数量',
            role: 'lagging',
            def: 'count',
            target: '',
            unit: '项',
            feature: '',
            collect: { kind: 'script', run: ['node', 'collect.mjs'], retro: true }
          }
        ]
      })),
      read: vi.fn(),
      refresh
    }
    function WindowAndReading() {
      const [window, setWindow] = useState<MetricWindow>({
        kind: 'range',
        since: '2026-09-23',
        until: '2026-09-25',
        granularity: 'week',
        timezone: 'Asia/Shanghai'
      })
      return (
        <>
          <AcceptanceMetricWindow
            window={window}
            onChange={setWindow}
            disabled={false}
            error={null}
          />
          <AcceptanceMetrics
            goal={goal}
            materialKey="test"
            readings={[]}
            port={port}
            scope={{ repoId: 'repo', worktreeId: 'tree', hostId: 'local' }}
            window={window}
            disabled={false}
            onReadings={vi.fn()}
          />
        </>
      )
    }
    await act(async () => root.render(<WindowAndReading />))
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('周一到周一')
    const refreshButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '采集'
    )!
    expect(refreshButton.disabled).toBe(true)
    await act(async () => {
      const select = container.querySelector<HTMLSelectElement>('[aria-label="指标采集粒度"]')!
      select.value = 'day'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(refreshButton.disabled).toBe(false)
    await act(async () => refreshButton.click())
    expect(refresh).toHaveBeenCalledWith(
      expect.objectContaining({
        window: expect.objectContaining({
          granularity: 'day',
          since: '2026-09-23',
          until: '2026-09-25'
        })
      })
    )
  })
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
    const onChecks = vi.fn()
    const candidatePort: AcceptanceCandidatePort = {
      check: () => pending.promise,
      inspect: vi.fn(async () => ({
        artifactId: 'a',
        candidate: { kind: 'unknown', reason: '' },
        availability: { kind: 'unknown', reason: '' },
        execution: { kind: 'unknown', reason: '' }
      })),
      openFile: vi.fn()
    }
    const metricWindow = { window: null, setWindow: () => {}, error: null }
    await act(async () => {
      root.render(
        <AcceptanceSources
          document={original}
          hasMetrics={false}
          metricWindow={metricWindow}
          disabled={false}
          onPrepare={vi.fn()}
          candidatePort={candidatePort}
          onChecks={onChecks}
        />
      )
    })
    act(() => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === '检查文件与候选')!
        .click()
    })
    const changed = {
      ...original,
      candidateRef: { ...original.candidateRef!, commit: '3'.repeat(40) }
    }
    await act(async () => {
      root.render(
        <AcceptanceSources
          document={changed}
          hasMetrics={false}
          metricWindow={metricWindow}
          disabled={false}
          onPrepare={vi.fn()}
          candidatePort={candidatePort}
          onChecks={onChecks}
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
    expect(onChecks).not.toHaveBeenCalled()
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
