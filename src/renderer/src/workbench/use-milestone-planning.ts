import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { CHARTER_BRANCH } from '../../../shared/workbench/project-charter'
import {
  milestoneDraft,
  milestoneProblems,
  milestoneGoalProblems,
  type MilestoneDraft
} from '../../../shared/workbench/project-milestones'
import { ensureNamedWorktree, nativeWorkspaceScopeKey } from './version-cycle/native-workspace'
import { readMilestones, submitMilestones, type MilestoneScope } from './milestone-port'
import {
  sessions,
  submitting,
  notify,
  subscribe,
  changed,
  recoverySaved,
  fresh,
  persist,
  restore,
  put,
  type Session
} from './milestone-planning-session'

export function useMilestonePlanning(
  scope: MilestoneScope | null,
  refreshToken: string | undefined
) {
  const key = scope ? `${nativeWorkspaceScopeKey(scope)}:${scope.worktreeId}` : 'unavailable'
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const state = useSyncExternalStore(
    subscribe,
    useCallback(() => sessions.get(key) ?? null, [key]),
    () => null
  )
  const writing = useSyncExternalStore(
    subscribe,
    useCallback(() => submitting.has(key), [key]),
    () => false
  )
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const generation = useRef(0)
  const reload = useCallback(async () => {
    const target = scopeRef.current
    if (!target) {
      return
    }
    const ticket = ++generation.current
    setReading(true)
    setReadError(null)
    try {
      const data = await readMilestones(target)
      if (ticket !== generation.current) {
        return
      }
      const cached = sessions.get(key)
      const previous = cached && !cached.recoveryBlocked ? cached : await restore(key, data)
      if (ticket !== generation.current) {
        return
      }
      const current = fresh(data, previous)
      if (previous?.recoveryBlocked) {
        put(key, { ...previous, data })
      } else if (previous && submitting.has(key)) {
        put(key, { ...previous, data })
      } else if (
        previous &&
        (changed(previous) || previous.retry || previous.past.length || previous.future.length)
      ) {
        const equal = (a: MilestoneDraft, b: MilestoneDraft) =>
          JSON.stringify(a) === JSON.stringify(b)
        const acceptedDraft =
          !equal(current.baseline, previous.baseline) && equal(current.baseline, previous.draft)
        if (equal(current.baseline, previous.baseline) || equal(current.baseline, previous.draft)) {
          put(key, {
            ...previous,
            data,
            baseline: current.baseline,
            expectedFormal: current.expectedFormal,
            expectedProposal: current.expectedProposal,
            sourceConflict: undefined,
            retry:
              !data.proposal && equal(milestoneDraft(data.formal), previous.draft)
                ? false
                : previous.retry ||
                  (equal(current.baseline, previous.draft) && !!previous.submitError),
            submitError: undefined,
            past: acceptedDraft ? [] : previous.past,
            future: acceptedDraft ? [] : previous.future,
            field: null
          })
        } else {
          put(key, {
            ...previous,
            data,
            sourceConflict:
              '当前显示本机草案，项目规划已有更新。草案已保留；可用顶部“放弃本次修改”载入最新规划。'
          })
        }
      } else {
        put(key, current)
      }
    } catch (reason) {
      if (ticket === generation.current) {
        setReadError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (ticket === generation.current) {
        setReading(false)
      }
    }
  }, [key])
  useEffect(() => {
    void reload()
    const counter = generation
    return () => {
      counter.current++
    }
  }, [reload, refreshToken])
  useEffect(() => {
    const save = () => {
      const s = sessions.get(key)
      if (s) {
        persist(key)
      }
    }
    window.addEventListener('beforeunload', save)
    return () => {
      save()
      window.removeEventListener('beforeunload', save)
    }
  }, [key])
  const patch = (update: Partial<Session>) => {
    const s = sessions.get(key)
    if (s) {
      put(key, { ...s, ...update }, false)
    }
  }
  const change = (update: (draft: MilestoneDraft) => MilestoneDraft, fieldEdit = false) => {
    const s = sessions.get(key)
    if (s && !s.recoveryBlocked && !submitting.has(key) && !reading) {
      const draft = update(s.draft)
      if (JSON.stringify(draft) === JSON.stringify(s.draft)) {
        return
      }
      const field = fieldEdit
        ? document.activeElement?.matches('input.wb-ml-inline')
          ? document.activeElement
          : s.field
        : null
      const past = field && field === s.field ? [...s.past] : [...s.past.slice(-99), s.draft]
      if (JSON.stringify(past.at(-1)) === JSON.stringify(draft)) {
        past.pop()
      }
      put(key, { ...s, draft, past, future: [], field, submitError: undefined })
    }
  }
  const history = (direction: 'undo' | 'redo') => {
    const s = sessions.get(key)
    if (!s || submitting.has(key) || reading) {
      return
    }
    const draft = (direction === 'undo' ? s.past : s.future).at(-1)
    if (!draft) {
      return
    }
    put(key, {
      ...s,
      draft,
      field: null,
      submitError: undefined,
      past: direction === 'undo' ? s.past.slice(0, -1) : [...s.past, s.draft],
      future: direction === 'undo' ? [...s.future, s.draft] : s.future.slice(0, -1)
    })
  }
  const submit = async () => {
    const s = sessions.get(key),
      target = scopeRef.current
    if (
      !target ||
      !s ||
      s.sourceConflict ||
      s.data.review.queryFailed ||
      submitting.has(key) ||
      reading ||
      milestoneProblems(s.draft).length ||
      milestoneGoalProblems(s.draft, (s.data.proposal ?? s.data.formal).versions).length
    ) {
      return
    }
    submitting.add(key)
    notify()
    setReadError(null)
    try {
      const tree = await ensureNamedWorktree(target, CHARTER_BRANCH, 'project')
      const result = await submitMilestones(
        { ...target, worktreeId: tree.id },
        {
          expectedFormal: s.expectedFormal,
          expectedProposal: s.expectedProposal,
          ...s.draft
        }
      )
      const baseline = milestoneDraft(result.proposal)
      const latest = sessions.get(key) ?? s
      put(key, {
        ...latest,
        baseline,
        draft:
          JSON.stringify(latest.draft) === JSON.stringify(s.draft)
            ? structuredClone(baseline)
            : latest.draft,
        expectedFormal: s.expectedFormal,
        expectedProposal: result.proposal.head,
        data: {
          ...latest.data,
          branchHead: result.proposal.head,
          proposal: result.proposal,
          review: {
            ...latest.data.review,
            ...(result.outcome.mode === 'pr'
              ? { pr: { ...result.outcome.pr, state: 'open' as const } }
              : {})
          }
        },
        retry: result.outcome.mode === 'failed',
        past: [],
        future: [],
        field: null,
        submitError: result.outcome.mode === 'failed' ? result.outcome.error : undefined
      })
      if (result.outcome.mode !== 'failed') {
        void useAppStore.getState().fetchWorktrees(target.repoId)
      }
    } catch (reason) {
      const latest = sessions.get(key)
      if (latest) {
        put(key, {
          ...latest,
          submitError: reason instanceof Error ? reason.message : String(reason)
        })
      }
    } finally {
      submitting.delete(key)
      notify()
    }
  }
  const revert = () => {
    const s = sessions.get(key)
    if (s && !submitting.has(key) && !reading) {
      if (s.recoveryBlocked) {
        void reload()
        return
      }
      put(key, fresh(s.data, s))
      setReadError(null)
    }
  }
  const finishEditing = () => {
    const s = sessions.get(key)
    if (s && !submitting.has(key) && !reading) {
      put(key, { ...s, editing: false, field: null })
    }
  }
  return {
    state,
    busy: reading || writing,
    error: readError ?? state?.sourceConflict ?? state?.submitError ?? null,
    persistenceError: state?.persistenceError ?? null,
    recoverySaved: state ? recoverySaved(state) : false,
    dirty: state ? changed(state) : false,
    patch,
    edit: (update: (draft: MilestoneDraft) => MilestoneDraft) => change(update),
    editField: (update: (draft: MilestoneDraft) => MilestoneDraft) => change(update, true),
    reload,
    submit,
    revert,
    finishEditing,
    undo: () => history('undo'),
    redo: () => history('redo'),
    beginFieldEdit: () => patch({ field: null }),
    canUndo: Boolean(state?.past.length),
    canRedo: Boolean(state?.future.length)
  }
}
