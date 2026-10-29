/**
 * PR 评审消息协议（pr-review-notify 特性共用底座）：拼装与识别。
 * 消息格式即识别协议——接收侧只认「【评审请求】」前缀＋可解析的仓库/编号行；
 * 解析失败按普通文本处理，不跳转。纯函数，renderer 两侧（发送拼装/接收识别）共用。
 */

/** 消息首行前缀；识别协议的唯一入口标记。 */
export const REVIEW_MESSAGE_PREFIX = '【评审请求】'

export type ReviewRequestPayload = {
  /** owner/name */
  repo: string
  prNumber: number
  title: string
}

/** 从 PR 链接行提取仓库与编号；链接行缺失或不可解析时返回 null。 */
function parsePrUrl(url: string): { repo: string; prNumber: number } | null {
  const match = url.match(/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/)
  if (!match) {
    return null
  }
  return { repo: `${match[1]}/${match[2]}`, prNumber: Number(match[3]) }
}

/**
 * 拼装评审消息：首行标识＋PR 标题，随后仓库/分支/链接各一行。
 * 分支为空时省略该行（detached HEAD 等场景），链接由仓库与编号推导。
 */
export function buildReviewMessage(payload: ReviewRequestPayload & { branch?: string }): string {
  const lines = [
    `${REVIEW_MESSAGE_PREFIX}PR #${payload.prNumber} ${payload.title}`,
    `仓库：${payload.repo}`,
    ...(payload.branch ? [`分支：${payload.branch}`] : []),
    `链接：https://github.com/${payload.repo}/pull/${payload.prNumber}`
  ]
  return lines.join('\n')
}

/**
 * 识别评审消息并提取跳转负载。只认前缀＋可解析的链接行（仓库与编号以链接为准，
 * 避免手打仓库行的笔误把人带错项目）；缺任一要素按普通文本消息处理，返回 null。
 */
export function parseReviewMessage(text: string): (ReviewRequestPayload & { url: string }) | null {
  if (!text.startsWith(REVIEW_MESSAGE_PREFIX)) {
    return null
  }
  const urlLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('链接：'))
  if (!urlLine) {
    return null
  }
  const parsed = parsePrUrl(urlLine.slice('链接：'.length))
  if (!parsed) {
    return null
  }
  const titleMatch = text.match(/PR #\d+\s+(.+)/)
  return {
    repo: parsed.repo,
    prNumber: parsed.prNumber,
    title: titleMatch ? titleMatch[1]!.trim() : '',
    url: `https://github.com/${parsed.repo}/pull/${parsed.prNumber}`
  }
}
