import { prState } from './overview-data.js'
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies
const hour = 3600000
// This full journey is a labelled simulation, separate from the fixed BW records.
const origin = Date.parse('2026-10-26T09:00:00Z')
const duration = 57
const at = (hours) => origin + hours * hour
const stamp = (value) => new Date(value).toISOString().slice(5, 16).replace('T', ' ')
const phases = [
  {
    id: 'design',
    start: 0,
    end: 30,
    short: '设计与联合评审',
    title: 'Issue → intent / spec / 原型共同评审',
    state: '设计 PR 已合入',
    summary:
      '同一特性 Issue 提供意图，intent、spec 与原型一起提交评审；批注后修订，设计 PR 经人评审合入，作为本轮设计通过的节点。',
    events: [
      [0, '已有特性 Issue，开始设计工作'],
      [2, 'intent、spec 与原型一起进入评审'],
      [7, '第 2 轮批注，修订范围与交互'],
      [30, '联合评审通过，设计 PR 合入']
    ],
    evidence: ['同一特性 Issue', '设计 PR · intent / spec / 原型', '人工评审及合入时间']
  },
  {
    id: 'build',
    start: 30,
    end: 36,
    short: '开发',
    title: '详细设计、Plan 与开发',
    state: 'PR 已合入',
    summary: '详细设计和实施 Plan 在原生工作会话中收敛，随后开发并持续测试；Plan 未单独入库。',
    events: [
      [30, '会话中明确详细设计与 Plan'],
      [34, '提交实现 PR，测试已开始'],
      [36, '实现 PR 合入']
    ],
    evidence: ['原生会话 · 详细设计 / Plan', '实现 PR · 合入修订', '开发中的检查记录']
  },
  {
    id: 'verify',
    start: 36,
    end: 42,
    short: 'Pre 准备',
    title: '实现已合入 → 随版发布 Pre',
    state: '开发已合入 · 待发布 Pre',
    summary:
      '本轮实现 PR 合入标记开发结束；随后随项目版本交付。此段包含已记录的候选验证、出包与等待，不能整段自动算成测试耗时。',
    events: [
      [34, '实现期间开始测试'],
      [36, '合入后继续候选验证'],
      [42, '候选通过，随 v1.1 提供本特性 Pre']
    ],
    evidence: ['候选 p1 · 验证报告', '运行环境与截图', 'Pre 使用范围']
  },
  {
    id: 'trial',
    start: 42,
    end: 57,
    short: 'Pre 试用与完善',
    title: 'Pre 试用 → 反馈修理 → Release',
    state: 'Pre 已发布 · 试用完善',
    summary: 'Pre 向约定用户开放；反馈进入目标下的 Issue，修复与回归后随后续版本正式交付 Release。',
    events: [
      [42, 'v1.1 发布，本特性 Pre 开放给试用者'],
      [49, '试用反馈进入目标下 Issue，开始修复回归'],
      [55, '修复候选回归通过'],
      [57, 'v1.2 发布，本特性 Release 正式交付']
    ],
    evidence: [
      'Pre · 候选 p1 / 试用范围',
      '反馈 Issue / 修复 PR / 回归报告',
      'Release · 候选 r1 / 开放范围'
    ]
  }
]
const releases = [
  {
    at: 9,
    version: 'v1.0',
    delivery: '本特性未交付',
    detail: '项目按其他目标的交付情况正常发布；这个特性仍在设计评审，尚未提供 Pre。',
    evidence: '发布记录 · 未包含本特性；本特性继续按后续版本范围推进。'
  },
  {
    at: 42,
    version: 'v1.1',
    delivery: '本特性 Pre',
    detail: '项目版本已发布，本特性首次提供 Pre，只向约定试用人群开放。',
    evidence: '发布记录 · 候选 p1 · 需求关联与试用范围。'
  },
  {
    at: 57,
    version: 'v1.2',
    delivery: '本特性 Release',
    detail: '项目版本已发布，本特性完成这次正式交付；后续问题仍进入 Issue。',
    evidence: '发布记录 · 候选 r1 · 修复回归与正式开放范围。'
  }
]
const position = (value) => `${(value / duration) * 100}%`

function WorkflowLinks({ feature, openSession, phaseId }) {
  const pr = phaseId === 'design' ? feature.designPR : null
  return (
    <div className="ov-artifact-links" aria-label="PR 与工作会话">
      <span className="ov-artifact-chip">
        {pr ? (
          <a href={pr.url} target="_blank" rel="noreferrer">
            <strong>设计 PR #{pr.number}</strong>
            <span>{prState(pr)}</span>
            <span>↗</span>
          </a>
        ) : (
          <button disabled title="未记录对应阶段的 PR，不能用其他阶段的 PR 替代">
            <strong>PR</strong>
            <span>未记录</span>
          </button>
        )}
      </span>
      <span className="ov-artifact-chip">
        <button onClick={() => openSession(feature)}>
          <strong>工作会话</strong>
          <span>↗</span>
        </button>
      </span>
    </div>
  )
}

