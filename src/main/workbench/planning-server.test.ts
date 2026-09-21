import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parsePlanningStartStdout,
  pickPlanningVersion,
  planningScriptCandidates,
  planningStartUrlIsLocal,
  pythonCandidates
} from './planning-server'

describe('pickPlanningVersion', () => {
  it('uses default when nothing is on disk', () => {
    expect(pickPlanningVersion([])).toBe('default')
  })

  it('prefers the newest named version over default', () => {
    expect(
      pickPlanningVersion([
        { version: 'default', mtimeMs: 90 },
        { version: 'v0.3', mtimeMs: 10 },
        { version: 'v0.4', mtimeMs: 50 }
      ])
    ).toBe('v0.4')
  })

  it('falls back to default when that is the only version', () => {
    expect(pickPlanningVersion([{ version: 'default', mtimeMs: 1 }])).toBe('default')
  })
})

describe('planningStartUrlIsLocal', () => {
  it('accepts loopback http with a port', () => {
    expect(planningStartUrlIsLocal('http://127.0.0.1:54321/?version=v0.4#token=abc')).toBe(true)
  })

  it('rejects non-loopback hosts', () => {
    expect(planningStartUrlIsLocal('http://example.test:80/?version=v0.4')).toBe(false)
  })
})

describe('parsePlanningStartStdout', () => {
  it('reads url and data path', () => {
    expect(
      parsePlanningStartStdout(
        JSON.stringify({
          url: 'http://127.0.0.1:9/?version=default#token=x',
          data: '/tmp/.bw/planning/default/data.json',
          reused: true
        })
      )
    ).toEqual({
      url: 'http://127.0.0.1:9/?version=default#token=x',
      data: '/tmp/.bw/planning/default/data.json',
      reused: true
    })
  })

  it('rejects a missing local url', () => {
    expect(() => parsePlanningStartStdout('{"url":"https://example.test/"}')).toThrow(
      '规划服务没有返回本机地址'
    )
  })
})

describe('planningScriptCandidates', () => {
  it('searches app, cwd, and packaged resource trees', () => {
    const rel = join('standard', 'skills', 'week-planning', 'scripts', 'planning.py')
    expect(planningScriptCandidates('/app', '/cwd', '/res')).toEqual([
      join('/app', rel),
      join('/cwd', rel),
      join('/res', rel),
      join('/res', 'app.asar.unpacked', rel)
    ])
  })
})

describe('pythonCandidates', () => {
  it('prefers python3 on macOS', () => {
    expect(pythonCandidates('darwin')).toEqual(['python3', 'python'])
  })

  it('prefers python on Windows', () => {
    expect(pythonCandidates('win32')).toEqual(['python', 'py'])
  })
})
