import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { TeamDirectory } from '../../shared/team-directory'

export const teamCollaborationApi = {
  readDirectory: (args: { groupId: string; spaceId: string; switching?: boolean }) =>
    ipcRenderer.invoke('teamCollaboration:readDirectory', args),
  syncHosts: (args: { groupId: string; spaceId: string }) =>
    ipcRenderer.invoke('teamCollaboration:syncHosts', args),
  writeDirectory: (directory: TeamDirectory, baseFileId?: string | null) =>
    ipcRenderer.invoke('teamCollaboration:writeDirectory', directory, baseFileId),
  listGroupSpaces: () => ipcRenderer.invoke('teamCollaboration:listGroupSpaces'),
  resolveGroupSpace: (args: { spaceId: string }) =>
    ipcRenderer.invoke('teamCollaboration:resolveGroupSpace', args)
} satisfies PreloadApi['teamCollaboration']
