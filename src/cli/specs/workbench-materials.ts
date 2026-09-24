import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const scopeFlags = ['repo-id', 'worktree-id', 'host-id', 'workflow']
const scopeUsage = '--repo-id <id> --worktree-id <id> --workflow plan|acceptance [--host-id <id>]'
export const WORKBENCH_MATERIAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['bw', 'materials', 'schema'],
    summary: 'Print the bundled schema 3 document format without a running app',
    usage: 'orca bw materials schema --workflow plan|acceptance [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'workflow'],
    notes: [
      'JSON Schema describes the document shape; save also checks identities and cross-field constraints.'
    ]
  },
  {
    path: ['bw', 'materials', 'list'],
    summary: 'List version materials in a registered workflow worktree',
    usage: `orca bw materials list ${scopeUsage} [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...scopeFlags],
    notes: ['Lists candidates without selecting a version or creating files.']
  },
  {
    path: ['bw', 'materials', 'read'],
    summary: 'Read version material and its revision',
    usage: `orca bw materials read ${scopeUsage} --version <version> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...scopeFlags, 'version']
  },
  {
    path: ['bw', 'materials', 'save'],
    summary: 'Save a version material draft with conflict protection',
    usage: `orca bw materials save ${scopeUsage} --version <version> --input <json-file> (--create | --expected-revision <revision>) [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      ...scopeFlags,
      'version',
      'input',
      'create',
      'expected-revision'
    ],
    notes: [
      'The input file contains the schema 3 document. Read first and use its revision; --create only succeeds when no document exists.',
      'A conflict preserves the stored document and the input file. Reread and merge deliberately before retrying.',
      'Uses the running Orca runtime and native project/worktree IDs; it never writes material files directly.'
    ]
  }
]
