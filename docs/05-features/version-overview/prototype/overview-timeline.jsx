import { prState, archivePull } from './overview-data.js'
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies
const hour = 3600000
const origin = Date.parse('2026-10-26T01:00:00Z')
const observedAt = Date.parse('2026-10-30T13:17:57Z')
const stamp = (value) =>
  new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(value)
const elapsedLabel = (hours) => {
  const minutes = Math.floor(hours * 60)
  return `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分` : ''}`
}
const stageNames = ['Plan', 'Design', 'Build', 'Test', 'Deploy', 'Maintain']
const defaultHours = [24, 48, 12, 24, 12, 24]
const defaultLabels = ['1天', '2天', '半天', '1天', '半天', '1天']
const sourceNames = [
  '计划 PR',
  '设计 PR',
  '开发 PR',
  '首次交付验收 PR',
  '部署时间',
  '后续版本验收 PR'
]

// Local review examples only. Default future widths do not create planned or actual timestamps.
function model(feature, path) {
  const recorded = path === 'recorded'
  const planPR = archivePull(feature.historical ? 'v0.7' : 'v0.8', 'plan')
  const sources = [
    planPR,
    feature.designPR,
    feature.developmentPR,
    feature.firstDeliveryPR,
    null,
    feature.maintenanceAcceptancePR
  ]
  const active = recorded
    ? feature.id === '334'
      ? 2
      : 1
    : { test: 3, maintain: 5, complete: 6 }[path]
  const planEnd = recorded ? Date.parse(planPR.mergedAt) : origin + 32 * hour
  const designEnd =
    recorded && feature.designPR?.mergedAt
      ? Date.parse(feature.designPR.mergedAt)
      : planEnd + 24 * hour
  const actual = recorded
    ? [(planEnd - origin) / hour, (designEnd - planEnd) / hour, (observedAt - designEnd) / hour]
    : [32, 24, 24, 24, 0, path === 'complete' ? 168 : 72]
  if (recorded && active === 1) {
    actual[1] = (observedAt - planEnd) / hour
  }
  let offset = 0
  let time = origin
  const phases = stageNames.map((name, index) => {
    const state =
      index === 4 ? 'untracked' : index < active ? 'done' : index === active ? 'current' : 'future'
    const placeholder = state === 'future' || state === 'untracked'
    const hours = placeholder ? defaultHours[index] : actual[index]
    const source = sources[index]
    const hint =
      index === 4
        ? '部署时间 · 未跟踪'
        : recorded
          ? source
            ? `${sourceNames[index]} #${source.number} · ${prState(source)}`
            : `${sourceNames[index]} · 未记录`
          : `原型注释: ${sourceNames[index]} · ${state === 'done' ? '已合入（模拟）' : state === 'current' ? '未合入（模拟）' : '未记录'}`
    const phase = {
      name,
      state,
      placeholder,
      start: offset,
      hours,
      startAt: time,
      endAt: placeholder ? null : time + hours * hour,
      label: placeholder
        ? `默认${defaultLabels[index]}`
        : `${state === 'current' ? '已 ' : ''}${elapsedLabel(hours)}`,
      hint,
      href: recorded ? source?.url : null
    }
    offset += hours
    if (!placeholder) {
      time += hours * hour
    }
    return phase
  })
  return { phases, total: offset, recorded }
}

