import { ipcMain } from 'electron'
import { resolveWelinkRoute } from '../workbench/reporting/report-submission'
import {
  readTeamDirectory,
  writeTeamDirectory,
  type TeamDirectory
} from '../workbench/team-collaboration/team-directory-client'

const NUMERIC_ID = /^\d{1,32}$/

function requireId(value: unknown, name: string): string {
  if (typeof value !== 'string' || !NUMERIC_ID.test(value)) {
    throw new Error(`${name} must be a numeric WeLink ID.`)
  }
  return value
}

export function registerTeamCollaborationHandlers(): void {
  ipcMain.handle(
    'teamCollaboration:readDirectory',
    async (_event, args: { groupId: string; spaceId: string }) => {
      const groupId = requireId(args?.groupId, 'groupId')
      const spaceId = requireId(args?.spaceId, 'spaceId')
      return readTeamDirectory({ route: await resolveWelinkRoute(), groupId, spaceId })
    }
  )

  ipcMain.handle(
    'teamCollaboration:writeDirectory',
    async (_event, directory: TeamDirectory) => {
      const groupId = requireId(directory?.team_group_id, 'team_group_id')
      const spaceId = requireId(directory?.team_space_id, 'team_space_id')
      return writeTeamDirectory({
        route: await resolveWelinkRoute(),
        directory: { ...directory, team_group_id: groupId, team_space_id: spaceId }
      })
    }
  )
}
