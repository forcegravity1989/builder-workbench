/**
 * WeLink 群消息内容解析（pr-review-notify 方案一）。
 * CARD_MSG 的 content 是 JSON 串（引用回复卡、标题链接卡等形态），IMAGESPAN_MSG 是
 * `/:um_begin{…}/:um_end` 图片坐标串＋随图文字；这里解析成人可读视图，解析不了
 * 如实回落占位，不猜内容。字段口径采样自真实群历史（2026-10-29）。
 */

/** CARD_MSG 解析结果：引用回复卡 / 标题链接卡 / 未知形态。 */
export type WelinkCardContent =
  | {
      kind: 'reply'
      replyText: string
      quoteName: string | null
      quoteText: string | null
    }
  | { kind: 'link'; title: string; url: string }
  | { kind: 'unknown' }

/** IMAGESPAN_MSG 解析结果：坐标串首段是链接，其余字段尽力取。 */
export type WelinkImageContent = {
  url: string
  fileName: string | null
  bytes: number | null
  caption: string
}

/** 图片坐标串记号；TEXT_MSG 内嵌同一记号（混发图片＋文字）也靠它剥离。 */
const IMAGE_TOKEN = /\/:um_begin\{([\s\S]*?)\}\/:um_end/
const IMAGE_TOKEN_GLOBAL = /\/:um_begin\{([\s\S]*?)\}\/:um_end/g

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** 把内嵌图片坐标串替换成「[图片]」，正文只留人可读文字。 */
export function stripWelinkImageTokens(text: string): string {
  return text.replace(IMAGE_TOKEN_GLOBAL, '[图片]')
}

export function parseWelinkCardContent(content: string): WelinkCardContent {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { kind: 'unknown' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unknown' }
  }
  const card = parsed as Record<string, unknown>
  // 引用回复卡：replyMsg.content 是回复正文，preMsg 是被引用的原消息。
  const cardContext = card.cardContext
  if (typeof cardContext === 'object' && cardContext !== null && !Array.isArray(cardContext)) {
    const context = cardContext as Record<string, unknown>
    const replyMsg = context.replyMsg
    if (typeof replyMsg === 'object' && replyMsg !== null && !Array.isArray(replyMsg)) {
      const replyText = asNonEmptyString((replyMsg as Record<string, unknown>).content)
      if (replyText) {
        const preMsg =
          typeof context.preMsg === 'object' &&
          context.preMsg !== null &&
          !Array.isArray(context.preMsg)
            ? (context.preMsg as Record<string, unknown>)
            : null
        return {
          kind: 'reply',
          replyText,
          quoteName:
            (preMsg &&
              (asNonEmptyString(preMsg.nameZH) ??
                asNonEmptyString(preMsg.nameEN) ??
                asNonEmptyString(preMsg.sender))) ||
            null,
          quoteText: preMsg
            ? asNonEmptyString(stripWelinkImageTokens(String(preMsg.content)))
            : null
        }
      }
    }
  }
  // 标题链接卡（会议/应用卡等）：标题＋可打开的链接；缺链接不成视图。
  const title = asNonEmptyString(card.title) ?? asNonEmptyString(card.titleEn)
  const url =
    asNonEmptyString(card.sourceUri) ??
    asNonEmptyString(card.uriAndroid) ??
    asNonEmptyString(card.uriIOS) ??
    asNonEmptyString(card.url)
  if (title && url) {
    return { kind: 'link', title, url }
  }
  return { kind: 'unknown' }
}

export function parseWelinkImageSpan(content: string): WelinkImageContent | null {
  const match = content.match(IMAGE_TOKEN)
  if (!match) {
    return null
  }
  // 坐标串竖线分段：链接|类型|字节数|文件名|…（采样口径，段数不承诺固定）。
  const fields = (match[1] ?? '').split('|')
  const url = fields[0]?.trim() ?? ''
  if (!/^https?:\/\//.test(url)) {
    return null
  }
  const bytes = Number(fields[2])
  return {
    url,
    fileName: fields[3]?.trim() || null,
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : null,
    caption: stripWelinkImageTokens(content).trim()
  }
}
