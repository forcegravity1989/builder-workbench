import { describe, expect, it } from 'vitest'
import { interpretOutcome } from './metrics-runtime'
import { MetricCollectorError } from './metrics/collector-output'

const base = {
  stdout: '{"value":1}',
  stderr: '',
  code: 0,
  signal: null,
  timedOut: false,
  outputTruncated: false
}

describe('interpretOutcome', () => {
  it('passes clean stdout through', () => {
    expect(interpretOutcome({ ...base }, 900_000)).toEqual({ stdout: '{"value":1}' })
  })
  it('maps timeout to a collector error instead of readings', () => {
    expect(() => interpretOutcome({ ...base, timedOut: true }, 900_000)).toThrowError(
      expect.objectContaining({
        name: 'MetricCollectorError',
        code: 'collector-timeout'
      })
    )
  })
  it('maps truncated output to an unusable reading, never partial JSON', () => {
    let error: unknown = null
    try {
      interpretOutcome({ ...base, outputTruncated: true, stdout: '{"value":1' }, 900_000)
    } catch (reason) {
      error = reason
    }
    expect(error).toBeInstanceOf(MetricCollectorError)
    expect((error as MetricCollectorError).code).toBe('output-truncated')
  })
  it('maps non-zero exit with stderr tail to a collector failure', () => {
    expect(() => interpretOutcome({ ...base, code: 2, stderr: 'boom' }, 900_000)).toThrowError(
      expect.objectContaining({
        name: 'MetricCollectorError',
        code: 'collector-failed'
      })
    )
  })
})
