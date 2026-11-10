import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_RATIO = 0.15
const MAX_RATIO = 0.85

export function ResizeHandle({
  direction,
  onResizeStart,
  onResizeEnd,
  onRatioChange
}: {
  direction: 'horizontal' | 'vertical'
  onResizeStart: () => void
  onResizeEnd?: () => void
  onRatioChange: (ratio: number) => void
}): React.JSX.Element {
  const isHorizontal = direction === 'horizontal'
  const [dragging, setDragging] = useState(false)
  const activeResizeCleanupRef = useRef<((updateDragging?: boolean) => void) | null>(null)

  useEffect(
    () => () => {
      activeResizeCleanupRef.current?.(false)
    },
    []
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      // Why: a second pointer must not steal or finalize the active gesture.
      if (activeResizeCleanupRef.current) {
        return
      }
      const handle = event.currentTarget
      const container = handle.parentElement
      if (!container) {
        return
      }
      const firstPane = handle.previousElementSibling as HTMLElement | null
      const secondPane = handle.nextElementSibling as HTMLElement | null
      if (!firstPane || !secondPane) {
        return
      }
      onResizeStart()
      setDragging(true)
      handle.setPointerCapture(event.pointerId)
      // Why: measure outside pointermove so pane writes never force a readback.
      let rect = container.getBoundingClientRect()
      const resizeObserver = new ResizeObserver(() => {
        rect = container.getBoundingClientRect()
      })
      resizeObserver.observe(container)
      let draggedRatio: number | null = null

      const onPointerMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== event.pointerId || !handle.hasPointerCapture(event.pointerId)) {
          return
        }
        const ratio = isHorizontal
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height
        const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
        draggedRatio = clamped
        // Write pane styles during drag to avoid 60–120 global store updates per second; commit once on release.
        firstPane.style.flex = `${clamped} 1 0%`
        secondPane.style.flex = `${1 - clamped} 1 0%`
      }

      let cleaned = false
      const cleanup = (updateDragging = true): void => {
        if (cleaned) {
          return
        }
        cleaned = true
        resizeObserver.disconnect()
        onResizeEnd?.()
        if (draggedRatio !== null) {
          onRatioChange(draggedRatio)
        }
        if (updateDragging) {
          setDragging(false)
        }
        try {
          if (handle.hasPointerCapture(event.pointerId)) {
            handle.releasePointerCapture(event.pointerId)
          }
        } catch {
          // Best effort: unmount cleanup can run after Chromium has already dropped capture.
        }
        handle.removeEventListener('pointermove', onPointerMove)
        handle.removeEventListener('pointerup', onPointerUp)
        handle.removeEventListener('pointercancel', onPointerCancel)
        handle.removeEventListener('lostpointercapture', onLostPointerCapture)
        if (activeResizeCleanupRef.current === cleanup) {
          activeResizeCleanupRef.current = null
        }
      }

      const onPointerUp = (upEvent: PointerEvent): void => {
        if (upEvent.pointerId === event.pointerId) {
          cleanup()
        }
      }

      const onPointerCancel = (cancelEvent: PointerEvent): void => {
        if (cancelEvent.pointerId === event.pointerId) {
          cleanup()
        }
      }

      const onLostPointerCapture = (lostEvent: PointerEvent): void => {
        if (lostEvent.pointerId === event.pointerId) {
          cleanup()
        }
      }

      handle.addEventListener('pointermove', onPointerMove)
      handle.addEventListener('pointerup', onPointerUp)
      handle.addEventListener('pointercancel', onPointerCancel)
      handle.addEventListener('lostpointercapture', onLostPointerCapture)
      activeResizeCleanupRef.current = cleanup
    },
    [isHorizontal, onRatioChange, onResizeStart, onResizeEnd]
  )

  return (
    <div
      className={`tab-group-split-resize-handle ${
        isHorizontal ? 'is-vertical' : 'is-horizontal'
      }${dragging ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
    />
  )
}
