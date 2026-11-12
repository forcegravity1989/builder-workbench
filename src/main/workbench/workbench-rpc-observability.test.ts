import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { _resetTracerForTests, setActiveSink, type TracerSink } from '../observability/tracer'
import { defineWorkbenchMethod } from './workbench-rpc-observability'

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
})

afterEach(() => {
  _resetTracerForTests()
})

const params = z.object({ value: z.string() })
const input = { value: 'v' }
const ctx = { runtime: {} } as never

describe('defineWorkbenchMethod', () => {
  it('passes ok-envelope and raw results through as Success server spans', async () => {
    const enveloped = defineWorkbenchMethod({
      name: 'workbench.test.read',
      params,
      handler: async () => ({ ok: true, value: 42 })
    })
    expect(await enveloped.handler(input, ctx)).toEqual({ ok: true, value: 42 })
    expect(records[0].name).toBe('workbench.test.read')
    expect(records[0].kind).toBe('server')
    expect(records[0].exit._tag).toBe('Success')
    expect(records[0].attributes.status).toBeUndefined()

    const raw = defineWorkbenchMethod({
      name: 'workbench.test.raw',
      params,
      handler: () => ({ complete: true })
    })
    expect(await raw.handler(input, ctx)).toEqual({ complete: true })
    expect(records[1].exit._tag).toBe('Success')
    expect(records[1].attributes.errorCode).toBeUndefined()
  })

  it('records errorCode and a redactable cause for ok:false envelopes', async () => {
    const failing = defineWorkbenchMethod({
      name: 'workbench.test.save',
      params,
      handler: async () => ({
        ok: false as const,
        error: { code: 'revision-conflict', message: 'stale revision' }
      })
    })
    expect(await failing.handler(input, ctx)).toEqual({
      ok: false,
      error: { code: 'revision-conflict', message: 'stale revision' }
    })
    expect(records[0].exit._tag).toBe('Failure')
    expect(records[0].attributes).toMatchObject({
      status: 'failed',
      errorCode: 'revision-conflict'
    })
    expect(records[0].exit.cause).toBe('revision-conflict: stale revision')

    const badCode = defineWorkbenchMethod({
      name: 'workbench.test.badcode',
      params,
      handler: async () => ({ ok: false as const, error: { code: 'not a code!', message: 'x' } })
    })
    await badCode.handler(input, ctx)
    expect(records[1].attributes.errorCode).toBe('workbench-error')
    expect(records[1].attributes).not.toHaveProperty('message')
  })

  it('records Failure with the error chain for throws, Interrupted for AbortError', async () => {
    const throwing = defineWorkbenchMethod({
      name: 'workbench.test.throw',
      params,
      handler: async (): Promise<never> => {
        throw new Error('boom')
      }
    })
    await expect(throwing.handler(input, ctx)).rejects.toThrow('boom')
    expect(records[0].exit._tag).toBe('Failure')
    expect(records[0].exit.cause).toContain('boom')
    expect(records[0].attributes.errorCode).toBeUndefined()

    const aborting = defineWorkbenchMethod({
      name: 'workbench.test.abort',
      params,
      handler: async (): Promise<never> => {
        const err = new Error('aborted')
        err.name = 'AbortError'
        throw err
      }
    })
    await expect(aborting.handler(input, ctx)).rejects.toThrow('aborted')
    expect(records[1].exit._tag).toBe('Interrupted')
  })

  it('every workbench RPC method file registers through defineWorkbenchMethod', () => {
    const dir = join(__dirname, '..', 'runtime', 'rpc', 'methods')
    const files = readdirSync(dir).filter((f) => /^workbench-.*\.ts$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter((f) => {
      const text = readFileSync(join(dir, f), 'utf8')
      return /\bdefineMethod\s*\(/.test(text) || !text.includes('defineWorkbenchMethod(')
    })
    expect(offenders, offenders.join(', ')).toEqual([])
  })
})
