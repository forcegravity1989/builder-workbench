// Phase-attribute protocol guard (Issue #553 C 档): mark() OPENS a phase
// (start convention), so each `${phase}Ms` must measure the work that follows
// its own mark — the controlled delays below lock label↔work correspondence
// (the off-by-one attribution defect independent review caught in the first
// cut). Unsafe phase labels must not become attribute keys.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import { withPhaseSpan } from './workbench-phase-observability'

type SpanRecord = {
  name: string
  attributes: Record<string, unknown>
  events: { name: string }[]
  exit: { _tag: string }
}

let records: SpanRecord[] = []

const sink: TracerSink = {
  push(record) {
    records.push(record as SpanRecord)
  },
  flush() {
    /* no-op */
  },
  close() {
    /* no-op */
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  records = []
  setActiveSink(sink)
})

afterEach(() => {
  _resetTracerForTests()
})

describe('withPhaseSpan', () => {
  it('attributes each phase duration to its own label, sanitizes keys, and closes on failure', async () => {
    const result = await withPhaseSpan(
      'workbench.test.flow',
      async (_span, mark) => {
        mark('resolve')
        await sleep(40)
        mark('provider')
        await sleep(10)
        mark('not a safe phase!')
        return 42
      },
      { 'flow.kind': 'test' }
    )

    expect(result).toBe(42)
    expect(records).toHaveLength(1)
    const record = records[0]
    expect(record.name).toBe('workbench.test.flow')
    expect(record.exit._tag).toBe('Success')
    expect(record.attributes['flow.kind']).toBe('test')
    // Label↔work correspondence: resolveMs covers the 40ms sleep that
    // follows mark('resolve'); providerMs only the 10ms one.
    expect(record.attributes.resolveMs).toBeGreaterThanOrEqual(35)
    expect(record.attributes.providerMs).toBeGreaterThanOrEqual(8)
    expect(record.attributes.resolveMs as number).toBeGreaterThan(
      record.attributes.providerMs as number
    )
    // The final (sanitized) phase closes at span end.
    expect(typeof record.attributes.phaseMs).toBe('number')
    expect(record.events.map((event) => event.name)).toEqual([
      'phase.resolve',
      'phase.provider',
      'phase.phase'
    ])

    // Failure closes the in-flight phase so its partial duration survives.
    await expect(
      withPhaseSpan('workbench.test.boom', async (_span, mark) => {
        mark('work')
        await sleep(15)
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(records[1].exit._tag).toBe('Failure')
    expect(records[1].attributes.workMs).toBeGreaterThanOrEqual(10)
  })
})
