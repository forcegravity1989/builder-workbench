import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AcceptanceMaterialSchema,
  type AcceptanceMaterial
} from '../../../../shared/monica/version-material'
import type { VersionDocumentPort } from '../../../../shared/monica/version-document'
import { useAcceptanceDraft } from './use-acceptance-draft'
import {
  createAcceptanceMaterial,
  sameAcceptanceSource,
  upsertGoalResult
} from './acceptance-model'
import { useMaterialAutosave } from '../version-cycle/use-material-autosave'
import type { AcceptanceBoardProps } from './AcceptanceBoard'
import { useAcceptanceSources, useFixedAcceptancePlan } from './use-acceptance-plan'
import { historyErrorCode } from '../version-history-port'
import { isWorkspaceGoneError, workspaceGoneMessage } from '../error-feedback'
import { replaceGoalTaskEvidence } from './acceptance-task-evidence'
import { useAcceptanceOutput } from './use-acceptance-output'

/**
 * Acceptance board data wiring: version catalog, draft material with autosave
 * and recovery, the fixed plan the material cites, and the edit entry points.
 *
 * Rounds are retired with the cross-week scenario, so there is no history
 * selection here — the board always shows the current material. A successful
 * session launch permits initialization only from a readable, verified fixed
 * plan. Plan archive status is checked by the assistant in the session.
 */
