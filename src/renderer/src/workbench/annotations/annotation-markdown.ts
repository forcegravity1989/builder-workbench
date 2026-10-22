import type { BoardAnnotation } from './types'

/** Copy/send output: one line per annotation, `- [对象] 文本`. */
export function formatBoardAnnotationsAsMarkdown(annotations: BoardAnnotation[]): string {
  return annotations.map((item) => `- [${item.ref.label}] ${item.text}`).join('\n')
}

/** Prompt for the panel's「发送给计划助手」: guidance sentence + the list. */
export function boardAnnotationsSendPrompt(annotations: BoardAnnotation[]): string {
  return [
    '以下是评审会在线批注，作为会议纪要输入整理',
    formatBoardAnnotationsAsMarkdown(annotations)
  ]
    .filter(Boolean)
    .join('\n')
}
