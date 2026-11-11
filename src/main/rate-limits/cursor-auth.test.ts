import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readCursorAuthSession } from './cursor-auth'
import { readKeychainPassword } from '../macos-keychain/generic-password'
import { readCursorDesktopProfile } from './cursor-desktop-state-db'

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }))
vi.mock('node:fs', () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => files.get(path)
}))
vi.mock('../macos-keychain/generic-password', () => ({ readKeychainPassword: vi.fn() }))
vi.mock('./cursor-desktop-state-db', () => ({ readCursorDesktopProfile: vi.fn() }))

const originalPlatform = process.platform
const options = {
  cliAuthPath: '/fixture/auth.json',
  cliConfigPath: '/fixture/cli-config.json',
  desktopStateDbPath: '/fixture/state.vscdb'
}

function jwt(subject: string, exp = 4_000_000_000): string {
  return `header.${Buffer.from(JSON.stringify({ sub: subject, exp })).toString('base64url')}.signature`
}

beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  files.clear()
  vi.mocked(readKeychainPassword).mockReset().mockResolvedValue(null)
  vi.mocked(readCursorDesktopProfile).mockReset().mockReturnValue({ status: 'missing' })
})
afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
})

describe('Cursor credential ownership', () => {
  it('prefers a live keychain login and falls through expired CLI logins to a live IDE session', async () => {
    files.set(options.cliAuthPath, JSON.stringify({ accessToken: jwt('cli') }))
    vi.mocked(readKeychainPassword).mockResolvedValue(jwt('keychain'))
    expect(await readCursorAuthSession(options)).toMatchObject({
      status: 'ok', session: { source: 'keychain', token: { subject: 'keychain' } }
    })
    expect(readCursorDesktopProfile).not.toHaveBeenCalled()

    vi.mocked(readKeychainPassword).mockResolvedValue(jwt('keychain', 1))
    files.set(options.cliAuthPath, JSON.stringify({ accessToken: jwt('cli', 1) }))
    vi.mocked(readCursorDesktopProfile).mockReturnValue({
      status: 'ok',
      profile: { accessToken: jwt('ide'), email: 'ide@example.test', membershipType: 'pro', subscriptionStatus: 'active' }
    })
    expect(await readCursorAuthSession(options)).toMatchObject({
      status: 'ok', session: { source: 'desktop', email: 'ide@example.test', token: { subject: 'ide' } }
    })
  })

  it('allows a CLI login through a denied keychain and returns missing without probing keychain on Windows', async () => {
    vi.mocked(readKeychainPassword).mockRejectedValue(new Error('/private/user/keychain denied'))
    files.set(options.cliAuthPath, JSON.stringify({ accessToken: jwt('cli') }))
    expect(await readCursorAuthSession(options)).toMatchObject({
      status: 'ok', session: { source: 'cli', token: { subject: 'cli' } }
    })

    vi.mocked(readKeychainPassword).mockClear()
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    files.clear()
    expect(await readCursorAuthSession(options)).toEqual({ status: 'missing' })
    expect(readKeychainPassword).not.toHaveBeenCalled()
  })
})
