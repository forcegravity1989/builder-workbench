import { latestFeatureEnd } from '../../../shared/monica/milestone-sdlc'
import {
  compareMilestoneWindows,
  milestoneDraft,
  milestoneWorkingDraft,
  type MilestoneRead,
  type MilestoneDraft
} from '../../../shared/monica/project-milestones'
import { saveMilestoneWorking, type MilestoneScope } from './milestone-port'
import { MetricRuntimeError } from './metric-runtime-rpc'
import type { LegacyMilestoneDraft } from './milestone-recovery'

type View = {
  viewDate?: string
  rangeOnly?: boolean
  scrollX: number | null
  scrollY: number
  pageY: number
}
export type Session = View & {
  data: MilestoneRead
  draft: MilestoneDraft
  saved: MilestoneDraft
  baseline: MilestoneDraft
  revision: string | null
  editing: boolean
  featureOrder?: string[]
  pinnedFeatures?: string[]
  past: MilestoneDraft[]
  future: MilestoneDraft[]
  field: Element | null
  saving?: boolean
  saveError?: string
  fileChanged?: boolean
  submitError?: string
  retry?: boolean
  legacy?: LegacyMilestoneDraft
}

export const sessions = new Map<string, Session>()
export const operations = new Map<string, 'prepare' | 'submit' | 'update'>()
const listeners = new Set<() => void>()
const pending = new Map<string, Promise<boolean>>()

export function notify() {
  for (const listener of listeners) {
    listener()
  }
}
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function put(key: string, next: Session) {
  sessions.set(key, next)
  notify()
}
export const sameDraft = (left: MilestoneDraft, right: MilestoneDraft) =>
  JSON.stringify(left.material) === JSON.stringify(right.material) &&
  JSON.stringify(left.versions.toSorted(compareMilestoneWindows)) ===
    JSON.stringify(right.versions.toSorted(compareMilestoneWindows))
export const changed = (s: Session) => {
  const { material, versions } = s.draft
  return !sameDraft(
    {
      material: {
        ...material,
        features: material.features.map((f) => ({
          ...f,
          title: f.title.trim(),
          owner: f.owner.trim()
        }))
      },
      versions
    },
    s.baseline
  )
}
export const unsaved = (s: Session) => !sameDraft(s.draft, s.saved)

export function readView(key: string): View {
  const initial = { scrollX: null, scrollY: 0, pageY: 0 }
  try {
    const value = JSON.parse(localStorage.getItem(`bw:milestone-view:${key}`) ?? 'null')
    const offset = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0)
    return value
      ? {
          viewDate: /^\d{4}-\d{2}-\d{2}$/.test(value.viewDate ?? '') ? value.viewDate : undefined,
          rangeOnly: typeof value.rangeOnly === 'boolean' ? value.rangeOnly : undefined,
          scrollX: value.scrollX == null ? null : offset(value.scrollX),
          scrollY: offset(value.scrollY),
          pageY: offset(value.pageY)
        }
      : initial
  } catch {
    return initial
  }
}

export function saveView(key: string) {
  const s = sessions.get(key)
  if (s) {
    const { viewDate, rangeOnly, scrollX, scrollY, pageY } = s
    try {
      localStorage.setItem(
        `bw:milestone-view:${key}`,
        JSON.stringify({ viewDate, rangeOnly, scrollX, scrollY, pageY })
      )
    } catch {
      // View preferences are optional; the material is stored on the worktree.
    }
  }
}

export function fromMaterial(key: string, data: MilestoneRead, previous?: Session): Session {
  const committed = data.project?.committed ?? data.formal
  const baseline = milestoneDraft(committed)
  const file = data.project?.working
  const saved = file ? milestoneWorkingDraft(file, committed) : baseline
  const revision = file?.revision ?? null
  const sameTree = data.project?.worktreeId === previous?.data.project?.worktreeId
  const seekingSave = previous && unsaved(previous)
  const inputOnDisk = previous && file && sameDraft(previous.draft, saved)
  const retainInput = seekingSave && !inputOnDisk
  const fileChanged = retainInput && (!sameTree || !file || revision !== previous.revision)
  const keepHistory = sameTree && previous && (retainInput || sameDraft(previous.draft, saved))
  const preferences = previous ?? readView(key)
  return {
    data,
    baseline,
    draft: retainInput ? previous.draft : saved,
    saved: retainInput ? previous.saved : saved,
    revision: retainInput ? previous.revision : revision,
    editing: previous?.editing ?? false,
    viewDate: preferences.viewDate,
    rangeOnly: preferences.rangeOnly,
    scrollX: preferences.scrollX,
    scrollY: preferences.scrollY,
    pageY: preferences.pageY,
    featureOrder: keepHistory ? previous.featureOrder : undefined,
    pinnedFeatures: keepHistory ? previous.pinnedFeatures : undefined,
    past: keepHistory ? previous.past : [],
    future: keepHistory ? previous.future : [],
    field: null,
    saving: previous?.saving,
    fileChanged: Boolean(fileChanged),
    saveError: retainInput ? previous.saveError : undefined,
    submitError: keepHistory ? previous.submitError : undefined,
    retry: keepHistory ? previous.retry : undefined,
    legacy: previous?.legacy
  }
}

export function flush(key: string, scope: MilestoneScope): Promise<boolean> {
  const running = pending.get(key)
  if (running) {
    return running
  }
  const initial = sessions.get(key)
  if (!initial || initial.fileChanged || !initial.data.project?.working) {
    return Promise.resolve(false)
  }
  if (!unsaved(initial)) {
    return Promise.resolve(true)
  }
  const job = Promise.resolve().then(async () => {
    try {
      for (;;) {
        const s = sessions.get(key)
        if (!s || s.fileChanged || s.data.project?.worktreeId !== scope.worktreeId) {
          return false
        }
        if (!unsaved(s)) {
          return true
        }
        const { revision } = await saveMilestoneWorking(scope, {
          expectedRevision: s.revision,
          material: {
            ...s.draft.material,
            versionPlans: s.draft.versions.toSorted(compareMilestoneWindows)
          }
        })
        const current = sessions.get(key)
        if (!current || current.data.project?.worktreeId !== scope.worktreeId) {
          return false
        }
        put(key, { ...current, saved: s.draft, revision, saveError: undefined })
      }
    } catch (error) {
      const s = sessions.get(key)
      if (s) {
        put(key, {
          ...s,
          fileChanged: error instanceof MetricRuntimeError && error.code === 'revision-conflict',
          saveError: error instanceof Error ? error.message : String(error)
        })
      }
      return false
    } finally {
      pending.delete(key)
      const s = sessions.get(key)
      if (s) {
        put(key, { ...s, saving: false })
      }
    }
  })
  pending.set(key, job)
  put(key, { ...initial, saving: true })
  return job
}

export function beginMilestoneEditing(key: string) {
  const s = sessions.get(key)
  if (s?.data.project?.working && !s.editing) {
    put(key, {
      ...s,
      editing: true,
      featureOrder: s.draft.material.features
        .toSorted((a, b) => latestFeatureEnd(b) - latestFeatureEnd(a))
        .map((f) => f.id),
      pinnedFeatures: []
    })
  }
}
