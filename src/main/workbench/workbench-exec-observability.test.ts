// Span-attribute protocol guards for the BW exec wrappers (Issue #553 B 档):
// the closed-vocabulary attribute set (subcommand/arg_count/cwd/exit code) is
// the source-avoidance contract — argument values and stderr must never
// become attributes, only the redacted failure cause.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import {
  bwCommandExecFileAsync,
  bwGhExecFileAsync,
  collectorInterpreterLabel
} from './workbench-exec-observability'

const { ghExecMock, commandExecMock } = vi.hoisted(() => ({
  ghExecMock: vi.fn(),
  commandExecMock: vi.fn()
}))

vi.mock('../git/command-runner/gh-exec-file', () => ({
  ghExecFileAsync: ghExecMock
}))
vi.mock('../git/command-runner/command-exec-file', () => ({
  commandExecFileAsync: commandExecMock
}))

type SpanRecord = {
  name: string
  kind: string
  attributes: Record<string, unknown>
  exit: { _tag: string; cause?: string }
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

beforeEach(() => {
  records = []
  setActiveSink(sink)
  ghExecMock.mockReset()
  commandExecMock.mockReset()
})

afterEach(() => {
  _resetTracerForTests()
})

describe('BW exec wrappers', () => {
  it('records closed-vocabulary attributes and Success exit for gh calls', async () => {
    ghExecMock.mockResolvedValue({ stdout: '{}', stderr: '' })
    await bwGhExecFileAsync(['api', 'repos/a/b/issues/1/comments'], { cwd: 'C:\\repo\\one' })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      name: 'workbench.gh.exec',
      kind: 'client',
      exit: { _tag: 'Success' }
    })
    expect(records[0].attributes).toEqual({
      'gh.subcommand': 'api',
      'gh.arg_count': 2,
      cwd: 'C:\\repo\\one'
    })

    commandExecMock.mockResolvedValue({ stdout: 'ok', stderr: '' })
    await bwCommandExecFileAsync('cb', ['pipeline', 'list'])
    expect(records[1].name).toBe('workbench.cli.exec')
    expect(records[1].attributes).toEqual({ 'cli.name': 'cb', 'cli.arg_count': 2 })
    // Interpreter labels stay basename-safe: user-configured collector paths
    // must not leak directories into attributes.
    expect(collectorInterpreterLabel('C:\\Python312\\python.exe')).toBe('python.exe')
    expect(collectorInterpreterLabel('/usr/bin/node')).toBe('node')
    expect(collectorInterpreterLabel('weird interpreter!')).toBe('other')
  })

  it('records exit code and killed flags on failure, stderr only in the cause', async () => {
    const failure = Object.assign(new Error('Command failed: gh api\nrate limited'), {
      code: 2,
      timedOut: false,
      stderr: 'gh: rate limited'
    })
    ghExecMock.mockRejectedValue(failure)
    await expect(bwGhExecFileAsync(['api', 'x'], {})).rejects.toThrow('rate limited')

    expect(records[0].exit._tag).toBe('Failure')
    expect(records[0].attributes).toMatchObject({
      'gh.subcommand': 'api',
      status: 'failed',
      exitCode: 2
    })
    // Free text (stderr tail) lives only in the redactor-scrubbed cause.
    expect(records[0].exit.cause).toContain('rate limited')
    expect(records[0].attributes).not.toHaveProperty('stderr')

    // Real timeout shape from exec-file-capture: a killed flag and no numeric
    // exit code. (timedOut stays a defensive attribute for result-shaped
    // collector errors; exec error objects carry killed instead.)
    const killed = Object.assign(new Error('Command killed: cb run'), {
      code: null,
      killed: true
    })
    commandExecMock.mockRejectedValue(killed)
    await expect(bwCommandExecFileAsync('cb', ['run'], {})).rejects.toThrow('killed')
    expect(records[1].attributes).toMatchObject({ status: 'failed', killed: true })
    expect(records[1].attributes).not.toHaveProperty('exitCode')
  })
})
