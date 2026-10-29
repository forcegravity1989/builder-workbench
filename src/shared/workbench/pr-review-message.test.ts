import { describe, expect, it } from 'vitest'
import {
  REVIEW_MESSAGE_PREFIX,
  buildReviewMessage,
  parseReviewDeepLink,
  parseReviewMessage,
  reviewDeepLinkFromArguments
} from './pr-review-message'

// 环 4 两类看护之数据协议：评审消息格式即识别协议（spec 方案一），链接行是
// BW 自有深链（workbench://，落安装 exe）；拼装/识别往返、历史格式兼容与
// 拒判边界是接收侧跳转与 main 深链入口的唯一依据。

describe('buildReviewMessage', () => {
  it('拼装两行评审消息（前缀行＋深链行），往返识别提取仓库/编号/标题', () => {
    const text = buildReviewMessage({
      repo: 'forcegravity1989/builder-workbench',
      prNumber: 470,
      title: '修复：批注框支持缩小与记忆尺寸'
    })
    expect(text).toBe(
      [
        `${REVIEW_MESSAGE_PREFIX}PR #470 修复：批注框支持缩小与记忆尺寸`,
        '链接：workbench://pr-review/github.com/forcegravity1989/builder-workbench/pull/470'
      ].join('\n')
    )
    expect(text).not.toContain('仓库：')
    expect(text).not.toContain('分支：')
    expect(parseReviewMessage(text)).toEqual({
      repo: 'forcegravity1989/builder-workbench',
      prNumber: 470,
      title: '修复：批注框支持缩小与记忆尺寸',
      url: 'https://github.com/forcegravity1989/builder-workbench/pull/470'
    })
    // CRLF 换行的消息同样识别（群消息可能带回车）。
    expect(parseReviewMessage(text.replace(/\n/g, '\r\n'))?.prNumber).toBe(470)
  })
})

describe('parseReviewMessage', () => {
  it('历史消息的 github 链接行同样识别（兼容首版协议）', () => {
    const legacy = [
      `${REVIEW_MESSAGE_PREFIX}PR #95 标题`,
      '仓库：octo/proj',
      '分支：feat/x',
      '链接：https://github.com/octo/proj/pull/95'
    ].join('\n')
    expect(parseReviewMessage(legacy)).toEqual({
      repo: 'octo/proj',
      prNumber: 95,
      title: '标题',
      url: 'https://github.com/octo/proj/pull/95'
    })
  })

  it('普通文本、无链接行、链接行不可解析均不识别（拒判边界）', () => {
    expect(parseReviewMessage('大家好')).toBeNull()
    expect(parseReviewMessage('【评审请求】 手打的，没有链接行')).toBeNull()
    expect(
      parseReviewMessage(
        [`${REVIEW_MESSAGE_PREFIX}PR #1 t`, '仓库：octo/proj', '链接：not-a-url'].join('\n')
      )
    ).toBeNull()
  })
})

describe('parseReviewDeepLink', () => {
  it('深链与启动参数解析：合法提取仓库/编号，畸形拒判', () => {
    expect(parseReviewDeepLink('workbench://pr-review/github.com/octo/proj/pull/7')).toEqual({
      repo: 'octo/proj',
      prNumber: 7
    })
    expect(
      reviewDeepLinkFromArguments([
        'C:\\app\\Workbench.exe',
        'workbench://pr-review/github.com/octo/proj/pull/7'
      ])
    ).toEqual({ repo: 'octo/proj', prNumber: 7 })
    expect(reviewDeepLinkFromArguments(['C:\\app\\Workbench.exe', '--serve'])).toBeNull()
    // 深链正文必须整段精确：带查询串、缺编号、非 github 正文均拒判。
    expect(parseReviewDeepLink('workbench://pr-review/github.com/octo/proj/pull/7?x=1')).toBeNull()
    expect(parseReviewDeepLink('workbench://pr-review/github.com/octo/proj/pull/')).toBeNull()
    expect(parseReviewDeepLink('workbench://pr-review/https://evil.example/pull/1')).toBeNull()
    expect(parseReviewDeepLink('https://github.com/octo/proj/pull/7')).toBeNull()
  })
})
