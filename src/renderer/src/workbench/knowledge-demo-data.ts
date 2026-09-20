/** 对账/代码页演示数据；文档清单与正文改从仓库加载（见 knowledge-repo-loader）。 */

import type { KbGap, KbNote, KbNoteKind } from './knowledge-doc-registry'

export type {
  KbAudience,
  KbDoc,
  KbGap,
  KbGapAsk,
  KbGapState,
  KbGroup,
  KbGroupRole,
  KbNote,
  KbNoteKind,
  KbTab
} from './knowledge-doc-registry'

export {
  KB_AUDIENCES,
  KB_ENG_FLOW,
  KB_GROUPS,
  KB_REGISTRY_DOCS,
  KB_TABS,
  kbDocById,
  kbGroupByKey,
  kbGroupsForAudience
} from './knowledge-doc-registry'

export const KB_NOT_YOURS = [
  { name: 'docs/site 站点工程元数据', go: '不进知识库清单' },
  { name: 'standard/ 与技能', go: '去设置 · AI Assets / Skills' },
  { name: '指标读数', go: '去总览看灯与数字' }
] as const

/** 对账演示：asset-audit 会话未接真后端前保留。 */
export const KB_GAPS: KbGap[] = [
  {
    id: 'g-kb',
    docId: 'nse-spec',
    state: 'diff',
    ask: 'impl',
    design: '知识库三页签：文档 / 代码 / 对账。',
    impl: '上一轮仍是文档 / 代码图 / 资产，与 V7 原型不一致。'
  },
  {
    id: 'g-41',
    docId: 'architecture',
    state: 'unknown',
    ask: 'wait',
    design: '架构全景 Kruchten 4+1，对照代码更新；人读相对上次变了什么。',
    impl: '正本未建。没数据，不装绿。'
  },
  {
    id: 'g-adr6',
    docId: 'adr6',
    state: 'ok',
    ask: null,
    design: '执行面 = 原生终端 + 建树序。废弃外部 Orca 嵌页。',
    impl: 'Workbench 叠层已按 ADR 走 Orca 执行核 + TaskPage。'
  },
  {
    id: 'g-agents',
    docId: 'agents',
    state: 'ok',
    ask: null,
    design: '门禁全过再提交；完成永远由人点。',
    impl: '实现与门禁、四铁律一致。'
  }
]

export const KB_AUDIT = {
  when: '09-15',
  last: '09-15 周二 20:00 · 自动',
  issue: '#120 Workbench 保真'
} as const

export const KB_NOTE_KINDS: { key: KbNoteKind; name: string }[] = [
  { key: 'verbose', name: '不够简洁' },
  { key: 'role', name: '定位不一致' },
  { key: 'other', name: '其他' }
]

export const KB_INITIAL_NOTES: KbNote[] = [
  {
    id: 'n-arch-1',
    docId: 'architecture',
    kind: 'verbose',
    body: '整体旅程和模块心智叠在一篇里，段落过长，读不出「先看哪一节」。'
  }
]

export const KB_VIEWS = [
  { name: '逻辑', hint: '系统由哪些部分组成' },
  { name: '过程', hint: '跑起来怎么交互' },
  { name: '开发', hint: '代码怎么组织' },
  { name: '物理', hint: '部署在哪' },
  { name: '场景', hint: '关键用例怎么走' }
] as const

export const KB_BIGFILES = [
  { path: 'src/renderer/src/store/index.ts', lang: 'TypeScript', nodes: 214, size: '61.8 KB' },
  { path: 'src/main/index.ts', lang: 'TypeScript', nodes: 187, size: '48.2 KB' },
  { path: 'src/renderer/src/App.tsx', lang: 'TypeScript', nodes: 143, size: '39.5 KB' },
  {
    path: 'src/renderer/src/components/task-page/TaskPage.tsx',
    lang: 'TypeScript',
    nodes: 96,
    size: '27.1 KB'
  },
  { path: 'electron.vite.config.ts', lang: 'TypeScript', nodes: 88, size: '24.6 KB' }
] as const
