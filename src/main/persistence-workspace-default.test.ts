import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type * as FsModule from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDefaultPersistedState, getDefaultWorkspaceDir } from '../shared/orca-profiles/constants'
import { Store } from './persistence/loading-store/store'
import { installFakeAppEnvironment } from '../../config/scripts/test-runtime/environment/vitest-host-ports-setup'
import { initDataPath } from './persistence/loading-store/user-data-path'
import { bootstrapProfileStateAuthority } from './persistence/profile-state/startup/profile-state-authority-bootstrap'
import { ProfileStateSqliteAuthority } from './persistence/profile-state/profile-state-sqlite-authority'
import { ProfileStateAuthorityBootstrapError } from './persistence/profile-state/recovery/profile-state-recovery-required'
import { profileStateDatabaseFile } from '../shared/orca-profiles/profile-state-storage-paths'
import {
  dataFile,
  readDataFile,
  testState,
  withPlatform,
  writeDataFile
} from './persistence/persistence-test-harness'

const { driveExists } = vi.hoisted(() => ({ driveExists: vi.fn(() => true) }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof FsModule>()
  return {
    ...actual,
    existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
      path === 'D:\\' ? driveExists() : actual.existsSync(path)
  }
})
vi.mock('electron', () => ({
  app: { getPath: () => testState.dir },
  safeStorage: { isEncryptionAvailable: () => false }
}))
vi.mock('./telemetry/client', () => ({ track: vi.fn() }))
vi.mock('./ssh/config/ssh-config-parser', () => ({
  loadUserSshConfig: vi.fn(() => ({ hosts: [] })),
  sshConfigHostsToTargets: vi.fn(() => [])
}))

describe('Workbench first-install workspace directory', () => {
  const stores: Store[] = []
  const openStore = () => {
    const boot = bootstrapProfileStateAuthority({
      dataFile: dataFile(),
      databaseFile: profileStateDatabaseFile(testState.dir),
      profileId: 'persistence-test',
      allowEmptyProfileState: true
    })
    if (!boot.authority) {
      throw new Error('SQLite profile authority is unavailable')
    }
    const store = new Store({
      dataFile: dataFile(),
      profileStateAuthority: boot.authority,
      initialAuthorityState: boot.initialState
    })
    stores.push(store)
    return store
  }

  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'workbench-workspace-default-'))
    vi.stubEnv('WORKBENCH_SHELL', '1')
    vi.stubEnv('ORCA_PRODUCT_NAME', 'Workbench')
    driveExists.mockReset().mockReturnValue(true)
    installFakeAppEnvironment({ getPath: () => testState.dir })
    initDataPath()
    vi.spyOn(ProfileStateSqliteAuthority.prototype, 'scheduleBackup').mockImplementation(() => {})
  })

  afterEach(async () => {
    for (const store of stores.splice(0)) {
      await store.freezeWritesAsync()
    }
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('persists the D drive default and preserves a later user change on reload', async () => {
    await withPlatform('win32', async () => {
      const store = openStore()
      expect(store.getSettings().workspaceDir).toBe('D:\\builders-workbench\\workspaces')
      store.flushOrThrow()
      expect(readDataFile()).toMatchObject({
        settings: { workspaceDir: 'D:\\builders-workbench\\workspaces' }
      })
      await store.freezeWritesAsync()
      const reloaded = openStore()
      expect(reloaded.getSettings().workspaceDir).toBe('D:\\builders-workbench\\workspaces')
      reloaded.updateSettings({ workspaceDir: 'C:\\chosen-by-user' })
      reloaded.flushOrThrow()
      await reloaded.freezeWritesAsync()
      expect(openStore().getSettings().workspaceDir).toBe('C:\\chosen-by-user')
    })
  })

  it('keeps the native fallback after a first install without D, even if D later appears', async () => {
    await withPlatform('win32', async () => {
      driveExists.mockReturnValue(false)
      const store = openStore()
      expect(store.getSettings().workspaceDir).toBe(getDefaultWorkspaceDir(homedir()))
      store.flushOrThrow()
      await store.freezeWritesAsync()
      driveExists.mockReturnValue(true)
      expect(openStore().getSettings().workspaceDir).toBe(getDefaultWorkspaceDir(homedir()))
    })
  })

  it.each([getDefaultWorkspaceDir(homedir()), 'E:\\existing-workspaces'])(
    'preserves an existing profile directory: %s',
    async (workspaceDir) => {
      writeDataFile({ settings: { workspaceDir } })
      await withPlatform('win32', async () => {
        expect(openStore().getSettings().workspaceDir).toBe(workspaceDir)
        expect(driveExists).not.toHaveBeenCalled()
      })
    }
  )

  it('restores the existing directory from a backup when the primary file is corrupt', async () => {
    const state = getDefaultPersistedState(homedir())
    state.settings.workspaceDir = 'E:\\restored-workspaces'
    writeFileSync(dataFile(), '{corrupt')
    writeFileSync(`${dataFile()}.bak.0`, JSON.stringify(state))
    await withPlatform('win32', async () => {
      expect(openStore().getSettings().workspaceDir).toBe('E:\\restored-workspaces')
      expect(driveExists).not.toHaveBeenCalled()
    })
  })

  it.each(['primary', 'backup'])(
    'does not treat a corrupt %s file as a new install',
    async (kind) => {
      writeFileSync(kind === 'primary' ? dataFile() : `${dataFile()}.bak.0`, '{corrupt')
      await withPlatform('win32', async () => {
        expect(() => openStore()).toThrow(ProfileStateAuthorityBootstrapError)
        expect(driveExists).not.toHaveBeenCalled()
      })
    }
  )

  it('leaves the Orca product default unchanged on Windows', async () => {
    vi.stubEnv('WORKBENCH_SHELL', '')
    vi.stubEnv('ORCA_PRODUCT_NAME', 'Orca')
    await withPlatform('win32', async () => {
      expect(openStore().getSettings().workspaceDir).toBe(getDefaultWorkspaceDir(homedir()))
      expect(driveExists).not.toHaveBeenCalled()
    })
  })

  it('leaves the Workbench default unchanged outside Windows', async () => {
    await withPlatform('linux', async () => {
      expect(openStore().getSettings().workspaceDir).toBe(getDefaultWorkspaceDir(homedir()))
      expect(driveExists).not.toHaveBeenCalled()
    })
  })
})
