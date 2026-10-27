import { MessageSquarePlus } from 'lucide-react'
import { useMemo } from 'react'
import { OverviewRefresh } from './overview-controls'
import { useOverviewViewState } from './overview-view-state'
import type {
  MetricCatalog,
  MetricDefinition,
  MetricReading
} from '../../../shared/workbench/metrics'
import type { PlanningMaterial } from '../../../shared/workbench/version-planning-material'
import {
  buildScoreboardScenes,
  targetVerdict,
  type ScoreboardScene,
  type TargetVerdict
} from './overview-scoreboard-model'
import { zoneBucketLabels, zoneChartRange, zonePointState } from './overview-zone-series'

/** 记分牌走势固定为周窗口。 */
export const SCOREBOARD_GRANULARITY = 'week' as const

const VERDICT_TEXT: Record<'met' | 'unmet' | 'unknown', string> = {
  met: '已达完成线',
  unmet: '未达完成线',
  unknown: '看不出输赢'
}

type MeasureView = {
  valueText: string
  unknown: boolean
  statusText: string
  values: (number | null)[]
  latestNumber: number | null
}

function collectedText(iso: string, timezone: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) {
    return iso
  }
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(at)
}

function measureView(
  def: MetricDefinition,
  readings: Record<string, MetricReading | null>,
  labels: string[],
  range: ReturnType<typeof zoneChartRange>,
  timezone: string,
  busy: boolean
): MeasureView {
  const state = zonePointState(readings[def.ref.definitionHash] ?? null, labels, range, timezone)
  if (state.kind === 'ready' && state.latest) {
    const { value, collectedAt } = state.latest
    return {
      valueText: typeof value === 'number' ? `${value}${def.unit}` : value,
      unknown: false,
      statusText: `采集于 ${collectedText(collectedAt, timezone)}`,
      values: state.values,
      latestNumber: typeof value === 'number' ? value : null
    }
  }
  return {
    valueText: busy && state.kind !== 'ready' ? '读取中' : '未知',
    unknown: true,
    statusText:
      busy && state.kind !== 'ready'
        ? '正在读取…'
        : state.kind === 'unknown'
          ? state.stale
            ? `${state.message} · 陈旧读数 ${state.stale.value}（采集于 ${collectedText(state.stale.collectedAt, timezone)}）`
            : state.message
          : state.kind === 'unread'
            ? '未读取'
            : '本窗口无读数',
    values: state.kind === 'ready' ? state.values : labels.map(() => null),
    latestNumber: null
  }
}

function verdictOf(def: MetricDefinition, target: string, view: MeasureView): TargetVerdict {
  return view.latestNumber === null ? null : targetVerdict(target, view.latestNumber, def.unit)
}

function shortLabel(label: string): string {
  return label.replace(/^\d{4}-/, '')
}

function Trend({
  name,
  labels,
  values
}: {
  name: string
  labels: string[]
  values: (number | null)[]
}) {
  const max = Math.max(...values.map((value) => Math.abs(value ?? 0)), 0)
  return (
    <div className="wb-sb-trend" aria-label={`${name} 走势`}>
      {values.map((value, index) => (
        <div
          key={labels[index]}
          className={[
            'wb-sb-bar',
            index === values.length - 1 && 'wb-sb-bar-now',
            value === null && 'wb-sb-bar-none'
          ]
            .filter(Boolean)
            .join(' ')}
          title={`${labels[index]}：${value ?? '无读数'}`}
        >
          <i
            style={{
              height: value === null || max === 0 ? 4 : Math.max(4, (Math.abs(value) / max) * 44)
            }}
          />
          <span>{shortLabel(labels[index])}</span>
        </div>
      ))}
    </div>
  )
}

function Measure({
  role,
  def,
  target,
  view,
  labels
}: {
  role: '结果' | '引领'
  def: MetricDefinition | null
  target: string | undefined
  view: MeasureView | null
  labels: string[]
}) {
  if (!def || !view) {
    return (
      <div className="wb-sb-measure wb-sb-measure-empty">
        <div className="wb-sb-role">{role}</div>
        <div className="wb-sb-name wb-muted">还没有{role}指标</div>
        <p className="wb-sb-def">
          用「配置指标」新建会话，给这个场景配一条可按周采集的{role}指标。
        </p>
      </div>
    )
  }
  const verdict = target ? verdictOf(def, target, view) : null
  return (
    <div className="wb-sb-measure">
      <div className="wb-sb-main">
        <div className="wb-sb-role">{role}</div>
        <div className="wb-sb-name">{def.name}</div>
        <div className={view.unknown ? 'wb-sb-num wb-sb-num-unknown' : 'wb-sb-num'}>
          {view.valueText}
        </div>
        <div className="wb-sb-status">
          {target ? (
            <>
              <i className={`wb-sb-dot wb-sb-dot-${verdict ?? 'unknown'}`} aria-hidden="true" />
              <span>{VERDICT_TEXT[verdict ?? 'unknown']}</span>
              <span className="wb-muted">· 完成线 {target}</span>
            </>
          ) : (
            <span className="wb-muted">{view.statusText}</span>
          )}
        </div>
        {target && <div className="wb-sb-status wb-muted">{view.statusText}</div>}
      </div>
      <Trend name={def.name} labels={labels} values={view.values} />
      <p className="wb-sb-def">{def.def}</p>
    </div>
  )
}

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
  onSetup
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
}) {
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
    return verdictOf(def, focus.target, measured) ?? 'unknown'
  }
  const focused = scenes.filter((scene) => scene.focus)
  const daily = scenes.filter((scene) => !scene.focus)
  const activeViews = active ? views(active) : null
  const line = active ? goalLine(active, plan, version) : null

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
    <section className="card wb-ov-section" id="scoreboard" aria-label="记分牌">
      <header className="wb-ov-section-head">
        <h2>记分牌</h2>
        <div className="wb-ov-tools">
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
            <div className="wb-sb-body">
              <div className="wb-sb-goal">
                <span className="wb-sb-goal-k">目标</span>
                <span className={line ? 'wb-sb-goal-t' : 'wb-sb-goal-t wb-muted'}>
                  {line ?? '日常盯防，不在本版聚焦'}
                </span>
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
                />
                <Measure
                  role={active.leading?.role === 'lagging' ? '结果' : '引领'}
                  def={active.leading}
                  target={active.leading ? active.targets[active.leading.name] : undefined}
                  view={activeViews.leading}
                  labels={labels}
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
    </section>
  )
}
