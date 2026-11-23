import type { TeamDirectory } from '../../shared/team-directory'

export type TeamCollaborationApi = {
  readDirectory: (args: { groupId: string; spaceId: string }) => Promise<{
    directory: TeamDirectory
    fileId: string | null
    currentMemberId: string | null
  }>
  syncHosts: (args: {
    groupId: string
    spaceId: string
  }) => Promise<{ added: number; updated: number }>
  writeDirectory: (directory: TeamDirectory) => Promise<{ fileId: string }>
}
