import {
  milestoneDraft,
  type MilestoneRead,
  type MilestoneDraft
} from '../../../shared/workbench/project-milestones'
import { MilestoneRecoveryRecordSchema } from '../../../shared/workbench/milestone-recovery'
import { latestMilestoneMonth } from '../../../shared/workbench/milestone-calendar'
import { milestoneRecoveryPayload, milestoneRecoverySchema } from './milestone-recovery'

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
  recoveryRevision: string | null
  saving: boolean
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
export const recoverySaved = (s: Session) =>
  !s.recoveryBlocked &&
  !s.saving &&
  !s.persistenceError &&
  s.recoveryRaw === (changed(s) || s.retry ? milestoneRecoveryPayload(s) : null)
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
    recoveryRevision: previous?.recoveryRevision ?? null,
    saving: previous?.saving ?? false,
    recoveryBlocked: previous?.recoveryBlocked,
    persistenceError: previous?.persistenceError
  }
}
const pending = new Map<string, Promise<void>>()
export function persist(key: string): void {
  const initial = sessions.get(key)
  if (!initial || initial.recoveryBlocked || pending.has(key)) {
    return
  }
  const payload = (s: Session) => (changed(s) || s.retry ? milestoneRecoveryPayload(s) : null)
  if (payload(initial) === initial.recoveryRaw) {
    return
  }
  sessions.set(key, { ...initial, saving: true })
  const job = Promise.resolve().then(async () => {
    try {
      // One in-flight write per scope; while it runs, retain only the latest user input.
      for (;;) {
        const s = sessions.get(key)
        if (!s || s.recoveryBlocked) {
          return
        }
        const raw = payload(s)
        if (raw === s.recoveryRaw) {
          return
        }
        const record = MilestoneRecoveryRecordSchema.parse(
          await window.api.milestoneRecovery.write({
            key,
            expectedRevision: s.recoveryRevision,
            payload: raw
          })
        )
        const current = sessions.get(key)
        if (!current) {
          return
        }
        sessions.set(key, {
          ...current,
          recoveryRaw: record.payload,
          recoveryRevision: record.revision,
          persistenceError: undefined
        })
      }
    } catch (error) {
      const current = sessions.get(key)
      if (current) {
        sessions.set(key, {
          ...current,
          persistenceError: `本机草案未保存，当前输入保留：${error instanceof Error ? error.message : String(error)}`
        })
      }
    } finally {
      pending.delete(key)
      const current = sessions.get(key)
      if (current) {
        sessions.set(key, { ...current, saving: false })
      }
      notify()
    }
  })
  pending.set(key, job)
  notify()
}
export async function restore(key: string, data: MilestoneRead): Promise<Session> {
  let record = { revision: null as string | null, payload: null as string | null }
  try {
    record = MilestoneRecoveryRecordSchema.parse(await window.api.milestoneRecovery.read(key))
    const saved = record.payload ? milestoneRecoverySchema.parse(JSON.parse(record.payload)) : {}
    return {
      ...fresh(data),
      ...saved,
      recoveryRaw: record.payload,
      recoveryRevision: record.revision
    }
  } catch {
    return {
      ...fresh(data),
      recoveryRaw: record.payload,
      recoveryRevision: record.revision,
      recoveryBlocked: true,
      sourceConflict: '本机草案无法读取，原文件已保留。请让模型检查恢复文件后，刷新里程碑重试。'
    }
  }
}
export function put(key: string, next: Session, save = true) {
  sessions.set(key, next)
  if (save) {
    persist(key)
  }
  notify()
}
