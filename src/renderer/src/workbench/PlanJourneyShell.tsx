import React from 'react'
import { PlanWeekPlanChat } from './PlanWeekPlanChat'
import { PlanWeekBoard } from './PlanWeekBoard'
import { usePlanColumnResize } from './use-plan-column-resize'
import './workbench-plan.css'

/** 计划页签：左侧 bw/week-plan 会话，右侧原生三屏读写 .bw/planning JSON。 */
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
            <PlanWeekBoard />
          </div>
        </div>
      </div>
    </div>
  )
}
