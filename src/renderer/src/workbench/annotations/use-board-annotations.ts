import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  annotationMatches,
  type AnnotationMatch,
  type AnnotationRef,
  type BoardAnnotation
} from './types'

export type AnnotationPopoverTarget = {
  id: string
  ref: AnnotationRef
  rect: { left: number; top: number; bottom: number }
}

type AnnotationSession = {
  annotations: BoardAnnotation[]
  annotating: boolean
  panelOpen: boolean
  popover: AnnotationPopoverTarget | null
}

/**
 * Module-level session store keyed by board identity. 第九轮 made the session
 * module-level so notes survive board unmounts (glancing at the other screen
 * mid-meeting is normal); 验收对齐轮 added the key: a single global session let
 * the two boards fight — mounting acceptance cleared the plan board's unsent
 * notes on its own identity change, and identical goalIds bled markers across
 * screens. Each board now reads and writes its own session; switching version or
 * scope is simply a different key (naturally empty), so no board runs an
 * imperative clearAll on identity change. Memory-only on purpose: a renderer
 * restart drops the module per decision D, with no storage cleanup to forget.
 */
const EMPTY_SESSION: AnnotationSession = {
  annotations: [],
  annotating: false,
  panelOpen: false,
  popover: null
}
const sessions = new Map<string, AnnotationSession>()
const listeners = new Map<string, Set<() => void>>()

// Unkeyed boards must get a stable snapshot object, or useSyncExternalStore
// re-renders forever. Entries are created only by patches.
const getSession = (boardId: string): AnnotationSession => sessions.get(boardId) ?? EMPTY_SESSION

const patchSession = (boardId: string, patch: Partial<AnnotationSession>) => {
  sessions.set(boardId, { ...getSession(boardId), ...patch })
  listeners.get(boardId)?.forEach((listener) => listener())
}

const subscribeBoard = (boardId: string, listener: () => void) => {
  let boardListeners = listeners.get(boardId)
  if (!boardListeners) {
    boardListeners = new Set()
    listeners.set(boardId, boardListeners)
  }
  const set = boardListeners
  set.add(listener)
  return () => {
    set.delete(listener)
    if (!set.size) {
      listeners.delete(boardId)
    }
  }
}

/**
 * Memory-only annotation state for one board (decision D): ordered records,
 * order-based global numbering shared by board markers and panel cards, mode
 * and popover lifecycle, and the Esc layering (popover first, then mode+panel).
 * Cascading goal removal filters by structured ref, not label prefixes.
 * `boardId` is the board's identity string (scope + version); sessions persist
 * across unmounts so screen switches keep each board's unsent notes.
 */
