import type { ReactNode } from 'react'
import type { MetricDefinition } from '../../../../shared/workbench/metrics'
import { Check, MessageSquarePlus, Pencil, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DECISION_LABELS } from '../version-labels'
import { OverviewRefresh } from '../overview-controls'
import { Measure } from '../scoreboard-measure'
import { sampleCharter } from './sample-charter'
import '../workbench-overview.css'
import '../version-overview/overview.css'
import '../version-planning/version-planning.css'

const ignore = () => {}
const weeks = ['2026-W42', '2026-W43', '2026-W44', '2026-W45', '2026-W46']

function Scene({
  title,
  version = 'v0.2',
  children
}: {
  title: string
  version?: string
  children: ReactNode
}) {
  return (
    <div className="direction-demo-window p-3">
      <div className="mx-auto w-full max-w-2xl">
        <p className="mb-1 text-xs text-muted-foreground">
          {sampleCharter.name} / {version}
        </p>
        <h4 className="mb-2 text-sm font-semibold">{title}</h4>
        {children}
      </div>
    </div>
  )
}

export function OutcomesFactsDemo({ time }: { time: number }) {
  if (time < 1800) {
    return (
      <Scene title="版本">
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <strong>v0.2</strong>
          <Button size="xs" variant="outline" data-demo-action="version-overview">
            总览
          </Button>
        </div>
      </Scene>
    )
  }
  return (
    <Scene title="v0.2 版本总览">
      <div className="bwo-header">
        <span className="bwo-badge">已有正式验收</span>
      </div>
      <div className="bwo-meta">验收 · 已进入归档 · 已合入 · #21</div>
      <div className="bwo-goal">
        <div className="bwo-goal-heading">
          <span>G1</span>
          <h4>让邻居用手机预约首场交换</h4>
          <span className="bwo-badge">{DECISION_LABELS['not-met']}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        场次确认仍待修正，试用效果可在项目总览查看。
      </p>
    </Scene>
  )
}

const baseDefinition: Omit<MetricDefinition, 'name' | 'role'> = {
  ref: {
    name: '',
    configurationCommit: 'a'.repeat(40),
    definitionHash: `sha256:${'a'.repeat(64)}`
  },
  def: '',
  target: '',
  unit: '%',
  feature: '预约流程',
  collect: { kind: 'script', run: ['sample'], retro: true }
}

function DemoMeasure({
  name,
  role,
  values,
  target
}: {
  name: string
  role: '结果' | '引领'
  values: (number | null)[]
  target?: string
}) {
  const latest = values.at(-1) ?? null
  return (
    <Measure
      role={role}
      def={{ ...baseDefinition, name, role: role === '结果' ? 'lagging' : 'leading' }}
      target={target}
      view={{
        valueText: latest === null ? '未知' : `${latest}%`,
        values,
        latestNumber: latest,
        unknown: latest === null
      }}
      labels={weeks}
      note={null}
      noteNumbers={[]}
      onOpenNotes={ignore}
    />
  )
}

function ScoreboardDemoFrame({
  children,
  refreshing = false
}: {
  children?: ReactNode
  refreshing?: boolean
}) {
  return (
    <div className="wb-ov relative">
      <section className="card wb-ov-section">
        <header className="wb-ov-section-head">
          <h2>记分牌</h2>
          <div className="wb-ov-tools">
            <button
              type="button"
              className="wb-btn wb-btn-secondary wb-btn-sm"
              data-demo-action="configure-metrics"
            >
              <MessageSquarePlus size={14} aria-hidden="true" /> 配置指标
            </button>
            <OverviewRefresh label="刷新" busy={refreshing} onClick={ignore} />
          </div>
        </header>
        {children}
      </section>
      {refreshing && (
        <div className="wb-ov-refresh-block !absolute">
          <div className="wb-ov-refresh-card">
            <RefreshCw size={14} className="wb-ov-refresh-spin" /> 正在重新采集指标读数…
          </div>
        </div>
      )}
    </div>
  )
}

