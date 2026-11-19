import { readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { writeSecureJsonFileAsync } from '../../shared/secure-file-async'

/**
 * Deployment endpoint compiled into the client. Changing it requires a reviewed code change,
 * the same way the Workbench report group is fixed in code instead of user settings.
 */
export const SHARE_SERVER_URL = 'http://7.192.170.220:8787'

/**
 * Must match `DEFAULT_ENROLL_KEY` on the service. It only keeps unrelated network clients from
 * minting upload tokens; it is not a secret against anyone who can read this repository.
 */
export const SHARE_ENROLL_KEY = 'bwshare-enroll-7d41c9ab6e2f5083'

type StoredShareClient = { version: 2; uploadToken: string }

/**
 * The per-device upload token is minted on first use and kept in a Workbench-owned file, so a
 * user never copies or pastes credentials. The renderer never sees the token.
 */
export function createShareTokenStore(options: { dataDir: () => string }): {
  read: () => Promise<string>
  save: (token: string) => Promise<void>
} {
  const configPath = (): string => join(options.dataDir(), 'config.json')

  async function read(): Promise<string> {
    let raw: string
    try {
      raw = await readFile(configPath(), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return ''
      }
      throw error
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredShareClient> | null
      if (!parsed || typeof parsed !== 'object') {
        return ''
      }
      return typeof parsed.uploadToken === 'string' ? parsed.uploadToken : ''
    } catch (error) {
      if (error instanceof SyntaxError) {
        // A corrupt file must not lock sharing; keep the bad copy and enroll again.
        await quarantine(configPath())
        return ''
      }
      throw error
    }
  }

  function save(token: string): Promise<void> {
    const next: StoredShareClient = { version: 2, uploadToken: token.trim() }
    // The shared writer serializes per path, restricts the ACL before the rename publishes the
    // credential, and fsyncs so a power loss cannot leave a zero-length token file behind.
    return writeSecureJsonFileAsync(configPath(), next, undefined, { durable: true }).then(
      (restricted) => {
        if (restricted === false) {
          console.error(
            'Workbench share token was saved but its permissions could not be restricted'
          )
        }
      }
    )
  }

  return { read, save }
}

async function quarantine(path: string): Promise<void> {
  try {
    await rename(path, `${path}.corrupt-${Date.now()}`)
  } catch (error) {
    console.error('Failed to quarantine corrupt share client state:', error)
  }
}
