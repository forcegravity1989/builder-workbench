import { prState, repository, snapshot } from './overview-data.js'
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies
const hour = 3600000
// The sample cycle is explicit; these timestamps are not BW delivery records.
const origin = Date.parse('2026-10-26T09:00:00+08:00')
const duration = 272
const at = (hours) => origin + hours * hour
const stamp = (value) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(value)
const position = (value) => `${(value / duration) * 100}%`

function sample(delayed) {
  const preAt = delayed ? 176 : 104
  const preVersion = delayed ? 'v1.0.1' : 'v1.0'
  return {
    phases: [
      {
        id: 'intent',
        start: 0,
        end: 32,
        short: '意图收敛',
        title: '周期起点 → 意图确认',
        state: '计划 PR 已合入',
        summary:
          '周一09:00作为约定的周期基线；包含本特性的版本计划 PR 合入，表示本次意图确认。延期交付不重置起点。',
        events: [
          [0, '周一09:00，固定周期起点'],
          [32, '包含本特性的版本计划 PR 合入']
        ],
        evidence: ['首次计划 PR 合入所在周', '计划中的特性／执行 Issue 关联', '计划 PR 合入时间']
      },
      {
        id: 'design',
        start: 32,
        end: 56,
        short: '设计评审',
        title: '意图确认 → 设计定稿',
        state: '设计 PR 已合入',
        summary:
          'intent、spec 与原型共同评审，批注后修订；明确的设计 PR 合入，标记对应设计范围定稿。',
        events: [
          [32, '开始准备 intent、spec 与原型'],
          [44, '联合评审批注与修订'],
          [56, '设计 PR 合入']
        ],
        evidence: ['同一特性 Issue', '设计 PR · intent／spec／原型', '设计 PR 合入时间']
      },
      {
        id: 'build',
        start: 56,
        end: 80,
        short: '开发',
        title: '设计定稿 → 开发交付',
        state: '开发 PR 已合入',
        summary:
          '详细设计、Plan 和开发在原生工作会话中推进。优先以明确的开发 PR 合入计交付；没有可识别开发 PR 时才用特性 Issue 关闭时间，并标出来源。',
        events: [
          [56, '明确实施 Plan，开始开发和自测'],
          [74, '提交开发 PR'],
          [80, '开发 PR 合入']
        ],
        evidence: [
          '开发 PR 与本版范围',
          '开发 PR 合入时间；缺失时读 Issue 关闭时间',
          'Plan 通常不单独入库'
        ]
      },
      {
        id: 'verify',
        start: 80,
        end: preAt,
        short: '测试准备',
        title: '开发交付 → 测试与随版准备',
        state: `${preVersion} 提供 Pre`,
        summary: delayed
          ? '原定 v1.0 已发布，但所属目标未达成，本特性没有随版交付。临时版 v1.0.1 关联本特性且目标验收达成，承接首次 Pre；这一段包含验证、修复、出包和等待。'
          : 'v1.0 的正式计划关联本特性，所属目标人工验收达成，按约定推导首次 Pre 交付。这段包含候选验证、修复、出包和等待，不等于纯测试耗时。',
        events: delayed
          ? [
              [80, '合入后继续验证与随版准备'],
              [104, 'v1.0 发布，所属目标未达成'],
              [176, 'v1.0.1 临时版目标达成，推导 Pre']
            ]
          : [
              [80, '合入后继续验证与随版准备'],
              [104, 'v1.0 目标人工验收达成，推导 Pre']
            ],
        evidence: ['实际版本计划关联', '目标人工验收结论与确认时间', '未达成不算；缺结论保持未知']
      },
      {
        id: 'trial',
        start: preAt,
        end: duration,
        short: '试用完善',
        title: 'Pre → 试用完善 → Release',
        state: 'v1.1 提供 Release',
        summary:
          '试用反馈进入目标下的 Issue。v1.1 再次关联本特性并验收达成，按约定推导第二次交付 Release；每周一版、两版完成只是规划默认，不自动把下一次项目发版认作特性交付。',
        events: [
          [preAt, `${preVersion} 提供 Pre`],
          [224, '反馈 Issue 修复与回归'],
          [duration, 'v1.1 目标达成，推导 Release']
        ],
        evidence: ['后续版本关联同一特性', '目标人工验收结论与确认时间', '同目标多特性暂沿整体结论']
      }
    ],
    releases: [
      ...(delayed
        ? [
            {
              at: 104,
              version: 'v1.0',
              delivery: '本特性未交付',
              state: '目标未达成',
              detail:
                '项目版本正常发布，但本特性所属目标人工验收未达成；不计入本特性的 Pre／Release。',
              evidence: '模拟 v1.0 计划关联＋目标未达成。'
            }
          ]
        : []),
      {
        at: preAt,
        version: preVersion,
        delivery: 'Pre',
        state: '首次交付',
        detail: `${preVersion} 的正式计划包含本特性，所属目标人工验收达成，按当前约定推导第一次随版交付 Pre。节点时间使用验收确认时间，不是独立核实的包发布时间。`,
        evidence: '模拟计划关联＋目标达成＋人工验收确认时间。'
      },
      {
        at: duration,
        version: 'v1.1',
        delivery: 'Release',
        state: '第二次交付',
        detail:
          'v1.1 再次关联同一特性且所属目标验收达成，按当前约定推导 Release。若没有关联、未达成或缺结论，则不能只凭“下一周发版”补出此节点。',
        evidence: '模拟后续计划关联＋目标达成＋人工验收确认时间。'
      }
    ]
  }
}

