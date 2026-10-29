import { Button } from '@/components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { CalendarPlus, Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  milestoneDraft,
  milestoneProblems,
  type MilestoneFeature,
  type ScheduledVersion
} from '../../../shared/workbench/project-milestones'
import type { MilestoneScope } from './milestone-port'
import { openVersionOverview } from './project-page-state'
import { useMilestonePlanning } from './use-milestone-planning'
import { MilestoneTimeline } from './milestone-timeline'
import { MilestoneNavigation } from './milestone-navigation'
import { MilestoneReference } from './milestone-reference'
import { MilestoneReviewButton } from './milestone-review-button'
import { describeMilestoneChanges } from './milestone-change-summary'
import { MilestoneVersionEditor } from './milestone-version-editor'
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
  const undoToast = useRef<string | number | undefined>(undefined)
  const clearUndo = () => {
    if (undoToast.current !== undefined) {
      toast.dismiss(undoToast.current)
    }
    undoToast.current = undefined
  }
  useEffect(() => clearUndo, [])
  const [locate, setLocate] = useState<string | null>(null)
  const [restoreKey, setRestoreKey] = useState(0)
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
  const enabled = editing && !busy
  const months = visible.material.months.toSorted((a, b) => a.month.localeCompare(b.month))
  const month = months.some((m) => m.month === state.month)
    ? state.month
    : (months.at(-1)?.month ?? state.month)
  const problems = milestoneProblems(state.draft)
  const status = state.retry
    ? '提交未完成'
    : dirty
      ? '有未提交修改'
      : state.data.proposal && state.data.review.pr?.state === 'merged'
        ? '已合入，待更新'
        : state.data.proposal && state.data.review.pr?.state === 'open'
          ? '已提交，待合入'
          : state.data.review.queryFailed
            ? '评审状态未读到'
            : '未修改'
  const changes = describeMilestoneChanges(state.baseline, state.draft)
  function begin() {
    patch({ editing: true })
    if (!state!.draft.material.months.length) {
      edit((d) => ({ ...d, material: { ...d.material, months: [{ month, outcome: '' }] } }))
    }
  }
  function updateVersion(cycleId: string, values: Partial<ScheduledVersion>) {
    edit((d) => ({
      ...d,
      versions: d.versions.map((v) => (v.cycleId === cycleId ? { ...v, ...values } : v)),
      material: {
        ...d.material,
        features: d.material.features.map((f) => ({
          ...f,
          pre:
            f.pre?.cycleId === cycleId && values.version !== undefined
              ? { ...f.pre, version: values.version }
              : f.pre,
          release:
            f.release?.cycleId === cycleId && values.version !== undefined
              ? { ...f.release, version: values.version }
              : f.release
        }))
      }
    }))
  }
  function remove(f: MilestoneFeature) {
    const index = state!.draft.material.features.findIndex((item) => item.id === f.id)
    edit((d) => ({
      ...d,
      material: { ...d.material, features: d.material.features.filter((item) => item.id !== f.id) }
    }))
    clearUndo()
    undoToast.current = toast('已移除特性', {
      action: {
        label: '撤销',
        onClick: () =>
          edit((d) => {
            if (d.material.features.some((item) => item.id === f.id)) {
              return d
            }
            const features = [...d.material.features]
            features.splice(Math.min(index, features.length), 0, f)
            return { ...d, material: { ...d.material, features } }
          })
      }
    })
  }
  function open(version: ScheduledVersion, feature: MilestoneFeature) {
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
      milestoneOrigin: { feature: feature.title }
    })
  }
  return (
    <section ref={root} className="wb-ml">
      <header className="wb-ml-heading">
        <strong>项目里程碑</strong>
        <div className="wb-ml-actions">
          {editing && (
            <>
              <small role="status">{status}</small>
              <Button
                variant="outline"
                size="xs"
                disabled={busy}
                onClick={() => patch({ editing: false })}
              >
                查看正式安排
              </Button>
              <Button
                variant="outline"
                size="xs"
                disabled={busy || !dirty}
                onClick={() => {
                  clearUndo()
                  model.revert()
                  setRestoreKey((v) => v + 1)
                }}
              >
                还原修改
              </Button>
            </>
          )}
          {!editing ? (
            <Button
              size="xs"
              className="bg-foreground text-background hover:bg-foreground/90"
              disabled={busy}
              onClick={begin}
            >
              规划里程碑
            </Button>
          ) : (
            <MilestoneReviewButton
              busy={busy}
              conflict={!!state.sourceConflict}
              dirty={dirty}
              retry={state.retry}
              invalid={problems.length > 0}
              hasReview={state.data.review.pr?.state === 'open'}
              changes={changes}
              submit={() => {
                clearUndo()
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
          <MilestoneReference />
        </div>
      </header>
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
      {state.data.formal.problems.length > 0 && (
        <details className="wb-ml-alert">
          <summary>部分版本材料未读到</summary>
          {state.data.formal.problems.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </details>
      )}
      {state.data.sourceNotice && (
        <div className="wb-ml-notice">
          {state.data.sourceNotice}
          {state.data.mergedProposal && (
            <Button
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={async () => {
                await updateFormal()
                await model.reload()
              }}
            >
              更新正式安排
            </Button>
          )}
        </div>
      )}
      {state.data.review.pr?.url && (
        <div className="wb-ml-review-link">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void window.api.shell.openUrl(state.data.review.pr!.url!)}
          >
            查看项目材料评审
          </Button>
        </div>
      )}
      {!months.length ? (
        <div className="wb-ml-empty">还没有月度里程碑</div>
      ) : (
        <>
          <MilestoneNavigation
            visible={visible}
            month={month}
            enabled={enabled}
            selectMonth={(month) => {
              clearUndo()
              patch({ month })
            }}
            setLocate={setLocate}
            edit={edit}
          />
          <div className="wb-ml-toolbar">
            <span>{month} · 特性交付安排</span>
            <div className="wb-ml-actions">
              {editing && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <MilestoneIconButton label="添加月份" disabled={busy}>
                        <CalendarPlus size={14} />
                      </MilestoneIconButton>
                    </PopoverTrigger>
                    <PopoverContent className="wb-ml-small">
                      <label>
                        规划月份
                        <input
                          type="month"
                          aria-label="规划月份"
                          value={month}
                          onChange={(e) => {
                            const value = e.target.value
                            if (!value) {
                              return
                            }
                            edit((d) => ({
                              ...d,
                              material: {
                                ...d.material,
                                months: d.material.months.some((m) => m.month === value)
                                  ? d.material.months
                                  : [...d.material.months, { month: value, outcome: '' }]
                              }
                            }))
                            patch({ month: value })
                            setLocate(value)
                          }}
                        />
                      </label>
                    </PopoverContent>
                  </Popover>
                  <MilestoneVersionEditor
                    draft={state.draft}
                    existing={(state.data.proposal ?? state.data.formal).versions}
                    busy={busy}
                    updateVersion={updateVersion}
                    edit={edit}
                  />
                  <MilestoneIconButton
                    label="添加特性"
                    disabled={busy}
                    onClick={() => {
                      const v =
                        state.draft.versions.find((item) =>
                          item.timeWindow?.start.startsWith(month)
                        ) ?? state.draft.versions.find((item) => item.timeWindow)
                      const ref = v ? { version: v.version, cycleId: v.cycleId } : null
                      edit((d) => ({
                        ...d,
                        material: {
                          ...d.material,
                          features: [
                            ...d.material.features,
                            {
                              id: crypto.randomUUID(),
                              month,
                              title: '',
                              owner: '',
                              pre: ref,
                              release: ref
                            }
                          ]
                        }
                      }))
                    }}
                  >
                    <Plus size={14} />
                  </MilestoneIconButton>
                </>
              )}
            </div>
          </div>
          <MilestoneTimeline
            key={`${editing}:${restoreKey}`}
            draft={visible}
            month={month}
            editing={enabled}
            edit={edit}
            open={open}
            remove={remove}
            rename={(cycleId, version) => updateVersion(cycleId, { version })}
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
            locate={locate}
            notify={(text) => toast(text)}
          />
        </>
      )}
    </section>
  )
}
