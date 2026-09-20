import React, { useEffect, useRef, useState } from 'react'
import { PlanLastWeekPane } from './PlanLastWeekPane'
import { PlanReviewPane } from './PlanReviewPane'
import { PlanWeekPlanChat } from './PlanWeekPlanChat'
import { usePlanColumnResize } from './use-plan-column-resize'
import './workbench-plan.css'

type Step = 1 | 2 | 3

const TABS: { step: Step; label: string }[] = [
  { step: 1, label: '上周结果' },
  { step: 2, label: '总结与评审' },
  { step: 3, label: '本周计划' }
]

type Props = {
  children: React.ReactNode
}

/**
 * Monday plan chrome from loop-buddy prototype-v7 (self-explanatory tabs, no journey coach).
 * Step 3 hosts Orca TaskPage (`children`) in place of the prototype task table.
 */
export function PlanJourneyShell({ children }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>(1)
  const [minutesReady, setMinutesReady] = useState(false)
  const [minutesName, setMinutesName] = useState('W38-周一评审纪要.md')
  const [minutesNeed, setMinutesNeed] = useState(false)
  const [draftTag, setDraftTag] = useState('W37 → W38')
  const [draftTagSuccess, setDraftTagSuccess] = useState(false)
  const [toastOn, setToastOn] = useState(false)
  const minutesRef = useRef<HTMLDivElement | null>(null)
  const needTimer = useRef<number | null>(null)
  const { bodyRef, chatColRef, isResizing, onResizeStart } = usePlanColumnResize()

  useEffect(() => {
    return () => {
      if (needTimer.current !== null) {
        window.clearTimeout(needTimer.current)
      }
    }
  }, [])

  const pulseMinutesNeed = () => {
    setMinutesNeed(true)
    minutesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (needTimer.current !== null) {
      window.clearTimeout(needTimer.current)
    }
    needTimer.current = window.setTimeout(() => setMinutesNeed(false), 1600)
  }

  /** V7: 未挂纪要时进不了本周计划，停在评审并点亮纪要区。 */
  const go = (next: Step) => {
    if (next === 3 && !minutesReady) {
      setStep(2)
      pulseMinutesNeed()
      return
    }
    setStep(next)
  }

  return (
    <div className="wb-plan" data-step={step}>
      <div className="plan-v7">
        <header className="plan-head">
          <h1>计划</h1>
          <span
            className={`wb-tag wb-mono ${draftTagSuccess ? 'wb-tag-success' : 'wb-tag-outline'}`}
            id="draft-tag"
          >
            {draftTag}
          </span>
          <span className="wb-muted wb-mono" style={{ fontSize: 11 }}>
            #120 · 更新指标与版本计划
          </span>
          <span style={{ flex: 1 }} />
          <div className="seg plan-tabs" role="tablist" aria-label="计划页">
            {TABS.map((t) => {
              const on = step === t.step
              const locked = t.step === 3 && !minutesReady
              return (
                <button
                  key={t.step}
                  type="button"
                  role="tab"
                  className={`seg-opt${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
                  data-goto={t.step}
                  aria-selected={on}
                  onClick={() => go(t.step)}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </header>

        <div className="plan-body" ref={bodyRef}>
          <div className="chat-col" ref={chatColRef}>
            <PlanWeekPlanChat />
            <div
              className={`plan-split${isResizing ? ' is-on' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整左右栏宽度"
              title="左右拖动调整宽度"
              onMouseDown={onResizeStart}
            />
          </div>

          <div className="right">
            <div className="right-scroll">
              <PlanLastWeekPane />
              <PlanReviewPane
                minutesReady={minutesReady}
                minutesName={minutesName}
                minutesNeed={minutesNeed}
                minutesRef={minutesRef}
                onUploadDemo={() => {
                  setMinutesName('W38-周一评审纪要.md')
                  setMinutesReady(true)
                  setMinutesNeed(false)
                }}
                onClearMinutes={() => setMinutesReady(false)}
                onFileChosen={(name) => {
                  setMinutesName(name)
                  setMinutesReady(true)
                  setMinutesNeed(false)
                }}
              />

              <div className="plan-step plan-step-3">
                <div className="sec">
                  <div className="block-title">
                    <h2>本周目标</h2>
                    <span className="wb-tag wb-tag-outline">v0.3 · W38 · 可批注</span>
                  </div>
                  <div className="goals">
                    <div className="wb-card goal">
                      <span className="card-kicker">目标 1</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>再纳入 2 个真实项目</span>
                      <span className="bar">
                        <i style={{ width: '50%' }} />
                      </span>
                      <span className="goal-meta">
                        1 / 2<span className="wb-tag wb-tag-success">green</span>
                      </span>
                    </div>
                    <div className="wb-card goal is-noted">
                      <span className="card-kicker">目标 2</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        记分牌 6 条指标全接真数据
                      </span>
                      <span className="bar warn">
                        <i style={{ width: '67%' }} />
                      </span>
                      <span className="goal-meta">
                        4 / 6<span className="wb-tag wb-tag-warning">delay</span>
                      </span>
                      <div
                        className="note-chip"
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                      >
                        <span className="lab">修改文</span>
                        <span>
                          纪要：CI 阶段目标 80% → <b>本周 75%</b>，W39 回 80%；摘 flaky×2。
                        </span>
                      </div>
                    </div>
                    <div className="wb-card goal is-noted">
                      <span className="card-kicker">目标 3</span>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        发版从 4 步变成 1 条命令
                      </span>
                      <span className="bar">
                        <i style={{ width: '33%' }} />
                      </span>
                      <span className="goal-meta">
                        3 步 → 1 步<span className="wb-tag wb-tag-success">green</span>
                      </span>
                      <div
                        className="note-chip"
                        contentEditable
                        suppressContentEditableWarning
                        spellCheck={false}
                      >
                        <span className="lab">修改文</span>
                        <span>
                          纪要：发版日仍 <b>09-18</b>；#158 顺延 W39，本周走旧脚本。
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="sec">
                  <div className="block-title">
                    <h2>本周任务（= 计划正文）</h2>
                    <span className="wb-tag wb-tag-neutral">Orca Tasks · ▶开工</span>
                  </div>
                  <div className="orca-tasks-host">{children}</div>
                </div>
              </div>
            </div>

            <div className="foot-bar">
              <div className="foot-by-step foot-s1">
                <div className="foot-actions foot-actions-end">
                  <button className="wb-btn wb-btn-primary" type="button" onClick={() => go(2)}>
                    总结与评审
                  </button>
                </div>
              </div>
              <div className="foot-by-step foot-s2">
                <div className="foot-actions foot-actions-end">
                  <button className="wb-btn wb-btn-ghost" type="button" onClick={() => go(1)}>
                    上周结果
                  </button>
                  <button
                    className="wb-btn wb-btn-primary"
                    type="button"
                    disabled={!minutesReady}
                    title={minutesReady ? undefined : '先挂上会议纪要'}
                    onClick={() => go(3)}
                  >
                    本周计划
                  </button>
                </div>
              </div>
              <div className="foot-by-step foot-s3">
                <div className="foot-actions foot-actions-end">
                  <button className="wb-btn wb-btn-ghost" type="button" onClick={() => go(2)}>
                    总结与评审
                  </button>
                  <button
                    className="wb-btn wb-btn-primary"
                    type="button"
                    onClick={() => {
                      setDraftTag('W38 已落盘')
                      setDraftTagSuccess(true)
                      setToastOn(true)
                      window.setTimeout(() => setToastOn(false), 2800)
                    }}
                  >
                    确认本周计划
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`toast wb-card${toastOn ? ' show' : ''}`} style={{ padding: '10px 12px' }}>
          <span style={{ fontWeight: 600 }}>已确认本周计划</span>
          <span className="wb-muted" style={{ fontSize: 12 }}>
            总览目标已刷新 · 任务批注写入 issue · 纪要已归档
          </span>
        </div>
      </div>
    </div>
  )
}
