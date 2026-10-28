// eslint-disable-next-line no-unused-vars
const { React, useState } = window.BWPrototypeDependencies

// One shared event set for both review options; relative days are entirely simulated.
const sampleEvents = [
  { at: 1, date: '第1天', items: [['意图规划', 'intent']] },
  { at: 2, date: '第2天', items: [['设计', '原型']] },
  {
    at: 4,
    date: '第4天',
    items: [
      ['设计', 'spec'],
      ['开发', '实施 Plan']
    ]
  },
  { at: 9, date: '第9天', items: [['开发', 'PR 合入']] },
  {
    at: 11,
    date: '第11天',
    items: [
      ['测试', '候选通过'],
      ['上线', 'Pre']
    ]
  },
  { at: 12, date: '第12天', items: [['反馈维护', '反馈 Issue']] },
  { at: 16, date: '第16天', items: [['测试', '回归通过']] },
  { at: 17, date: '第17天', items: [['上线', 'Release']] }
]

function EventContent({ event, open }) {
  return (
    <>
      <time>{event.date}</time>
      {event.items.map(([phase, label, id]) => (
        <div className="ov-event-artifact" key={label}>
          <small>{phase}</small>
          {id ? <button onClick={() => open(id)}>{label} ↗</button> : <strong>{label}</strong>}
        </div>
      ))}
    </>
  )
}

function EventAxis({ events, vertical, open }) {
  if (!events.length) {
    return <p className="ov-event-empty">尚无可核对的成果日期。</p>
  }
  if (events.length === 1) {
    return (
      <div className="ov-single-event">
        <span className="ov-node-dot" aria-hidden="true" />
        <EventContent event={events[0]} open={open} />
        <p>仅记录到一个时间点，尚不能比较节点间隔。</p>
      </div>
    )
  }
  const start = events[0].at
  const duration = events.at(-1).at - start
  const position = (at) => `${((at - start) / duration) * 100}%`
  const coordinate = vertical ? 'top' : 'left'
  return (
    <div className={`ov-event-scroll ${vertical ? 'vertical' : 'horizontal'}`}>
      <div className="ov-event-canvas" style={vertical ? { height: duration * 44 + 130 } : {}}>
        <div className="ov-event-rail">
          {events.slice(1).map((event, index) => {
            const previous = events[index]
            const gap = event.at - previous.at
            return (
              <span
                className="ov-event-gap"
                key={event.at}
                style={{ [coordinate]: position((event.at + previous.at) / 2) }}
              >
                {gap} 天
              </span>
            )
          })}
          {events.map((event, index) => (
            <div
              className={`ov-event-node ${index % 2 ? 'after' : 'before'}`}
              key={event.at}
              style={{ [coordinate]: position(event.at) }}
            >
              <span className="ov-node-dot" aria-hidden="true" />
              <span className="ov-node-connector" aria-hidden="true" />
              <div className="ov-event-card">
                <EventContent event={event} open={open} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FeatureTimeline({ feature, openArtifact }) {
  const [demo, setDemo] = useState(false)
  const [layout, setLayout] = useState('horizontal')
  const draft = feature.draftEvidence
  const artifact = (id) => feature.artifacts.find((row) => row[4] === id)
  const open = (id) => openArtifact(feature, artifact(id))
  const actual = draft
    ? [
        {
          at: Date.parse(draft.at) / 86400000,
          date: `${draft.at.slice(0, 10)} · 初稿提交`,
          items: [
            ['意图规划', 'intent 初稿', 'intent'],
            ['设计', '原型初稿', 'prototype'],
            ['设计', 'spec 初稿', 'spec']
          ]
        }
      ]
    : []
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>成果时间轴</strong>
        <button className="ov-link" onClick={() => setDemo(!demo)} aria-pressed={demo}>
          原型注释: {demo ? '返回实际材料' : '查看完整历程示例'}
        </button>
      </div>
      <div className="ov-timeline-variants" role="group" aria-label="原型注释: 时间轴方案对比">
        <span>原型注释: 方案对比</span>
        <button aria-pressed={layout === 'horizontal'} onClick={() => setLayout('horizontal')}>
          A · 横向单轴
        </button>
        <button aria-pressed={layout === 'vertical'} onClick={() => setLayout('vertical')}>
          B · 纵向单轴
        </button>
      </div>
      {demo && (
        <p className="ov-demo-warning">
          原型注释:
          以下日期和间隔均为模拟。两种方案使用相同事件，供内部评审，不代表本需求的真实进度或排期。
        </p>
      )}
      <EventAxis
        events={demo ? sampleEvents : actual}
        vertical={layout === 'vertical'}
        open={open}
      />
      {demo && (
        <p className="ov-event-reading">
          节点间距离与时间成正比；同一天的成果合并展示。间隔包含等待及并行工作，不等于阶段工时。 Pre
          即 MVP 试用交付，Release 为正式交付。
        </p>
      )}
      {!demo && (
        <p className="ov-note">
          原型注释:{' '}
          {draft
            ? '日期取本 PR 的初稿提交，尚无实现合入、生产候选验证、Pre / Release 的需求交付日期。初稿存在不代表已获人工认可。'
            : '当时的成果日期未归档，不用本轮设计稿或版本级发布补写需求历史。'}
        </p>
      )}
      <div className="ov-timeline-evidence" aria-label="其他成果与依据">
        {[
          ['plan', '实施 Plan'],
          ['pr', 'PR'],
          ['test', '设计 CI'],
          ['release', '发布依据'],
          ['issues', '关联 Issue'],
          ['commitment', '当时计划'],
          ['acceptance', '本版目标验收']
        ].map(
          ([id, label]) =>
            artifact(id) && (
              <button key={id} onClick={() => open(id)}>
                {label} ↗
              </button>
            )
        )}
      </div>
    </div>
  )
}
