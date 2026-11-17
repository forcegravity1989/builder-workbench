import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * Task detail round-trips remount the board; the scroll position of one plan
 * round (scope + version + cycleId) survives in sessionStorage. Drafts and the
 * selected version persist through their own stores — this only restores the view.
 */
export function usePlanningViewMemory(
  identity: string | null,
  contentRef: RefObject<HTMLDivElement | null>
) {
  const restored = useRef<string | null>(null)
  useEffect(() => {
    if (!identity || restored.current === identity) {
      return
    }
    restored.current = identity
    try {
      const savedScroll = sessionStorage.getItem(`bw:plan:scroll:${identity}`)
      if (savedScroll && contentRef.current) {
        contentRef.current.scrollTop = Number(savedScroll) || 0
      }
    } catch {
      /* View memory is best-effort. */
    }
  }, [identity, contentRef])
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
