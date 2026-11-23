import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type { TeamDirectory } from '../../shared/team-directory'

export const teamCollaborationApi = {
  readDirectory: (args: { groupId: string; spaceId: string }) =>
    ipcRenderer.invoke('teamCollaboration:readDirectory', args),
  syncHosts: (args: { groupId: string; spaceId: string }) =>
    ipcRenderer.invoke('teamCollaboration:syncHosts', args),
  writeDirectory: (directory: TeamDirectory) =>
    ipcRenderer.invoke('teamCollaboration:writeDirectory', directory)
} satisfies PreloadApi['teamCollaboration']