export function OutcomesScoreboardDemo({ time }: { time: number }) {
  const booking = time >= 1700
  return (
    <Scene title="项目总览">
      <ScoreboardDemoFrame>
        <nav className="wb-sb-tabs" role="tablist" aria-label="场景">
          <div className="wb-sb-cluster">
            <button
              type="button"
              className="tab wb-sb-tab"
              role="tab"
              aria-selected={booking}
              data-demo-action="booking-tab"
            >
              <i className="wb-sb-dot wb-sb-dot-unmet" />
              预约流程
            </button>
            <button type="button" className="tab wb-sb-tab" role="tab" aria-selected={!booking}>
              活动发现
            </button>
          </div>
        </nav>
        <div className="wb-sb-body">
          <div className="wb-sb-duo">
            <DemoMeasure
              role="结果"
              name={booking ? '预约完成率' : '活动详情打开率'}
              target={booking ? '≥60%' : undefined}
              values={booking ? [null, 41, 46, 53, 48] : [null, 31, 31, 33, 34]}
            />
            <DemoMeasure
              role="引领"
              name={booking ? '场次查看率' : '活动列表触达率'}
              values={booking ? [null, 62, 68, 73, 76] : [null, 45, 56, 59, 61]}
            />
          </div>
        </div>
      </ScoreboardDemoFrame>
      {time >= 4500 && (
        <p className="mt-2 text-xs text-muted-foreground">
          W46 · 预约完成率 48%，低于样例计划的 60%。团队核对差距后决定跟进。
        </p>
      )}
    </Scene>
  )
}

export function OutcomesRecoveryDemo({ time }: { time: number }) {
  if (time >= 5900) {
    return (
      <Scene title="指标配置会话">
        <div className="rounded-md border border-border p-3 text-xs">
          完整读取并使用「…/metrics-refresh/SKILL.md」中的 Skill，和我配置项目指标。
        </div>
        <p className="mt-2 text-xs text-muted-foreground">样例会话草稿。确认需求后由你发送。</p>
      </Scene>
    )
  }
  const refreshing = time >= 1750 && time < 3300
  return (
    <Scene title="项目总览">
      <ScoreboardDemoFrame refreshing={refreshing}>
        {time >= 3300 && (
          <details open={time >= 4420} className="outcomes-metric-problem text-xs">
            <summary>部分指标读取或采集失败 · 查看详情</summary>
            {time >= 4420 && (
              <p className="text-xs text-muted-foreground">预约完成率：采集脚本未返回可用结果</p>
            )}
          </details>
        )}
        <div className="wb-sb-body">
          <div className="wb-sb-duo">
            <DemoMeasure role="结果" name="预约完成率" values={[null, null, null, null, null]} />
          </div>
        </div>
      </ScoreboardDemoFrame>
    </Scene>
  )
}

export function OutcomesPlanDemo({ time }: { time: number }) {
  if (time < 1600) {
    return (
      <Scene title="版本" version="v0.3">
        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <strong>v0.3</strong>
          <Button size="xs" variant="outline" data-demo-action="next-plan">
            计划
          </Button>
        </div>
      </Scene>
    )
  }
  const editing = time >= 3500 && time < 6200
  const goal = '找出预约流失环节并验证改进'
  const draft = time >= 6200 ? goal : goal.slice(0, Math.max(0, Math.floor((time - 3820) / 73)))
  return (
    <Scene title="版本计划" version="v0.3">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <strong>本版目标</strong>
          <Button size="xs" variant="outline" aria-label={editing ? '结束编辑目标' : '编辑目标'}>
            {editing ? <Check size={14} /> : <Pencil size={14} />}
          </Button>
        </div>
        {editing ? (
          <input
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
            aria-label="目标"
            readOnly
            value={draft}
          />
        ) : (
          <p className="text-sm">{draft || '改善首场预约体验'}</p>
        )}
        {time >= 6200 && (
          <p className="mt-1 text-xs text-muted-foreground">
            样例草稿 · 用相同口径观察改动后的预约完成率。
          </p>
        )}
      </div>
    </Scene>
  )
}
