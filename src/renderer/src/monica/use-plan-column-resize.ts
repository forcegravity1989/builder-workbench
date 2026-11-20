import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'
import {
  PLAN_CHAT_MIN_PX,
  PLAN_RIGHT_MIN_PX,
  planChatRatioFromWidth,
  planChatWidthFromRatio,
  PLAN_CHAT_REVEAL_EVENT,
  PLAN_CHAT_TOGGLE_EVENT,
  readPlanChatCollapsed,
  readPlanChatRatio,
  writePlanChatRatio
} from './plan-column-resize'

export function usePlanColumnResize(enabled = true): {
  bodyRef: React.RefObject<HTMLDivElement | null>
  chatColRef: React.RefObject<HTMLDivElement | null>
  isResizing: boolean
  chatCollapsed: boolean
  onResizeStart: (event: React.MouseEvent) => void
} {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState(readPlanChatRatio)
  const [chatCollapsed, setChatCollapsed] = useState(readPlanChatCollapsed)
  const [containerWidth, setContainerWidth] = useState(0)
  const chatWidth = planChatWidthFromRatio(ratio, containerWidth)
  const maxWidth = Math.max(PLAN_CHAT_MIN_PX, containerWidth - PLAN_RIGHT_MIN_PX)

  const setWidth = useCallback(
    (nextWidth: number) => {
      const nextRatio = planChatRatioFromWidth(
        nextWidth,
        bodyRef.current?.clientWidth ?? containerWidth
      )
      setRatio(nextRatio)
      writePlanChatRatio(nextRatio)
      window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
    },
    [containerWidth]
  )

  const {
    containerRef: chatColRef,
    isResizing,
    onResizeStart
  } = useSidebarResize<HTMLDivElement>({
    isOpen: enabled,
    width: chatWidth,
    minWidth: PLAN_CHAT_MIN_PX,
    maxWidth,
    deltaSign: 1,
    setWidth
  })

  useEffect(() => {
    const reveal = () => setChatCollapsed(false)
    const sync = () => setChatCollapsed(readPlanChatCollapsed())
    window.addEventListener(PLAN_CHAT_REVEAL_EVENT, reveal)
    window.addEventListener(PLAN_CHAT_TOGGLE_EVENT, sync)
    return () => {
      window.removeEventListener(PLAN_CHAT_REVEAL_EVENT, reveal)
      window.removeEventListener(PLAN_CHAT_TOGGLE_EVENT, sync)
    }
  }, [])

  useLayoutEffect(() => {
    window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
  }, [chatCollapsed])

  const handleResizeStart = useCallback(
    (event: React.MouseEvent) => {
      if (!chatCollapsed) {
        onResizeStart(event)
      }
    },
    [chatCollapsed, onResizeStart]
  )

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) {
      return
    }
    const syncWidth = (): void => {
      setContainerWidth(body.clientWidth)
    }
    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  return {
    bodyRef,
    chatColRef,
    isResizing,
    chatCollapsed,
    onResizeStart: handleResizeStart
  }
}
