import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'

import {
  anchorFloatingTerminalTriggerPosition,
  clampFloatingTerminalTriggerPosition,
  getDefaultFloatingTerminalTriggerCommittedPosition,
  persistFloatingTerminalTriggerPosition,
  readPersistedFloatingTerminalTriggerPosition,
  resolveFloatingTerminalTriggerCommittedPosition,
  shouldReconcileFloatingTerminalTriggerPosition,
  type FloatingTerminalTriggerCommittedPosition,
  type FloatingTerminalTriggerPosition,
  type FloatingTerminalTriggerPositionSource
} from './floating-terminal-trigger-position'

const DRAG_THRESHOLD = 4

type PositionState = {
  committedPosition: FloatingTerminalTriggerCommittedPosition
  position: FloatingTerminalTriggerPosition
  source: FloatingTerminalTriggerPositionSource
}

type TriggerOptions = { storageKey?: string; rightGap?: number; bottomGap?: number }

function readInitialPosition(options: TriggerOptions): PositionState {
  const defaultCommittedPosition = getDefaultFloatingTerminalTriggerCommittedPosition()
  defaultCommittedPosition.offsetX = options.rightGap ?? defaultCommittedPosition.offsetX
  defaultCommittedPosition.offsetY = options.bottomGap ?? defaultCommittedPosition.offsetY
  const defaultPosition = clampFloatingTerminalTriggerPosition(
    resolveFloatingTerminalTriggerCommittedPosition(defaultCommittedPosition)
  )
  if (typeof window === 'undefined') {
    return {
      committedPosition: defaultCommittedPosition,
      position: defaultPosition,
      source: 'default'
    }
  }
  const persistedPosition = readPersistedFloatingTerminalTriggerPosition(options.storageKey)
  return persistedPosition
    ? {
        committedPosition: persistedPosition,
        position: resolveFloatingTerminalTriggerCommittedPosition(persistedPosition),
        source: 'user'
      }
    : { committedPosition: defaultCommittedPosition, position: defaultPosition, source: 'default' }
}

export function useFloatingTriggerPosition(options: TriggerOptions = {}): {
  position: FloatingTerminalTriggerPosition
  dragHandlers: {
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void
    onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void
    onClickCapture: (event: React.MouseEvent<HTMLButtonElement>) => void
  }
} {
  const { storageKey } = options
  const initialState = useRef<PositionState | null>(null)
  if (initialState.current === null) {
    initialState.current = readInitialPosition(options)
  }
  const positionSourceRef = useRef<FloatingTerminalTriggerPositionSource>(
    initialState.current.source
  )
  const committedPositionRef = useRef<FloatingTerminalTriggerCommittedPosition>(
    initialState.current.committedPosition
  )
  const [position, setPosition] = useState(initialState.current.position)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    left: number
    top: number
    moved: boolean
  } | null>(null)
  const stagedPositionRef = useRef<FloatingTerminalTriggerPosition | null>(null)
  const suppressClickRef = useRef(false)

  const previewPosition = useCallback((nextPosition: FloatingTerminalTriggerPosition): void => {
    const clamped = clampFloatingTerminalTriggerPosition(nextPosition)
    stagedPositionRef.current = clamped
    setPosition(clamped)
  }, [])

  const commitPosition = useCallback(
    (nextPosition: FloatingTerminalTriggerPosition): void => {
      stagedPositionRef.current = null
      const clamped = clampFloatingTerminalTriggerPosition(nextPosition)
      setPosition(clamped)
      const anchoredPosition = anchorFloatingTerminalTriggerPosition(clamped)
      if (!anchoredPosition) {
        return
      }
      committedPositionRef.current = anchoredPosition
      positionSourceRef.current = 'user'
      persistFloatingTerminalTriggerPosition(anchoredPosition, storageKey)
    },
    [storageKey]
  )

  const reconcilePosition = useCallback((): void => {
    setPosition((current) => {
      if (!shouldReconcileFloatingTerminalTriggerPosition(positionSourceRef.current)) {
        // Why: Electron 可能先以启动尺寸挂载；此时不要用安全夹取覆盖用户拖动位置。
        return current
      }
      return clampFloatingTerminalTriggerPosition(
        resolveFloatingTerminalTriggerCommittedPosition(committedPositionRef.current)
      )
    })
  }, [])

  useLayoutEffect(() => {
    // Why: 默认位置按右下角锚定，首帧按真实视口重新计算，避免启动尺寸偏差。
    reconcilePosition()
  }, [reconcilePosition])

  useEffect(() => {
    const handleResize = (): void => reconcilePosition()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [reconcilePosition])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      if (event.button !== 0) {
        return
      }
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: position.left,
        top: position.top,
        moved: false
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [position.left, position.top]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return
      }
      drag.moved = true
      previewPosition({ left: drag.left + dx, top: drag.top + dy })
    },
    [previewPosition]
  )

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>): void => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }
      suppressClickRef.current = drag.moved
      if (drag.moved && stagedPositionRef.current) {
        commitPosition(stagedPositionRef.current)
      }
      dragRef.current = null
    },
    [commitPosition]
  )

  const onClickCapture = useCallback((event: React.MouseEvent<HTMLButtonElement>): void => {
    if (!suppressClickRef.current) {
      return
    }
    suppressClickRef.current = false
    // Why: 拖动结束后浏览器仍会派发 click；捕获阶段拦下，避免顺带开关面板。
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return {
    position,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onClickCapture
    }
  }
}
