import React, { useState } from 'react'
import { PlanCurrentPane } from './PlanCurrentPane'
import { PlanResultsPane } from './PlanResultsPane'
import { PlanReviewBoard } from './PlanReviewBoard'
import { usePlanWeekDocument } from './use-plan-week-document'

const TABS = [
  { step: 1, label: '上周版本结果' },
  { step: 2, label: '总结与评审' },
  { step: 3, label: '当前版本计划' }
] as const

export function PlanWeekBoard(): React.JSX.Element {
  const {
    workspacePath,
    versions,
    state,
    saveStatus,
    saveError,
    patch,
    confirm,
    selectVersion,
    reload
  } = usePlanWeekDocument()
  const [step, setStep] = useState(1)

  if (!workspacePath) {
    return (
      <div className="plan-board">
        <div className="plan-html-empty">
          <p>先在左侧选一个项目</p>
          <p className="wb-muted">选好之后会在这里打开版本计划。</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div className="plan-board">
        <div className="plan-html-empty">
          <p>{state.error}</p>
          <button className="wb-btn wb-btn-primary wb-btn-sm" type="button" onClick={reload}>
            重试
          </button>
        </div>
      </div>
    )
  }

  if (state.kind !== 'ready') {
    return (
      <div className="plan-board">
        <div className="plan-html-empty">
          <p>正在打开版本计划…</p>
        </div>
      </div>
    )
  }

  const { data, filePath } = state
  const relativePath = `.bw/planning/${data.version}/data.json`

  return (
    <div className="plan-board" data-step={String(step)}>
      <header className="plan-head">
        <h1>计划</h1>
        <label className="version-picker">
          版本{' '}
          <select
            aria-label="选择版本"
            value={data.version}
            onChange={(event) => selectVersion(event.target.value)}
          >
            {(versions.includes(data.version) ? versions : [...versions, data.version]).map(
              (version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              )
            )}
          </select>
        </label>
        <span className="wb-tag wb-tag-outline mono">
          {data.header.version_pair || data.version}
        </span>
        <span className={`plan-save${saveError ? ' is-error' : ''}`} title={filePath}>
          {saveError ? saveStatus : relativePath}
        </span>
        <span style={{ flex: 1 }} />
        <div className="seg plan-tabs" role="tablist" aria-label="计划页">
          {TABS.map((tab) => (
            <button
              key={tab.step}
              type="button"
              className={`seg-opt${step === tab.step ? ' is-on' : ''}`}
              role="tab"
              aria-selected={step === tab.step}
              onClick={() => setStep(tab.step)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>
      <div className="right-scroll">
        <PlanResultsPane data={data} onChange={patch} />
        <PlanReviewBoard data={data} onChange={patch} />
        <PlanCurrentPane data={data} onChange={patch} />
      </div>
      <div className="foot-bar">
        <div className="foot-by-step foot-s1">
          <div className="foot-actions foot-actions-end">
            <button
              className="wb-btn wb-btn-primary"
              type="button"
              onClick={() => {
                void confirm('results').then((ok) => {
                  if (ok) {
                    setStep(2)
                  }
                })
              }}
            >
              {data.confirmation.results
                ? '结果已确认，进入总结与评审'
                : '确认结果，进入总结与评审'}
            </button>
          </div>
        </div>
        <div className="foot-by-step foot-s3">
          <div className="foot-actions foot-actions-end">
            <button
              className="wb-btn wb-btn-primary"
              type="button"
              onClick={() => {
                if (
                  !window.confirm('确认当前版本计划？这会保存确认记录；发起 PR 请回到会话提出。')
                ) {
                  return
                }
                void confirm('plan')
              }}
            >
              {data.confirmation.plan ? '计划已确认' : '确认计划'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
