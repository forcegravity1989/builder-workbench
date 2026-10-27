import type { BoardAnnotation } from './types'

/** Copy/send output: one line per annotation, `- [对象] 文本`. */
export function formatBoardAnnotationsAsMarkdown(annotations: BoardAnnotation[]): string {
  return annotations.map((item) => `- [${item.ref.label}] ${item.text}`).join('\n')
}

/**
 * Send-prompt design source (prototype g3-model.js annotationsSendPrompt). #431
 * 规范轮定为中性抬头：两屏共享的注入句只标明「这是会议反馈批注」，不承载屏别意图
 * ——双意图（计划屏按批注帮人调整目标、验收屏按对象回应或修订材料，均为纪要整理
 * 输入之一）、全量清单以最新一次为准、会中发送是累积输入不是整理请求等语义，各屏
 * SKILL（week-planning / version-acceptance）已分别承载，注入句不复述，避免计划
 * 视角「调整目标」漏进只读的验收屏（SKILL-MD-SPEC §规则单点、§用户面表达）。
 */
export function annotationsSendPrompt(count: number): string {
  return `会议反馈批注（${count} 条）内容如下：`
}

/** Panel「发送给计划助手」payload: the design-source sentence + the list. */
export function boardAnnotationsSendPrompt(annotations: BoardAnnotation[]): string {
  return [annotationsSendPrompt(annotations.length), formatBoardAnnotationsAsMarkdown(annotations)]
    .filter(Boolean)
    .join('\n')
}
