import { toast } from 'sonner'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { CHARTER_BRANCH } from '../../../shared/workbench/project-charter'
import {
  milestoneProblems,
  type MilestoneDraft
} from '../../../shared/workbench/project-milestones'
import { ensureNamedWorktree, nativeWorkspaceScopeKey } from './version-cycle/native-workspace'
import { updateTrunkCode } from './version-cycle/trunk-update-port'
import {
  discardMilestoneWorking,
  readFormalMilestones,
  readMilestones,
  readMilestoneWorking,
  submitMilestones,
  type MilestoneScope
} from './milestone-port'
import {
  sessions,
  operations,
  beginMilestoneEditing,
  changed,
  flush,
  fromMaterial,
  notify,
  put,
  sameDraft,
  saveView,
  subscribe,
  unsaved,
  type Session
} from './milestone-planning-session'
import { readLegacyMilestoneDraft } from './milestone-recovery'

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
const savedScope = (scope: MilestoneScope, s: Session | undefined): MilestoneScope | null =>
  s?.data.project ? { ...scope, worktreeId: s.data.project.worktreeId } : null

export function useMilestonePlanning(scope: MilestoneScope | null, refreshToken: number) {
  const key = scope ? `${nativeWorkspaceScopeKey(scope)}:${scope.worktreeId}` : 'unavailable'
  const current = useRef({ scope, key })
  current.current = { scope, key }
  const state = useSyncExternalStore(
    subscribe,
    useCallback(() => sessions.get(key) ?? null, [key]),
    () => null
  )
  const operation = useSyncExternalStore(
    subscribe,
    useCallback(() => operations.get(key), [key]),
    () => undefined
  )
  const [reading, setReading] = useState(false)
  const [preview, setPreview] = useState<{ key: string; state: Session } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const generation = useRef(0)

  const reload = useCallback(
    async (useFile = false) => {
      const target = current.current.scope
      if (!target || current.current.key !== key) {
        return
      }
      const ticket = ++generation.current
      const active = () => ticket === generation.current && current.current.key === key
      setReading(true)
      setError(null)
      try {
        const full = readMilestones(target)
        if (!sessions.has(key)) {
          void readFormalMilestones(target)
            .then(({ formal }) => {
              if (active() && !sessions.has(key)) {
                setPreview({
                  key,
                  state: fromMaterial(key, {
                    formal,
                    project: null,
                    review: { pr: null, remoteAvailable: null }
                  })
                })
              }
            })
            .catch(() => {
              // The full read still reports source errors and any partial results.
            })
        }
        const data = await full
        if (!active()) {
          return
        }
        const previous = sessions.get(key)
        if (previous?.saving || (useFile && !data.project?.working)) {
          return
        }
        const next = fromMaterial(
          key,
          data,
          useFile && previous
            ? { ...previous, draft: previous.saved, past: [], future: [] }
            : previous
        )
        put(key, next)
        setPreview(null)
        if (!previous) {
          void readLegacyMilestoneDraft(key)
            .then((legacy) => {
              const latest = sessions.get(key)
              if (legacy && latest && !sameDraft(legacy.draft, latest.draft)) {
                put(key, { ...latest, legacy })
              }
            })
            .catch(() => toast.error('旧版里程碑草稿无法读取，原文件仍保留。'))
        }
      } catch (reason) {
        if (active()) {
          setError(message(reason))
        }
      } finally {
        if (active()) {
          setReading(false)
        }
      }
    },
    [key]
  )

  useEffect(() => {
    setUpdateError(null)
    void reload()
    return () => {
      generation.current++
    }
  }, [reload, refreshToken])

  const projectId = state?.data.project?.worktreeId
  useEffect(() => {
    if (!projectId) {
      return
    }
    let disposed = false
    let checking = false
    const check = async () => {
      const target = current.current.scope
      const before = sessions.get(key)
      if (!target || disposed || checking || !before || before.saving || operations.has(key)) {
        return
      }
      checking = true
      try {
        const file = await readMilestoneWorking({ ...target, worktreeId: projectId })
        if (
          !disposed &&
          sessions.get(key) === before &&
          !operations.has(key) &&
          (!before.data.project?.working ||
            (!before.fileChanged && file.revision !== before.revision))
        ) {
          await reload()
        }
      } catch {
        if (!disposed && sessions.get(key) === before && !before.data.project?.workingError) {
          await reload()
        }
      } finally {
        checking = false
      }
    }
    const timer = setInterval(() => void check(), 5000)
    const focus = () => {
      if (!operations.has(key) && !sessions.get(key)?.saving) {
        void reload()
      }
    }
    window.addEventListener('focus', focus)
    return () => {
      disposed = true
      clearInterval(timer)
      window.removeEventListener('focus', focus)
    }
  }, [key, projectId, reload])

  const scopeRef = useRef(scope)
  scopeRef.current = scope
  useEffect(() => {
    const target = scopeRef.current
    return () => {
      saveView(key)
      const s = sessions.get(key)
      const project = target && savedScope(target, s)
      if (project && s && unsaved(s) && !operations.has(key)) {
        void flush(key, project)
      }
    }
  }, [key])
  useEffect(() => {
    const timer = setTimeout(() => saveView(key), 350)
    return () => clearTimeout(timer)
  }, [key, state?.viewDate, state?.rangeOnly, state?.scrollX, state?.scrollY, state?.pageY])
  useEffect(() => {
    const target = scopeRef.current
    const s = sessions.get(key)
    const project = target && savedScope(target, s)
    if (!project || !s || !unsaved(s) || s.fileChanged || operation) {
      return
    }
    const timer = setTimeout(() => void flush(key, project), 600)
    return () => clearTimeout(timer)
  }, [key, state?.draft, state?.fileChanged, projectId, operation])

  const patch = (update: Partial<Session>) => {
    const s = sessions.get(key)
    if (s) {
      put(key, { ...s, ...update })
    }
  }

  const change = (update: (draft: MilestoneDraft) => MilestoneDraft, fieldEdit = false) => {
    const s = sessions.get(key)
    if (!s?.data.project?.working || operations.has(key) || reading) {
      return
    }
    const draft = update(s.draft)
    if (sameDraft(draft, s.draft)) {
      return
    }
    const field = fieldEdit
      ? document.activeElement?.matches('.wb-ml-inline')
        ? document.activeElement
        : s.field
      : null
    const past = field && field === s.field ? [...s.past] : [...s.past.slice(-99), s.draft]
    if (past.at(-1) && sameDraft(past.at(-1)!, draft)) {
      past.pop()
    }
    put(key, { ...s, draft, past, future: [], field, submitError: undefined })
  }

  const history = (direction: 'undo' | 'redo') => {
    const s = sessions.get(key)
    const draft = (direction === 'undo' ? s?.past : s?.future)?.at(-1)
    if (!s || !draft || operations.has(key) || reading) {
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

  const act = async (
    kind: 'prepare' | 'submit' | 'update',
    run: (project: MilestoneScope) => Promise<void> | void
  ) => {
    if (!scope || !sessions.has(key) || reading || operations.has(key)) {
      return
    }
    operations.set(key, kind)
    notify()
    try {
      let project = savedScope(scope, sessions.get(key))
      if (!project) {
        const tree = await ensureNamedWorktree(scope, CHARTER_BRANCH, 'project')
        project = { ...scope, worktreeId: tree.id }
        await reload()
      }
      await run(project)
    } catch (reason) {
      if (kind === 'submit') {
        patch({ submitError: message(reason) })
        toast.error('里程碑提交失败')
      } else if (current.current.key === key) {
        setUpdateError(message(reason))
      }
    } finally {
      operations.delete(key)
      notify()
    }
  }

  const submit = () =>
    act('submit', async (project) => {
      const s = sessions.get(key)
      if (
        !s ||
        s.fileChanged ||
        s.data.review.queryFailed ||
        (!changed(s) && !s.retry && !s.data.project?.pendingReview) ||
        milestoneProblems(s.draft, s.baseline).length
      ) {
        return
      }
      patch({ submitError: undefined })
      if (!(await flush(key, project))) {
        return
      }
      const revision = sessions.get(key)?.revision
      if (!revision) {
        return
      }
      const { outcome } = await submitMilestones(project, revision)
      await reload()
      if (outcome.mode === 'failed') {
        patch({ retry: true, submitError: outcome.error })
        toast.error('里程碑提交失败')
      } else {
        patch({ retry: false, past: [], future: [], field: null })
        if (outcome.mode === 'pr') {
          const url = outcome.pr.url
          toast.success('里程碑已提交评审', {
            action: url
              ? { label: '查看评审', onClick: () => void window.api.shell.openUrl(url) }
              : undefined
          })
        }
      }
    })

  const update = () =>
    act('update', async (project) => {
      setUpdateError(null)
      const s = sessions.get(key)
      if (s && unsaved(s) && !(await flush(key, project))) {
        return
      }
      const result = await updateTrunkCode(
        { repoId: project.repoId, worktreeId: project.worktreeId, hostId: project.hostId },
        project.runtimeOwnerEnvironmentId,
        CHARTER_BRANCH
      )
      await reload()
      if (current.current.key === key) {
        if (result.updated) {
          toast.success(result.pulled ? '项目材料工作树已更新' : '项目材料工作树已是最新')
        } else {
          setUpdateError(result.reason ?? '未能确认工作树是否已更新。')
        }
      }
    })

  const restoreLegacy = () =>
    act('prepare', async (project) => {
      const s = sessions.get(key)
      if (!s?.legacy || !sameDraft(s.draft, s.legacy.baseline) || unsaved(s)) {
        return
      }
      put(key, { ...s, draft: s.legacy.draft })
      if (await flush(key, project)) {
        try {
          localStorage.setItem(`bw:milestone-restored:${key}`, s.legacy.revision)
        } catch {
          // A future read also compares the draft with the current file.
        }
        patch({ legacy: undefined })
        beginMilestoneEditing(key)
      }
    })

  return {
    state: state ?? (preview?.key === key ? preview.state : null),
    confirmed: state !== null,
    reading,
    writing: operation === 'submit',
    updating: operation === 'update',
    busy: reading || !!operation || state === null,
    error,
    updateError,
    dirty: state ? changed(state) : false,
    unsaved: state ? unsaved(state) : false,
    patch,
    edit: (update: (draft: MilestoneDraft) => MilestoneDraft) => change(update),
    editField: (update: (draft: MilestoneDraft) => MilestoneDraft) => change(update, true),
    reload,
    update,
    submit,
    save: () => {
      const project = scope && savedScope(scope, sessions.get(key))
      return project && flush(key, project)
    },
    revert: () =>
      act('prepare', async (project) => {
        const s = sessions.get(key)
        if (!s || s.fileChanged || (s.saving && !(await flush(key, project)))) {
          return
        }
        try {
          await discardMilestoneWorking(project, sessions.get(key)?.revision ?? null)
          await reload(true)
          patch({ submitError: undefined, retry: false })
        } catch (reason) {
          await reload()
          toast.error('未能恢复最近提交', { description: message(reason) })
        }
      }),
    restoreLegacy,
    finishEditing: () =>
      patch({ editing: false, field: null, featureOrder: undefined, pinnedFeatures: [] }),
    undo: () => history('undo'),
    redo: () => history('redo'),
    beginEditing: () => act('prepare', () => beginMilestoneEditing(key)),
    beginFieldEdit: () => patch({ field: null }),
    canUndo: Boolean(state?.past.length),
    canRedo: Boolean(state?.future.length)
  }
}
