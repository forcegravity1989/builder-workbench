import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ShareConfigView } from '../../shared/workbench/share'

export type ShareConfig = {
  serverUrl: string
  uploadToken: string
}

type StoredShareConfig = ShareConfig & { version: 1 }

export class ShareConfigError extends Error {
  constructor(
    readonly code: 'invalid-config',
    message: string
  ) {
    super(message)
    this.name = 'ShareConfigError'
  }
}

/** Normalize a user-entered server address; empty means "not configured". */
export function normalizeShareServerUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new ShareConfigError('invalid-config', '分享服务地址不是有效的 URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ShareConfigError('invalid-config', '分享服务地址必须以 http:// 或 https:// 开头')
  }
  if (url.username || url.password) {
    throw new ShareConfigError('invalid-config', '分享服务地址不能包含用户名或密码')
  }
  if (url.search || url.hash) {
    throw new ShareConfigError('invalid-config', '分享服务地址不能包含查询参数或锚点')
  }
  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

export function shareConfigView(config: ShareConfig): ShareConfigView {
  return {
    serverUrl: config.serverUrl,
    uploadTokenSet: config.uploadToken !== '',
    configured: config.serverUrl !== ''
  }
}

/**
 * Settings for the self-hosted share service live in a Workbench-owned file rather than
 * Orca's settings store: the upload token is a secret and the address is deployment-specific,
 * so keeping both out of synced/UI settings avoids adding another protected-secret slot.
 */
export function createShareConfigStore(options: { dataDir: () => string }): {
  read: () => Promise<ShareConfig>
  save: (update: { serverUrl: string; uploadToken?: string }) => Promise<ShareConfig>
} {
  let writeChain: Promise<unknown> = Promise.resolve()
  const configPath = (): string => join(options.dataDir(), 'config.json')

  async function read(): Promise<ShareConfig> {
    try {
      const raw = await readFile(configPath(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoredShareConfig> | null
      if (!parsed || typeof parsed !== 'object') {
        return { serverUrl: '', uploadToken: '' }
      }
      return {
        serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : '',
        uploadToken: typeof parsed.uploadToken === 'string' ? parsed.uploadToken : ''
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { serverUrl: '', uploadToken: '' }
      }
      // A corrupt file must not lock the form; keep the bad copy and let the user re-enter it.
      if (error instanceof SyntaxError) {
        await quarantine(configPath())
        return { serverUrl: '', uploadToken: '' }
      }
      throw error
    }
  }

  function save(update: { serverUrl: string; uploadToken?: string }): Promise<ShareConfig> {
    const run = writeChain.then(async () => {
      const current = await read()
      const next: StoredShareConfig = {
        version: 1,
        serverUrl: normalizeShareServerUrl(update.serverUrl),
        uploadToken:
          update.uploadToken === undefined ? current.uploadToken : update.uploadToken.trim()
      }
      const path = configPath()
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const temp = `${path}.tmp`
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
      await rename(temp, path)
      return { serverUrl: next.serverUrl, uploadToken: next.uploadToken }
    })
    writeChain = run.catch(() => undefined)
    return run
  }

  return { read, save }
}

async function quarantine(path: string): Promise<void> {
  try {
    await rename(path, `${path}.corrupt-${Date.now()}`)
  } catch (error) {
    console.error('Failed to quarantine corrupt share settings:', error)
  }
}
