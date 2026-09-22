export type PlanningStamp = { at: string; actor: string }

export type PlanningGoal = {
  id: string
  label: string
  title: string
  metric: string
  target: string
  baseline: string
  reading: string
  deadline: string
  owner: string
  progress: number | null
  status: { label: string; tone: string }
  note: string
  sources: unknown[]
}

export type PlanningTask = {
  id: string
  number: string
  url?: string
  title: string
  kind: string
  progress_note: string
  goal: string
  sources: unknown[]
}

export type PlanningDeliverable = {
  id: string
  label: string
  goal: string
  url: string
}

export type PlanningSession = {
  id?: string
  title: string
}

export type PlanningDocument = {
  schema_version: number
  template_version: string
  version: string
  project: string
  header: { version_pair: string; context: string }
  provenance: { kind: string; notice: string }
  previous_version: string | null
  sources: unknown[]
  results: {
    version_label: string
    task_summary: string
    goals: PlanningGoal[]
    tasks: PlanningTask[]
    session_label: string
    session_kind: string
    session_meta: string
    sessions: PlanningSession[]
    deliverables: PlanningDeliverable[]
  }
  summary: {
    overview: string
    risks: string
    progress: string
    badges: string[][]
  }
  review: {
    live_notes: string
    meeting_url: string
    transcript: { path: string; sha256: string; text: string; source_url: string }
    minutes: { state: string; markdown: string }
    decisions: unknown[]
  }
  plan: {
    task_summary: string
    goals: PlanningGoal[]
    tasks: PlanningTask[]
  }
  confirmation: {
    results: PlanningStamp | null
    review_ready: PlanningStamp | null
    plan: PlanningStamp | null
  }
  updated_at: string | null
  progress_updates: unknown[]
}

export type PlanningVersionStamp = {
  version: string
  mtimeMs: number
}

export function emptyPlanningDocument(version = 'default'): PlanningDocument {
  return {
    schema_version: 2,
    template_version: 'se-v7-1-pilot-1',
    version,
    project: '版本计划',
    header: { version_pair: version, context: '' },
    provenance: {
      kind: 'new',
      notice: '尚未读取前序版本与当前事实；空值不代表已完成'
    },
    previous_version: null,
    sources: [],
    results: {
      version_label: '尚无可核对归档',
      task_summary: '待读取原计划与实际结果',
      goals: [],
      tasks: [],
      session_label: '未取得',
      session_kind: '原始记录',
      session_meta: '不编造历史会话',
      sessions: [],
      deliverables: []
    },
    summary: {
      overview: '',
      risks: '',
      progress: '',
      badges: [['待核对', '待讨论'], ['待核对']]
    },
    review: {
      live_notes: '',
      meeting_url: '',
      transcript: { path: '', sha256: '', text: '', source_url: '' },
      minutes: { state: 'missing', markdown: '' },
      decisions: []
    },
    plan: { task_summary: '等待讨论', goals: [], tasks: [] },
    confirmation: { results: null, review_ready: null, plan: null },
    updated_at: null,
    progress_updates: []
  }
}

export function pickPlanningVersion(stamps: readonly PlanningVersionStamp[]): string {
  if (stamps.length === 0) {
    return 'default'
  }
  const named = stamps.filter((stamp) => stamp.version !== 'default')
  const pool = named.length > 0 ? named : stamps
  return [...pool].sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.version ?? 'default'
}

export function parsePlanningDocument(raw: string, fallbackVersion: string): PlanningDocument {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('规划数据不是对象')
  }
  const record = parsed as PlanningDocument
  const base = emptyPlanningDocument(fallbackVersion)
  return {
    ...base,
    ...record,
    header: { ...base.header, ...record.header },
    provenance: { ...base.provenance, ...record.provenance },
    results: { ...base.results, ...record.results },
    summary: { ...base.summary, ...record.summary },
    review: {
      ...base.review,
      ...record.review,
      transcript: { ...base.review.transcript, ...record.review?.transcript },
      minutes: { ...base.review.minutes, ...record.review?.minutes }
    },
    plan: { ...base.plan, ...record.plan },
    confirmation: { ...base.confirmation, ...record.confirmation },
    version:
      typeof record.version === 'string' && record.version.trim() ? record.version : fallbackVersion
  }
}

export function serializePlanningDocument(data: PlanningDocument): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

export function planningNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function newPlanningId(): string {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function nextGoalLabel(goals: readonly { label: string }[]): string {
  const used = new Set(goals.map((goal) => goal.label))
  let n = 1
  while (used.has(`G${n}`)) {
    n += 1
  }
  return `G${n}`
}

export function newGoal(goals: readonly { label: string }[]): PlanningGoal {
  return {
    id: newPlanningId(),
    label: nextGoalLabel(goals),
    title: '',
    metric: '',
    target: '',
    baseline: '',
    reading: '',
    deadline: '',
    owner: '',
    progress: null,
    status: { label: '待填写', tone: 'neutral' },
    note: '',
    sources: []
  }
}

export function newTask(): PlanningTask {
  return {
    id: newPlanningId(),
    number: '',
    title: '',
    kind: 'feature',
    progress_note: '',
    goal: '',
    sources: []
  }
}

export function newDeliverable(): PlanningDeliverable {
  return { id: newPlanningId(), label: '', goal: '', url: '' }
}

export function touchPlanningDocument(data: PlanningDocument): PlanningDocument {
  return { ...data, updated_at: planningNow() }
}

export function confirmPlanningStage(
  data: PlanningDocument,
  stage: 'results' | 'plan'
): PlanningDocument {
  if (stage === 'plan') {
    if (
      !data.plan.goals.some((goal) => goal.title.trim()) ||
      !data.plan.tasks.some((task) => task.title.trim())
    ) {
      throw new Error('请先填写版本目标和任务，再确认计划。')
    }
  }
  return {
    ...data,
    confirmation: {
      ...data.confirmation,
      [stage]: { at: planningNow(), actor: 'user' }
    },
    updated_at: planningNow()
  }
}

export function clearStaleConfirmation(
  previous: PlanningDocument,
  next: PlanningDocument
): PlanningDocument {
  const confirmation = { ...next.confirmation }
  const resultsChanged = JSON.stringify(previous.results) !== JSON.stringify(next.results)
  const summaryChanged = JSON.stringify(previous.summary) !== JSON.stringify(next.summary)
  const reviewChanged = JSON.stringify(previous.review) !== JSON.stringify(next.review)
  const planChanged = JSON.stringify(previous.plan) !== JSON.stringify(next.plan)
  if (resultsChanged) {
    confirmation.results = null
    confirmation.review_ready = null
  }
  if (summaryChanged) {
    confirmation.review_ready = null
  }
  if (resultsChanged || summaryChanged || reviewChanged || planChanged) {
    confirmation.plan = null
  }
  return { ...next, confirmation, updated_at: planningNow() }
}
