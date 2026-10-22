import type { BoardAnnotation } from './types'

/** Copy/send output: one line per annotation, `- [对象] 文本`. */
export function formatBoardAnnotationsAsMarkdown(annotations: BoardAnnotation[]): string {
  return annotations.map((item) => `- [${item.ref.label}] ${item.text}`).join('\n')
}

/**
 * Send-prompt design source (prototype g3-model.js annotationsSendPrompt, round-9
 * 瘦身): full-list semantics + 「现在不要整理」— an in-meeting send is cumulative
 * input, not an organize request (the old sentence ended in 「整理」 and read as
 * one). SOP-level rules live in the week-planning Skill, not here.
 */
export function annotationsSendPrompt(count: number): string {
  return `记录当前板面全部批注（${count} 条，全量清单，以最新一次为准），作为纪要输入；现在不要整理。`
}

/** Panel「发送给计划助手」payload: the design-source sentence + the list. */
export function boardAnnotationsSendPrompt(annotations: BoardAnnotation[]): string {
  return [annotationsSendPrompt(annotations.length), formatBoardAnnotationsAsMarkdown(annotations)]
    .filter(Boolean)
    .join('\n')
}
