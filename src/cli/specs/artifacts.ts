import type { CommandSpec } from '../discovery/command-spec'
import { LOCAL_COMMAND_FLAGS } from '../arguments/args'

export const ARTIFACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['artifacts', 'share'],
    summary: 'Share an HTML or Markdown file as a public link',
    usage: 'orca artifacts share <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: ['orca artifacts share ./report.html', 'orca artifacts share ./notes.md --json']
  },
  {
    path: ['artifacts', 'update'],
    summary: 'Publish new content over the link previously shared for a file',
    usage: 'orca artifacts update <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'unshare'],
    destructive: true,
    summary: 'Delete the link previously shared for a file',
    usage: 'orca artifacts unshare <file> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'list'],
    summary: 'List the links this computer has shared',
    usage: 'orca artifacts list [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS]
  },
  {
    path: ['artifacts', 'delete'],
    aliases: [['artifacts', 'rm']],
    destructive: true,
    summary: 'Delete a shared link by id',
    usage: 'orca artifacts delete <id> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'id'],
    positionalArgs: ['id']
  }
]
