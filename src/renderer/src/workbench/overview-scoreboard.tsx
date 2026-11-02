import { MessageSquarePlus } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { AnnotationPanel } from './annotations/AnnotationPanel'
import { AnnotationPopover } from './annotations/AnnotationPopover'
import {
  boardAnnotationsSendPrompt,
  formatBoardAnnotationsAsMarkdown
} from './annotations/annotation-markdown'
import { annotationRefFromElement } from './annotations/types'
import { useBoardAnnotations } from './annotations/use-board-annotations'
import { BoardActionButton } from './board-ui'
import { OverviewRefresh } from './overview-controls'
import { useOverviewViewState } from './overview-view-state'
import type { MetricCatalog, MetricReading } from '../../../shared/workbench/metrics'
import type { PlanningMaterial } from '../../../shared/workbench/version-planning-material'
import { buildScoreboardScenes, type ScoreboardScene } from './overview-scoreboard-model'
import { zoneBucketLabels, zoneChartRange } from './overview-zone-series'
import { Measure, measureView, metricNote, scoreboardVerdict } from './scoreboard-measure'
import { sendScoreboardNotes } from './send-scoreboard-notes'

/** 记分牌走势固定为周窗口。 */
export const SCOREBOARD_GRANULARITY = 'week' as const

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
  const tabVerdict = (scene: ScoreboardScene): 'met' | 'unmet' | 'unknown' | null => {
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
        {catalog?.draft && <span className="wb-sb-draft">草稿</span>}
        <div className="wb-ov-tools">
          <BoardActionButton
            className={`wb-sb-annot-entry${notes.annotating ? ' wb-sb-annot-on' : ''}`}
            aria-pressed={notes.annotating}
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
          >
            <MessageSquarePlus size={14} aria-hidden="true" /> 配置指标
          </button>
          <OverviewRefresh label="刷新" busy={busy} onClick={onRefresh} />
        </div>
      </header>
      {noteNotice && (
        <p className="wb-sb-annot-notice" role="status">
          {noteNotice}
        </p>
      )}
      {scenes.length === 0 ? (
        catalog ? null : (
          <p className="wb-sb-empty wb-muted">指标目录未就绪</p>
        )
      ) : (
        <>
          <nav className="wb-sb-tabs" role="tablist" aria-label="场景">
            {focused.length > 0 && <div className="wb-sb-cluster">{focused.map(tab)}</div>}
            {daily.length > 0 && <div className="wb-sb-cluster">{daily.map(tab)}</div>}
          </nav>
          {active && activeViews && (
            <div className="wb-sb-body" onClickCapture={onNotesClick}>
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
            </div>
          )}
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
