import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { restrictWindowsPath } from './secure-path-windows-acl'
import { writeSecureJsonFileAsync } from './secure-file-async'

vi.mock('./secure-path-windows-acl', () => ({ restrictWindowsPath: vi.fn() }))

describe('asynchronous secure publication', () => {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
  let directory: string
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    directory = mkdtempSync(join(tmpdir(), 'bw-async-secure-'))
    vi.mocked(restrictWindowsPath).mockReset().mockResolvedValue(true)
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', platform)
    rmSync(directory, { recursive: true, force: true })
  })

  it('keeps the published credential unchanged while permission work yields to the event loop', async () => {
    const target = join(directory, 'credential.json')
    writeFileSync(target, 'original')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    vi.mocked(restrictWindowsPath).mockImplementation(async (path) => {
      if (path.endsWith('.tmp')) {
        await gate
      }
      return true
    })
    const writing = writeSecureJsonFileAsync(target, { token: 'replacement' })
    await vi.waitFor(() =>
      expect(readdirSync(directory).some((path) => path.endsWith('.tmp'))).toBe(true)
    )
    expect(readFileSync(target, 'utf8')).toBe('original')
    release()
    await expect(writing).resolves.toBe(true)
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ token: 'replacement' })
    expect(readdirSync(directory)).toEqual(['credential.json'])
  })

  it('serializes overlapping writes so the latest record stays published', async () => {
    const target = join(directory, 'runtime.json')
    const writes = [
      writeSecureJsonFileAsync(target, { generation: 1 }),
      writeSecureJsonFileAsync(target, { generation: 2 })
    ]
    await expect(Promise.all(writes)).resolves.toEqual([true, true])
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ generation: 2 })
    expect(readdirSync(directory)).toEqual(['runtime.json'])
  })

  it('removes an unpublished temporary file and allows the next write after a failure', async () => {
    const target = join(directory, 'runtime.json')
    vi.mocked(restrictWindowsPath).mockImplementation(async (path) => {
      if (path.endsWith('.tmp')) {
        throw new Error('permission worker failed')
      }
      return true
    })
    await expect(writeSecureJsonFileAsync(target, { generation: 1 })).rejects.toThrow(
      'permission worker failed'
    )
    expect(existsSync(target)).toBe(false)
    expect(readdirSync(directory)).toEqual([])
    vi.mocked(restrictWindowsPath).mockResolvedValue(true)
    await expect(writeSecureJsonFileAsync(target, { generation: 2 })).resolves.toBe(true)
  })

  it('reports an ACL failure rather than claiming a protected file', async () => {
    vi.mocked(restrictWindowsPath).mockResolvedValue(false)
    await expect(writeSecureJsonFileAsync(join(directory, 'runtime.json'), {})).resolves.toBe(false)
  })
})
