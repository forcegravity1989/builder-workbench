import {
  frozenMilestoneProblems,
  restoreFrozenMilestones
} from '../../../shared/workbench/milestone-freeze'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { MilestoneHistoryActions } from './milestone-history-actions'
import {
  ScheduledVersionSchema,
  milestoneDraft,
  milestoneProblems,
  milestoneGoalProblems,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import type { MilestoneScope } from './milestone-port'
import { openVersionOverview } from './project-page-state'
import { useMilestonePlanning } from './use-milestone-planning'
import { MilestoneTimeline, type MilestoneLocation } from './milestone-timeline'
import { createMilestoneFeature } from './milestone-add-feature'
import {
  fitMilestoneVersions,
  milestoneLaneConflict
} from '../../../shared/workbench/milestone-sdlc'
import {
  materializeMilestoneWeek,
  datedMilestoneVersions,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'
import { MilestoneNavigation } from './milestone-navigation'
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
  const { state, busy, dirty, error, patch, edit } = model
  const root = useRef<HTMLElement>(null)
  const [locate, setLocate] = useState<(MilestoneLocation & { scope: string | null }) | null>(null)
  const [restoreKey, setRestoreKey] = useState(0)
  const [newFeature, setNewFeature] = useState<string | null>(null)
  const [updatingFormal, setUpdatingFormal] = useState(false)
  const restored = useRef<string | null>(null)
  const restoreScope = scope ? JSON.stringify(scope) : null
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
  const visible = editing ? state.draft : milestoneDraft(state.data.formal)
  const enabled = editing && !busy && !state.recoveryBlocked
  const month = state.month
  const hasPlanning =
    visible.material.months.some((m) => m.outcome.trim()) ||
    visible.material.features.length > 0 ||
    datedMilestoneVersions(visible).length > 0
  const navigate = (date: string) => {
    patch({ month: date.slice(0, 7) })
    setLocate((previous) => ({
      date,
      sequence: (previous?.sequence ?? 0) + 1,
      scope: restoreScope
    }))
  }
  const frozenProblems = frozenMilestoneProblems(
    state.data.proposal ?? state.data.formal,
    state.draft
  )
  const versionFacts = (state.data.proposal ?? state.data.formal).versions
  const problems = [
    ...milestoneProblems(state.draft),
    ...milestoneGoalProblems(state.draft, versionFacts),
    ...frozenProblems
  ]
  const changes = describeMilestoneChanges(state.baseline, state.draft)
  function begin() {
    if (state && !state.recoveryBlocked) {
      patch({ editing: true })
    }
  }
  function renameVersion(cycleId: string, version: string) {
    model.editField((d) => ({
      ...d,
      versions: d.versions.map((v) => (v.cycleId === cycleId ? { ...v, version } : v)),
      material: {
        ...d.material,
        features: d.material.features.map((f) => ({
          ...f,
          deliveries: f.deliveries.map((item) =>
            item.version.cycleId === cycleId
              ? { ...item, version: { ...item.version, version } }
              : item
          )
        }))
      }
    }))
  }
  function remove(f: MilestoneFeature) {
    edit((d) =>
      fitMilestoneVersions(
        {
          ...d,
          material: {
            ...d.material,
            features: d.material.features.filter((item) => item.id !== f.id)
          }
        },
        new Set(f.deliveries.map((delivery) => delivery.version.cycleId))
      )
    )
  }
  function registerWeek(week: MilestoneWeek, name: string) {
    if (!enabled) {
      return
    }
    if (state!.draft.versions.some((v) => v.version.toLowerCase() === name.toLowerCase())) {
      toast('版本名称已存在')
      return
    }
    const next = materializeMilestoneWeek(state!.draft, week, crypto.randomUUID(), name)
    if (!ScheduledVersionSchema.safeParse(next.version).success) {
      toast('版本名称无效，未登记')
      return
    }
    edit(() => next.draft)
  }
  function addFeature() {
    if (!enabled) {
      return
    }
    const started = new Set(
      (state!.data.proposal ?? state!.data.formal).versions
        .filter((v) => v.started)
        .map((v) => v.cycleId)
    )
    const { id, date, draft } = createMilestoneFeature(state!.draft, started)
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
      !state!.data.formal.versions.some(
        (v) => v.version === version.version && v.cycleId === version.cycleId
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
        if (event.target instanceof HTMLInputElement && event.target.matches('.wb-ml-inline')) {
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
        <strong>项目里程碑</strong>
        <div className="wb-ml-actions">
          {editing && (
            <MilestoneHistoryActions
              dirty={dirty}
              busy={busy}
              conflict={!!state.sourceConflict}
              recoveryBlocked={!!state.recoveryBlocked}
              canUndo={model.canUndo}
              canRedo={model.canRedo}
              undo={() => {
                model.undo()
              }}
              redo={() => {
                model.redo()
              }}
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
              onClick={begin}
            >
              规划里程碑
            </Button>
          )}
          {(editing || state.data.review.pr || state.data.mergedProposal) && (
            <MilestoneReviewButton
              busy={busy || updatingFormal}
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
      {error && (
        <p className="wb-ml-alert" role="alert">
          {error}
        </p>
      )}
      {editing && problems.length > 0 && (
        <p className="wb-ml-alert" role="status">
          {problems.slice(0, 3).join('；')}
          {problems.length > 3 ? `（另有 ${problems.length - 3} 项）` : ''}
        </p>
      )}
      {editing && frozenProblems.length > 0 && (
        <div className="wb-ml-notice">
          <span>
            还原已锁定版本的改动；涉及这些版本的新增特性整行移除，已有特性的其他未来排期保留。可撤销。
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={!enabled}
            onClick={() =>
              edit((draft) =>
                restoreFrozenMilestones(state.data.proposal ?? state.data.formal, draft)
              )
            }
          >
            还原已锁定版本的改动
          </Button>
        </div>
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
        <div className="wb-ml-empty">还没有里程碑</div>
      ) : (
        <>
          <MilestoneNavigation
            visible={visible}
            month={month}
            editing={editing}
            enabled={enabled}
            navigate={(value) => navigate(`${value}-01`)}
            editField={model.editField}
          />
          <div className="wb-ml-toolbar">
            <span>
              {visible.material.features.length} 个特性 ·{' '}
              {new Set(visible.material.features.map((f) => f.owner.trim()).filter(Boolean)).size}{' '}
              位负责人
            </span>
          </div>
          <MilestoneTimeline
            key={`${restoreScope}:${editing}:${restoreKey}`}
            draft={visible}
            versionFacts={versionFacts}
            editField={model.editField}
            registerWeek={registerWeek}
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
                (state.data.proposal ?? state.data.formal).versions
                  .filter((v) => v.started)
                  .map((v) => v.cycleId)
              )
            }
            scrollX={state.scrollX}
            scrollY={state.scrollY}
            onScroll={(scrollX, scrollY) => patch({ scrollX, scrollY })}
            locate={locate?.scope === restoreScope ? locate : null}
          />
        </>
      )}
    </section>
  )
}