export function useAcceptanceBoard({
  context,
  history,
  recoveryKey,
  started
}: Pick<AcceptanceBoardProps, 'context' | 'history'> & {
  recoveryKey: string
  started: boolean
}) {
  const scope = context.scope!
  const worktreeId = context.worktreeId!
  const materialPort = context.materialPort!
  const metricScope = useMemo(
    () => ({ repoId: scope.repoId, worktreeId, hostId: scope.hostId }),
    [scope.repoId, scope.hostId, worktreeId]
  )
  const port = useMemo<VersionDocumentPort<AcceptanceMaterial>>(
    () => ({
      async read(version) {
        const value = await materialPort.read(version)
        return value ? { ...value, document: AcceptanceMaterialSchema.parse(value.document) } : null
      },
      async save(input) {
        const value = await materialPort.save(input)
        return { ...value, document: AcceptanceMaterialSchema.parse(value.document) }
      }
    }),
    [materialPort]
  )
  const {
    draft,
    controller,
    recoveryError,
    recoveryText,
    loadedVersion,
    refresh: refreshDraft,
    clear: useRemoteDeletion,
    initializationSuppressed,
    loadedRefresh
  } = useAcceptanceDraft(recoveryKey, port, context.version ?? undefined, context.materialRefresh)
  const catalog = useAcceptanceSources(history, materialPort, metricScope, context.materialRefresh)
  const [error, setError] = useState<string | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const document = draft?.document
  const fixed = useFixedAcceptancePlan(history, metricScope, document?.planRef)
  const output = useAcceptanceOutput(context, controller)
  const associated = Boolean(document && document.version === context.version)
  const readOnly = Boolean(context.syncing) || !associated || !fixed.plan
  const lifetime = useRef({ active: true })
  // Set once the scope stops resolving (worktree deleted): later polls would fail the same way,
  // so the interval stands down instead of refreshing a dead error (#727). Latched on two
  // consecutive misses: a single `selector_not_found` can be a transient rejected scan, which the
  // native contract treats as a real answer, and latching on one would freeze a self-healing
  // poller on a live workspace.
  const gone = useRef(false)
  const goneMisses = useRef(0)
  useEffect(() => {
    const state = lifetime.current
    state.active = true
    return () => {
      state.active = false
    }
  }, [])
  const isCurrent = useCallback(() => lifetime.current.active, [])
  const selection = useRef({ value: 0 })
  const canSave = useCallback(() => !context.syncing, [context.syncing])
  const autosave = useMaterialAutosave({
    controller,
    draft,
    options: { canSave },
    isCurrent,
    selection,
    onSaved: catalog.refresh
  })
  const source = catalog.sources.find((item) => item.version === context.version)
  useEffect(() => {
    if (
      context.syncing ||
      !started ||
      initializationSuppressed ||
      !source ||
      draft ||
      recoveryError ||
      loadedVersion !== context.version ||
      loadedRefresh !== (context.materialRefresh ?? 0) ||
      catalog.loadedRefresh !== (context.materialRefresh ?? 0)
    ) {
      return
    }
    let current = true
    const original = controller.value
    const planRef = {
      kind: 'committed' as const,
      version: source.version,
      cycleId: source.cycleId,
      sourceCommit: source.sourceCommit,
      revision: source.revision
    }
    void history
      .readPlan({ scope: metricScope, planRef })
      .then((selected) => {
        if (current && controller.value === original) {
          controller.restore({
            document: createAcceptanceMaterial({
              planRef,
              plan: selected,
              cycleId: crypto.randomUUID()
            }),
            expectedRevision: null,
            dirty: true
          })
        }
      })
      .catch((reason) => {
        // No plan file yet (e.g. the version's plan is not merged): stay on the
        // empty board until the user refreshes; format problems still surface.
        if (current && historyErrorCode(reason) !== 'history-unavailable') {
          setError(String(reason))
        }
      })
    return () => {
      current = false
    }
  }, [
    context.syncing,
    started,
    initializationSuppressed,
    source,
    draft,
    loadedVersion,
    loadedRefresh,
    catalog.loadedRefresh,
    context.materialRefresh,
    context.version,
    recoveryError,
    controller,
    history,
    metricScope
  ])
  useEffect(() => {
    gone.current = false
    goneMisses.current = 0
    const timer = setInterval(() => {
      if (!context.syncing && !gone.current) {
        void controller
          .refresh()
          .then(() => {
            goneMisses.current = 0
          })
          .catch((reason) => {
            if (isWorkspaceGoneError(reason)) {
              goneMisses.current += 1
              if (goneMisses.current >= 2) {
                gone.current = true
                setError(workspaceGoneMessage())
              }
            } else {
              goneMisses.current = 0
              setError(String(reason))
            }
          })
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [controller, context.syncing])
  useEffect(() => {
    if (scroll.current) {
      try {
        scroll.current.scrollTop = Number(sessionStorage.getItem(`${recoveryKey}:scroll`) ?? 0)
      } catch {
        /* Scroll recovery is optional. */
      }
    }
  }, [document?.version, recoveryKey])
  async function refreshData() {
    setError(null)
    try {
      fixed.refresh()
      await refreshDraft()
      await catalog.refresh()
    } catch (reason) {
      setError(isWorkspaceGoneError(reason) ? workspaceGoneMessage() : String(reason))
    }
  }
  /** Whole-document edit for sections that are not one goal result (minutes). */
  function editDocument(next: AcceptanceMaterial) {
    const current = controller.value?.document
    if (!current || readOnly || current.version !== context.version) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    if (!sameAcceptanceSource(current, next)) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    controller.edit(next)
  }
  function editGoal(next: AcceptanceMaterial, goalId: string, recordEvidence = false) {
    const current = controller.value?.document
    const result = next.results.find((item) => item.goalId === goalId)
    if (!current || !result) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    if (readOnly || current.version !== context.version || !sameAcceptanceSource(current, next)) {
      setError('验收来源已变化，输入未覆盖新材料，请重新核对。')
      return
    }
    // 基准是 current.results 而非 next.results：这条是 CAS 写入路径，必须以刚重读的
    // 控制器值为准，否则会把并发写入盖掉。
    controller.edit({
      ...current,
      results: upsertGoalResult(current.results, result),
      ...(recordEvidence
        ? { taskSnapshot: replaceGoalTaskEvidence(current.taskSnapshot, goalId, next.taskSnapshot) }
        : {})
    })
  }
  return {
    scope,
    session: context.session,
    worktreeId,
    metricScope,
    draft,
    controller,
    recoveryError,
    recoveryText,
    version: context.version ?? '',
    error: error ?? fixed.error ?? catalog.error,
    setError,
    ...output,
    scroll,
    document,
    plan: fixed.plan,
    readOnly,
    refreshData,
    saving: autosave.saving,
    retrySave: autosave.save,
    useRemoteDeletion,
    editDocument,
    editGoal
  }
}
