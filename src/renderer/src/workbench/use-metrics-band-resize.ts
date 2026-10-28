import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { SYNC_FIT_PANES_EVENT } from '@/constants/terminal'

const STORAGE_KEY = 'workbench.metrics.bandRatio'
const DEFAULT_RATIO = 0.6
const MIN_CHAT = 160
const MIN_BOARD = 160

function readRatio(): number {
  try {
    const parsed = Number(window.localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(parsed) && parsed > 0.12 && parsed < 0.88) {
      return parsed
    }
  } catch {
    // Private mode: keep the default until the next drag.
  }
  return DEFAULT_RATIO
}

function writeRatio(ratio: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(ratio))
  } catch {
    // Quota: the height still applies until reload.
  }
}

function clampBoard(board: number, total: number): number {
  const max = Math.max(MIN_BOARD, total - MIN_CHAT)
  return Math.min(max, Math.max(MIN_BOARD, board))
}

/** Bottom scoreboard band in the metrics workspace. Ratio is the band's share of the column. */
export function useMetricsBandResize(): {
  ratio: number
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void
} {
  const [ratio, setRatio] = useState(readRatio)
  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => () => stopRef.current?.(), [])
  const onResizeStart = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    const column = event.currentTarget.parentElement
    if (!column) {
      return
    }
    const startY = event.clientY
    const total = () => column.getBoundingClientRect().height
    const startBoard =
      column.lastElementChild?.getBoundingClientRect().height ?? total() * readRatio()
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    let next = startBoard / total()
    const move = (pointer: MouseEvent) => {
      const height = total()
      if (height <= 0) {
        return
      }
      const board = clampBoard(startBoard + (startY - pointer.clientY), height)
      next = board / height
      setRatio(next)
    }
    const stop = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
      writeRatio(next)
      window.dispatchEvent(new Event(SYNC_FIT_PANES_EVENT))
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      stopRef.current = null
    }
    stopRef.current?.()
    stopRef.current = stop
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }, [])
  return { ratio, onResizeStart }
}
