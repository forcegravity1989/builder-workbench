import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const WORKBENCH_MEETING_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['bw', 'meeting', 'transcript'],
    summary: 'Read the eMeeting transcript through its API and save transcript JSON',
    usage:
      'orca bw meeting transcript --meeting-id <32-hex-id> --output <absolute-json-path> [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'meeting-id', 'output', 'worktree']
  }
]
