import { expect, it } from 'vitest'
import { decodeMetricDefinitions } from './definitions'

const commit = 'a'.repeat(40)
const raw = `schema_version = 2
[[feature]]
name = "需求对齐"
value = "确认前把承诺写清"
[[lagging]]
name = "结果"
def = "真实计数"
target = "3"
unit = "个"
collect = { kind = "script", run = ["python", "collect.py"], retro = true }
[[leading]]
name = "投入"
def = "真实计数"
collect = { kind = "script", run = ["python", "leading.py"], retro = true }
`

it('decodes schema2 features and resolves only an unambiguous leading relationship', () => {
  const result = decodeMetricDefinitions(raw, commit)
  expect(result.features).toEqual([{ name: '需求对齐', value: '确认前把承诺写清' }])
  expect(result.problems).toEqual([])
  const repeated = decodeMetricDefinitions(`${raw}[[feature]]\nname = "需求对齐"\n`, commit)
  expect(repeated.features).toEqual(result.features)
  expect(repeated.problems.map((problem) => problem.code)).toEqual(['ambiguous-feature'])
  expect(result.definitions).toHaveLength(2)
  expect(result.definitions[1].leads).toBe('结果')
  const changedTarget = decodeMetricDefinitions(raw.replace('target = "3"', 'target = "9"'), commit)
  expect(changedTarget.definitions[0].ref).toEqual(result.definitions[0].ref)
  const changedScript = decodeMetricDefinitions(raw.replace('collect.py', 'new-collect.py'), commit)
  expect(changedScript.definitions[0].ref.definitionHash).not.toBe(
    result.definitions[0].ref.definitionHash
  )
})

it('separates missing configuration, malformed files and manual definitions', () => {
  expect(decodeMetricDefinitions(null, commit).problems[0].code).toBe('not-configured')
  expect(decodeMetricDefinitions('schema_version = 2\n[broken', commit).problems[0].code).toBe(
    'invalid-definition'
  )
  const manual = decodeMetricDefinitions(
    'schema_version=2\n[north_star]\nname="待定义"\ndef="无来源"\ncollect={kind="manual"}',
    commit
  )
  expect(manual.definitions).toEqual([])
  expect(manual.problems[0].code).toBe('collector-required')
  const current = decodeMetricDefinitions(raw.replaceAll('retro = true', 'retro = false'), commit)
  expect(current.definitions).toEqual([])
  expect(current.problems.every((problem) => problem.code === 'history-required')).toBe(true)
})

it('excludes duplicate metric names and ambiguous implicit leading relationships', () => {
  const duplicate = decodeMetricDefinitions(raw.replace('name = "投入"', 'name = "结果"'), commit)
  expect(duplicate.definitions).toEqual([])
  expect(duplicate.problems.every((problem) => problem.code === 'ambiguous-name')).toBe(true)
  const ambiguous = decodeMetricDefinitions(
    `${raw}\n[[lagging]]\nname="另一结果"\ndef="真实计数"\ncollect={kind="script",run=["node","other.js"],retro=true}`,
    commit
  )
  expect(ambiguous.definitions.map((metric) => metric.name)).toEqual(['结果', '另一结果'])
  expect(ambiguous.problems[0].code).toBe('ambiguous-relation')
})
