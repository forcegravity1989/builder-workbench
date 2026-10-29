import { z } from 'zod'
import {
  MilestoneFeatureSchema,
  ScheduledVersionSchema,
  milestoneDraft,
  type MilestoneRead,
  type MilestoneDraft
} from '../../../shared/workbench/project-milestones'
import { latestMilestoneMonth } from '../../../shared/workbench/milestone-calendar'

// Recovery must accept unfinished fields; submission still validates the business material schema.
const draftSchema = z.strictObject({
  material: z.strictObject({
    schema_version: z.literal(1),
    months: z
      .array(
        z.strictObject({
          month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
          outcome: z.string()
        })
      )
      .max(240),
    features: z.array(
      MilestoneFeatureSchema.extend({
        title: z.string(),
        owner: z.string(),
        pre: z.strictObject({ version: z.string(), cycleId: z.string().min(1) }).nullable(),
        release: z.strictObject({ version: z.string(), cycleId: z.string().min(1) }).nullable()
      })
    )
  }),
  versions: z.array(ScheduledVersionSchema.extend({ version: z.string() }))
})
const recoverySchema = z.strictObject({
  schema_version: z.literal(1),
  draft: draftSchema,
  baseline: draftSchema,
  expectedFormal: z.string().min(1),
  expectedProposal: z.string().nullable(),
  editing: z.boolean(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  scrollX: z.number().finite().nonnegative().nullable(),
  scrollY: z.number().finite().nonnegative(),
  pageY: z.number().finite().nonnegative(),
  retry: z.boolean(),
  submitError: z.string().optional()
})
type MilestoneRecovery = z.infer<typeof recoverySchema>
const milestoneRecoveryKey = (scope: string) => `workbench.milestones.draft:${scope}`
function parseMilestoneRecovery(raw: string): MilestoneRecovery {
  return recoverySchema.parse(JSON.parse(raw))
}
function milestoneRecoveryValue(value: {
  draft: MilestoneDraft
  baseline: MilestoneDraft
  expectedFormal: string
  expectedProposal: string | null
  editing: boolean
  month: string
  scrollX: number | null
  scrollY: number
  pageY: number
  retry: boolean
  submitError?: string
}): MilestoneRecovery {
  const {
    draft,
    baseline,
    expectedFormal,
    expectedProposal,
    editing,
    month,
    scrollX,
    scrollY,
    pageY,
    retry,
    submitError
  } = value
  return {
    schema_version: 1,
    draft,
    baseline,
    expectedFormal,
    expectedProposal,
    editing,
    month,
    scrollX,
    scrollY,
    pageY,
    retry,
    submitError
  }
}

export type Session = {
  data: MilestoneRead
  draft: MilestoneDraft
  baseline: MilestoneDraft
  expectedFormal: string
  expectedProposal: string | null
  editing: boolean
  month: string
  scrollX: number | null
  scrollY: number
  pageY: number
  retry: boolean
  submitError?: string
  sourceConflict?: string
  past: MilestoneDraft[]
  future: MilestoneDraft[]
  field: Element | null
  recoveryRaw: string | null
  recoveryBlocked?: boolean
  persistenceError?: string
}
// The disk cache only recovers local edits; committed .bw materials remain authoritative.
export const sessions = new Map<string, Session>()
export const submitting = new Set<string>()
const listeners = new Set<() => void>()
export const notify = () => {
  for (const listener of listeners) {
    listener()
  }
}
export const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const changed = (s: Session) => JSON.stringify(s.draft) !== JSON.stringify(s.baseline)
export function fresh(data: MilestoneRead, previous?: Session): Session {
  const snapshot = data.proposal ?? data.formal
  const draft = milestoneDraft(snapshot)
  return {
    data,
    draft,
    baseline: structuredClone(draft),
    expectedFormal: data.formal.revision,
    expectedProposal: data.branchHead,
    editing: previous?.editing ?? false,
    month: previous?.month ?? latestMilestoneMonth(draft),
    scrollX: previous?.scrollX ?? null,
    scrollY: previous?.scrollY ?? 0,
    pageY: previous?.pageY ?? 0,
    retry: false,
    past: [],
    future: [],
    field: null,
    recoveryRaw: previous?.recoveryRaw ?? null,
    recoveryBlocked: previous?.recoveryBlocked,
    persistenceError: previous?.persistenceError
  }
}
export function persist(key: string, next: Session): Session {
  if (next.recoveryBlocked) {
    return next
  }
  try {
    const storageKey = milestoneRecoveryKey(key)
    if (localStorage.getItem(storageKey) !== next.recoveryRaw) {
      return {
        ...next,
        persistenceError:
          '另一窗口已更新本机恢复记录，当前输入仍在页面；提交后再退出，避免丢失修改。'
      }
    }
    const raw = changed(next) || next.retry ? JSON.stringify(milestoneRecoveryValue(next)) : null
    if (raw !== next.recoveryRaw) {
      if (raw === null) {
        localStorage.removeItem(storageKey)
      } else {
        localStorage.setItem(storageKey, raw)
      }
    }
    return { ...next, recoveryRaw: raw, persistenceError: undefined }
  } catch {
    return {
      ...next,
      persistenceError: '本机草案恢复保存失败，当前输入仍在页面；提交成功后再退出。'
    }
  }
}
export function restore(key: string, data: MilestoneRead): Session | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(milestoneRecoveryKey(key))
    if (!raw) {
      return null
    }
    const saved = parseMilestoneRecovery(raw)
    return { ...fresh(data), ...saved, recoveryRaw: raw, past: [], future: [], field: null }
  } catch {
    return {
      ...fresh(data),
      recoveryRaw: raw,
      recoveryBlocked: true,
      sourceConflict:
        '本机草案恢复记录无法读取，原记录保留。核对后可放弃本次修改，从最新材料重新编辑。'
    }
  }
}
export function put(key: string, next: Session, save = true) {
  if (save) {
    next = persist(key, next)
  }
  sessions.set(key, next)
  notify()
}