function SampleJourney({ feature, openSession }) {
  const [phaseId, setPhaseId] = useState('design')
  const [releaseIndex, setReleaseIndex] = useState(null)
  const phase = phases.find((p) => p.id === phaseId)
  const release = releaseIndex === null ? null : releases[releaseIndex]
  return (
    <>
      <div className="ov-time-legend">
        <span>项目版本发布</span>
        <span>时间：UTC · 精确到分钟</span>
      </div>
      <div className="ov-journey-scroll" tabIndex={0} aria-label="特性历程，可横向滚动查看小时刻度">
        <div className="ov-journey-canvas">
          <div className="ov-journey-scale">
            {releases.map((r, index) => (
              <button
                key={r.version}
                className={`ov-project-release ${index === releases.length - 1 ? 'last' : ''}`}
                style={{ left: position(r.at) }}
                aria-pressed={releaseIndex === index}
                onClick={() => setReleaseIndex(index)}
              >
                <strong>{r.version}</strong>
                <span>{r.delivery}</span>
                <time>{stamp(at(r.at))}</time>
              </button>
            ))}
            {[
              ['design', 30, '设计 PR 合入'],
              ['build', 36, '实现 PR 合入']
            ].map(([id, h, label]) => (
              <button
                key={id}
                className={`ov-merge-point ${id}`}
                style={{ left: position(h) }}
                title={`${label} · ${stamp(at(h))} UTC`}
                onClick={() => {
                  setPhaseId(id)
                  setReleaseIndex(null)
                }}
              >
                {label}
              </button>
            ))}
            <div className="ov-range-track">
              {phases.map((p) => (
                <button
                  key={p.id}
                  className="ov-phase-range"
                  style={{ left: position(p.start), width: position(p.end - p.start) }}
                  aria-label={`${p.title}，${stamp(at(p.start))} 至 ${stamp(at(p.end))}，${p.end - p.start} 小时`}
                  aria-pressed={releaseIndex === null && phaseId === p.id}
                  title={`${p.title} · ${stamp(at(p.start))} → ${stamp(at(p.end))}`}
                  onClick={() => {
                    setPhaseId(p.id)
                    setReleaseIndex(null)
                  }}
                >
                  <strong>{p.short}</strong>
                  <span>{p.end - p.start} 小时</span>
                </button>
              ))}
            </div>
            <div className="ov-hour-ticks">
              {[0, 12, 24, 36, 48, 57].map((h, index) => (
                <time
                  key={h}
                  className={index === 0 ? 'first' : index === 5 ? 'last' : ''}
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
            <div className="ov-test-periods" aria-label="与开发及试用并行的测试">
              {[
                [34, 42, '测试'],
                [49, 55, '回归']
              ].map(([start, end, label]) => (
                <span
                  key={start}
                  style={{ left: position(start), width: position(end - start) }}
                  title={`${label} · ${stamp(at(start))} → ${stamp(at(end))}`}
                >
                  {label}
                </span>
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
              : `${stamp(at(phase.start))} → ${stamp(at(phase.end))}`}
          </time>
        </div>
        <p className="ov-note">
          原型注释: 以下 PR 按 #{feature.id}{' '}
          的真实记录展示，与上方模拟历程分开。工作会话为原生入口衔接演示，具体会话尚未读取。
        </p>
        <WorkflowLinks
          feature={feature}
          openSession={openSession}
          phaseId={release ? 'release' : phaseId}
        />
        <details key={release ? release.version : phaseId} className="ov-process-disclosure">
          <summary>过程详情</summary>
          <div className="ov-journey-detail">
            <div className="ov-journey-detail-heading">
              <strong>{release ? `${release.version} · 项目已发布` : phase.title}</strong>
              <span className="ov-chip">
                {release
                  ? releaseIndex === 0
                    ? '本特性未随版交付'
                    : releaseIndex === 1
                      ? 'Pre 已发布'
                      : 'Release 已发布'
                  : phase.state}
              </span>
            </div>
            <time>
              {release
                ? stamp(at(release.at))
                : `${stamp(at(phase.start))} → ${stamp(at(phase.end))} · ${phase.end - phase.start} 小时`}{' '}
              · UTC
            </time>
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
        原型注释: 轴上版本、时刻及“过程详情”中的记录均为模拟；PR
        按真实记录链接，工作会话仅演示原生衔接；未记录的入口不补造。历时包含等待，测试可并行，不累计为人工工时。
      </p>
    </>
  )
}

export function FeatureTimeline({ feature, openSession }) {
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>特性历程与版本交付</strong>
      </div>
      <p className="ov-demo-warning">
        原型注释: 完整模拟历程。v1.0 未交付此特性，v1.1 提供 Pre，v1.2 提供
        Release。设计／开发各一次 PR 合入；这些时刻与版本不对应 BW 的真实安排。
      </p>
      <SampleJourney feature={feature} openSession={openSession} />
    </div>
  )
}
