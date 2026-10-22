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
 * Module-level session store (2026-10-23 第九轮): annotations are meeting shorthand
 * and must survive plan-board unmounts — glancing at the acceptance or tasks screen
 * mid-review is normal, and component state evaporated the notes on every route
 * switch, wider than decision D ("restart loss is by design"). Memory-only on
 * purpose: screen switches keep the session, a renderer restart resets the module
 * and drops it per the decision, with no storage cleanup to forget.
 */
let session: AnnotationSession = {
  annotations: [],
  annotating: false,
  panelOpen: false,
  popover: null
}
const listeners = new Set<() => void>()
const patchSession = (patch: Partial<AnnotationSession>) => {
  session = { ...session, ...patch }
  listeners.forEach((listener) => listener())
}
const subscribeSession = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Memory-only annotation state for one board (decision D): ordered records,
 * order-based global numbering shared by board markers and panel cards, mode
 * and popover lifecycle, and the Esc layering (popover first, then mode+panel).
 * Cascading goal removal filters by structured ref, not label prefixes.
 */
export function useBoardAnnotations() {
  const { annotations, annotating, panelOpen, popover } = useSyncExternalStore(
    subscribeSession,
    () => session
  )

  const numbered = useMemo(
    () => annotations.map((item, index) => ({ ...item, number: index + 1 })),
    [annotations]
  )

  const add = useCallback((ref: AnnotationRef, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    patchSession({
      annotations: [
        ...session.annotations,
        { id: `${Date.now()}-${session.annotations.length}`, ref, text: trimmed }
      ]
    })
  }, [])

  const update = useCallback((id: string, text: string) => {
    patchSession({
      annotations: session.annotations.map((item) =>
        item.id === id ? { ...item, text: text.trim() } : item
      )
    })
  }, [])

  const remove = useCallback((id: string) => {
    patchSession({ annotations: session.annotations.filter((item) => item.id !== id) })
  }, [])

  /** Goal deletion cascade: every annotation referencing the goal (board-level records have no goalId and stay). */
  const removeForGoal = useCallback((goalId: string) => {
    patchSession({
      annotations: session.annotations.filter((item) => item.ref.goalId !== goalId),
      popover: session.popover && session.popover.ref.goalId === goalId ? null : session.popover
    })
  }, [])

  const numbersFor = useCallback(
    (match: AnnotationMatch): number[] =>
      numbered.filter((item) => annotationMatches(item.ref, match)).map((item) => item.number),
    [numbered]
  )

  const openPopover = useCallback((ref: AnnotationRef, rect: DOMRect) => {
    patchSession({
      popover: {
        id: `${ref.kind}-${Date.now()}`,
        ref,
        rect: { left: rect.left, top: rect.top, bottom: rect.bottom }
      },
      panelOpen: true
    })
  }, [])

  const closePopover = useCallback(() => {
    patchSession({ popover: null })
  }, [])

  const openPanel = useCallback(() => {
    patchSession({ panelOpen: true })
  }, [])

  const closePanel = useCallback(() => {
    patchSession({ panelOpen: false, popover: null })
  }, [])

  /** Board identity changed (version/scope/restart): memory records no longer point at visible objects. */
  const clearAll = useCallback(() => {
    patchSession({ annotations: [], popover: null })
  }, [])

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
      patchSession({
        annotations: session.annotations.filter((item) => survives(item.ref)),
        popover: session.popover && !survives(session.popover.ref) ? null : session.popover
      })
    },
    []
  )

  const toggleMode = useCallback(() => {
    const next = !session.annotating
    patchSession({ annotating: next, popover: null, panelOpen: next })
  }, [])

  // The popover anchors to a board element rect: after a screen switch the rect is
  // stale, so drop only the popover on unmount while notes/mode/panel survive.
  useEffect(() => () => patchSession({ popover: null }), [])

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
      if (session.popover) {
        patchSession({ popover: null })
        return
      }
      patchSession({ annotating: false, panelOpen: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotating])

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
