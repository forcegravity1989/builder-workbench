import type { TeamDirectory, TeamHostSyncResult } from '../../shared/team-directory'
import type {
  TeamGroupSpaceListResult,
  TeamGroupSpaceResolveResult
} from '../../shared/team-group-discovery'

export type TeamCollaborationApi = {
  readDirectory: (args: { groupId: string; spaceId: string; switching?: boolean }) => Promise<{
    directory: TeamDirectory
    fileId: string | null
    currentMemberId: string | null
  }>
  syncHosts: (args: { groupId: string; spaceId: string }) => Promise<TeamHostSyncResult>
  writeDirectory: (
    directory: TeamDirectory,
    baseFileId?: string | null
  ) => Promise<{ fileId: string }>
  listGroupSpaces: () => Promise<TeamGroupSpaceListResult>
  resolveGroupSpace: (args: { spaceId: string }) => Promise<TeamGroupSpaceResolveResult>
}
