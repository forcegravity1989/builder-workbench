import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Tasks round-trips remount the board; the goal filter and scroll position of one
 * plan round (scope + version + cycleId) survive in sessionStorage. Drafts and the
 * selected version persist through their own stores — this only restores the view.
 */
export function usePlanningViewMemory(
  identity: string | null,
  goalFilter: string,
  onRestoreGoalFilter: (value: string) => void,
  contentRef: RefObject<HTMLDivElement | null>
) {
  const restored = useRef<string | null>(null)
  useEffect(() => {
    if (!identity || restored.current === identity) {
      return
    }
    restored.current = identity
    try {
      const savedView = sessionStorage.getItem(`bw:plan:view:${identity}`)
      if (savedView) {
        const parsed = JSON.parse(savedView) as { goalFilter?: string }
        if (parsed.goalFilter) {
          onRestoreGoalFilter(parsed.goalFilter)
        }
      }
      const savedScroll = sessionStorage.getItem(`bw:plan:scroll:${identity}`)
      if (savedScroll && contentRef.current) {
        contentRef.current.scrollTop = Number(savedScroll) || 0
      }
    } catch {
      /* View memory is best-effort. */
    }
  }, [identity, onRestoreGoalFilter, contentRef])
  useEffect(() => {
    if (!identity) {
      return
    }
    try {
      sessionStorage.setItem(`bw:plan:view:${identity}`, JSON.stringify({ goalFilter }))
    } catch {
      /* View memory is best-effort. */
    }
  }, [identity, goalFilter])
  return {
    onScroll() {
      if (!identity || !contentRef.current) {
        return
      }
      try {
        sessionStorage.setItem(
          `bw:plan:scroll:${identity}`,
          String(contentRef.current.scrollTop ?? 0)
        )
      } catch {
        /* View memory is best-effort. */
      }
    }
  }
}