function WorkflowLinks({ feature, openSession, native, phaseId }) {
  const plan = feature.historical ? snapshot.priorPlan : snapshot.plan
  const archive = plan.workflow?.archivePr
  const pr =
    phaseId === 'intent'
      ? archive && { number: archive.number, url: `${repository}/pull/${archive.number}` }
      : phaseId === 'design'
        ? feature.designPR
        : phaseId === 'build'
          ? feature.developmentPR
          : null
  const label = phaseId === 'intent' ? '计划 PR' : phaseId === 'design' ? '设计 PR' : '开发 PR'
  return (
    <div className="ov-artifact-links" aria-label="PR 与工作会话">
      <span className="ov-artifact-chip">
        {pr ? (
          <a href={pr.url} target="_blank" rel="noreferrer">
            <strong>
              {label} #{pr.number}
            </strong>
            <span>{pr.state ? prState(pr) : '查看'}</span>
            <span>↗</span>
          </a>
        ) : (
          <button disabled title="未记录对应阶段的 PR，不能用其他阶段替代">
            <strong>PR</strong>
            <span>未记录</span>
          </button>
        )}
      </span>
      <span className="ov-artifact-chip">
        <button onClick={() => (phaseId === 'intent' ? native('版本计划') : openSession(feature))}>
          <strong>{phaseId === 'intent' ? '计划工作会话' : '工作会话'}</strong>
          <span>↗</span>
        </button>
      </span>
    </div>
  )
}

