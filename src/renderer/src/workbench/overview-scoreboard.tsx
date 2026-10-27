import { MessageSquarePlus } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { AnnotationMarkers } from './annotations/annotation-markers'
import { AnnotationPanel } from './annotations/AnnotationPanel'
import { AnnotationPopover } from './annotations/AnnotationPopover'
import {
  boardAnnotationsSendPrompt,
  formatBoardAnnotationsAsMarkdown
} from './annotations/annotation-markdown'
import { annotationAttributes, annotationRefFromElement } from './annotations/types'
import { useBoardAnnotations } from './annotations/use-board-annotations'
import { BoardActionButton } from './board-ui'
import { OverviewRefresh } from './overview-controls'
import { useOverviewViewState } from './overview-view-state'
import type { MetricCatalog, MetricReading } from '../../../shared/workbench/metrics'
import type { PlanningMaterial } from '../../../shared/workbench/version-planning-material'
import { buildScoreboardScenes, type ScoreboardScene } from './overview-scoreboard-model'
import { zoneBucketLabels, zoneChartRange } from './overview-zone-series'
import {
  Measure,
  measureView,
  metricNote,
  scoreboardVerdict,
  VERDICT_TEXT
} from './scoreboard-measure'
import { sendScoreboardNotes } from './send-scoreboard-notes'

/** 记分牌走势固定为周窗口。 */
export const SCOREBOARD_GRANULARITY = 'week' as const

function goalLine(scene: ScoreboardScene, plan: PlanningMaterial | null, version: string | null) {
  if (!scene.focus) {
    return null
  }
  const baseline = plan?.goals
    .flatMap((goal) => goal.metricTargets)
    .find(
      (item) => item.ref.name === scene.focus?.metric && item.target.trim() === scene.focus.target
    )?.baseline
  const from = baseline ? `从 ${baseline.value}${baseline.unit} ` : ''
  return `${scene.focus.metric}　${from}到 ${scene.focus.target}${version ? `　截至 ${version} 验收` : ''}`
}

