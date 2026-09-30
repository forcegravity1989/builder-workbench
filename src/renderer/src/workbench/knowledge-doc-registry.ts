/** KB 分层：用户文档 vs 工程文档分开；正文从仓库读取。 */

export type KbTab = 'docs' | 'code' | 'audit'
export type KbAudience = 'user' | 'eng'
export type KbGroupRole = 'main' | 'side'
export type KbGapState = 'diff' | 'unknown' | 'ok'
export type KbGapAsk = 'impl' | 'design' | 'wait' | null
export type KbNoteKind = 'verbose' | 'role' | 'other'

export type KbGroup = {
  key: string
  name: string
  path: string
  who: string
  when: string
  hint: string
  role: KbGroupRole
  audience: KbAudience
}

export type KbDoc = {
  id: string
  group: string
  name: string
  path: string
  lede: string
  body: string
}

export type KbGap = {
  id: string
  docId: string
  state: KbGapState
  ask: KbGapAsk
  design: string
  impl: string
}

export type KbNote = {
  id: string
  docId: string
  kind: KbNoteKind
  body: string
}

export const KB_TABS: { key: KbTab; name: string }[] = [
  { key: 'docs', name: '文档' },
  { key: 'code', name: '代码' },
  { key: 'audit', name: '对账' }
]

export const KB_AUDIENCES: { key: KbAudience; name: string; hint: string }[] = [
  { key: 'user', name: '用户文档', hint: '产品帮助与对外 README · 不对账' },
  { key: 'eng', name: '工程文档', hint: '契约 / 参考 / 活跃特性 · 对账主线' }
]

/** 工程侧约束线：原则 → 契约 → 活跃特性。 */
export const KB_ENG_FLOW = [{ say: '约束契约' }, { say: '约束这次' }] as const

/** 工程文档清单阅读顺序：项目约定在最上，工程参考在最后。 */
export const KB_ENG_LIST_ORDER = [
  'eng-bw',
  'eng-agents',
  'eng-principles',
  'eng-contract',
  'eng-features',
  'eng-reference'
] as const

/** 稳定的 AI-native 文档角色（路径因仓而异，角色跨仓一致）。 */
export const KB_ROLE_KEYS = [
  'user-docs',
  'user-readme',
  'eng-principles',
  'eng-contract',
  'eng-features',
  'eng-reference',
  'eng-agents',
  'eng-bw'
] as const

export type KbRoleKey = (typeof KB_ROLE_KEYS)[number]

export const KB_GROUPS: KbGroup[] = [
  {
    key: 'user-docs',
    name: '产品帮助',
    path: 'docs/site/content/docs/',
    who: '文档站维护',
    when: '用户可见行为变了',
    hint: 'onorca.dev/docs',
    role: 'main',
    audience: 'user'
  },
  {
    key: 'user-readme',
    name: '对外 README',
    path: 'README · docs/readme/',
    who: '产品对外文案',
    when: '定位或功能墙变了',
    hint: '给访客看，不进工程对账',
    role: 'main',
    audience: 'user'
  },
  {
    key: 'eng-principles',
    name: '愿景和原则',
    path: 'docs/01-principles/',
    who: '你拍板后改',
    when: '客群 / 主张要变',
    hint: '本仓常空 · 待补',
    role: 'main',
    audience: 'eng'
  },
  {
    key: 'eng-contract',
    name: '设计与契约',
    path: 'STYLEGUIDE · 硬契约',
    who: '你维护，代码不读写',
    when: '人确认契约错了才改',
    hint: 'UI 正本 / 边界 / 兼容',
    role: 'main',
    audience: 'eng'
  },
  {
    key: 'eng-features',
    name: '当前活跃特性',
    path: 'features · intent/spec',
    who: '你点头才算过',
    when: '开特性 / 推进中',
    hint: 'intent / spec / roadmap',
    role: 'main',
    audience: 'eng'
  },
  {
    key: 'eng-reference',
    name: '工程参考',
    path: 'docs/reference/',
    who: '实现时查阅',
    when: '平台 / 运维 / 备忘更新',
    hint: 'howto · 不进对账主线',
    role: 'side',
    audience: 'eng'
  },
  {
    key: 'eng-agents',
    name: 'Agent 入口',
    path: '仓根 AGENTS 等',
    who: '你写',
    when: '规矩或用词变了',
    hint: '约束 agent，不是用户文',
    role: 'side',
    audience: 'eng'
  },
  {
    key: 'eng-bw',
    name: '项目约定',
    path: '.bw/',
    who: 'Workbench 写，你合 MR',
    when: '接入 / 改名片',
    hint: '机器名片',
    role: 'side',
    audience: 'eng'
  }
]

/** 已知文档槽位：路径与展示名；仓库里存在才出现在清单（展示用，分类按内置规则）。 */
export const KB_REGISTRY_DOCS: Omit<KbDoc, 'body'>[] = [
  {
    id: 'org',
    group: 'eng-principles',
    name: '01 · 文档组织结构',
    path: 'docs/01-principles/01-document-organization.md',
    lede: '整仓知识怎么分层。'
  },
  {
    id: 'architecture',
    group: 'eng-contract',
    name: 'architecture.md',
    path: 'docs/architecture.md',
    lede: '整体旅程 + 逻辑模块。'
  },
  {
    id: 'styleguide',
    group: 'eng-contract',
    name: 'STYLEGUIDE.md',
    path: 'docs/STYLEGUIDE.md',
    lede: 'UI 设计系统正本。'
  },
  {
    id: 'adr6',
    group: 'eng-contract',
    name: 'ADR-0006 会话执行内嵌',
    path: 'docs/02-adr/0006-会话执行内嵌-废弃外部Orca嵌页.md',
    lede: '难回头的决定，一条一篇。'
  },
  {
    id: 'nse-intent',
    group: 'eng-features',
    name: 'intent.md',
    path: 'docs/05-features/native-session-execution/intent.md',
    lede: '这次要给用户什么。'
  },
  {
    id: 'nse-spec',
    group: 'eng-features',
    name: 'spec.md',
    path: 'docs/05-features/native-session-execution/spec.md',
    lede: '规格；必须带可点原型链接。'
  },
  {
    id: 'agents',
    group: 'eng-agents',
    name: 'AGENTS.md',
    path: 'AGENTS.md',
    lede: '怎么建、怎么跑、怎么测。'
  },
  {
    id: 'readme',
    group: 'user-readme',
    name: 'README.md',
    path: 'README.md',
    lede: '对外产品入口。'
  },
  {
    id: 'project',
    group: 'eng-bw',
    name: 'project.toml',
    path: '.bw/project.toml',
    lede: '项目名片：叫啥、目标是啥。'
  }
]

export const ROOT_USER_BASENAMES = new Set(['README.md'])
export const ROOT_ENG_BASENAMES = new Set(['AGENTS.md', 'CLAUDE.md', 'CONTEXT.md'])

export function kbGroupByKey(key: string): KbGroup | undefined {
  return KB_GROUPS.find((g) => g.key === key)
}

export function kbGroupsForAudience(audience: KbAudience): KbGroup[] {
  return KB_GROUPS.filter((g) => g.audience === audience)
}

export function kbDocById(docs: KbDoc[], id: string): KbDoc | undefined {
  return docs.find((d) => d.id === id)
}

export function registryMetaForPath(relativePath: string): Omit<KbDoc, 'body'> | undefined {
  const norm = normalizeKbRelativePath(relativePath)
  return KB_REGISTRY_DOCS.find((d) => d.path === norm)
}

export function normalizeKbRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
}