export function FeatureTimeline({ feature, openSession, native }) {
  const [delayed, setDelayed] = useState(false)
  const [phaseId, setPhaseId] = useState('design')
  const [releaseIndex, setReleaseIndex] = useState(null)
  const { phases, releases } = sample(delayed)
  const phase = phases.find((item) => item.id === phaseId)
  const release = releaseIndex === null ? null : releases[releaseIndex]
  const markers = [
    { id: 'intent', h: 0, label: '周期起点' },
    { id: 'intent', h: 32, label: '意图确认' },
    { id: 'design', h: 56, label: '设计定稿' },
    { id: 'build', h: 80, label: '开发交付' }
  ]
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>特性历程与版本交付</strong>
      </div>
      <p className="ov-demo-warning">
        原型注释: 以下为完整模拟历程，时刻与示例版本不对应 BW 的真实承诺；下方 PR
        链接与工作会话入口单独保留真实来源。
      </p>
      <div className="ov-time-legend">
        <label>
          原型注释: 示例路径{' '}
          <select
            aria-label="模拟交付路径"
            value={delayed ? 'delayed' : 'planned'}
            onChange={(event) => {
              setDelayed(event.target.value === 'delayed')
              setReleaseIndex(null)
            }}
          >
            <option value="planned">按计划随版</option>
            <option value="delayed">错过目标版，临时版交付 Pre</option>
          </select>
        </label>
        <span>北京时间 UTC+08:00 · 日历历时</span>
      </div>
      <div className="ov-journey-scroll" tabIndex={0} aria-label="六个节点与五段历时，可横向滚动">
        <div className="ov-journey-canvas">
          <div className="ov-journey-scale">
            {releases.map((item, index) => (
              <button
                key={item.version}
                className={`ov-project-release ${index === releases.length - 1 ? 'last' : ''}`}
                style={{ left: position(item.at) }}
                aria-pressed={releaseIndex === index}
                title={`${item.version} · ${item.delivery} · ${stamp(at(item.at))}；按目标验收推导`}
                onClick={() => setReleaseIndex(index)}
              >
                <strong>
                  {item.version} · {item.delivery}
                </strong>
                <time>{stamp(at(item.at))}</time>
              </button>
            ))}
            {markers.map((marker, index) => (
              <button
                key={marker.label}
                className={`ov-merge-point ${index === 0 ? 'first' : ''} ${index % 2 ? 'lower' : ''}`}
                style={{ left: position(marker.h) }}
                title={`${marker.label} · ${stamp(at(marker.h))}`}
                onClick={() => {
                  setPhaseId(marker.id)
                  setReleaseIndex(null)
                }}
              >
                <strong>{marker.label}</strong>
                <time>{stamp(at(marker.h))}</time>
              </button>
            ))}
            <div className="ov-range-track">
              {phases.map((item) => (
                <button
                  key={item.id}
                  className="ov-phase-range"
                  style={{ left: position(item.start), width: position(item.end - item.start) }}
                  aria-label={`${item.title}，${stamp(at(item.start))} 至 ${stamp(at(item.end))}，${item.end - item.start} 小时`}
                  aria-pressed={releaseIndex === null && phaseId === item.id}
                  title={`${item.title} · ${item.end - item.start} 小时（含等待）`}
                  onClick={() => {
                    setPhaseId(item.id)
                    setReleaseIndex(null)
                  }}
                >
                  <strong>{item.short}</strong>
                  <span>{item.end - item.start} 小时</span>
                </button>
              ))}
            </div>
            <div className="ov-hour-ticks">
              {[0, 48, 96, 144, 192, 240, duration].map((h, index) => (
                <time
                  key={h}
                  className={index === 0 ? 'first' : index === 6 ? 'last' : ''}
                  style={{ left: position(h) }}
                >
                  {stamp(at(h))
                    .split(' ')
                    .map((part, i) => (
                      <span key={i}>{part}</span>
                    ))}
                </time>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="ov-journey-selection" aria-live="polite">
        <div className="ov-selection-heading">
          <strong>{release ? `${release.version} · ${release.delivery}` : phase.title}</strong>
          <time>
            {release
              ? stamp(at(release.at))
              : `${stamp(at(phase.start))} → ${stamp(at(phase.end))} · ${phase.end - phase.start} 小时`}
          </time>
        </div>
        <p className="ov-note">
          原型注释: 过程详情默认收起。PR 按真实记录打开，和上方模拟时序分开；工作会话仍沿 Orca
          原生入口。
        </p>
        <WorkflowLinks
          feature={feature}
          openSession={openSession}
          native={native}
          phaseId={release ? 'release' : phaseId}
        />
        <details
          key={`${delayed}:${release ? release.version : phaseId}`}
          className="ov-process-disclosure"
        >
          <summary>过程详情</summary>
          <div className="ov-journey-detail">
            <div className="ov-journey-detail-heading">
              <strong>{release ? `${release.version} · ${release.delivery}` : phase.title}</strong>
              <span className="ov-chip">{release ? release.state : phase.state}</span>
            </div>
            <p>{release ? release.detail : phase.summary}</p>
            {!release && (
              <ol className="ov-process-events">
                {phase.events.map(([h, label]) => (
                  <li key={h}>
                    <time>{stamp(at(h))}</time>
                    <span>{label}</span>
                  </li>
                ))}
              </ol>
            )}
            <div className="ov-sample-evidence">
              <span>依据</span>
              {(release ? [release.evidence] : phase.evidence).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
        </details>
      </div>
      <p className="ov-note">
        原型注释: 周一09:00是周期基线，不是实际开工；意图确认取计划 PR
        合入，不取纪要确认。Pre／Release
        按计划关联与目标人工达成推导，同目标多个特性暂沿整体结论。所有时段含等待，不等于人工工时或独立测试耗时。
      </p>
    </div>
  )
}
