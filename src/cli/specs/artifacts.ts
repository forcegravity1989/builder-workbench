import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ARTIFACT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['artifacts', 'share'],
    summary: 'Share an HTML or Markdown file as a public link',
    usage: 'orca artifacts share <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    positionalArgs: ['file'],
    examples: ['orca artifacts share ./report.html', 'orca artifacts share ./notes.md --json']
  },
  {
    path: ['artifacts', 'update'],
    summary: 'Publish new content over the link previously shared for a file',
    usage: 'orca artifacts update <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'unshare'],
    destructive: true,
    summary: 'Delete the link previously shared for a file',
    usage: 'orca artifacts unshare <file> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    positionalArgs: ['file']
  },
  {
    path: ['artifacts', 'list'],
    summary: 'List the links this computer has shared',
    usage: 'orca artifacts list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['artifacts', 'delete'],
    aliases: [['artifacts', 'rm']],
    destructive: true,
    summary: 'Delete a shared link by id',
    usage: 'orca artifacts delete <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id']
  }
]
