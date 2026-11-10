import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NodeCrypto from 'node:crypto'
import type * as NodeFs from 'node:fs'
import type { CookiesGetFilter } from 'electron'

const {
  appGetPathMock,
  createDecipherivMock,
  execFileSyncMock,
  sessionFromPartitionMock,
  dialogShowOpenDialogMock,
  setPendingCookieImportMock,
  clearPendingCookieImportMock,
  writeCookieIdentityMock
} = vi.hoisted(() => ({
  appGetPathMock: vi.fn(),
  createDecipherivMock: vi.fn(),
  execFileSyncMock: vi.fn(),
  sessionFromPartitionMock: vi.fn(),
  dialogShowOpenDialogMock: vi.fn(),
  setPendingCookieImportMock: vi.fn(),
  clearPendingCookieImportMock: vi.fn(),
  writeCookieIdentityMock: vi.fn()
}))

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof NodeCrypto>()
  createDecipherivMock.mockImplementation(original.createDecipheriv)
  return { ...original, createDecipheriv: createDecipherivMock }
})
vi.mock('../../sessions/profiles/browser-session-registry', () => ({
  browserSessionRegistry: {
    setPendingCookieImport: setPendingCookieImportMock,
    clearPendingCookieImport: clearPendingCookieImportMock
  }
}))
vi.mock('node:child_process', () => ({ execFileSync: execFileSyncMock }))
vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof NodeFs>()) }))
vi.mock('electron', () => ({
  app: { getPath: appGetPathMock },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: dialogShowOpenDialogMock },
  session: { fromPartition: sessionFromPartitionMock }
}))
vi.mock('../browser-cookie-clear-store', () => ({
  openCookieClearStore: (targetSession: {
    cookies: {
      get: (filter: CookiesGetFilter) => Promise<unknown>
      remove: (url: string, name: string) => Promise<void>
    }
  }) => ({
    get: (filter: CookiesGetFilter) => targetSession.cookies.get(filter),
    remove: (url: string, name: string) => targetSession.cookies.remove(url, name),
    snapshotClearIdentities: async (items: { cookie: Record<string, unknown>; url: string }[]) =>
      items.map(({ cookie, url }) => ({ url, ...cookie })),
    restoreClearIdentities: async () => undefined,
    // Why (STA-4300): imports write through the CDP identity store, not cookies.set. A store double
    // missing this method throws a TypeError the per-cookie catch swallows, routing every write
    // down the rejected path while the suite still looks green.
    writeCookieIdentity: writeCookieIdentityMock,
    dispose: () => undefined
  })
}))

import { importCookiesFromBrowser } from '../browser-cookie-import'
import type { DetectedBrowser } from './browser-cookie-source-profiles'
import { createChromiumCookieTestDatabase } from '../browser-cookie-import-test-database'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function chromeBrowser(cookiesPath: string): DetectedBrowser {
  return {
    family: 'chrome',
    label: 'Google Chrome',
    cookiesPath,
    keychainService: 'Chrome Safe Storage',
    keychainAccount: 'Chrome',
    profiles: [{ name: 'Default', directory: 'Default' }],
    selectedProfile: 'Default'
  }
}

describe('importCookiesFromBrowser — undecryptable cookies', () => {
  let tmpDir: string
  let cookiesSetMock: ReturnType<typeof vi.fn>
  let cookiesRemoveMock: ReturnType<typeof vi.fn>
  let clearDataMock: ReturnType<typeof vi.fn>
  let targetJar: Record<string, unknown>[]
  let platformSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'orca-linux-keyring-test-'))
    cookiesSetMock = vi.fn().mockResolvedValue(undefined)
    targetJar = []
    cookiesRemoveMock = vi.fn(async (_url: string, name: string) => {
      const index = targetJar.findIndex((cookie) => cookie.name === name)
      if (index !== -1) {
        targetJar.splice(index, 1)
      }
    })
    clearDataMock = vi.fn(async () => {
      targetJar.splice(0)
    })
    writeCookieIdentityMock.mockReset().mockResolvedValue(undefined)
    appGetPathMock.mockReturnValue(join(tmpDir, 'userData'))
    sessionFromPartitionMock.mockReturnValue({
      cookies: {
        get: vi.fn(async () => targetJar),
        set: cookiesSetMock,
        remove: cookiesRemoveMock,
        flushStore: vi.fn().mockResolvedValue(undefined)
      },
      clearData: clearDataMock,
      setUserAgent: vi.fn(),
      // Why (STA-4300): the importer derives the partition dir from the session rather than
      // trusting a caller-supplied partition, so the double must expose it.
      getStoragePath: vi.fn().mockReturnValue(join(tmpDir, 'userData', 'Partitions', 'test'))
    })
    platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    // Why: both secret-tool lookups failing is exactly the keyring-unavailable case.
    execFileSyncMock.mockImplementation(() => {
      throw new Error('secret-tool: no such service')
    })
  })

  afterEach(() => {
    platformSpy.mockRestore()
    vi.clearAllMocks()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function seedProfile(...encryptedValues: Buffer[]): string {
    const sourceCookiesPath = join(tmpDir, 'Chrome', 'Default', 'Network', 'Cookies')
    createChromiumCookieTestDatabase(
      sourceCookiesPath,
      encryptedValues.map((encryptedValue, index) => ({
        name: `sid-${index}`,
        value: '',
        encryptedValue
      }))
    ).close()
    createChromiumCookieTestDatabase(
      join(tmpDir, 'userData', 'Partitions', 'test', 'Network', 'Cookies'),
      []
    ).close()
    return sourceCookiesPath
  }

  it('reports Windows app-bound (v20) cookies rather than an empty success', async () => {
    // Why: Chrome/Edge 140+ v20 rows can only be unwrapped by the writing browser.
    const sourceCookiesPath = seedProfile(
      Buffer.concat([Buffer.from('v20'), Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])])
    )

    const result = await importCookiesFromBrowser(chromeBrowser(sourceCookiesPath), 'persist:test')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.summary.importedCookies).toBe(0)
    expect(result.summary.warning).toEqual({
      code: 'cookies-undecryptable',
      failedCookies: 1,
      reason: 'app-bound-encryption'
    })
  })
})
