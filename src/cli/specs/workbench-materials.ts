import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const scopeFlags = ['repo-id', 'worktree-id', 'host-id', 'workflow']
const scopeUsage = '--repo-id <id> --worktree-id <id> --workflow plan|acceptance [--host-id <id>]'
export const WORKBENCH_MATERIAL_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['bw', 'materials', 'context'],
    summary: 'Read the workflow selection, native identity and BW session instructions',
    usage:
      'orca bw materials context --workflow plan|acceptance [--repo-id <id> --worktree-id <id>] [--host-id <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, ...scopeFlags],
    notes: [
      'Without explicit scope, resolves the native terminal worktree or the registered enclosing worktree. Returns the shared SYSTEM instructions and live material problems; never uses the focused UI workspace.'
    ]
  },
  {
    path: ['bw', 'materials', 'select'],
    summary: 'Select the explicitly confirmed version without creating material',
    usage: `orca bw materials select ${scopeUsage} --version <version> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...scopeFlags, 'version'],
    notes: [
      'Select only after user confirmation. History conversation selection does not change this workflow selection.'
    ]
  },
  {
    path: ['bw', 'materials', 'migration-preview'],
    summary: 'Preview explicit schema 2 migration without writing files',
    usage: `orca bw materials migration-preview ${scopeUsage} --version <version> --cycle-id <id> [--source-revision <preserved-revision>] [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...scopeFlags, 'version', 'cycle-id', 'source-revision'],
    notes: [
      'Only the plan workflow contains legacy schema 2 data. A preserved source revision may be read again after migration.'
    ]
  },
  {
    path: ['bw', 'materials', 'migrate'],
    summary: 'Preserve the original and explicitly migrate schema 2 planning material',
    usage: `orca bw materials migrate ${scopeUsage} --version <version> --cycle-id <id> --expected-revision <preview-revision> [--json]`,
    allowedFlags: [...GLOBAL_FLAGS, ...scopeFlags, 'version', 'cycle-id', 'expected-revision'],
    notes: [
      'Review migration-preview first. Old results are returned for the explicitly named previous version; importing acceptance requires its real plan reference and never imports a decision.'
    ]
  },
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
    usage: `orca bw materials save ${scopeUsage} --version <version> (--input <json-file> | --input-stdin) (--create | --expected-revision <revision>) [--json]`,
    allowedFlags: [
      ...GLOBAL_FLAGS,
      ...scopeFlags,
      'version',
      'input',
      'input-stdin',
      'create',
      'expected-revision'
    ],
    notes: [
      'The input file contains the schema 3 document. Read first and use its revision; --create only succeeds when no document exists.',
      'A conflict preserves the stored document and the input file. Reread and merge deliberately before retrying.',
      'Use --input-stdin in SSH sessions; Orca forwards the payload through its native CLI bridge. --input reads a file on the CLI process host.',
      'Uses the running Orca runtime and native project/worktree IDs; it never writes material files directly.'
    ]
  }
]
