import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Bot } from '../../shared/bot-types'
import { localBotHomeFilesystem as fs } from './bot-home'
import { createBotFromTemplate, type BotTemplateCreateDeps } from './bot-template-create'

function makeBot(): Bot {
  return {
    id: 'bot-1',
    name: 'BW acceptance meeting',
    hostId: 'local',
    folder: 'bw-acceptance-meeting',
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
    root = await mkdtemp(join(tmpdir(), 'orca-bot-template-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('gets the whole version-acceptance skill folder from the BW skill package', async () => {
    const bot = await createBotFromTemplate(deps(root), {
      name: 'BW acceptance meeting',
      agent: 'claude',
      fromTemplate: { id: 'bw-meeting', skills: ['version-acceptance'] }
    })
    const skill = join(root, bot.folder, 'skills', 'version-acceptance')

    expect(await readFile(join(skill, 'SKILL.md'), 'utf8')).toContain('name: version-acceptance')
    // The references the first session must read ship with the folder, not as bare SKILL.md text.
    expect(await readFile(join(skill, 'references', 'meeting-preparation.md'), 'utf8')).toContain(
      '预订会议与纪要同步'
    )
    expect(await readFile(join(skill, 'references', 'shared', 'execution.md'), 'utf8')).toContain(
      'BW 业务会话执行规范'
    )
  })

  it('installs nothing the owner unticked', async () => {
    const bot = await createBotFromTemplate(deps(root), {
      name: 'BW acceptance meeting',
      agent: 'claude',
      fromTemplate: { id: 'bw-meeting', skills: [] }
    })
    await expect(
      readFile(join(root, bot.folder, 'skills', 'version-acceptance', 'SKILL.md'), 'utf8')
    ).rejects.toThrow()
  })
})
