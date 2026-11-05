import { useAppStore } from '@/store'
import { requestContextualTourWhenReady } from '@/components/contextual-tours/request-contextual-tour-when-ready'
import { settleMilestoneWindows } from '../../../shared/workbench/milestone-window-order'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { CircleHelp, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { MilestoneHistoryActions, MilestoneTitle } from './milestone-history-actions'
import {
  ScheduledVersionSchema,
  milestoneDraft,
  milestoneProblems,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import type { MilestoneScope } from './milestone-port'
import { openVersionOverview } from './project-page-state'
import { useMilestonePlanning } from './use-milestone-planning'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { MilestoneTimeline, type MilestoneLocation } from './milestone-timeline'
import { createMilestoneFeature } from './milestone-add-feature'
import { milestoneLaneConflict } from '../../../shared/workbench/milestone-sdlc'
import {
  materializeMilestoneWeek,
  editMilestoneVersionName,
  datedMilestoneVersions,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'
import { MilestoneReviewButton } from './milestone-review-button'
import { describeMilestoneChanges } from './milestone-change-summary'
import { MilestoneIconButton } from './milestone-icon-button'
import './project-milestones.css'

export function ProjectMilestones({
  scope,
  refreshToken,
  updateFormal
}: {
  scope: MilestoneScope | null
  refreshToken?: string
  updateFormal(): Promise<void>
}) {
  const model = useMilestonePlanning(scope, refreshToken)
  const catalog = useVersionCatalogForRepo(scope?.repoId ?? null)
  const { state, busy, dirty, error, patch, edit } = model
  const root = useRef<HTMLElement>(null)
  const [locate, setLocate] = useState<(MilestoneLocation & { scope: string | null }) | null>(null)
  const [restoreKey, setRestoreKey] = useState(0)
  const [newFeature, setNewFeature] = useState<string | null>(null)
  const [updatingFormal, setUpdatingFormal] = useState(false)
  const restored = useRef<string | null>(null)
  const restoreScope = scope ? JSON.stringify(scope) : null
  const uiReady = useAppStore((s) => s.persistedUIReady)
  useEffect(() => {
    if (!state?.editing || state.recoveryBlocked || !uiReady) {
      return
    }
    const app = useAppStore.getState()
    const wasFeaturePreviouslyInteracted = Boolean(app.featureInteractions['workbench-milestones'])
    void app.recordFeatureInteraction('workbench-milestones')
    return requestContextualTourWhenReady({
      wasFeaturePreviouslyInteracted,
      id: 'workbench-milestones',
      source: 'milestone_planning',
      waitForActiveTourToClear: true,
      shouldContinue: () =>
        !useAppStore.getState().contextualToursSeenIds.includes('workbench-milestones')
    })
  }, [state?.editing, state?.recoveryBlocked, uiReady, restoreScope])
  useEffect(
    () => () => {
      useAppStore.getState().suppressContextualTour('workbench-milestones', 'milestone_planning')
    },
    [restoreScope, state?.editing]
  )
  const pageY = state?.pageY
  useEffect(() => {
    if (restoreScope && pageY !== undefined && root.current && restored.current !== restoreScope) {
      const content = root.current.closest('.content')
      if (content) {
        content.scrollTop = pageY
        restored.current = restoreScope
      }
    }
  }, [restoreScope, pageY])
  if (!scope) {
    return (
      <section className="card wb-ml">
        <strong>项目里程碑</strong>
        <p>工作树来源尚未就绪</p>
      </section>
    )
  }
  if (!state) {
    return (
      <section className="card wb-ml">
        <strong>项目里程碑</strong>
        <p role="status">{error ?? '正在读取项目规划…'}</p>
        {error && (
          <Button variant="outline" size="xs" onClick={() => void model.reload()}>
            重试读取
          </Button>
        )}
      </section>
    )
  }
  const editing = state.editing
  const hasReviewAction = editing || !!state.data.review.pr || !!state.data.mergedProposal
  const visible = editing ? state.draft : milestoneDraft(state.data.formal)
  const enabled = editing && !busy && !state.recoveryBlocked
  const hasPlanning =
    visible.material.milestones.length > 0 ||
    visible.material.features.length > 0 ||
    datedMilestoneVersions(visible).length > 0
  const navigate = (date: string) => {
    setLocate((previous) => ({
      date,
      sequence: (previous?.sequence ?? 0) + 1,
      scope: restoreScope
    }))
  }
  const registeredVersions = (
    state.data.formal.registeredVersions ?? state.data.formal.versions
  ).concat(state.data.proposal?.registeredVersions ?? state.data.proposal?.versions ?? [])
  const problems = milestoneProblems(state.draft)
  const changes = describeMilestoneChanges(state.baseline, state.draft)
  function begin() {
    if (state && !state.recoveryBlocked) {
      patch({ editing: true })
    }
  }
  function renameVersion(cycleId: string, version: string, previousName?: string) {
    const result = editMilestoneVersionName(
      state!.draft,
      cycleId,
      version,
      previousName === undefined ? undefined : { previousName, registered: registeredVersions }
    )
    model.editField(() => result.draft)
    if (result.problem) {
      toast(result.problem)
    }
  }
  function remove(f: MilestoneFeature) {
    edit((d) => ({
      ...d,
      material: { ...d.material, features: d.material.features.filter((item) => item.id !== f.id) }
    }))
  }
  function registerWeek(week: MilestoneWeek, name: string) {
    if (!enabled) {
      return
    }
    if (state!.draft.versions.some((v) => v.version.toLowerCase() === name.toLowerCase())) {
      toast('版本名称已存在')
      return
    }
    const next = materializeMilestoneWeek(
      state!.draft,
      week,
      crypto.randomUUID(),
      name,
      registeredVersions
    )
    if (!ScheduledVersionSchema.safeParse(next.version).success) {
      toast('版本名称无效，未登记')
      return
    }
    if (next.version.version !== name) {
      toast(`该日期已有 ${next.version.version}，已复用现有版本纳入规划`)
    }
    edit(() => next.draft)
  }
  function addFeature() {
    if (!enabled) {
      return
    }
    const { id, date, draft: candidate } = createMilestoneFeature(state!.draft, registeredVersions)
    const { draft, conflict } = settleMilestoneWindows(state!.draft, candidate)
    if (conflict) {
      toast(conflict)
      return
    }
    if (milestoneLaneConflict(draft)) {
      toast('同一泳道不能重叠，请先为后续版本留出时间。')
      return
    }
    edit(() => draft)
    navigate(date)
    setNewFeature(id)
  }
  function open(version: ScheduledVersion) {
    if (
      !catalog.catalog?.entries.some(
        (entry) =>
          entry.version === version.version &&
          (entry.material.plan?.cycleId === version.cycleId ||
            entry.material.acceptance?.cycleId === version.cycleId)
      )
    ) {
      toast('该版本尚未进入正式材料，合入并更新后可进入')
      return
    }
    patch({ pageY: root.current?.closest('.content')?.scrollTop ?? 0 })
    openVersionOverview({
      repoId: scope!.repoId,
      version: version.version,
      milestoneOrigin: { feature: '' }
    })
  }
  return (
    <section
      ref={root}
      className="wb-ml"
      data-draft-persistence={
        model.persistenceError
          ? 'failed'
          : state.saving
            ? 'saving'
            : model.recoverySaved
              ? 'saved'
              : 'idle'
      }
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && event.target.matches('.wb-ml-inline')) {
          model.beginFieldEdit()
        }
      }}
      onKeyDown={(event) => {
        if (
          !enabled ||
          (event.target instanceof HTMLElement &&
            event.target.closest('input, textarea, [contenteditable="true"]')) ||
          !(event.ctrlKey || event.metaKey) ||
          !['z', 'y'].includes(event.key.toLowerCase())
        ) {
          return
        }
        event.preventDefault()
        if (event.key.toLowerCase() === 'y' || event.shiftKey) {
          model.redo()
        } else {
          model.undo()
        }
      }}
    >
      <header className="wb-ml-heading">
        <MilestoneTitle editing={editing} busy={busy} finishEditing={model.finishEditing} />
        <div className="wb-ml-actions">
          <MilestoneIconButton
            label="里程碑操作引导"
            onClick={() =>
              useAppStore
                .getState()
                .requestContextualTour('workbench-milestones', 'milestone_planning', false, {
                  force: true
                })
            }
          >
            <CircleHelp size={15} />
          </MilestoneIconButton>
          {editing && (
            <MilestoneHistoryActions
              dirty={dirty}
              busy={busy}
              conflict={!!state.sourceConflict}
              recoveryBlocked={!!state.recoveryBlocked}
              canUndo={model.canUndo}
              canRedo={model.canRedo}
              undo={model.undo}
              redo={model.redo}
              discard={() => {
                model.revert()
                setRestoreKey((v) => v + 1)
              }}
            />
          )}
          {!editing && (
            <Button
              size="xs"
              className="bg-foreground text-background hover:bg-foreground/90"
              disabled={busy || state.recoveryBlocked}
              data-contextual-tour-target={
                hasReviewAction ? 'milestone-start' : 'milestone-start milestone-submit'
              }
              onClick={begin}
            >
              规划里程碑
            </Button>
          )}
          {hasReviewAction && (
            <MilestoneReviewButton
              writing={model.writing}
              busy={busy || updatingFormal || !!state.recoveryBlocked}
              conflict={!!state.sourceConflict || !!state.data.review.queryFailed}
              dirty={editing && dirty}
              retry={state.retry}
              invalid={problems.length > 0}
              hasReview={state.data.review.pr?.state === 'open'}
              reviewUrl={state.data.review.pr?.url ?? undefined}
              needsUpdate={!!state.data.mergedProposal}
              updateFormal={() => {
                setUpdatingFormal(true)
                void updateFormal()
                  .then(() => model.reload())
                  .catch((reason) =>
                    toast.error(reason instanceof Error ? reason.message : String(reason))
                  )
                  .finally(() => setUpdatingFormal(false))
              }}
              changes={changes}
              submit={() => {
                void model.submit()
              }}
            />
          )}
          <MilestoneIconButton
            label="刷新里程碑与评审"
            disabled={busy}
            onClick={() => void model.reload()}
          >
            <RefreshCw size={15} />
          </MilestoneIconButton>
        </div>
      </header>
      {state.data.review.queryFailed && (
        <p className="wb-ml-alert" role="alert">
          评审状态未读到，请刷新里程碑与评审后再提交。
        </p>
      )}
      {model.persistenceError && (
        <p className="wb-ml-alert" role="alert">
          {model.persistenceError}
        </p>
      )}
      {state.submitError && (
        <details className="wb-ml-alert" role="status">
          <summary>里程碑提交失败 · 查看详情</summary>
          <p>{state.submitError}</p>
          <Button
            size="xs"
            variant="outline"
            disabled={
              !enabled ||
              !!state.sourceConflict ||
              !!state.data.review.queryFailed ||
              problems.length > 0
            }
            onClick={() => void model.submit()}
          >
            重试提交
          </Button>
        </details>
      )}
      {error && (
        <p className="wb-ml-alert" role="alert">
          {error}
        </p>
      )}
      {editing && !state.sourceConflict && problems.length > 0 && (
        <p className="wb-ml-alert" role="status">
          {problems.slice(0, 3).join('；')}
          {problems.length > 3 ? `（另有 ${problems.length - 3} 项）` : ''}
        </p>
      )}
      {state.data.formal.problems.length > 0 && (
        <details className="wb-ml-alert">
          <summary>部分版本材料未读到</summary>
          {state.data.formal.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </details>
      )}
      {state.data.sourceNotice && <div className="wb-ml-notice">{state.data.sourceNotice}</div>}
      {!editing && !hasPlanning ? (
        <div className="wb-ml-empty" data-contextual-tour-target="milestone-schedule">
          还没有里程碑
        </div>
      ) : (
        <MilestoneTimeline
          catalog={catalog}
          key={`${restoreScope}:${editing}:${restoreKey}`}
          draft={visible}
          registeredVersions={registeredVersions}
          editField={model.editField}
          registerWeek={registerWeek}
          navigate={navigate}
          addFeature={addFeature}
          newFeature={newFeature}
          editing={editing}
          busy={busy || !!state.recoveryBlocked}
          edit={edit}
          open={open}
          remove={remove}
          rename={renameVersion}
          started={
            new Set(
              (
                (state.data.proposal ?? state.data.formal).registeredVersions ??
                (state.data.proposal ?? state.data.formal).versions
              )
                .filter((v) => v.started)
                .map((v) => v.cycleId)
            )
          }
          scrollX={state.scrollX}
          scrollY={state.scrollY}
          onScroll={(scrollX, scrollY) => patch({ scrollX, scrollY })}
          locate={locate?.scope === restoreScope ? locate : null}
        />
      )}
    </section>
  )
}