export function FeatureTimeline({ feature }) {
  const [path, setPath] = useState(feature.historical ? 'complete' : 'recorded')
  const { phases, total, recorded } = model(feature, path)
  const position = (h) => `${(h / total) * 100}%`
  const test = phases[3]
  const maintain = phases[5]
  const releaseAt = test.start + test.hours
  const releases = [
    {
      at: releaseAt,
      version: recorded ? 'v0.8' : 'v1.0',
      title: '首次交付',
      time: test.state === 'done' ? test.endAt : null,
      source: test
    },
    ...(maintain.state === 'done'
      ? [
          {
            at: total,
            version: 'v1.1',
            title: '维护交付',
            time: maintain.endAt,
            source: maintain
          }
        ]
      : [])
  ]
  const markers = [
    { h: 0, label: '周期起点', time: origin },
    ...phases.slice(0, 3).flatMap((phase, index) =>
      phase.state === 'done'
        ? [
            {
              h: phase.start + phase.hours,
              label: ['意图确认', '设计定稿', '开发交付'][index],
              time: phase.endAt
            }
          ]
        : []
    ),
    ...phases
      .filter((phase) => phase.state === 'current')
      .map((phase) => ({
        h: phase.start + phase.hours,
        label: `当前 · ${phase.name}`,
        time: phase.endAt,
        current: true
      }))
  ]
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>特性历程与版本交付</strong>
      </div>
      <div className="ov-time-legend">
        <label>
          原型注释: 演示场景{' '}
          <select
            aria-label="时间轴演示场景"
            value={path}
            onChange={(event) => setPath(event.target.value)}
          >
            {!feature.historical && (
              <option value="recorded">
                PR 快照 · {feature.id === '334' ? 'Build' : 'Design'} 进行中
              </option>
            )}
            <option value="test">模拟 · Test 进行中</option>
            <option value="maintain">模拟 · Maintain 进行中</option>
            <option value="complete">模拟 · 维护交付后</option>
          </select>
        </label>
        <span>北京时间 · 日历历时</span>
      </div>
      <p className="ov-note">
        原型注释: {recorded ? '前段采用 PR 快照，截至 10-30 21:17。' : '本场景时序与交付为模拟。'}
        虚线使用默认长度，不是正式排期；Deploy 未跟踪，Maintain 暂用 1 天占位。
      </p>
      <div className="ov-journey-scroll" tabIndex={0} aria-label="特性时间轴，可横向滚动">
        <div className="ov-journey-canvas" style={{ minWidth: Math.max(600, total * 3.4) }}>
          <div className="ov-journey-scale">
            {releases.map((release) => {
              const Target = release.source.href ? 'a' : 'button'
              return (
                <Target
                  key={release.version}
                  className={`ov-project-release ${release.at === total ? 'last' : ''} ${!release.time ? 'future' : ''}`}
                  style={{ left: position(release.at) }}
                  title={release.source.hint}
                  {...(release.source.href
                    ? { href: release.source.href, target: '_blank', rel: 'noreferrer' }
                    : { type: 'button' })}
                >
                  <strong>
                    {release.version} · {release.title}
                  </strong>
                  <time>{release.time ? stamp(release.time) : '验收 PR 未记录'}</time>
                </Target>
              )
            })}
            {markers.map((marker, index) => (
              <div
                key={marker.label}
                className={`ov-merge-point ${index === 0 ? 'first' : ''} ${index % 2 ? 'lower' : ''} ${marker.current ? 'current' : ''}`}
                style={{ left: position(marker.h) }}
              >
                <strong>{marker.label}</strong>
                <time>{stamp(marker.time)}</time>
              </div>
            ))}
            <div className="ov-range-track">
              {phases.map((phase, index) => {
                const Target = phase.href ? 'a' : 'button'
                return (
                  <div
                    className={`ov-phase-cell ${index === 5 ? 'last' : ''}`}
                    key={phase.name}
                    style={{ left: position(phase.start), width: position(phase.hours) }}
                  >
                    <Target
                      className={`ov-phase-range ${phase.state}`}
                      aria-label={`${phase.name}，${phase.label}，${phase.hint}`}
                      aria-describedby={`timeline-${feature.id}-${phase.name}`}
                      {...(phase.href
                        ? { href: phase.href, target: '_blank', rel: 'noreferrer' }
                        : { type: 'button' })}
                    >
                      <strong>{phase.name}</strong>
                      <span>{phase.label}</span>
                    </Target>
                    <span
                      className="ov-phase-tip"
                      role="tooltip"
                      id={`timeline-${feature.id}-${phase.name}`}
                    >
                      {phase.hint}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="ov-timeline-captions">
              <span>{recorded ? '已记录历程' : '原型注释: 模拟历程'}</span>
              <span>原型注释: 虚线为默认长度</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
