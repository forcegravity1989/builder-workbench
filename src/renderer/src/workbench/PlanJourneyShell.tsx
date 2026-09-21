import React from 'react'
import { PlanWeekPlanChat } from './PlanWeekPlanChat'
import { PlanWeekPlanHtml } from './PlanWeekPlanHtml'
import { usePlanColumnResize } from './use-plan-column-resize'
import './workbench-plan.css'

/**
 * 计划页签：左侧 bw/week-plan 会话，右侧 week-planning 固定 HTML。
 * 三屏与保存由 planning.py 本地服务承担，不在壳里再做一套页面。
 */
export function PlanJourneyShell(): React.JSX.Element {
  const { bodyRef, chatColRef, isResizing, onResizeStart } = usePlanColumnResize()

  return (
    <div className="wb-plan">
      <div className="plan-v7">
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
            <PlanWeekPlanHtml />
          </div>
        </div>
      </div>
    </div>
  )
}
