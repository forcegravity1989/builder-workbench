import React, { useRef, type RefObject } from 'react'

type Props = {
  minutesReady: boolean
  minutesName: string
  minutesNeed: boolean
  minutesRef: RefObject<HTMLDivElement | null>
  onUploadDemo: () => void
  onClearMinutes: () => void
  onFileChosen: (name: string) => void
}

/** Step 2 right pane — summary + minutes (prototype-v7). */
export function PlanReviewPane({
  minutesReady,
  minutesName,
  minutesNeed,
  minutesRef,
  onUploadDemo,
  onClearMinutes,
  onFileChosen
}: Props): React.JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="plan-step plan-step-2">
      <div className="summary-box">
        <span className="k">草案</span>
        <div className="editable" contentEditable suppressContentEditableWarning spellCheck={false}>
          W37：完 2 遗留 1；见红 2 条 — CI 62%（flaky×2，去掉后 76%）、发版 21 天。本周建议纳入 3
          件：CI 止血、09-18 发版、接第 2 个真实项目。
        </div>
      </div>

      <div className="sec">
        <div className="block-title">
          <h2>总结三段</h2>
        </div>
        <div className="agenda">
          <div className="wb-card agenda-card">
            <div className="block-title">
              <h2 style={{ fontSize: 13 }}>① 风险</h2>
              <span style={{ display: 'flex', gap: 6 }}>
                <span className="wb-tag wb-tag-danger">见红 2</span>
                <span className="wb-tag wb-tag-warning">目标 2 / 3</span>
              </span>
            </div>
            <div
              className="editable"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
            >
              CI flaky×2 拉低首过率；发版脚本 #158 未合，间隔已 21 天。措施草案：摘 flaky、门禁不动
              · CI <b>62% → 75%</b> · 09-18 仍发 · <b>21 → ≤14 天</b>
            </div>
          </div>
          <div className="wb-card agenda-card">
            <div className="block-title">
              <h2 style={{ fontSize: 13 }}>② 上周进展</h2>
              <span className="wb-tag wb-tag-neutral">完 2 · 遗留 1</span>
            </div>
            <div
              className="editable"
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
            >
              接真数据 <b>2 → 4</b> ✓ · 项目数 <b>1</b> 跑满一周 ✓ ·{' '}
              <span className="wb-mono">#158</span> 未合，发版仍 <b>3 步</b>（遗留）
            </div>
          </div>
          <div className="wb-card agenda-card" style={{ borderColor: 'var(--color-accent-300)' }}>
            <div className="block-title">
              <h2 style={{ fontSize: 13 }}>③ 本周任务预览</h2>
              <span className="wb-tag wb-tag-accent">草案 · 待管评</span>
            </div>
            <div className="preview-list">
              <div className="preview-item">
                <span className="num">1</span>
                <span
                  className="editable"
                  contentEditable
                  suppressContentEditableWarning
                  style={{ flex: 1 }}
                >
                  CI 止血
                </span>
                <span className="wb-mono wb-muted">62% → 75%</span>
                <span className="wb-tag wb-tag-warning">目标 2</span>
              </div>
              <div className="preview-item">
                <span className="num">2</span>
                <span
                  className="editable"
                  contentEditable
                  suppressContentEditableWarning
                  style={{ flex: 1 }}
                >
                  09-18 发 v0.3
                </span>
                <span className="wb-mono wb-muted">21 → ≤14 天</span>
                <span className="wb-tag wb-tag-danger">目标 3</span>
              </div>
              <div className="preview-item">
                <span className="num">3</span>
                <span
                  className="editable"
                  contentEditable
                  suppressContentEditableWarning
                  style={{ flex: 1 }}
                >
                  接第 2 个真实项目
                </span>
                <span className="wb-mono wb-muted">1 → 2</span>
                <span className="wb-tag wb-tag-success">目标 1</span>
              </div>
              <div className="preview-item" style={{ opacity: 0.55 }}>
                <span
                  className="num"
                  style={{
                    background: 'transparent',
                    color: 'inherit',
                    border: '1px dashed var(--color-neutral-400)'
                  }}
                >
                  4
                </span>
                <span
                  className="editable"
                  contentEditable
                  suppressContentEditableWarning
                  style={{ flex: 1, textDecoration: 'line-through' }}
                >
                  #149 评审进记分牌
                </span>
                <span className="wb-tag wb-tag-neutral">建议不纳入</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="block-title">
          <h2>会议评审记录</h2>
          <span className={`wb-tag ${minutesReady ? 'wb-tag-success' : 'wb-tag-outline'}`}>
            {minutesReady ? '已挂上' : '未挂'}
          </span>
        </div>
        <div
          ref={minutesRef}
          className={`wb-card minutes${minutesReady ? ' is-ready' : ''}${minutesNeed ? ' is-need' : ''}`}
          id="minutes-card"
        >
          <div className="minutes-empty" hidden={minutesReady}>
            <div className="minutes-drop">
              <div style={{ fontWeight: 600, fontSize: 13 }}>会议纪要</div>
              <div className="wb-muted" style={{ fontSize: 12, lineHeight: 1.55 }}>
                .md / .txt / .pdf
              </div>
              <div className="minutes-actions">
                <button
                  type="button"
                  className="wb-btn wb-btn-secondary wb-btn-sm"
                  onClick={() => fileRef.current?.click()}
                >
                  选择文件
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".md,.txt,.pdf,.doc,.docx"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      onFileChosen(file.name)
                    }
                  }}
                />
                <button
                  type="button"
                  className="wb-btn wb-btn-ghost wb-btn-sm"
                  onClick={onUploadDemo}
                >
                  用示例纪要
                </button>
              </div>
            </div>
          </div>
          <div className="minutes-filled" hidden={!minutesReady}>
            <div className="minutes-file-row">
              <div className="minutes-file-icon">纪</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{minutesName}</div>
                <div className="wb-muted wb-mono" style={{ fontSize: 11 }}>
                  刚上传 · 可预览结论
                </div>
              </div>
              <button
                type="button"
                className="wb-btn wb-btn-ghost wb-btn-sm"
                onClick={onClearMinutes}
              >
                移除
              </button>
            </div>
            <div className="minutes-excerpt">
              <div className="wb-muted" style={{ fontSize: 11, fontWeight: 600 }}>
                纪要摘录（只读预览）
              </div>
              <div className="minutes-body">
                · 认本周纳入 3 件；#149 超 top3，本周不纳入
                <br />· CI 阶段目标本周 75%，W39 回 80%；摘 flaky×2，门禁不动
                <br />· #158 顺延 W39；09-18 仍发，本周走旧脚本
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
