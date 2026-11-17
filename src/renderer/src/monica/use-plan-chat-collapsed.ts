import { useEffect, useState } from 'react'
import {
  PLAN_CHAT_REVEAL_EVENT,
  PLAN_CHAT_TOGGLE_EVENT,
  readPlanChatCollapsed
} from './plan-column-resize'

/**
 * Collapse state of the native chat column as seen from the plan board header
 * chip. The chip renders in the board, the column lives in the shell; both stay
 * in sync through the persisted value plus the reveal/toggle window events.
 */
export function usePlanChatCollapsed(): boolean {
  const [collapsed, setCollapsed] = useState(readPlanChatCollapsed)
  useEffect(() => {
    const sync = () => setCollapsed(readPlanChatCollapsed())
    window.addEventListener(PLAN_CHAT_REVEAL_EVENT, sync)
    window.addEventListener(PLAN_CHAT_TOGGLE_EVENT, sync)
    return () => {
      window.removeEventListener(PLAN_CHAT_REVEAL_EVENT, sync)
      window.removeEventListener(PLAN_CHAT_TOGGLE_EVENT, sync)
    }
  }, [])
  return collapsed
}
