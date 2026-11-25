import { ipcRenderer } from 'electron'
import {
  W3_ACCOUNT_STATUS_CHANGED_CHANNEL,
  type W3AccountStatus,
  type W3OpenWebRequest,
  type W3OpenWebResult,
  type W3StartLoginResult
} from '../../shared/w3-account'

export type W3AccountApi = {
  status: () => Promise<W3AccountStatus>
  start: () => Promise<W3StartLoginResult>
  /** Harvest a passwordless SSO session from the system browser into the W3 partition. */
  sync: () => Promise<W3AccountStatus>
  cancel: () => Promise<W3AccountStatus>
  signOut: () => Promise<W3AccountStatus>
  /** Open the W3 home shortcut inside the signed-in W3 session (same partition). */
  openWeb: (request?: W3OpenWebRequest) => Promise<W3OpenWebResult>
  /** Fires when the main-process login poll resolves or fails. */
  onStatusChanged: (callback: (status: W3AccountStatus) => void) => () => void
}

export const w3AccountApi = {
  status: () => ipcRenderer.invoke('w3Account:status'),
  start: () => ipcRenderer.invoke('w3Account:start'),
  sync: () => ipcRenderer.invoke('w3Account:sync'),
  cancel: () => ipcRenderer.invoke('w3Account:cancel'),
  signOut: () => ipcRenderer.invoke('w3Account:signOut'),
  openWeb: (request) => ipcRenderer.invoke('w3Account:openWeb', request),
  onStatusChanged: (callback) => {
    const listener = (_event: unknown, status: W3AccountStatus): void => callback(status)
    ipcRenderer.on(W3_ACCOUNT_STATUS_CHANGED_CHANNEL, listener)
    return () => ipcRenderer.removeListener(W3_ACCOUNT_STATUS_CHANGED_CHANNEL, listener)
  }
} satisfies W3AccountApi
