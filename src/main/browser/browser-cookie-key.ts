import { diag } from './browser-cookie-import-diagnostics'
import * as providers from './browser-cookie-key-providers'
import type { DetectedBrowser } from './browser-cookie-detection-types'
import type { EncryptionKeyResult } from './browser-cookie-sqlite'

// Why: the providers are Electron-free so the CLI can read system-browser cookies too;
// this wrapper keeps the importer's diagnostics log wired in.
export function getEncryptionKey(
  keychainService: string,
  keychainAccount: string,
  browser?: DetectedBrowser
): EncryptionKeyResult | null {
  return providers.getEncryptionKey(keychainService, keychainAccount, browser, diag)
}

export function getMacEncryptionKey(
  keychainService: string,
  keychainAccount: string
): EncryptionKeyResult | null {
  return providers.getMacEncryptionKey(keychainService, keychainAccount)
}

export function getLinuxEncryptionKey(
  keychainService: string,
  keychainAccount: string
): EncryptionKeyResult | null {
  return providers.getLinuxEncryptionKey(keychainService, keychainAccount, diag)
}

export function getWindowsEncryptionKey(browser: DetectedBrowser): EncryptionKeyResult | null {
  return providers.getWindowsEncryptionKey(browser, diag)
}