export function useBoardAnnotations(boardId: string) {
  const subscribe = useCallback(
    (listener: () => void) => subscribeBoard(boardId, listener),
    [boardId]
  )
  const getSnapshot = useCallback(() => getSession(boardId), [boardId])
  const { annotations, annotating, panelOpen, popover } = useSyncExternalStore(
    subscribe,
    getSnapshot
  )

  const numbered = useMemo(
    () => annotations.map((item, index) => ({ ...item, number: index + 1 })),
    [annotations]
  )

  const add = useCallback(
    (ref: AnnotationRef, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) {
        return
      }
      const current = getSession(boardId)
      patchSession(boardId, {
        annotations: [
          ...current.annotations,
          { id: `${Date.now()}-${current.annotations.length}`, ref, text: trimmed }
        ]
      })
    },
    [boardId]
  )

  const update = useCallback(
    (id: string, text: string) => {
      const current = getSession(boardId)
      patchSession(boardId, {
        annotations: current.annotations.map((item) =>
          item.id === id ? { ...item, text: text.trim() } : item
        )
      })
    },
    [boardId]
  )

  const remove = useCallback(
    (id: string) => {
      const current = getSession(boardId)
      patchSession(boardId, { annotations: current.annotations.filter((item) => item.id !== id) })
    },
    [boardId]
  )

  /** Goal deletion cascade: every annotation referencing the goal (board-level records have no goalId and stay). */
  const removeForGoal = useCallback(
    (goalId: string) => {
      const current = getSession(boardId)
      patchSession(boardId, {
        annotations: current.annotations.filter((item) => item.ref.goalId !== goalId),
        popover: current.popover && current.popover.ref.goalId === goalId ? null : current.popover
      })
    },
    [boardId]
  )

  const numbersFor = useCallback(
    (match: AnnotationMatch): number[] =>
      numbered.filter((item) => annotationMatches(item.ref, match)).map((item) => item.number),
    [numbered]
  )

  const openPopover = useCallback(
    (ref: AnnotationRef, rect: DOMRect) => {
      patchSession(boardId, {
        popover: {
          id: `${ref.kind}-${Date.now()}`,
          ref,
          rect: { left: rect.left, top: rect.top, bottom: rect.bottom }
        },
        panelOpen: true
      })
    },
    [boardId]
  )

  const closePopover = useCallback(() => {
    patchSession(boardId, { popover: null })
  }, [boardId])

  const openPanel = useCallback(() => {
    patchSession(boardId, { panelOpen: true })
  }, [boardId])

  const closePanel = useCallback(() => {
    patchSession(boardId, { panelOpen: false, popover: null })
  }, [boardId])

  /**
   * Sent notes leave the board (send-success receipt). Identity switches need no
   * clearing — they are separate keys — so boards must not wire this to an
   * identity effect; that coupling is what wiped the other screen's notes.
   */
  const clearAll = useCallback(() => {
    patchSession(boardId, { annotations: [], popover: null })
  }, [boardId])

  /** Model-side material edits may remove annotated objects: drop orphan records. */
  const pruneMissing = useCallback(
    (
      hasGoal: (goalId: string) => boolean,
      hasIssue: (goalId: string, number: number) => boolean
    ) => {
      const survives = (ref: AnnotationRef): boolean => {
        if (ref.kind === 'board') {
          return true
        }
        if (!ref.goalId || !hasGoal(ref.goalId)) {
          return false
        }
        return (
          ref.kind !== 'issue' ||
          ref.issueNumber === undefined ||
          hasIssue(ref.goalId, ref.issueNumber)
        )
      }
      const current = getSession(boardId)
      patchSession(boardId, {
        annotations: current.annotations.filter((item) => survives(item.ref)),
        popover: current.popover && !survives(current.popover.ref) ? null : current.popover
      })
    },
    [boardId]
  )

  const toggleMode = useCallback(() => {
    const current = getSession(boardId)
    const next = !current.annotating
    patchSession(boardId, { annotating: next, popover: null, panelOpen: next })
  }, [boardId])

  // The popover anchors to a board element rect: after a screen switch the rect is
  // stale, so drop only the popover on unmount while notes/mode/panel survive.
  useEffect(
    () => () => {
      if (sessions.has(boardId)) {
        patchSession(boardId, { popover: null })
      }
    },
    [boardId]
  )

  useEffect(() => {
    if (!annotating) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      // Why: Radix dismissable layers close their popover on Esc with
      // preventDefault but no stopPropagation; without this guard one Esc
      // would both close the send menu and tear down the annotation session.
      if (event.defaultPrevented) {
        return
      }
      // Esc closes the nearest popover first, then exits the mode and panel.
      if (getSession(boardId).popover) {
        patchSession(boardId, { popover: null })
        return
      }
      patchSession(boardId, { annotating: false, panelOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotating, boardId])

  return {
    annotations,
    numbered,
    annotating,
    panelOpen,
    popover,
    add,
    update,
    remove,
    removeForGoal,
    numbersFor,
    openPopover,
    closePopover,
    openPanel,
    closePanel,
    clearAll,
    pruneMissing,
    toggleMode
  }
}
