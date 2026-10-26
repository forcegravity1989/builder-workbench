import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { createCodeHubComment, deleteCodeHubComment, listCodeHubComments } from './comments'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }

describe('codehub comments', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
  })

  it('flattens mr review discussions into their nested notes, keeping system activity notes', async () => {
    // `mr review list` yields discussions; the comments live in `notes`.
    // Shapes below mirror codehub-cli v1.3.4 JSON output.
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        {
          id: 'e54b6674d010ca64839e1be0ae7720ed05d1414a',
          individual_note: false,
          notes: [
            {
              id: 140416451,
              body: '后续考虑调用大模型来识别设备选择方式',
              author: {
                username: 'm30077918',
                avatar_url: 'https://codehub-g.huawei.com/avatar/m30077918.png'
              },
              created_at: '2026-03-12T18:13:08.989+08:00',
              discussion_id: 'e54b6674d010ca64839e1be0ae7720ed05d1414a',
              is_reply: false,
              system: false,
              from_robot: false,
              resolved: false
            },
            {
              id: 140425415,
              body: 'changed this line on [77b9822e](https://codehub-g.huawei.com)',
              author: { username: 'l30047599' },
              created_at: '2026-03-13T10:17:39.799+08:00',
              is_reply: true,
              system: true
            }
          ]
        },
        {
          id: '0a5c6957da27c2f46c58c57c511879a973291126',
          individual_note: false,
          notes: [
            {
              id: 140416464,
              body: '直接使用 ast.literal_eval 解析 LLM 输出',
              author: {
                username: 'codehub-bot',
                avatar_url: 'https://codehub-g.huawei.com/avatar/bot.png'
              },
              created_at: '2026-03-12T18:14:25.771+08:00',
              discussion_id: '0a5c6957da27c2f46c58c57c511879a973291126',
              is_reply: false,
              system: false,
              from_robot: true,
              resolved: true,
              file_path: 'src/main/bridge.py',
              line: 42
            }
          ]
        },
        {
          id: '11a5c957da27c2f46c58c57c511879a973291126',
          individual_note: true,
          notes: [
            {
              id: 140416480,
              body: '单独的一条评论',
              author: { username: 'm30077918' },
              created_at: '2026-03-12T18:15:13.662+08:00',
              system: false
            }
          ]
        },
        {
          id: '5b1d0c57da27c2f46c58c57c511879a973291126',
          individual_note: false,
          notes: [
            {
              id: 140416501,
              body: '这行的空值处理要补',
              author: {
                username: 'm30077918',
                avatar_url: 'https://codehub-g.huawei.com/avatar/m30077918.png'
              },
              created_at: '2026-03-12T18:20:08.989+08:00',
              discussion_id: '5b1d0c57da27c2f46c58c57c511879a973291126',
              is_reply: false,
              system: false,
              from_robot: false,
              resolved: false,
              type: 'DiffNote',
              is_outdated: false,
              // szv-open shape: top-level anchor fields are null and the
              // anchor lives in the nested position object.
              file_path: null,
              line: null,
              position: {
                position_type: 'text',
                new_path: 'src/main/bridge.py',
                new_line: 52,
                old_path: 'src/main/bridge.py',
                old_line: null
              }
            },
            {
              id: 140416502,
              body: '旧补丁上的行评论',
              author: { username: 'm30077918' },
              created_at: '2026-03-12T18:21:33.001+08:00',
              discussion_id: '5b1d0c57da27c2f46c58c57c511879a973291126',
              is_reply: false,
              system: false,
              type: 'DiffNote',
              is_outdated: true,
              file_path: null,
              line: null,
              position: {
                position_type: 'text',
                new_path: 'src/main/bridge.py',
                new_line: 12
              }
            }
          ]
        }
      ])
    )
    const comments = await listCodeHubComments({ remote, kind: 'mr', iid: 4092 })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'review',
        'list',
        '4092',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--limit',
        '50'
      ],
      undefined
    )
    expect(comments).toEqual([
      {
        id: '140416451',
        body: '后续考虑调用大模型来识别设备选择方式',
        author: 'm30077918',
        createdAt: '2026-03-12T18:13:08.989+08:00',
        discussionId: 'e54b6674d010ca64839e1be0ae7720ed05d1414a',
        individual: false,
        isReply: false,
        authorAvatarUrl: 'https://codehub-g.huawei.com/avatar/m30077918.png',
        isBot: false,
        isResolved: false,
        path: null,
        line: null,
        isOutdated: false
      },
      {
        id: '140425415',
        body: 'changed this line on [77b9822e](https://codehub-g.huawei.com)',
        author: 'l30047599',
        createdAt: '2026-03-13T10:17:39.799+08:00',
        discussionId: 'e54b6674d010ca64839e1be0ae7720ed05d1414a',
        individual: false,
        // System activity records ("changed this line on …") render like
        // ordinary replies — real-data review preferred the website's
        // full-fidelity thread over GitHub-style activity filtering.
        isReply: true,
        authorAvatarUrl: null,
        isBot: false,
        isResolved: false,
        path: null,
        line: null,
        isOutdated: false
      },
      {
        id: '140416464',
        body: '直接使用 ast.literal_eval 解析 LLM 输出',
        author: 'codehub-bot',
        createdAt: '2026-03-12T18:14:25.771+08:00',
        discussionId: '0a5c6957da27c2f46c58c57c511879a973291126',
        individual: false,
        isReply: false,
        authorAvatarUrl: 'https://codehub-g.huawei.com/avatar/bot.png',
        isBot: true,
        isResolved: true,
        path: 'src/main/bridge.py',
        line: 42,
        isOutdated: false
      },
      {
        id: '140416480',
        body: '单独的一条评论',
        author: 'm30077918',
        createdAt: '2026-03-12T18:15:13.662+08:00',
        // Standalone notes keep their own single-note discussion id so
        // `mr review reply` can address them; `individual` marks that
        // deletion must not send `--discussion-id`.
        discussionId: '11a5c957da27c2f46c58c57c511879a973291126',
        individual: true,
        isReply: false,
        authorAvatarUrl: null,
        isBot: false,
        isResolved: false,
        path: null,
        line: null,
        isOutdated: false
      },
      {
        id: '140416501',
        body: '这行的空值处理要补',
        author: 'm30077918',
        createdAt: '2026-03-12T18:20:08.989+08:00',
        discussionId: '5b1d0c57da27c2f46c58c57c511879a973291126',
        individual: false,
        isReply: false,
        authorAvatarUrl: 'https://codehub-g.huawei.com/avatar/m30077918.png',
        isBot: false,
        isResolved: false,
        // szv-open hosts null the top-level anchor; the position fallback
        // recovers path/line so the files tab can still place the card.
        path: 'src/main/bridge.py',
        line: 52,
        isOutdated: false
      },
      {
        id: '140416502',
        body: '旧补丁上的行评论',
        author: 'm30077918',
        createdAt: '2026-03-12T18:21:33.001+08:00',
        discussionId: '5b1d0c57da27c2f46c58c57c511879a973291126',
        individual: false,
        isReply: false,
        authorAvatarUrl: null,
        isBot: false,
        isResolved: false,
        path: 'src/main/bridge.py',
        line: 12,
        // Stale anchors pass through so the files tab can skip them inline.
        isOutdated: true
      }
    ])
  })

  it('maps flat issue comments as-is', async () => {
    runCodeHubCliMock.mockResolvedValue(
      JSON.stringify([
        {
          id: 144535827,
          body: '取消原因:新版本待验证',
          author: { username: 'a30030291' },
          created_at: '2026-09-11T18:34:34.348+08:00',
          system: false
        }
      ])
    )
    const comments = await listCodeHubComments({ remote, kind: 'issue', iid: 70 })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'issue',
        'comment',
        'list',
        '70',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '-f',
        'json',
        '--limit',
        '50'
      ],
      undefined
    )
    expect(comments).toEqual([
      {
        id: '144535827',
        body: '取消原因:新版本待验证',
        author: 'a30030291',
        createdAt: '2026-09-11T18:34:34.348+08:00',
        discussionId: null,
        individual: false,
        isReply: false,
        // Issue comment payloads carry no robot/resolution/file-position
        // fields; the mapping must default them rather than drop the note.
        authorAvatarUrl: null,
        isBot: false,
        isResolved: false,
        path: null,
        line: null,
        isOutdated: false
      }
    ])
  })

  it('replies within an mr discussion via mr review reply', async () => {
    runCodeHubCliMock.mockResolvedValue('')
    await createCodeHubComment({
      remote,
      kind: 'mr',
      iid: 4092,
      body: '收到，下个版本处理',
      discussionId: 'e54b6674d010ca64839e1be0ae7720ed05d1414a'
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'review',
        'reply',
        '4092',
        'e54b6674d010ca64839e1be0ae7720ed05d1414a',
        '--body',
        '收到，下个版本处理',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com'
      ],
      undefined
    )
  })

  it('creates a top-level mr note, anchoring line-level notes with --path and --line', async () => {
    runCodeHubCliMock.mockResolvedValue('')
    await createCodeHubComment({ remote, kind: 'mr', iid: 4092, body: '整体看没问题' })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'review',
        'create',
        '4092',
        '--body',
        '整体看没问题',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com'
      ],
      undefined
    )
    await createCodeHubComment({
      remote,
      kind: 'mr',
      iid: 4092,
      body: '这里的边界条件漏了',
      path: 'src/main/bridge.py',
      line: 42,
      startLine: 40
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'review',
        'create',
        '4092',
        '--body',
        '这里的边界条件漏了',
        // --path + --line make the note a DiffNote; --start-line only goes
        // out for a real multi-line range, and the CLI derives diff_refs
        // itself, so no commit anchors ride along. --severity is required
        // by the review API (CH.00406030 on empty); suggestion is the
        // mildest level.
        '--path',
        'src/main/bridge.py',
        '--line',
        '42',
        '--start-line',
        '40',
        '--severity',
        'suggestion',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com'
      ],
      undefined
    )
    // A single-line click (startLine === line) must not send --start-line.
    await createCodeHubComment({
      remote,
      kind: 'mr',
      iid: 4092,
      body: '拼写错误',
      path: 'README.md',
      line: 7,
      startLine: 7
    })
    expect(runCodeHubCliMock).toHaveBeenLastCalledWith(
      [
        'mr',
        'review',
        'create',
        '4092',
        '--body',
        '拼写错误',
        '--path',
        'README.md',
        '--line',
        '7',
        '--severity',
        'suggestion',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com'
      ],
      undefined
    )
  })

  it('deletes an mr note within a discussion with --discussion-id', async () => {
    runCodeHubCliMock.mockResolvedValue('')
    await deleteCodeHubComment({
      remote,
      kind: 'mr',
      iid: 4092,
      commentId: '140416451',
      discussionId: 'e54b6674d010ca64839e1be0ae7720ed05d1414a'
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'review',
        'delete',
        '4092',
        '--discussion-id',
        'e54b6674d010ca64839e1be0ae7720ed05d1414a',
        '--note-id',
        '140416451',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '--yes'
      ],
      undefined
    )
  })

  it('deletes a standalone mr note by note id alone', async () => {
    runCodeHubCliMock.mockResolvedValue('')
    await deleteCodeHubComment({ remote, kind: 'mr', iid: 4092, commentId: '140416480' })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'mr',
        'review',
        'delete',
        '4092',
        '--note-id',
        '140416480',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '--yes'
      ],
      undefined
    )
  })

  it('deletes an issue comment without discussion flags', async () => {
    runCodeHubCliMock.mockResolvedValue('')
    await deleteCodeHubComment({
      remote,
      kind: 'issue',
      iid: 70,
      commentId: '144535827',
      discussionId: null
    })
    expect(runCodeHubCliMock).toHaveBeenCalledWith(
      [
        'issue',
        'comment',
        'delete',
        '70',
        '144535827',
        '-p',
        'Org/Group/repo',
        '-H',
        'codehub-g.huawei.com',
        '--yes'
      ],
      undefined
    )
  })
})
