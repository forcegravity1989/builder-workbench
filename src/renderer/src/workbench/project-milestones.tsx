import { ErrorDetails, notifyWorkbenchError } from './error-feedback'
import { toRuntimeExecutionHostId } from '../../../shared/execution-host/execution-host'
import { focusMissingMilestoneField } from './milestone-field'
import { settleMilestoneWindows } from '../../../shared/workbench/milestone-window-order'
import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, LoaderCircle } from 'lucide-react'
import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { MilestoneHistoryActions, MilestoneTitle } from './milestone-history-actions'
import {
  ScheduledVersionSchema,
  milestoneDraft,
  milestoneProblems,
  type MilestoneDraft,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import type { MilestoneScope } from './milestone-port'
import { openVersionOverview } from './project-page-state'
import { useMilestonePlanning } from './use-milestone-planning'
import { useVersionCatalogForRepo } from './use-version-catalog'
import { MilestoneTimeline, type MilestoneLocation } from './milestone-timeline'
import { createMilestoneFeature } from './milestone-add-feature'
import {
  materializeMilestoneWeek,
  milestoneDay,
  milestoneDate,
  editMilestoneVersionName,
  datedMilestoneVersions,
  type MilestoneWeek
} from '../../../shared/workbench/milestone-calendar'
import { MilestoneReviewButton } from './milestone-review-button'
import { describeMilestoneChanges } from './milestone-change-summary'
import { MilestoneIconButton } from './milestone-icon-button'
import { sameDraft } from './milestone-planning-session'
import { activateVersionWorktree } from './version-worktree-host'
import { useWorkbenchScreenGuide } from './WorkbenchScreenGuide'
import { useWorkbenchScreenUsage } from './workbench-screen-usage'
import './project-milestones.css'

export function ProjectMilestones({
  scope,
  refreshToken
}: {
  scope: MilestoneScope | null
  refreshToken: number
}) {
  const model = useMilestonePlanning(scope, refreshToken)
  const catalog = useVersionCatalogForRepo(
    scope?.repoId ?? null,
    scope?.runtimeOwnerEnvironmentId
      ? toRuntimeExecutionHostId(scope.runtimeOwnerEnvironmentId)
      : scope?.hostId
  )
  const { state, busy, dirty, error, patch, edit } = model
  const formalHead = model.confirmed ? state?.data.formal.head : undefined
  const reloadCatalog = catalog.reload
  useEffect(() => {
    if (formalHead) {
      reloadCatalog()
    }
  }, [formalHead, reloadCatalog])
  const root = useRef<HTMLElement>(null)
  const [locate, setLocate] = useState<(MilestoneLocation & { scope: string | null }) | null>(null)
  const [restoreKey, setRestoreKey] = useState(0)
  const [validationAttempt, setValidationAttempt] = useState(false)
  const [newFeature, setNewFeature] = useState<string | null>(null)
  const restored = useRef<string | null>(null)
  const restoreScope = scope ? JSON.stringify(scope) : null
  const pageY = state?.pageY
  useWorkbenchScreenGuide(
    'workbench-milestones',
    Boolean(state?.editing && !busy && state.data.project?.working)
  )
  // Why: entering milestone planning is the usage; the guide's busy/working gates
  // keep tours quiet but must not gate the usage count.
  useWorkbenchScreenUsage('workbench-milestones', Boolean(state?.editing))
  useEffect(() => {
    if (
      model.confirmed &&
      restoreScope &&
      pageY !== undefined &&
      root.current &&
      restored.current !== restoreScope
    ) {
      const content = root.current.closest('.content')
      if (content) {
        content.scrollTop = pageY
        restored.current = restoreScope
      }
    }
  }, [model.confirmed, restoreScope, pageY])
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
        {error ? (
          <ErrorDetails summary="项目规划读取失败 · 查看详情" detail={error} />
        ) : (
          <p role="status">正在读取项目规划…</p>
        )}
        {error && (
          <Button variant="outline" size="xs" onClick={() => void model.reload()}>
            重试读取
          </Button>
        )}
      </section>
    )
  }
  const editing = state.editing
  const project = state.data.project
  const retry = Boolean(state.retry || project?.pendingReview)
  const hasReviewAction = editing || dirty || retry || !!state.data.review.pr
  const visible = state.draft
  const enabled = editing && !busy && !!project?.working
  const status =
    model.unsaved || state.fileChanged
      ? state.saving
        ? '正在保存…'
        : '未保存'
      : dirty
        ? '已保存 · 未提交'
        : retry
          ? '待提交评审'
          : project?.incorporated
            ? project.working?.material
              ? '已合入'
              : null
            : project?.reviewed
              ? '待评审'
              : state.data.review.pr
                ? '有开放评审'
                : null
  const formalDraft = milestoneDraft(state.data.formal)
  const hasPlanning =
    visible.material.milestones.length > 0 ||
    visible.material.features.length > 0 ||
    datedMilestoneVersions(visible).length > 0 ||
    formalDraft.material.features.length > 0 ||
    datedMilestoneVersions(formalDraft).length > 0
  const navigate = (date: string) => {
    setLocate((previous) => ({
      date,
      sequence: (previous?.sequence ?? 0) + 1,
      scope: restoreScope
    }))
  }
  const registeredVersions = (
    state.data.formal.registeredVersions ?? state.data.formal.versions
  ).concat(project?.committed.registeredVersions ?? project?.committed.versions ?? [])
  const problems = milestoneProblems(state.draft, state.baseline)
  const busyReason = project?.workingError
    ? '项目材料文件无法读取，见下方说明。'
    : state.saving
      ? '正在保存里程碑…'
      : model.updating
        ? '正在更新项目材料工作树…'
        : busy
          ? '正在读取项目材料，请稍候。'
          : undefined
  const reviewBlockedReason = state.fileChanged
    ? '里程碑文件已被改动，请先复制修改或载入文件。'
    : state.data.review.queryFailed
      ? '评审状态未读到，请先重试读取。'
      : busyReason
  const changes = describeMilestoneChanges(state.baseline, state.draft)
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
    const settled = settleMilestoneWindows(state!.draft, next.draft)
    if (settled.conflict) {
      toast.error(settled.conflict)
      return
    }
    edit(() => settled.draft)
  }
  function addFeature(viewDate: string, viewEnd: number) {
    if (!enabled) {
      return
    }
    const created = createMilestoneFeature(state!.draft, viewDate)
    if (!created) {
      toast.error('超出可记录的日期范围')
      return
    }
    const { id, date, draft } = created
    edit(() => draft)
    if (milestoneDay(date) + 7 > viewEnd) {
      navigate(milestoneDate(milestoneDay(date) - 3))
    }
    setValidationAttempt(false)
    setNewFeature(id)
  }
  function validate() {
    if (!problems.length) {
      return true
    }
    setValidationAttempt(true)
    if (!editing) {
      void model.beginEditing()
    }
    toast.error(problems[0])
    requestAnimationFrame(() => focusMissingMilestoneField(root.current))
    return false
  }
  const openProjectWorktree = () => {
    const tree =
      project && useAppStore.getState().getKnownWorktreeById(project.worktreeId, scope.hostId)
    if (!tree || !activateVersionWorktree(tree)) {
      toast.error('项目材料工作树暂不可用。请检查项目连接。')
    }
  }
  const copyDraft = async (draft: MilestoneDraft) => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ ...draft.material, versionPlans: draft.versions }, null, 2)
      )
      toast.success('已复制里程碑修改')
    } catch (reason) {
      notifyWorkbenchError('未能复制里程碑修改', reason)
    }
  }
  function open(version: ScheduledVersion) {
    if (
      !catalog.catalog?.entries.some(
        (entry) =>
          entry.version === version.version &&
          (entry.material.plan?.cycleId === version.cycleId ||
            entry.draft?.cycleId === version.cycleId ||
            entry.material.acceptance?.cycleId === version.cycleId)
      )
    ) {
      const adopted = state!.data.formal.versions.some(
        (v) => v.cycleId === version.cycleId && v.version === version.version
      )
      toast(
        catalog.loading
          ? '正在读取版本材料，请稍后再试'
          : (catalog.error ??
              catalog.catalog?.problems[0]?.message ??
              (adopted
                ? '当前只有里程碑排期。到「版本工作区 → 新建版本」填写同一版本名，再开始计划。'
                : '先提交排期评审。合入后更新主检出，再用同一版本名开始计划。'))
      )
      return
    }
    patch({ pageY: root.current?.closest('.content')?.scrollTop ?? 0 })
    openVersionOverview({
      repoId: scope!.repoId,
      hostId: scope!.runtimeOwnerEnvironmentId
        ? toRuntimeExecutionHostId(scope!.runtimeOwnerEnvironmentId)
        : scope!.hostId,
      version: version.version,
      milestoneOrigin: { feature: '' }
    })
  }
  return (
    <section
      ref={root}
      className="wb-ml"
      data-validation-attempt={validationAttempt || undefined}
      data-draft-persistence={
        !model.confirmed
          ? undefined
          : state.saveError || state.fileChanged
            ? 'failed'
            : state.saving
              ? 'saving'
              : !model.unsaved
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
          {!model.confirmed && (
            <span className="text-xs text-muted-foreground" role="status">
              {model.reading ? '正式安排 · 正在读取项目材料与评审' : '当前显示正式安排'}
            </span>
          )}
          {status && !project?.workingError && (
            <span className="text-xs text-muted-foreground" role="status">
              {status}
            </span>
          )}
          {editing && (
            <MilestoneHistoryActions
              dirty={dirty}
              busy={busy}
              fileChanged={!!state.fileChanged}
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
            <span
              className="inline-flex"
              title={busy || project?.workingError ? busyReason : undefined}
            >
              <Button
                size="xs"
                className="bg-foreground text-background hover:bg-foreground/90"
                disabled={busy || !!project?.workingError}
                data-contextual-tour-target={
                  hasReviewAction ? 'milestone-start' : 'milestone-start milestone-submit'
                }
                onClick={model.beginEditing}
              >
                规划里程碑
              </Button>
            </span>
          )}
          {hasReviewAction && (
            <MilestoneReviewButton
              writing={model.writing}
              busy={busy || state.saving || !!project?.workingError}
              conflict={!!state.fileChanged || !!state.data.review.queryFailed}
              dirty={dirty}
              retry={retry}
              validate={validate}
              hasReview={state.data.review.pr?.state === 'open'}
              reviewUrl={state.data.review.pr?.url ?? undefined}
              secondary={!editing}
              changes={changes}
              blockedReason={reviewBlockedReason}
              submit={() => {
                void model.submit()
              }}
            />
          )}
          <MilestoneIconButton
            label={model.updating ? '正在更新项目材料工作树' : '更新代码 · 项目材料工作树'}
            disabled={busy}
            onClick={() => void model.update()}
          >
            {model.updating ? <LoaderCircle className="animate-spin" /> : <ArrowDownToLine />}
          </MilestoneIconButton>
        </div>
      </header>
      {state.data.review.queryFailed && (
        <p className="wb-ml-alert" role="alert">
          评审状态未读到。
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void model.reload()}>
            重试读取
          </Button>
        </p>
      )}
      {model.updateError && (
        <div className="wb-ml-alert" role="alert">
          <ErrorDetails summary="项目材料工作树未更新 · 查看详情" detail={model.updateError} />
          {project && (
            <Button size="xs" variant="ghost" onClick={openProjectWorktree}>
              打开项目材料工作树
            </Button>
          )}
        </div>
      )}
      {project?.workingError && (
        <ErrorDetails
          className="wb-ml-alert"
          summary="项目材料文件无法读取 · 查看详情"
          detail={project.workingError}
        />
      )}
      {state.fileChanged ? (
        <div className="wb-ml-alert" role="alert">
          <p>里程碑文件已被改动。当前输入仍保留，复制后可到工作树核对。</p>
          <Button size="xs" variant="ghost" onClick={() => void copyDraft(state.draft)}>
            复制我的修改
          </Button>
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => void model.reload(true)}>
            放弃未保存输入，载入文件
          </Button>
        </div>
      ) : (
        state.saveError && (
          <div className="wb-ml-alert" role="alert">
            <ErrorDetails
              summary="里程碑未保存，当前输入已保留 · 查看详情"
              detail={state.saveError}
            />
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void model.save()}>
              重试保存
            </Button>
          </div>
        )
      )}
      {state.legacy && (
        <div className="wb-ml-notice">
          此设备有旧版里程碑草稿。
          <Button size="xs" variant="ghost" onClick={() => void copyDraft(state.legacy!.draft)}>
            复制旧草稿
          </Button>
          {sameDraft(state.draft, state.legacy.baseline) && !model.unsaved && (
            <Button
              size="xs"
              variant="ghost"
              disabled={busy || !!project?.workingError}
              onClick={() => void model.restoreLegacy()}
            >
              恢复到工作树
            </Button>
          )}
        </div>
      )}
      {state.submitError && (
        <details className="wb-ml-alert" role="status">
          <summary>里程碑提交失败 · 查看详情</summary>
          <p>{state.submitError}</p>
          <Button
            size="xs"
            variant="outline"
            disabled={
              busy || !!state.fileChanged || !!state.data.review.queryFailed || problems.length > 0
            }
            onClick={() => void model.submit()}
          >
            重试提交
          </Button>
        </details>
      )}
      {error && (
        <div className="wb-ml-alert">
          <ErrorDetails summary="里程碑读取失败 · 查看详情" detail={error} />
          {!model.confirmed && (
            <Button
              size="xs"
              variant="ghost"
              disabled={model.reading}
              onClick={() => void model.reload()}
            >
              重试读取
            </Button>
          )}
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
      {!editing && !hasPlanning ? (
        <div className="wb-ml-empty" data-contextual-tour-target="milestone-schedule">
          {model.confirmed ? '还没有里程碑' : '正式安排中还没有里程碑'}
        </div>
      ) : (
        <MilestoneTimeline
          catalog={catalog}
          key={`${restoreScope}:${model.confirmed}:${editing}:${restoreKey}`}
          draft={visible}
          formalDraft={formalDraft}
          editField={model.editField}
          registerWeek={registerWeek}
          navigate={navigate}
          addFeature={addFeature}
          newFeature={newFeature}
          editing={editing}
          busy={busy || !project?.working}
          edit={edit}
          open={open}
          remove={remove}
          rename={renameVersion}
          started={new Set(registeredVersions.filter((v) => v.started).map((v) => v.cycleId))}
          viewDate={state.viewDate}
          featureOrder={state.featureOrder ?? []}
          pinnedFeatures={state.pinnedFeatures ?? []}
          pinFeature={(id) =>
            patch({ pinnedFeatures: [...new Set([...(state.pinnedFeatures ?? []), id])] })
          }
          rangeOnly={state.rangeOnly ?? true}
          onRangeOnly={(rangeOnly) => patch({ rangeOnly })}
          validationAttempt={validationAttempt}
          scrollX={state.scrollX}
          scrollY={state.scrollY}
          onScroll={(scrollX, scrollY, viewDate) => patch({ scrollX, scrollY, viewDate })}
          locate={locate?.scope === restoreScope ? locate : null}
        />
      )}
    </section>
  )
}
