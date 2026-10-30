import { prState, archivePull } from './overview-data.js'
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies
const hour = 3600000
// Simulation only; production derives these points from explicit source records.
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

function sample(unregistered, maintaining) {
  const phases = [
    {
      id: 'plan',
      start: 0,
      end: 32,
      short: 'Plan',
      title: '周期起点 → 计划 PR 合入确认意图'
    },
    {
      id: 'design',
      start: 32,
      end: 56,
      short: 'Design',
      title: '设计评审：意图确认 → 设计 PR 合入定稿'
    },
    {
      id: 'build',
      start: 56,
      end: 80,
      short: 'Build',
      title: '设计定稿 → 开发 PR 合入交付；无可识别开发 PR 时以特性 Issue 关闭兜底'
    },
    {
      id: 'test',
      start: 80,
      end: unregistered ? duration : 104,
      short: 'Test',
      ongoing: unregistered,
      title: unregistered
        ? '首次交付未记录；这一段仅计至模拟观察时点，不代表测试已结束'
        : '验收前交付区间：开发交付 → 验收 PR 合入且目标人工达成；含测试、出包与等待'
    },
    ...(!unregistered
      ? [
          {
            id: 'maintain',
            start: 104,
            end: duration,
            short: 'Maintain',
            ongoing: maintaining,
            title:
              '关注、修理与完善：首次交付 → 后续明确关联版本验收 PR 合入且目标达成；包含中间等待'
          }
        ]
      : [])
  ]
  return {
    phases,
    releases: unregistered
      ? [
          {
            at: 104,
            version: 'v1.0',
            delivery: '本特性未交付',
            id: 'test',
            hint: '模拟：本版验收 PR 已合入，但目标未达成；没有后续补发登记，不生成特性交付节点。'
          }
        ]
      : [
          {
            at: 104,
            version: 'v1.0',
            delivery: '首次交付',
            id: 'test',
            hint: '模拟：正式计划关联本特性，目标达成，验收 PR 在此时合入；推导首次交付。'
          },
          ...(!maintaining
            ? [
                {
                  at: duration,
                  version: 'v1.1',
                  delivery: '维护交付',
                  id: 'maintain',
                  hint: '模拟：后续版本明确纳入同一特性且目标达成，验收 PR 在此时合入；形成 Maintain 交付，不代表整个特性结束。'
                }
              ]
            : [])
        ]
  }
}

