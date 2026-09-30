import React from 'react'
import type { OnboardLogLine } from './run-project-onboard'

type Props = {
  targetPath: string
  probeNote: string | null
  name: string
  brief: string
  benchmark: string
  opportunity: string
  log: readonly OnboardLogLine[]
  busy: boolean
  /** 提交按钮文案;接入默认「确认接入」,编辑名片传「提交 PR」。 */
  submitLabel?: string
  busyLabel?: string
  onName: (value: string) => void
  onBrief: (value: string) => void
  onBenchmark: (value: string) => void
  onOpportunity: (value: string) => void
  onBack: () => void
  onSubmit: () => void
}

/** Step 2: charter fields before repo.add + `.bw/project.toml`. */
export function OnboardCharterStep({
  targetPath,
  probeNote,
  name,
  brief,
  benchmark,
  opportunity,
  log,
  busy,
  submitLabel,
  busyLabel,
  onName,
  onBrief,
  onBenchmark,
  onOpportunity,
  onBack,
  onSubmit
}: Props): React.JSX.Element {
  return (
    <>
      <div className="ob-card">
        <h3>基础信息</h3>
        <div className="ob-note">
          <span className="mono">{targetPath || '（路径未定）'}</span>
        </div>
        {probeNote ? <div className="ob-note">{probeNote}</div> : null}
        <div className="field-2">
          <div className="field">
            <label>项目名称</label>
            <input
              className="wb-ob-input"
              value={name}
              placeholder="例如 Workbench"
              onChange={(e) => onName(e.target.value)}
            />
          </div>
          <div className="field">
            <label>最像的对标</label>
            <input
              className="wb-ob-input"
              value={benchmark}
              placeholder="Linear"
              onChange={(e) => onBenchmark(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>你想做什么</label>
          <textarea
            className="wb-ob-textarea"
            value={brief}
            placeholder="把 agent 会话里长出的工作流沉淀成可复用资产"
            onChange={(e) => onBrief(e.target.value)}
          />
        </div>
        <div className="field">
          <label>目标方向</label>
          <textarea
            className="wb-ob-textarea"
            value={opportunity}
            placeholder="每月通过工作流完成的 Issue 数"
            onChange={(e) => onOpportunity(e.target.value)}
          />
        </div>
      </div>
      {log.length > 0 ? (
        <div className="ob-log" aria-live="polite">
          {log.map((line, i) => (
            <div key={`${i}-${line.text}`} className={line.kind}>
              {line.text}
            </div>
          ))}
        </div>
      ) : null}
      <div className="ob-actions">
        <button type="button" className="wb-btn wb-btn-secondary" disabled={busy} onClick={onBack}>
          ← 上一步
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-primary"
          disabled={busy || !name.trim()}
          onClick={onSubmit}
        >
          {busy ? (busyLabel ?? '接入中…') : (submitLabel ?? '确认接入')}
        </button>
      </div>
    </>
  )
}
