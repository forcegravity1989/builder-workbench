import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runCodeHubCliMock } = vi.hoisted(() => ({
  runCodeHubCliMock: vi.fn()
}))

vi.mock('./cli', () => ({
  runCodeHubCli: runCodeHubCliMock
}))

import { deleteCodeHubComment, listCodeHubComments } from './comments'

const remote = { host: 'codehub-g.huawei.com', project: 'Org/Group/repo' }

describe('codehub comments', () => {
  beforeEach(() => {
    runCodeHubCliMock.mockReset()
  })

  it('flattens mr review discussions into their nested notes and skips system notes', async () => {
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
              author: { username: 'm30077918' },
              created_at: '2026-03-12T18:13:08.989+08:00',
              discussion_id: 'e54b6674d010ca64839e1be0ae7720ed05d1414a',
              is_reply: false,
              system: false
            },
            {
              id: 140425415,
              body: 'changed this line on [77b9822e](https://codehub-g.huawei.com)',
              author: { username: 'l30047599' },
              created_at: '2026-03-13T10:17:39.799+08:00',
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
              author: { username: 'm30077918' },
              created_at: '2026-03-12T18:14:25.771+08:00',
              discussion_id: '0a5c6957da27c2f46c58c57c511879a973291126',
              is_reply: false,
              system: false
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
        isReply: false
      },
      {
        id: '140416464',
        body: '直接使用 ast.literal_eval 解析 LLM 输出',
        author: 'm30077918',
        createdAt: '2026-03-12T18:14:25.771+08:00',
        discussionId: '0a5c6957da27c2f46c58c57c511879a973291126',
        isReply: false
      },
      {
        id: '140416480',
        body: '单独的一条评论',
        author: 'm30077918',
        createdAt: '2026-03-12T18:15:13.662+08:00',
        discussionId: null,
        isReply: false
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
        isReply: false
      }
    ])
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
