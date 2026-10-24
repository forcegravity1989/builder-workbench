import type { BoardAnnotation } from './types'

/** Copy/send output: one line per annotation, `- [对象] 文本`. */
export function formatBoardAnnotationsAsMarkdown(annotations: BoardAnnotation[]): string {
  return annotations.map((item) => `- [${item.ref.label}] ${item.text}`).join('\n')
}

/**
 * Send-prompt design source (prototype g3-model.js annotationsSendPrompt, round-9
 * 瘦身; #431 规范轮再洗): 批注发送双意图（2026-10-24 负责人明确）——①模型按对象
 * 理解意见，帮人按批注调整目标；②会议纪要整理的输入之一。「现在不要整理」保留：
 * 会中发送是累积输入、不是整理请求（旧句以「整理」结尾被误读）。全量清单语义
 * （「以最新一次为准」）归两屏 SKILL——用户口吻文本只留人话（SKILL-MD-SPEC
 * §用户面表达）。
 */
export function annotationsSendPrompt(count: number): string {
  return `记录当前板面全部批注（${count} 条），作为调整目标的依据和会议纪要的输入；现在不要整理。`
}

/** Panel「发送给计划助手」payload: the design-source sentence + the list. */
export function boardAnnotationsSendPrompt(annotations: BoardAnnotation[]): string {
  return [annotationsSendPrompt(annotations.length), formatBoardAnnotationsAsMarkdown(annotations)]
    .filter(Boolean)
    .join('\n')
}
