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
  it('maps collector stdout: clean output passes through, truncation never yields partial JSON', () => {
    expect(interpretOutcome({ ...base }, 900_000)).toEqual({ stdout: '{"value":1}' })
    let error: unknown = null
    try {
      interpretOutcome({ ...base, outputTruncated: true, stdout: '{"value":1' }, 900_000)
    } catch (reason) {
      error = reason
    }
    expect(error).toBeInstanceOf(MetricCollectorError)
    expect((error as MetricCollectorError).code).toBe('output-truncated')
  })
  it('maps timeout and non-zero exit to typed collector errors instead of readings', () => {
    expect(() => interpretOutcome({ ...base, timedOut: true }, 900_000)).toThrowError(
      expect.objectContaining({
        name: 'MetricCollectorError',
        code: 'collector-timeout'
      })
    )
    expect(() => interpretOutcome({ ...base, code: 2, stderr: 'boom' }, 900_000)).toThrowError(
      expect.objectContaining({
        name: 'MetricCollectorError',
        code: 'collector-failed'
      })
    )
  })
})
