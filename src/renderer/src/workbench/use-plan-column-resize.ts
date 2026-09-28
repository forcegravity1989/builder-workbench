import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'
import {
  PLAN_CHAT_MIN_PX,
  PLAN_RIGHT_MIN_PX,
  planChatRatioFromWidth,
  planChatWidthFromRatio,
  readPlanChatRatio,
  writePlanChatRatio
} from './plan-column-resize'

export function usePlanColumnResize(enabled = true): {
  bodyRef: React.RefObject<HTMLDivElement | null>
  chatColRef: React.RefObject<HTMLDivElement | null>
  isResizing: boolean
  onResizeStart: (event: React.MouseEvent) => void
} {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [ratio, setRatio] = useState(readPlanChatRatio)
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

  return { bodyRef, chatColRef, isResizing, onResizeStart }
}
