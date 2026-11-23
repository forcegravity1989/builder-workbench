import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import { listCloudDragonPipelines } from './cloud-dragon-cli-ops'
import {
  bwCbExecFileAsync,
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
vi.mock('./cloud-dragon-package-ops', () => ({ CLOUDDRAGON_PROJECT_ID: 'fixture-group' }))

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
    await bwCbExecFileAsync(['pipeline', 'list'])
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
    expect(records[0].exit.cause).toContain('rate limited')
    expect(records[0].exit.cause).not.toContain('Command failed:')
    expect(records[0].attributes).not.toHaveProperty('stderr')

    const killed = Object.assign(new Error('gh timed out.'), {
      code: null,
      killed: true
    })
    ghExecMock.mockRejectedValue(killed)
    await expect(bwGhExecFileAsync(['run'], {})).rejects.toBe(killed)
    expect(records[1].attributes).toMatchObject({ status: 'failed', timedOut: true, killed: true })
    expect(records[1].attributes).not.toHaveProperty('exitCode')

    const shimFailure = Object.assign(new Error('C:\\bin\\cb.cmd exited with 7.'), {
      stderr: 'pipeline denied, token=fixture-credential',
      stdout: 'private result'
    })
    commandExecMock.mockRejectedValue(shimFailure)
    await expect(bwCbExecFileAsync(['pipeline', 'list'])).rejects.toBe(shimFailure)
    expect(records[2]).toMatchObject({
      attributes: { status: 'failed', exitCode: 7 },
      exit: { _tag: 'Failure', cause: 'cb exited 7: pipeline denied, [redacted:labeled-kv]' }
    })

    const truncated = Object.assign(new Error('cb.cmd stderr exceeded maxBuffer.'), {
      stderr: '-----BEGIN PRIVATE KEY-----\npartial-key'
    })
    commandExecMock.mockRejectedValue(truncated)
    await expect(listCloudDragonPipelines()).rejects.toMatchObject({
      code: 'cb-failed',
      message: 'cb 命令输出超出上限，无法读取流水线结果'
    })
    expect(records[3]).toMatchObject({
      attributes: { outputTruncated: true },
      exit: { _tag: 'Failure', cause: 'cb output truncated' }
    })

    const aborted = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
      killed: true
    })
    ghExecMock.mockRejectedValue(aborted)
    await expect(bwGhExecFileAsync(['api', 'y'], {})).rejects.toThrow('aborted')
    expect(records[4].exit._tag).toBe('Interrupted')
    expect(records[4].attributes).not.toHaveProperty('status')
    expect(records[4].attributes).not.toHaveProperty('killed')
  })
})
