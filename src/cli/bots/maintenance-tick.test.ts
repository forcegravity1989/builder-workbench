import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { HandlerContext } from '../dispatch/dispatch'
import { MAINTENANCE_HANDLERS } from './maintenance-tick'

it('recovers a lost worker receipt and holds a second labeled issue until the first worker settles', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'maintenance-dispatch-'))
  vi.stubEnv('ORCA_USER_DATA_PATH', profile)
  vi.stubEnv('ORCA_AGENT_SESSION_ID', 'maintenance-chat')
  const source = { owner: 'team', repo: 'project' }
  const issues = [1, 2, 3].map((number) => ({
    number,
    url: `https://github.com/team/project/issues/${number}`,
    labels: number === 3 ? [] : ['bw-bot-fix'],
    type: 'issue',
    state: 'open'
  }))
  let workerState = 'stopped'
  let outcome = 'finished_unverified'
  let hasLink = false
  let hasPR = false
  const starts: string[] = []
  const refs: string[] = []
  const resultFor = (method: string, args: Record<string, unknown>) => {
    switch (method) {
      case 'repo.list':
        return { repos: [{ id: 'project' }] }
      case 'bots.list':
        return { bots: [{ id: 'bot', name: 'Fix', agent: 'codex', templateId: 'bw-maintenance' }] }
      case 'github.listWorkItems':
        return { items: issues, sources: { issues: source } }
      case 'github.workItemDetails':
        return { item: issues.find((issue) => issue.number === args.number) }
      case 'worktree.list':
        return { worktrees: [], truncated: false }
      case 'bots.items.list':
        return { botId: 'bot', items: [] }
      case 'bots.items.add':
        return { item: { number: Number(String(args.description).split('/').pop()) } }
      case 'github.workItem':
        return issues.find((issue) => issue.number === args.number)
      case 'orchestration.workerStart':
        starts.push(String(args.taskTitle))
        if (starts.length === 1) {
          throw new Error('lost reply after native dispatch committed')
        }
        return { state: 'ready', dispatchId: 'worker-2' }
      case 'bots.items.show':
        return {
          item: {
            links: hasLink
              ? [
                  {
                    kind: 'dispatch',
                    ref: 'worker-1',
                    state: workerState,
                    pr: hasPR
                      ? {
                          shown: true,
                          url: 'https://github.com/team/project/pull/10',
                          state: 'open',
                          checks: 'neutral'
                        }
                      : null
                  }
                ]
              : []
          }
        }
      case 'orchestration.requestShow':
        return { state: 'completed', receipt: { dispatchId: 'worker-1' } }
      case 'orchestration.workerShow':
        return { worker: {}, projection: { outcome } }
      case 'bots.items.link':
        refs.push(...(args.refs as string[]))
        hasLink = true
        return {}
      default:
        throw new Error(`Unexpected RPC ${method}`)
    }
  }
  const tick = () =>
    MAINTENANCE_HANDLERS['bot maintenance tick']({
      flags: new Map([['repo', 'project']]),
      cwd: profile,
      json: true,
      client: {
        call: async (method: string, args: Record<string, unknown>) => ({
          result: resultFor(method, args)
        })
      }
    } as unknown as HandlerContext)
  try {
    await expect(tick()).rejects.toThrow('lost reply')
    issues[0].labels = []
    await tick()
    await tick()
    expect(starts).toEqual([issues[0].url])
    expect(refs).toContain('dispatch:worker-1')
    workerState = 'failed'
    outcome = 'failed'
    await tick()
    hasPR = true
    await tick()
    expect(starts).toEqual([issues[0].url, issues[1].url])
    expect(refs).toContain('https://github.com/team/project/pull/10')
  } finally {
    vi.unstubAllEnvs()
    await rm(profile, { recursive: true, force: true })
  }
})
