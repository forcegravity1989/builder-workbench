/**
 * Acceptance board sections: the four meeting steps as same-page locators. They
 * are reading anchors only — not gates, not completion buttons, and deliberately
 * not the material's `workflow.stage` enum (preparation/showcase/archive), which
 * stays a session-model SOP contract the board never renders as a lamp.
 */
export type AcceptanceSectionId = 'prepare' | 'showcase' | 'minutes' | 'archive'

/** Top journey navigation copy, verbatim from the approved v10 prototype. */
export const ACCEPTANCE_SECTIONS: [AcceptanceSectionId, string, string][] = [
  ['prepare', '验收准备', '部署服务与证据报告'],
  ['showcase', 'Showcase', '逐目标核对交付结果'],
  ['minutes', '会议纪要', '共识与遗留 · 人工确认'],
  ['archive', '归档 PR 及发版本', '原生 PR 再审 · 授权发布']
]
