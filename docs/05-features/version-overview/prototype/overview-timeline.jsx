// Local chart samples are separate from the fixed BW facts and never update the plan.
// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies
const day = 86400000
const demoRows = [
  { name: '意图规划', spans: [[0, 1]], events: [{ at: 1, label: 'intent', date: '第2天' }] },
  {
    name: '设计',
    spans: [[1, 5]],
    events: [
      { at: 3, label: '原型', date: '第4天' },
      { at: 5, label: 'spec', date: '第6天' }
    ]
  },
  {
    name: '开发',
    spans: [[4, 6]],
    events: [
      { at: 4, label: '实施 Plan', date: '第5天' },
      { at: 6, label: 'PR 合入', date: '第7天' }
    ]
  },
  {
    name: '测试',
    spans: [
      [5, 7],
      [11, 13]
    ],
    events: [
      { at: 7, label: '候选通过', date: '第8天' },
      { at: 13, label: '回归通过', date: '第14天' }
    ]
  },
  {
    name: '上线',
    spans: [[7, 13]],
    events: [
      { at: 7, label: 'Pre', date: '第8天' },
      { at: 13, label: 'Release', date: '第14天' }
    ]
  },
  {
    name: '反馈维护',
    spans: [[7, 15]],
    ongoing: true,
    events: [{ at: 9, label: '反馈 Issue', date: '第10天' }]
  }
]
export function FeatureTimeline({ feature, openArtifact }) {
  const [demo, setDemo] = useState(false)
  const draft = feature.draftEvidence
  const rows = feature.artifacts
  const row = (id) => rows.find((r) => r[4] === id)
  const recorded = draft ? (Date.parse(draft.at) - Date.parse('2026-10-27T00:00:00Z')) / day : null
  const actualRows = [
    {
      name: '意图规划',
      events: draft ? [{ at: recorded, label: 'intent 初稿', date: '10/27', ids: ['intent'] }] : [],
      pending: '日期未归档'
    },
    {
      name: '设计',
      events: draft
        ? [{ at: recorded, label: '原型 / spec 初稿', date: '10/27', ids: ['prototype', 'spec'] }]
        : [],
      pending: '日期未归档'
    },
    {
      name: '开发',
      events: [],
      pending: '未记录实现 PR 合入',
      links: [
        ['plan', '实施 Plan'],
        ['pr', 'PR']
      ]
    },
    { name: '测试', events: [], pending: '未记录生产候选验证', links: [['test', '设计 CI']] },
    {
      name: '上线',
      events: [],
      pending: 'Pre / Release 尚无需求交付依据',
      links: [['release', '发布依据']]
    },
    {
      name: '反馈维护',
      events: [],
      pending: '处理起止时间未记录',
      links: [['issues', '关联 Issue']]
    }
  ]
  const chart = demo ? demoRows : actualRows
  const scale = demo ? 16 : 2
  const ticks = demo
    ? [
        [0, '第1天'],
        [4, '第5天'],
        [8, '第9天'],
        [12, '第13天'],
        [16, '第17天']
      ]
    : draft
      ? [
          [0, '10/27'],
          [1, '10/28'],
          [2, '10/29']
        ]
      : [[1, '日期未归档']]
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>成果时间轴</strong>
        <button className="ov-link" onClick={() => setDemo(!demo)} aria-pressed={demo}>
          原型注释: {demo ? '返回实际材料' : '查看完整历程示例'}
        </button>
      </div>
      {demo && (
        <p className="ov-demo-warning">
          原型注释: 以下日期与历时全部为模拟示例，用于审阅时间轴；不代表此需求的真实进度或排期。
        </p>
      )}
      <div className="ov-time-axis">
        <span>{demo ? '阶段 · 示例' : '阶段'}</span>
        <div>
          {ticks.map(([at, label]) => (
            <span key={at} style={{ left: `${(at / scale) * 100}%` }}>
              {label}
            </span>
          ))}
        </div>
        <span>{demo ? '模拟历时' : '已记录历时'}</span>
      </div>
      {chart.map((r) => (
        <div className="ov-time-row" key={r.name}>
          <strong>{r.name}</strong>
          <div className="ov-time-track">
            {(r.spans || []).map(([start, end]) => (
              <span
                key={start}
                className={`ov-time-span${r.ongoing ? ' ongoing' : ''}`}
                style={{
                  left: `${(start / scale) * 100}%`,
                  width: `${((end - start) / scale) * 100}%`
                }}
              />
            ))}
            {r.events.map((e) => (
              <div
                className="ov-time-event"
                key={e.label}
                style={{ left: `${(e.at / scale) * 100}%` }}
              >
                <span className="ov-time-dot" aria-hidden="true" />
                <span className="ov-time-date">{e.date}</span>
                {demo ? (
                  <span>{e.label}</span>
                ) : (
                  <span className="ov-event-links">
                    {e.ids.map((id) => (
                      <button key={id} onClick={() => openArtifact(feature, row(id))}>
                        {id === 'prototype' ? '原型初稿' : `${id} 初稿`} ↗
                      </button>
                    ))}
                  </span>
                )}
              </div>
            ))}
            {!r.events.length && (
              <div className="ov-time-pending">
                <span>{r.pending}</span>
                {(r.links || []).map(
                  ([id, label]) =>
                    row(id) && (
                      <button key={id} onClick={() => openArtifact(feature, row(id))}>
                        {label} ↗
                      </button>
                    )
                )}
              </div>
            )}
          </div>
          <span className="ov-time-duration">
            {demo ? `${r.spans.reduce((sum, [start, end]) => sum + end - start, 0)} 天` : '—'}
            {demo && r.ongoing && <small>进行中</small>}
          </span>
        </div>
      ))}
      <div className="ov-timeline-evidence">
        {row('commitment') && (
          <button onClick={() => openArtifact(feature, row('commitment'))}>当时计划 ↗</button>
        )}
        {row('acceptance') && (
          <button onClick={() => openArtifact(feature, row('acceptance'))}>本版目标验收 ↗</button>
        )}
      </div>
      <p className="ov-note">
        原型注释: Pre 即 MVP 试用交付，Release 为正式交付。测试可在开发中开始，Pre
        后继续试用、修复与回归。历时按有依据的阶段活动区间统计，含等待、可重叠，不等于纯工时；未知不填零。
      </p>
      <p className="ov-note">
        原型注释:{' '}
        {demo
          ? '示例测试包含两轮，各 2 天；上线区间含 Pre 至 Release 的试用与完善，反馈维护可并行延续。'
          : draft
            ? '目前只有初稿提交日期，阶段起止未记录，尚不能比较真实耗时；初稿提交不等于人工认可，设计 CI 不等于生产测试完成。'
            : '当时阶段事件与起止时间未归档，日期范围与历时未知；不能用当前设计初稿或版本级发布补写此需求的历史。'}
      </p>
    </div>
  )
}