export function OverviewScoreboard({
  catalog,
  readings,
  busy,
  onRefresh,
  anchor,
  identity,
  plan,
  version,
  setupBusy,
  onSetup,
  worktreeId
}: {
  catalog: MetricCatalog | null
  readings: Record<string, MetricReading | null>
  busy: boolean
  onRefresh(): void
  anchor?: string
  identity: string
  plan: PlanningMaterial | null
  version: string | null
  setupBusy: boolean
  onSetup(): void
  worktreeId: string | null
}) {
  const notes = useBoardAnnotations(`scoreboard:${identity}:${version ?? ''}`)
  const [noteNotice, setNoteNotice] = useState<string | null>(null)
  const scenes = useMemo(() => buildScoreboardScenes(catalog, plan), [catalog, plan])
  const [view, setView] = useOverviewViewState(identity)
  const active = scenes.find((scene) => scene.name === view.feature) ?? scenes[0]
  const timezone = catalog?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const range = zoneChartRange(SCOREBOARD_GRANULARITY, timezone, anchor)
  const labels = zoneBucketLabels(range)
  const views = (scene: ScoreboardScene) => ({
    lagging: scene.lagging
      ? measureView(scene.lagging, readings, labels, range, timezone, busy)
      : null,
    leading: scene.leading
      ? measureView(scene.leading, readings, labels, range, timezone, busy)
      : null
  })
  const tabVerdict = (scene: ScoreboardScene): keyof typeof VERDICT_TEXT | null => {
    const focus = scene.focus
    const def = [scene.lagging, scene.leading, ...scene.others].find(
      (item) => item?.name === focus?.metric
    )
    if (!focus || !def) {
      return null
    }
    const measured = measureView(def, readings, labels, range, timezone, busy)
    return scoreboardVerdict(def, focus.target, measured)
  }
  const focused = scenes.filter((scene) => scene.focus)
  const daily = scenes.filter((scene) => !scene.focus)
  const activeViews = active ? views(active) : null
  const line = active ? goalLine(active, plan, version) : null

  const onNotesClick = (event: MouseEvent) => {
    if (!notes.annotating) {
      return
    }
    const target = event.target as Element | null
    if (target?.closest('.g3-annot-marker')) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const element = target?.closest('[data-annotate-kind]')
    const ref = element ? annotationRefFromElement(element) : null
    if (element && ref) {
      notes.openPopover(ref, element.getBoundingClientRect())
    } else {
      notes.closePopover()
    }
  }
  const goalNote = active
    ? { kind: 'goal-title' as const, goalId: active.name, label: `${active.name} · 目标` }
    : null
  const popover = notes.popover

  const tab = (scene: ScoreboardScene) => {
    const verdict = tabVerdict(scene)
    return (
      <button
        key={scene.name}
        type="button"
        className="tab wb-sb-tab"
        role="tab"
        aria-selected={scene.name === active?.name}
        onClick={() => setView({ feature: scene.name })}
      >
        {scene.focus && (
          <i className={`wb-sb-dot wb-sb-dot-${verdict ?? 'unknown'}`} aria-hidden="true" />
        )}
        {scene.name}
        {verdict && verdict !== 'unknown' && (
          <span className="wb-sb-tab-state">{VERDICT_TEXT[verdict]}</span>
        )}
      </button>
    )
  }

  return (
    <section
      className={`card wb-ov-section${notes.annotating ? ' annotating' : ''}`}
      id="scoreboard"
      aria-label="记分牌"
    >
      <header className="wb-ov-section-head">
        <h2>记分牌</h2>
        <div className="wb-ov-tools">
          <BoardActionButton
            className={`wb-sb-annot-entry${notes.annotating ? ' wb-sb-annot-on' : ''}`}
            aria-pressed={notes.annotating}
            title={
              notes.annotating
                ? '退出批注模式（Esc 同样退出）'
                : '批注模式：点击目标或指标，记下要改的口径'
            }
            onClick={notes.toggleMode}
          >
            <MessageSquarePlus size={14} aria-hidden="true" /> 批注
            {notes.annotations.length > 0 && (
              <span className="wb-sb-annot-count">{notes.annotations.length}</span>
            )}
          </BoardActionButton>
          <button
            type="button"
            className="wb-btn wb-btn-secondary wb-btn-sm"
            disabled={setupBusy}
            onClick={onSetup}
            title="新建会话，配置场景与指标"
          >
            <MessageSquarePlus size={14} aria-hidden="true" /> 配置指标
          </button>
          <OverviewRefresh label="刷新记分牌读数" busy={busy} onClick={onRefresh} />
        </div>
      </header>
      {noteNotice && (
        <p className="wb-sb-annot-notice" role="status">
          {noteNotice}
        </p>
      )}
      {notes.annotating && (
        <p className="wb-sb-annot-notice" role="status">
          批注模式中，点击目标或指标即可记下讨论 · Esc 退出
        </p>
      )}
      {catalog?.draft && (
        <p className="wb-sb-annot-notice" role="status">
          正在显示配置草稿。场景和口径已按配置工作区里的文件更新；读数仍是已提交目录的，提交后再刷新。
        </p>
      )}
      {scenes.length === 0 ? (
        <p className="wb-sb-empty wb-muted">
          {catalog ? '还没有场景和指标，点「配置指标」新建会话来配置。' : '指标目录未就绪'}
        </p>
      ) : (
        <>
          <nav className="wb-sb-tabs" role="tablist" aria-label="场景">
            {focused.length > 0 && <span className="wb-sb-group">聚焦</span>}
            {focused.map(tab)}
            {focused.length > 0 && daily.length > 0 && (
              <span className="wb-sb-sep" aria-hidden="true" />
            )}
            {focused.length > 0 && daily.length > 0 && <span className="wb-sb-group">日常</span>}
            {daily.map(tab)}
          </nav>
          {active && activeViews && (
            <div className="wb-sb-body" onClickCapture={onNotesClick}>
              <div className="wb-sb-goal" {...(goalNote ? annotationAttributes(goalNote) : {})}>
                <span className="wb-sb-goal-k">目标</span>
                <span className={line ? 'wb-sb-goal-t' : 'wb-sb-goal-t wb-muted'}>
                  {line ?? '日常盯防，不在本版聚焦'}
                </span>
                {goalNote && (
                  <AnnotationMarkers
                    numbers={notes.numbersFor({ kinds: ['goal-title'], goalId: goalNote.goalId })}
                    label={goalNote.label}
                    onOpenPanel={notes.openPanel}
                  />
                )}
              </div>
              <p className={active.value ? 'wb-sb-value' : 'wb-sb-value wb-muted'}>
                {active.value || '价值说明未写'}
              </p>
              <div className="wb-sb-duo">
                <Measure
                  role="结果"
                  def={active.lagging}
                  target={active.lagging ? active.targets[active.lagging.name] : undefined}
                  view={activeViews.lagging}
                  labels={labels}
                  note={active.lagging ? metricNote(active.name, active.lagging.name) : null}
                  noteNumbers={
                    active.lagging
                      ? notes.numbersFor({
                          kinds: ['metrics'],
                          goalId: metricNote(active.name, active.lagging.name).goalId
                        })
                      : []
                  }
                  onOpenNotes={notes.openPanel}
                />
                <Measure
                  role={active.leading?.role === 'lagging' ? '结果' : '引领'}
                  def={active.leading}
                  target={active.leading ? active.targets[active.leading.name] : undefined}
                  view={activeViews.leading}
                  labels={labels}
                  note={active.leading ? metricNote(active.name, active.leading.name) : null}
                  noteNumbers={
                    active.leading
                      ? notes.numbersFor({
                          kinds: ['metrics'],
                          goalId: metricNote(active.name, active.leading.name).goalId
                        })
                      : []
                  }
                  onOpenNotes={notes.openPanel}
                />
              </div>
              {active.others.length > 0 && (
                <p className="wb-muted wb-sb-others">
                  本场景另有 {active.others.length} 项指标：
                  {active.others.map((item) => item.name).join('、')}
                </p>
              )}
            </div>
          )}
          <footer className="wb-sb-foot">
            <span>
              <b>输赢怎么算</b>
              最近读数对比计划写的完成线；完成线要写比较方向（如 ≥80），没写或没读数就看不出输赢
            </span>
            <span>
              <b>每周短会</b>报上周承诺 → 看这张记分牌 → 每人定下周一两件，承诺落成普通 Issue
            </span>
          </footer>
        </>
      )}
      {notes.panelOpen && (
        <AnnotationPanel
          annotations={notes.numbered}
          annotating={notes.annotating}
          worktreeId={worktreeId}
          assistant="指标配置"
          onClose={notes.closePanel}
          onUpdate={notes.update}
          onRemove={notes.remove}
          onBoardLevel={(rect) => notes.openPopover({ kind: 'board', label: '记分牌' }, rect)}
          onCopy={async () => {
            await window.api.ui.writeClipboardText(
              formatBoardAnnotationsAsMarkdown(notes.annotations)
            )
          }}
          onCopyError={(message) => setNoteNotice(`复制批注失败：${message}`)}
          onSendDirect={async () => {
            const result = await sendScoreboardNotes(boardAnnotationsSendPrompt(notes.annotations))
            if (!result.ok) {
              setNoteNotice(result.message)
              return false
            }
            return true
          }}
          onSent={() => {
            const count = notes.annotations.length
            notes.clearAll()
            setNoteNotice(`批注已发送 · 已递交的 ${count} 条已从记分牌清空，可继续批注。`)
          }}
        />
      )}
      {popover && (
        <AnnotationPopover
          key={popover.id}
          target={popover}
          onSave={(text) => {
            notes.add(popover.ref, text)
            notes.closePopover()
          }}
          onCancel={notes.closePopover}
        />
      )}
    </section>
  )
}
