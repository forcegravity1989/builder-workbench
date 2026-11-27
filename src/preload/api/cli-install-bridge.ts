import { ipcRenderer } from 'electron'
import type { BwCliInstallFinishedPayload } from '../../shared/bw-cli-install-commands'
import type { CliInstallApi } from './bw-cli-install-api'

export const cliInstallApi = {
  start: (args: Parameters<CliInstallApi['start']>[0]) =>
    ipcRenderer.invoke('cliInstall:start', args),
  isRunning: (args: Parameters<CliInstallApi['isRunning']>[0]) =>
    ipcRenderer.invoke('cliInstall:isRunning', args),
  onFinished: (callback: (payload: BwCliInstallFinishedPayload) => void): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: BwCliInstallFinishedPayload
    ): void => callback(payload)
    ipcRenderer.on('cliInstall:finished', listener)
    return () => ipcRenderer.removeListener('cliInstall:finished', listener)
  }
} satisfies CliInstallApi
