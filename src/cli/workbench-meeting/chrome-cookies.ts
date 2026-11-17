import { DatabaseSync } from 'node:sqlite'
import {
  chromiumTimestampToUnix,
  createChromiumCookieSnapshot,
  decryptCookieValueRaw,
  detectInstalledBrowsers,
  getEncryptionKey,
  isAppBoundEncryptedCookie
} from '../../main/browser/browser-cookie-cli-reader'
import type { DetectedBrowser } from '../../main/browser/browser-cookie-detection-types'
import type { EncryptionKeyResult } from '../../main/browser/browser-cookie-sqlite'
import { RuntimeClientError } from '../runtime/types'

export type ChromeCookieRow = {
  hostKey: string
  name: string
  value: string
  encryptedValue: Buffer
  expiresUnix: number
}

const LOCKED_CODES = new Set(['EBUSY', 'EACCES', 'EPERM'])

/** Cookie domain match per RFC 6265: exact host or a parent domain. */
export function cookieMatchesHost(hostKey: string, host: string): boolean {
  const domain = hostKey.replace(/^\./, '').toLowerCase()
  const target = host.toLowerCase()
  return domain.length > 0 && (target === domain || target.endsWith(`.${domain}`))
}

/** Build the request Cookie header; expired rows and duplicates of the same name are dropped. */
export function cookieHeaderFromRows(
  rows: ChromeCookieRow[],
  host: string,
  nowUnix: number
): string {
  const values = new Map<string, string>()
  for (const row of rows) {
    if (!row.name || !cookieMatchesHost(row.hostKey, host)) {
      continue
    }
    if (row.expiresUnix > 0 && row.expiresUnix <= nowUnix) {
      continue
    }
    values.set(row.name, row.value)
  }
  return Array.from(values, ([name, value]) => `${name}=${value}`).join('; ')
}

/** Decrypt one row; undefined means the value is unusable (app-bound or wrong key). */
export function decryptRow(
  row: ChromeCookieRow,
  key: EncryptionKeyResult | null
): { value: string } | { appBound: true } | undefined {
  if (row.encryptedValue.length === 0) {
    return { value: row.value }
  }
  if (isAppBoundEncryptedCookie(row.encryptedValue)) {
    return { appBound: true }
  }
  const decrypted = key ? decryptCookieValueRaw(row.encryptedValue, key) : null
  return decrypted ? { value: decrypted.toString('utf8') } : undefined
}

function findChrome(): DetectedBrowser {
  const chrome = detectInstalledBrowsers().find((browser) => browser.family === 'chrome')
  if (!chrome) {
    throw new RuntimeClientError(
      'chrome-not-found',
      '未找到系统 Chrome 的 Cookie 数据库，请确认已安装 Chrome 并登录过 eMeeting。'
    )
  }
  return chrome
}

function lockedError(browser: DetectedBrowser): RuntimeClientError {
  return new RuntimeClientError(
    'chrome-cookies-locked',
    `系统 Chrome 正在运行并独占锁定了 Cookie 数据库，无法读取登录态。请完全退出 ${browser.label}（含后台进程）后重试。`
  )
}

/** Read the user's Chrome cookies for a URL and reuse the existing eMeeting login. */
export async function fetchChromeCookies(url: string): Promise<{ cookie: string }> {
  const browser = findChrome()
  const host = new URL(url).hostname

  let snapshot: ReturnType<typeof createChromiumCookieSnapshot>
  try {
    snapshot = createChromiumCookieSnapshot(browser.cookiesPath)
  } catch (error) {
    if (error instanceof Error && LOCKED_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
      throw lockedError(browser)
    }
    throw new RuntimeClientError(
      'chrome-cookies-unavailable',
      `读取系统 Chrome Cookie 数据库失败：${error instanceof Error ? error.message : String(error)}`
    )
  }

  try {
    const db = new DatabaseSync(snapshot.databasePath, { readOnly: true, readBigInts: true })
    let rows: ChromeCookieRow[]
    try {
      rows = db
        .prepare(
          'SELECT host_key, name, value, encrypted_value, expires_utc FROM cookies ORDER BY rowid'
        )
        .all()
        .map((row) => ({
          hostKey: String(row.host_key ?? ''),
          name: String(row.name ?? ''),
          value: String(row.value ?? ''),
          encryptedValue: Buffer.from(row.encrypted_value as Uint8Array),
          expiresUnix: chromiumTimestampToUnix(row.expires_utc as bigint)
        }))
    } finally {
      db.close()
    }

    const matching = rows.filter((row) => row.name && cookieMatchesHost(row.hostKey, host))
    if (matching.length === 0) {
      throw new RuntimeClientError(
        'meeting-login-required',
        `系统 Chrome 中没有 ${host} 的 Cookie，请先在 Chrome 登录 https://w3.huawei.com/emeeting/ 后重试。`
      )
    }

    const key = getEncryptionKey(
      browser.keychainService ?? '',
      browser.keychainAccount ?? '',
      browser
    )
    if (!key) {
      throw new RuntimeClientError(
        'chrome-cookie-key-unavailable',
        `无法取得系统 Chrome 的 Cookie 解密密钥，请确认当前用户已解锁系统凭据后重试。`
      )
    }

    let appBound = 0
    const usable: ChromeCookieRow[] = []
    for (const row of matching) {
      const decrypted = decryptRow(row, key)
      if (!decrypted) {
        continue
      }
      if ('appBound' in decrypted) {
        appBound += 1
        continue
      }
      usable.push({ ...row, value: decrypted.value })
    }
    if (usable.length === 0) {
      throw new RuntimeClientError(
        'chrome-cookies-undecryptable',
        appBound > 0
          ? '系统 Chrome 使用应用绑定加密（v20）保护 Cookie，外部进程无法解密，请改用内置浏览器登录 eMeeting。'
          : '系统 Chrome 的 eMeeting Cookie 无法解密，请在 Chrome 重新登录 eMeeting 后重试。'
      )
    }

    const cookie = cookieHeaderFromRows(usable, host, Math.floor(Date.now() / 1000))
    if (!cookie) {
      throw new RuntimeClientError(
        'meeting-login-required',
        '系统 Chrome 中的 eMeeting Cookie 已过期，请重新登录后重试。'
      )
    }
    return { cookie }
  } finally {
    snapshot.cleanup()
  }
}
