import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bot } from '../../shared/bot-types'
import { localBotHomeFilesystem as fs } from './bot-home'
import { createBotFromTemplate, type BotTemplateCreateDeps } from './bot-template-create'

function makeBot(): Bot {
  return {
    id: 'bot-1',
    name: 'WeLink meeting assistant',
    hostId: 'local',
    folder: 'bw-welink-meeting',
    folderWorkspaceId: 'fw-1',
    agent: 'claude',
    avatar: null,
    paused: false,
    permissionMode: 'ask',
    notifications: { needsPermission: true, taskComplete: true, couldNotFinish: true },
    members: [],
    slack: null,
    chatSessionId: null,
    linear: null,
    github: null,
    createdAt: 1,
    updatedAt: 1
  }
}

function deps(root: string): BotTemplateCreateDeps {
  return {
    bots: {
      create: async () => makeBot(),
      delete: async () => ({ deleted: true })
    },
    filesystem: fs,
    botsRoot: () => root,
    createPausedSchedule: async () => {}
  }
}

describe('a bot made from the BW meeting template', () => {
  let root: string

  beforeEach(async () => {
    vi.stubEnv('WORKBENCH_SHELL', '1')
    root = await mkdtemp(join(tmpdir(), 'orca-bot-template-'))
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it('gets the whole welink-meeting skill folder from the BW skill package', async () => {
    const bot = await createBotFromTemplate(deps(root), {
      name: 'WeLink meeting assistant',
      agent: 'claude',
      fromTemplate: { id: 'bw-meeting', skills: ['welink-meeting'] }
    })
    const skill = join(root, bot.folder, 'skills', 'welink-meeting')

    expect(await readFile(join(skill, 'SKILL.md'), 'utf8')).toContain('name: welink-meeting')
    // The references the first session must read ship with the folder, not as bare SKILL.md text.
    expect(await readFile(join(skill, 'references', 'meeting-preparation.md'), 'utf8')).toContain(
      '预订与恢复'
    )
  })

  it('installs nothing the owner unticked', async () => {
    const bot = await createBotFromTemplate(deps(root), {
      name: 'WeLink meeting assistant',
      agent: 'claude',
      fromTemplate: { id: 'bw-meeting', skills: [] }
    })
    await expect(
      readFile(join(root, bot.folder, 'skills', 'welink-meeting', 'SKILL.md'), 'utf8')
    ).rejects.toThrow()
  })
})