function EvidenceSources({ feature, selected }) {
  const version = feature.historical ? 'v0.7' : 'v0.8'
  // Sources are view references, not a new shared evidence protocol.
  const sources =
    feature.sources ??
    [
      { phase: 'plan', label: '计划 PR', item: archivePull(version, 'plan') },
      { phase: 'design', label: '设计 PR', item: feature.designPR },
      { phase: 'build', label: '开发 PR', item: feature.developmentPR },
      { phase: 'test', label: '首次交付验收 PR', item: feature.firstDeliveryPR },
      { phase: 'maintain', label: '后续版本计划 PR', item: feature.maintenancePlanPR },
      { phase: 'maintain', label: '后续版本验收 PR', item: feature.maintenanceAcceptancePR }
    ].map(({ phase, label, item }) => ({
      phase,
      label: item ? `${label} #${item.number}` : `${label} · 未记录`,
      href: item?.url,
      state: item?.state ? prState(item) : null
    }))
  return (
    <div className="ov-artifact-links" aria-label="采集来源">
      <span className="muted">采集来源</span>
      {sources.map((source) => (
        <span
          className={`ov-artifact-chip ${source.phase === selected ? 'active' : ''}`}
          key={source.label}
        >
          {source.href ? (
            <a href={source.href} target="_blank" rel="noreferrer">
              <strong>{source.label}</strong>
              {source.state && <span>{source.state}</span>}
              <span>↗</span>
            </a>
          ) : (
            <span className="ov-source-unknown" title="尚未读取到对应来源，不补造链接">
              {source.label}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

export function FeatureTimeline({ feature }) {
  const [path, setPath] = useState('planned')
  const unregistered = path === 'unregistered'
  const maintaining = path === 'maintaining'
  const [selected, setSelected] = useState('design')
  const { phases, releases } = sample(unregistered, maintaining)
  const markers = [
    { id: 'plan', h: 0, label: '周期起点' },
    { id: 'plan', h: 32, label: '意图确认' },
    { id: 'design', h: 56, label: '设计定稿' },
    { id: 'build', h: 80, label: '开发交付' }
  ]
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>特性历程与版本交付</strong>
      </div>
      <p className="ov-demo-warning">
        原型注释:
        轴上时刻与版本均为模拟，下方来源行保留真实记录。未登记的临时出包无法自动感知；只有明确的版本计划、特性关联、目标达成和验收
        PR 合入，才生成交付节点。
      </p>
      <div className="ov-time-legend">
        <label>
          原型注释: 示例路径{' '}
          <select
            aria-label="模拟交付路径"
            value={path}
            onChange={(event) => {
              setPath(event.target.value)
              setSelected('design')
            }}
          >
            <option value="planned">按计划随版</option>
            <option value="maintaining">后续版本维护中</option>
            <option value="unregistered">错过目标版，补发未登记</option>
          </select>
        </label>
        <span>北京时间 UTC+08:00 · 日历历时</span>
      </div>
      <div className="ov-journey-scroll" tabIndex={0} aria-label="特性时间轴，可横向滚动">
        <div className="ov-journey-canvas">
          <div className="ov-journey-scale">
            {releases.map((item) => (
              <button
                key={item.version}
                className={`ov-project-release ${item.at === duration ? 'last' : ''}`}
                style={{ left: position(item.at) }}
                aria-pressed={selected === item.id}
                title={item.hint}
                onClick={() => setSelected(item.id)}
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
                onClick={() => setSelected(marker.id)}
              >
                <strong>{marker.label}</strong>
                <time>{stamp(at(marker.h))}</time>
              </button>
            ))}
            <div className="ov-range-track">
              {phases.map((item) => (
                <button
                  key={item.id}
                  className={`ov-phase-range ${item.ongoing ? 'ongoing' : ''}`}
                  style={{ left: position(item.start), width: position(item.end - item.start) }}
                  aria-label={`${item.title}，${stamp(at(item.start))} 至 ${stamp(at(item.end))}，${item.end - item.start} 小时`}
                  aria-pressed={selected === item.id}
                  title={`${item.title} · ${item.end - item.start} 小时（含等待）${item.ongoing ? ' · 进行中，统计至模拟观察时点' : ''}`}
                  onClick={() => setSelected(item.id)}
                >
                  <strong>{item.short}</strong>
                  <span>
                    {item.ongoing ? '已历时 ' : ''}
                    {item.end - item.start} 小时
                  </span>
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
                    .map((part) => (
                      <span key={part}>{part}</span>
                    ))}
                </time>
              ))}
            </div>
          </div>
        </div>
      </div>
      {unregistered && (
        <p className="muted" role="status">
          首次交付未记录；Test 进行中，统计至模拟观察时点 {stamp(at(duration))}
          。尚无可核对的补发版本关联与验收 PR。
        </p>
      )}
      {maintaining && (
        <p className="muted" role="status">
          v1.1 已明确纳入本特性，尚未完成验收。Maintain 从首次交付连续计时，统计至模拟观察时点{' '}
          {stamp(at(duration))}，包含中间等待。
        </p>
      )}
      <div className="ov-untracked-stage">
        <span
          tabIndex={0}
          title="未采集实际部署时间，无法计算 Deploy 历时。验收合入、首次交付或 Maintain 均不证明已部署。"
        >
          <strong>Deploy</strong> · 未跟踪
        </span>
        <span>暂无实际部署时间</span>
      </div>
      <EvidenceSources feature={feature} selected={selected} />
    </div>
  )
}
