import { createContext, useContext, type ReactNode, type RefObject } from 'react'

/**
 * Scroll plumbing the version tree needs to reveal a worktree inside the shared
 * sidebar scroller (#762). The version section is one virtualized 'content' row,
 * so the tree itself cannot reach the virtualizer; the viewport lends it these
 * handles instead. Null outside the viewport (e.g. the filters empty state, which
 * mounts the version tree in its own non-virtualized scroller).
 */
export type AfterPinnedScrollApi = {
  scrollRef: RefObject<HTMLDivElement | null>
  /** Bring the virtualized version-section row into the scroll window. */
  scrollContentRowIntoView: () => void
  markRevealScroll: (targetTop: number) => void
}

const AfterPinnedScrollContext = createContext<AfterPinnedScrollApi | null>(null)

export function AfterPinnedScrollProvider({
  value,
  children
}: {
  value: AfterPinnedScrollApi
  children: ReactNode
}): ReactNode {
  return (
    <AfterPinnedScrollContext.Provider value={value}>{children}</AfterPinnedScrollContext.Provider>
  )
}

export function useAfterPinnedScroll(): AfterPinnedScrollApi | null {
  return useContext(AfterPinnedScrollContext)
}
