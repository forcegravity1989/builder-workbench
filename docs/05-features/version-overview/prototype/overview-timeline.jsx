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
    short: '意图 → 设计评审',
    title: '初始意图 → 原型 / spec 联合评审定稿',
    state: '已定稿',
    summary: '3 轮原型与规格共同评审，记录修改、等待和最终认可。',
    events: [
      [0, '初始 intent 提交'],
      [2, '原型与 spec r1 一起进入评审'],
      [7, '第 2 轮批注，修订范围与交互'],
      [30, '原型与 spec r3 共同定稿']
    ],
    evidence: ['intent r1', '原型 r3 + spec r3', '3 轮批注与认可']
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
    short: '验证',
    title: '集成验证与 Pre 准备',
    state: '候选通过',
    summary: '开发中的测试继续进行，针对准备发布的候选完成集成验证。',
    events: [
      [34, '实现期间开始测试'],
      [36, '合入后继续候选验证'],
      [42, '候选通过，随 v1.1 提供本需求 Pre']
    ],
    evidence: ['候选 p1 · 验证报告', '运行环境与截图', 'Pre 使用范围']
  },
  {
    id: 'trial',
    start: 42,
    end: 57,
    short: 'Pre 试用与完善',
    title: 'Pre 试用 → 反馈修理 → Release',
    state: '正式交付',
    summary: 'Pre 即 MVP，先向部分用户开放；反馈进入目标下的 Issue，修复与回归后随下一版正式交付。',
    events: [
      [42, 'v1.1 发布，本需求 Pre 开放给试用者'],
      [49, '试用反馈进入目标下 Issue，开始修复回归'],
      [55, '修复候选回归通过'],
      [57, 'v1.2 发布，本需求 Release 正式交付']
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
    delivery: '本需求未交付',
    detail: '项目按其他目标的交付情况正常发布；这个大需求仍在设计评审，尚未提供 Pre。',
    evidence: '发布记录 · 未包含本需求；本需求继续按后续版本范围推进。'
  },
  {
    at: 42,
    version: 'v1.1',
    delivery: '本需求 Pre',
    detail: '项目版本已发布，本需求首次提供 Pre（MVP），只向约定试用人群开放。',
    evidence: '发布记录 · 候选 p1 · 需求关联与试用范围。'
  },
  {
    at: 57,
    version: 'v1.2',
    delivery: '本需求 Release',
    detail: '项目版本已发布，本需求完成这次正式交付；后续问题仍进入 Issue。',
    evidence: '发布记录 · 候选 r1 · 修复回归与正式开放范围。'
  }
]
const position = (value) => `${(value / duration) * 100}%`

const phaseArtifacts = {
  design: ['intent', 'prototype', 'spec', 'commitment'],
  build: ['plan', 'pr'],
  verify: ['test', 'release', 'acceptance'],
  trial: ['release', 'issues', 'pr', 'test']
}
const artifactLabels = {
  intent: '意图',
  prototype: '原型',
  spec: '规格',
  plan: '详细设计 / Plan',
  test: '设计稿 CI',
  release: '发布记录',
  issues: '关联 Issue',
  commitment: '当时计划',
  acceptance: '人工验收'
}

function ArtifactLinks({ feature, openArtifact, ids }) {
  const rows = feature.artifacts.filter((row) => !ids || ids.includes(row[4]))
  return (
    <div className="ov-artifact-links" aria-label="成果入口">
      {rows.map((row) => {
        const label = row[4] === 'pr' ? `PR #${feature.pr.number}` : artifactLabels[row[4]]
        const content = (
          <>
            <strong>{label}</strong>
            <span>{row[2]}</span>
            <span aria-hidden="true">↗</span>
          </>
        )
        return (
          <span className="ov-artifact-chip" key={row[4]}>
            {row[5] ? (
              <a href={row[5]} target="_blank" rel="noreferrer" title={`${row[1]} · ${row[3]}`}>
                {content}
              </a>
            ) : (
              <button onClick={() => openArtifact(feature, row)} title={row[3]}>
                {content}
              </button>
            )}
            {row[5] && (
              <button
                className="ov-artifact-info"
                aria-label={`查看${label}的来源与状态`}
                onClick={() => openArtifact(feature, row)}
              >
                ⓘ
              </button>
            )}
          </span>
        )
      })}
    </div>
  )
}

function SampleJourney({ feature, openArtifact }) {
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
      <div className="ov-journey-scroll" tabIndex={0} aria-label="需求历程，可横向滚动查看小时刻度">
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
          原型注释: 以下打开 #{feature.id} 的实际材料，状态与上方模拟历程分开。
        </p>
        <ArtifactLinks
          feature={feature}
          openArtifact={openArtifact}
          ids={release ? ['release'] : phaseArtifacts[phaseId]}
        />
        <details key={release ? release.version : phaseId} className="ov-process-disclosure">
          <summary>过程详情</summary>
          <div className="ov-journey-detail">
            <div className="ov-journey-detail-heading">
              <strong>{release ? `${release.version} · 项目已发布` : phase.title}</strong>
              <span className="ov-chip">{release ? release.delivery : phase.state}</span>
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
        原型注释:
        轴上版本、时刻及“过程详情”中的记录均为模拟；成果链接打开真实固定读数或当前文件。历时包含等待，测试可并行，不累计为人工工时。
      </p>
    </>
  )
}

export function FeatureTimeline({ feature, openArtifact }) {
  const [demo, setDemo] = useState(!feature.historical)
  const draft = feature.draftEvidence
  return (
    <div className="ov-timeline" aria-label={`${feature.title}成果时间轴`}>
      <div className="ov-timeline-heading">
        <strong>需求历程与版本交付</strong>
        <button className="ov-link" onClick={() => setDemo(!demo)} aria-pressed={demo}>
          原型注释: {demo ? '核对实际材料' : '显示完整模拟历程'}
        </button>
      </div>
      {demo ? (
        <>
          <p className="ov-demo-warning">
            原型注释: 模拟历程。示例 v1.0 正常发布时，本需求尚无 Pre；后续 v1.1 提供 Pre，v1.2
            正式交付。不是 BW 的真实版本安排。
          </p>
          <SampleJourney feature={feature} openArtifact={openArtifact} />
        </>
      ) : (
        <>
          {draft ? (
            <div className="ov-recorded-start">
              <time dateTime={draft.at}>{stamp(Date.parse(draft.at))} UTC</time>
              <strong>本 PR 初稿已提交 · 原型与 spec 仍在共同评审</strong>
              <p>初稿存在不代表已确认。初始意图、评审起止及定稿时间尚未完整记录。</p>
            </div>
          ) : (
            <p className="ov-event-empty">当时的阶段起止与交付日期未归档。</p>
          )}
          <p className="ov-note">
            原型注释:
            仅展示已核对的提交时刻，不由文件时间补造阶段历时，也不把项目版本已发布推成这个需求已交付
            Pre / Release。
          </p>
          <ArtifactLinks feature={feature} openArtifact={openArtifact} />
        </>
      )}
    </div>
  )
}
