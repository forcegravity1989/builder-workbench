import { describe, expect, it } from 'vitest'
import { REVIEW_MESSAGE_PREFIX, buildReviewMessage, parseReviewMessage } from './pr-review-message'

// 环 4 两类看护之数据协议：评审消息格式即识别协议（spec 方案一），
// 拼装/识别往返与拒判边界是接收侧跳转的唯一依据。

describe('buildReviewMessage', () => {
  it('拼装含分支的四行评审消息；无分支时省略分支行', () => {
    expect(
      buildReviewMessage({
        repo: 'forcegravity1989/builder-workbench',
        prNumber: 470,
        title: '修复：批注框支持缩小与记忆尺寸',
        branch: 'fix/annotation-box-resize'
      })
    ).toBe(
      [
        `${REVIEW_MESSAGE_PREFIX}PR #470 修复：批注框支持缩小与记忆尺寸`,
        '仓库：forcegravity1989/builder-workbench',
        '分支：fix/annotation-box-resize',
        '链接：https://github.com/forcegravity1989/builder-workbench/pull/470'
      ].join('\n')
    )
    const branchless = buildReviewMessage({ repo: 'octo/proj', prNumber: 7, title: 't' })
    expect(branchless).not.toContain('分支：')
    expect(parseReviewMessage(branchless)?.prNumber).toBe(7)
  })
})

describe('parseReviewMessage', () => {
  it('识别拼装产物并提取仓库/编号/标题（往返）', () => {
    const text = buildReviewMessage({
      repo: 'octo/proj',
      prNumber: 95,
      title: '标题',
      branch: 'b'
    })
    expect(parseReviewMessage(text)).toEqual({
      repo: 'octo/proj',
      prNumber: 95,
      title: '标题',
      url: 'https://github.com/octo/proj/pull/95'
    })
  })

  it('普通文本、无前缀、链接行不可解析均不识别（拒判边界）', () => {
    expect(parseReviewMessage('大家好')).toBeNull()
    expect(parseReviewMessage('【评审请求】 手打的，没有链接行')).toBeNull()
    expect(
      parseReviewMessage(
        [`${REVIEW_MESSAGE_PREFIX}PR #1 t`, '仓库：octo/proj', '链接：not-a-url'].join('\n')
      )
    ).toBeNull()
  })

  it('CRLF 换行的消息同样识别（群消息可能带回车）', () => {
    const text = buildReviewMessage({ repo: 'a/b', prNumber: 3, title: 'x' }).replace(/\n/g, '\r\n')
    expect(parseReviewMessage(text)?.prNumber).toBe(3)
  })
})
