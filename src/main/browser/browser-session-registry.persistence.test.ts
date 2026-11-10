import { beforeEach, describe, expect, it, vi } from 'vitest'

const USER_DATA = '/user-data'
const META_PATH = `${USER_DATA}/browser-session-meta.json`
const RAW_ELECTRON_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Orca/1.4.198 Chrome/150.0.7871.224 Electron/43.4.1 Safari/537.36'
const CLEAN_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.224 Safari/537.36'

type FsState = {
  files: Map<string, string>
  present: Set<string>
}

function fsKey(pathValue: string): string {
  return pathValue.replaceAll('\\', '/')
}

function createFsState(): FsState {
  return { files: new Map(), present: new Set() }
}

function seedMeta(fsState: FsState, meta: unknown): void {
  const raw = JSON.stringify(meta)
  fsState.files.set(META_PATH, raw)
  fsState.present.add(META_PATH)
}

function installModuleMocks(
  fsState: FsState,
  copyFailures = new Set<string>()
): {
  sessionFromPartitionMock: ReturnType<typeof vi.fn>
  cleanElectronUserAgentMock: ReturnType<typeof vi.fn>
  setupGoogleAuthUserAgentOverrideMock: ReturnType<typeof vi.fn>
  browserManagerHandleGuestWillDownloadMock: ReturnType<typeof vi.fn>
  browserManagerNotifyPermissionDeniedMock: ReturnType<typeof vi.fn>
  requestSystemMediaAccessMock: ReturnType<typeof vi.fn>
} {
  const sessionFromPartitionMock = vi.fn((partition: string) => ({
    partition,
    setUserAgent: vi.fn(),
    getUserAgent: vi.fn(() => RAW_ELECTRON_USER_AGENT),
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    setDevicePermissionHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    clearStorageData: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined)
  }))
  const cleanElectronUserAgentMock = vi.fn(() => CLEAN_USER_AGENT)
  const setupGoogleAuthUserAgentOverrideMock = vi.fn()
  const browserManagerHandleGuestWillDownloadMock = vi.fn()
  const browserManagerNotifyPermissionDeniedMock = vi.fn()
  const requestSystemMediaAccessMock = vi.fn().mockResolvedValue(true)

  vi.doMock('electron', () => ({
    app: { getPath: vi.fn(() => USER_DATA) },
    session: { fromPartition: sessionFromPartitionMock },
    systemPreferences: {
      askForMediaAccess: vi.fn().mockResolvedValue(true),
      getMediaAccessStatus: vi.fn(() => 'granted')
    }
  }))

  vi.doMock('node:fs', () => ({
    copyFileSync: vi.fn((src: string, dst: string) => {
      const sourceKey = fsKey(src)
      const destinationKey = fsKey(dst)
      if (copyFailures.has(sourceKey)) {
        throw new Error(`copy fail for ${src}`)
      }
      fsState.present.add(destinationKey)
      const value = fsState.files.get(sourceKey)
      if (value !== undefined) {
        fsState.files.set(destinationKey, value)
      }
    }),
    existsSync: vi.fn((p: string) => fsState.present.has(fsKey(p))),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((p: string) => {
      const v = fsState.files.get(fsKey(p))
      if (v === undefined) {
        throw new Error('ENOENT')
      }
      return v
    }),
    renameSync: vi.fn((from: string, to: string) => {
      const sourceKey = fsKey(from)
      const destinationKey = fsKey(to)
      const v = fsState.files.get(sourceKey)
      if (v === undefined) {
        throw new Error('ENOENT')
      }
      fsState.files.set(destinationKey, v)
      fsState.present.add(destinationKey)
      fsState.files.delete(sourceKey)
      fsState.present.delete(sourceKey)
    }),
    unlinkSync: vi.fn((p: string) => {
      const key = fsKey(p)
      fsState.present.delete(key)
      fsState.files.delete(key)
    }),
    writeFileSync: vi.fn((p: string, data: string | Uint8Array) => {
      const value = typeof data === 'string' ? data : Buffer.from(data).toString('utf-8')
      const key = fsKey(p)
      fsState.files.set(key, value)
      fsState.present.add(key)
    })
  }))

  vi.doMock('./guest-lifecycle/manager/browser-manager', () => ({
    browserManager: {
      notifyPermissionDenied: browserManagerNotifyPermissionDeniedMock,
      handleGuestWillDownload: browserManagerHandleGuestWillDownloadMock,
      installCertificateRequestGuard: vi.fn(),
      removeCertificateRequestGuard: vi.fn()
    }
  }))
  vi.doMock('./site-settings/permissions/browser-media-access', () => ({
    hasSystemMediaAccess: vi.fn(() => true),
    requestSystemMediaAccess: requestSystemMediaAccessMock
  }))
  vi.doMock('./identity/requests/browser-session-ua', () => ({
    cleanElectronUserAgent: cleanElectronUserAgentMock,
    setupGoogleAuthUserAgentOverride: setupGoogleAuthUserAgentOverrideMock
  }))
  // This suite models replay with an in-memory filesystem. The real file-backed SQLite merge has
  // dedicated coverage; these fixtures are legacy unmarked images and keep the copy path.
  vi.doMock('./cookies/staging/browser-cookie-staged-import', () => ({
    SCOPED_COOKIE_IMPORT_FORMAT: 'scoped-v1',
    applyScopedStagedCookieImport: vi.fn(() => false),
    isScopedStagedCookieImport: vi.fn(() => false),
    removeCookieImportScopeMarker: vi.fn()
  }))
  vi.doMock('../codex-accounts/fs-utils', () => ({
    renameFileWithWindowsRetry: vi.fn((source: string, target: string) => {
      const sourceKey = fsKey(source)
      const targetKey = fsKey(target)
      if (!fsState.present.has(sourceKey)) {
        throw new Error('ENOENT')
      }
      const value = fsState.files.get(sourceKey)
      fsState.present.delete(sourceKey)
      fsState.files.delete(sourceKey)
      fsState.present.add(targetKey)
      if (value !== undefined) {
        fsState.files.set(targetKey, value)
      }
    })
  }))

  return {
    sessionFromPartitionMock,
    cleanElectronUserAgentMock,
    setupGoogleAuthUserAgentOverrideMock,
    browserManagerHandleGuestWillDownloadMock,
    browserManagerNotifyPermissionDeniedMock,
    requestSystemMediaAccessMock
  }
}

