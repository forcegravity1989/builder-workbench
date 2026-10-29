/**
 * PR 评审消息协议（pr-review-notify 特性共用底座）：拼装与识别。
 * 消息格式即识别协议——接收侧只认「【评审请求】」前缀＋可解析的「链接：」行；
 * 链接行是 BW 自有深链（workbench://pr-review/…，scheme 与打包版注册的一致，
 * 点击落安装 exe 内跳转，不开网页），历史消息的 github 链接行同样识别。
 * 解析失败按普通文本处理，不跳转。纯函数，renderer 两侧（发送拼装/接收识别）
 * 与 main 深链入口共用。
 */

/** 消息首行前缀；识别协议的唯一入口标记。 */
export const REVIEW_MESSAGE_PREFIX = '【评审请求】'

/** BW 自有深链前缀；正文是 github.com/<owner>/<name>/pull/<N>。 */
export const REVIEW_DEEP_LINK_PREFIX = 'workbench://pr-review/'

export type ReviewRequestPayload = {
  /** owner/name */
  repo: string
  prNumber: number
  title: string
}

/** 深链正文精确匹配：github.com/<owner>/<name>/pull/<N> 整段，不带余料。 */
const DEEP_LINK_BODY_PATTERN = /^github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)$/

/** 历史 github 链接行沿用宽松匹配（链接行出现即取，与首版协议一致）。 */
const LEGACY_PR_URL_PATTERN = /github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)/

/** 拼评审深链：workbench://pr-review/github.com/<owner>/<name>/pull/<N>。 */
export function buildReviewDeepLink(repo: string, prNumber: number): string {
  return `${REVIEW_DEEP_LINK_PREFIX}github.com/${repo}/pull/${prNumber}`
}

/**
 * 解析评审深链（OS 分发进 exe 的 argv/open-url 与消息链接行共用）。
 * 只认深链前缀＋整段精确正文，畸形返回 null。
 */
export function parseReviewDeepLink(value: string): { repo: string; prNumber: number } | null {
  const trimmed = value.trim()
  if (!trimmed.startsWith(REVIEW_DEEP_LINK_PREFIX)) {
    return null
  }
  const match = trimmed.slice(REVIEW_DEEP_LINK_PREFIX.length).match(DEEP_LINK_BODY_PATTERN)
  if (!match) {
    return null
  }
  return { repo: `${match[1]}/${match[2]}`, prNumber: Number(match[3]) }
}

/** 从启动参数里找评审深链（照 skillShareIdFromArguments 的守卫模式）。 */
export function reviewDeepLinkFromArguments(
  argv: readonly string[]
): { repo: string; prNumber: number } | null {
  for (const value of argv) {
    if (value.includes(REVIEW_DEEP_LINK_PREFIX)) {
      const parsed = parseReviewDeepLink(value)
      if (parsed) {
        return parsed
      }
    }
  }
  return null
}

/** 历史 github 链接行沿用宽松匹配（链接行出现即取，与首版协议一致）。 */
function parseLegacyPrUrl(value: string): { repo: string; prNumber: number } | null {
  const match = value.match(LEGACY_PR_URL_PATTERN)
  if (!match) {
    return null
  }
  return { repo: `${match[1]}/${match[2]}`, prNumber: Number(match[3]) }
}

/**
 * 拼装评审消息：首行标识＋PR 标题，链接行携 BW 自有深链。
 * 识别协议键在链接行（仓库/编号以深链为准），标题只作展示。
 */
export function buildReviewMessage(payload: ReviewRequestPayload): string {
  return [
    `${REVIEW_MESSAGE_PREFIX}PR #${payload.prNumber} ${payload.title}`,
    `链接：${buildReviewDeepLink(payload.repo, payload.prNumber)}`
  ].join('\n')
}

/**
 * 识别评审消息并提取跳转负载。只认前缀＋可解析的链接行（深链优先、
 * 历史 github 链接行兼容）；缺任一要素按普通文本消息处理，返回 null。
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
  const linkValue = urlLine.slice('链接：'.length)
  const parsed = parseReviewDeepLink(linkValue) ?? parseLegacyPrUrl(linkValue)
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
