import { expect, it } from 'vitest'
import type { MetricCatalog, MetricDefinition } from '../../../shared/workbench/metrics'
import type { PlanningMaterial } from '../../../shared/workbench/version-planning-material'
import { buildScoreboardScenes, targetVerdict } from './overview-scoreboard-model'

function def(overrides: Partial<MetricDefinition> & { name: string }): MetricDefinition {
  return {
    ref: { name: overrides.name, definitionHash: `h-${overrides.name}`, configurationCommit: 'a' },
    role: 'lagging',
    def: overrides.name,
    target: '',
    unit: '',
    feature: '',
    collect: { kind: 'script', run: ['node', 'x.js'], retro: true },
    ...overrides
  }
}

const catalog = {
  features: [
    { name: '需求对齐', value: '确认前写清承诺' },
    { name: '需求验收', value: '' },
    { name: '项目上下文', value: '只写一次' }
  ],
  definitions: [
    def({ name: '北极星', role: 'north_star' }),
    def({ name: '修改程度', feature: '需求对齐' }),
    def({ name: '准备耗时', role: 'leading', feature: '需求对齐', leads: '修改程度' }),
    def({ name: '可核对率', feature: '需求验收' }),
    def({ name: '别的引领', role: 'leading', feature: '需求验收', leads: '另一结果' }),
    def({ name: '验收耗时', role: 'leading', feature: '需求验收', leads: '可核对率' }),
    def({ name: '另一结果', feature: '需求验收' }),
    def({ name: '闭环数' })
  ]
} as unknown as MetricCatalog

function plan(targets: { name: string; target: string }[]): PlanningMaterial {
  return {
    goals: [
      {
        goalId: 'g1',
        title: '目标',
        metricTargets: targets.map((item) => ({
          ref: { name: item.name, definitionHash: 'x', configurationCommit: 'a' },
          target: item.target
        }))
      }
    ]
  } as unknown as PlanningMaterial
}

it('按声明顺序排场景，每签配一结果一引领，不借用关联其他结果的引领，多余指标保留，空特性归主要页签', () => {
  const scenes = buildScoreboardScenes(catalog, null)
  expect(scenes.map((scene) => scene.name)).toEqual(['需求对齐', '需求验收', '项目上下文', '主要'])
  expect(scenes[0]).toMatchObject({ value: '确认前写清承诺', focus: null })
  expect([scenes[1].lagging?.name, scenes[1].leading?.name]).toEqual(['可核对率', '验收耗时'])
  expect(scenes[1].others.map((item) => item.name)).toEqual(['别的引领', '另一结果'])
  expect([scenes[2].lagging, scenes[2].leading]).toEqual([null, null])
  expect(buildScoreboardScenes(null, null)).toEqual([])
})

it('聚焦只由计划里写了目标值的指标决定，计划指标占展示位，结果的完成线优先，聚焦场景排前', () => {
  const scenes = buildScoreboardScenes(
    catalog,
    plan([
      { name: '验收耗时', target: '≤4' },
      { name: '可核对率', target: '≥80' },
      { name: '准备耗时', target: '  ' }
    ])
  )
  expect(scenes.map((scene) => scene.name)).toEqual(['需求验收', '需求对齐', '项目上下文', '主要'])
  expect(scenes[0].focus).toEqual({ metric: '可核对率', target: '≥80' })
  expect(scenes[0].targets).toEqual({ 可核对率: '≥80', 验收耗时: '≤4' })
  expect(scenes[1].focus).toBeNull()
  const planned = buildScoreboardScenes(catalog, plan([{ name: '另一结果', target: '≥1' }]))[0]
  expect([planned.lagging?.name, planned.leading?.name]).toEqual(['另一结果', '别的引领'])
  expect(planned.focus).toEqual({ metric: '另一结果', target: '≥1' })
})

it('只有写明比较方向且单位一致的完成线才判输赢', () => {
  expect(targetVerdict('≥3', 3, '')).toBe('met')
  expect(targetVerdict('<= 15%', 33, '%')).toBe('unmet')
  expect(targetVerdict('<2', 1.5, '小时')).toBe('met')
  expect(targetVerdict('3', 3, '')).toBeNull()
  expect(targetVerdict('≤15%', 10, '小时')).toBeNull()
  expect(targetVerdict('提升', 10, '')).toBeNull()
})