describe('BrowserSessionRegistry persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('clears only the requested partition and unlinks its staged database files', async () => {
    const otherPartition = 'persist:orca-browser-session-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const fsState = createFsState()
    seedMeta(fsState, {
      defaultSource: null,
      userAgent: null,
      userAgentByPartition: {},
      pendingCookieDbPath: '/staged/default',
      pendingCookieImports: {
        'persist:orca-browser': '/staged/default',
        [otherPartition]: '/staged/other'
      },
      profiles: []
    })
    for (const suffix of ['', '-wal', '-shm']) {
      fsState.files.set(`/staged/other${suffix}`, 'db')
      fsState.present.add(`/staged/other${suffix}`)
      fsState.files.set(`/staged/default${suffix}`, 'db')
      fsState.present.add(`/staged/default${suffix}`)
    }

    installModuleMocks(fsState)
    const { browserSessionRegistry } = await import('./sessions/profiles/browser-session-registry')

    browserSessionRegistry.clearPendingCookieImport(otherPartition)

    const written = JSON.parse(fsState.files.get(META_PATH) ?? '{}')
    expect(written.pendingCookieImports).toEqual({ 'persist:orca-browser': '/staged/default' })
    // Why: the default partition still has a staged replay, so the legacy pointer must survive.
    expect(written.pendingCookieDbPath).toBe('/staged/default')
    for (const suffix of ['', '-wal', '-shm']) {
      expect(fsState.present.has(`/staged/other${suffix}`)).toBe(false)
      expect(fsState.present.has(`/staged/default${suffix}`)).toBe(true)
    }
  })

  it('ignores pending cookie imports for invalid persisted profile partitions', async () => {
    const invalidPartition = 'persist:../../outside'
    const fsState = createFsState()
    seedMeta(fsState, {
      defaultSource: null,
      userAgent: null,
      userAgentByPartition: {},
      pendingCookieDbPath: null,
      pendingCookieImports: {
        [invalidPartition]: '/staged/evil'
      },
      profiles: [
        {
          id: 'profile-1',
          scope: 'imported',
          partition: invalidPartition,
          label: 'Invalid',
          source: null
        }
      ]
    })
    fsState.present.add('/staged/evil')

    installModuleMocks(fsState)
    const { browserSessionRegistry } = await import('./sessions/profiles/browser-session-registry')

    browserSessionRegistry.applyPendingCookieImport()

    const written = JSON.parse(fsState.files.get(META_PATH) ?? '{}')
    expect(written.pendingCookieImports).toEqual({})
    expect(fsState.present.has('/outside/Cookies')).toBe(false)
  })
})
