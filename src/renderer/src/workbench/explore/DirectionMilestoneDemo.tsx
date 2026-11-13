import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { MilestoneTimeline } from '../milestone-timeline'
import { MilestoneTitle } from '../milestone-history-actions'
import { MilestoneNodeForm } from '../milestone-navigation'
import { MilestoneReviewButton } from '../milestone-review-button'
import { describeMilestoneChanges } from '../milestone-change-summary'
import type { VersionCatalogState } from '../use-version-catalog'
import type { MilestoneDraft } from '../../../../shared/workbench/project-milestones'
import '../project-milestones.css'

const ignore = () => {}
const empty: MilestoneDraft = {
  material: { schema_version: 4, milestones: [], features: [] },
  versions: []
}
const catalog: VersionCatalogState = {
  scope: null,
  home: null,
  worktrees: [],
  repoIds: [],
  planTrees: [],
  catalog: null,
  loading: false,
  error: null,
  materialReady: true,
  materialError: null,
  reload: ignore
}

function demoDraft(hasNode: boolean, hasFeature: boolean, moved: boolean): MilestoneDraft {
  return {
    versions: [],
    material: {
      schema_version: 4,
      milestones: hasNode ? [{ id: 'first', date: '2026-11-13', outcome: '首场交换开放预约' }] : [],
      features: hasFeature
        ? [
            {
              id: 'booking',
              title: '手机预约',
              owner: '林小满',
              deliveries: [
                {
                  id: 'build',
                  phase: 'Build',
                  timeWindow: {
                    start: '2026-11-10T00:00',
                    end: moved ? '2026-11-13T12:00' : '2026-11-12T12:00'
                  }
                }
              ]
            }
          ]
        : []
    }
  }
}

function DemoTimeline({ draft, editing }: { draft: MilestoneDraft; editing: boolean }) {
  return (
    <MilestoneTimeline
      catalog={catalog}
      draft={draft}
      editing={editing}
      busy={false}
      edit={ignore}
      editField={ignore}
      open={ignore}
      remove={ignore}
      rename={ignore}
      started={new Set()}
      onScroll={ignore}
      viewDate="2026-11-09"
      rangeOnly={false}
      featureOrder={[]}
      pinnedFeatures={[]}
      pinFeature={ignore}
      onRangeOnly={ignore}
      validationAttempt={false}
      scrollX={null}
      scrollY={0}
      locate={null}
      registerWeek={ignore}
      navigate={ignore}
      addFeature={ignore}
      newFeature={null}
    />
  )
}

export function DirectionMilestoneDemo({ time, review }: { time: number; review: boolean }) {
  const editing = review ? time < 3800 : time >= 950
  const adding = !review && time >= 2250 && time < 3650
  const hasNode = review || time >= 3650
  const hasFeature = review || time >= 4050
  const moved = review || time >= 5450
  const draft = useMemo(() => demoDraft(hasNode, hasFeature, moved), [hasNode, hasFeature, moved])
  const pending = review && time >= 3800 && time < 6200
  const merged = review && time >= 6200 && time < 7950
  const formal = review && time >= 7950
  const timeline = useMemo(() => <DemoTimeline draft={draft} editing={editing} />, [draft, editing])
  const changes = useMemo(() => describeMilestoneChanges(empty, draft), [draft])
  return (
    <section className="wb-ml direction-milestone-demo">
      <header className="wb-ml-heading">
        <MilestoneTitle editing={editing} busy={false} finishEditing={ignore} />
        <div className="wb-ml-actions">
          {!review && hasNode && (
            <span className="text-xs text-muted-foreground">草稿已保存在本机</span>
          )}
          {!editing && !review && (
            <Button size="xs" data-demo-action="plan">
              规划里程碑
            </Button>
          )}
          {review && !formal && (
            <MilestoneReviewButton
              busy={false}
              writing={false}
              conflict={false}
              dirty={editing}
              retry={false}
              validate={() => true}
              hasReview={pending}
              openReview={pending ? ignore : undefined}
              needsUpdate={merged}
              updateFormal={ignore}
              changes={[]}
              submit={ignore}
            />
          )}
        </div>
      </header>
      {adding && (
        <section className="direction-review-summary">
          <h3 className="mb-2 text-sm font-semibold">添加里程碑</h3>
          <MilestoneNodeForm
            date="2026-11-13"
            outcome={'首场交换开放预约'.slice(0, Math.floor((time - 2250) / 50))}
            setDate={ignore}
            setOutcome={ignore}
            cancel={ignore}
            submit={ignore}
          />
        </section>
      )}
      {review && time >= 1250 && time < 3800 && (
        <section className="wb-ml-review direction-review-summary">
          <strong>本次改动</strong>
          <ul>
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Button size="xs" data-demo-action="confirm">
            确认提交
          </Button>
        </section>
      )}
      {editing || formal ? timeline : <div className="wb-ml-empty">还没有里程碑</div>}
    </section>
  )
}
