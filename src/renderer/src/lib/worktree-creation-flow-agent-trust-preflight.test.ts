import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const FLOW_SOURCE = readFileSync(join(__dirname, 'worktree-creation-flow-execute.ts'), 'utf8')
const STARTUP_SOURCE = readFileSync(join(__dirname, 'worktree-creation-flow-startup.ts'), 'utf8')
const PREFLIGHT_SOURCE = readFileSync(join(__dirname, 'agent-trust-preflight.ts'), 'utf8')
const STRUCTURED_SOURCE = readFileSync(
  join(__dirname, 'worktree-creation-structured-session.ts'),
  'utf8'
)

function sourceBetween(source: string, startPattern: string, endPattern: string): string {
  const start = source.indexOf(startPattern)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endPattern, start + startPattern.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe('worktree creation flow agent trust preflight', () => {
  it('forwards the repo SSH connection id when pre-marking agent trust', () => {
    const preflight = PREFLIGHT_SOURCE
    const createFlow = sourceBetween(
      STARTUP_SOURCE,
      'const backendSpawned = result.startupTerminal?.spawned === true',
      'return stopWorktreeCreationForChangedHost'
    )

    expect(FLOW_SOURCE).toContain(
      'await prepareWorktreeCreationStartup(creationId, preparedRequest, result)'
    )
    expect(preflight).toContain('connectionId?: string | null')
    expect(preflight).toContain('...(args.connectionId ? { connectionId: args.connectionId } : {})')
    expect(createFlow).toContain('repoConnectionId')
    expect(createFlow).toContain('repo.id === worktree.repoId')
    expect(createFlow).toContain('await preflightAgentTrust({')
    expect(createFlow).toContain('connectionId: repoConnectionId')
    expect(STRUCTURED_SOURCE).toContain('await preflightAgentTrust({')
    expect(STRUCTURED_SOURCE).toContain('workspacePath: worktree.path')
  })
})
