import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKBENCH_MEETING_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['bw', 'meeting', 'transcript'],
    summary: 'Read eMeeting recordings through the native browser and save transcript JSON',
    usage:
      'orca bw meeting transcript --meeting-id <32-hex-id> (--list | --recording <all|index|name> --output <absolute-json-path>) [--page <id>] [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'meeting-id', 'list', 'recording', 'output', 'worktree']
  }
]
