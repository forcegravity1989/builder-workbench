import { useCallback, useEffect, useMemo, useState } from 'react'
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

/**
 * Memory-only annotation state for one board (decision D): ordered records,
 * order-based global numbering shared by board markers and panel cards, mode
 * and popover lifecycle, and the Esc layering (popover first, then mode+panel).
 * Cascading goal removal filters by structured ref, not label prefixes.
 */
export function useBoardAnnotations() {
  const [annotations, setAnnotations] = useState<BoardAnnotation[]>([])
  const [annotating, setAnnotating] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [popover, setPopover] = useState<AnnotationPopoverTarget | null>(null)

  const numbered = useMemo(
    () => annotations.map((item, index) => ({ ...item, number: index + 1 })),
    [annotations]
  )

  const add = useCallback((ref: AnnotationRef, text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      return
    }
    setAnnotations((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, ref, text: trimmed }
    ])
  }, [])

  const update = useCallback((id: string, text: string) => {
    setAnnotations((current) =>
      current.map((item) => (item.id === id ? { ...item, text: text.trim() } : item))
    )
  }, [])

  const remove = useCallback((id: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== id))
  }, [])

  /** Goal deletion cascade: every annotation referencing the goal (board-level records have no goalId and stay). */
  const removeForGoal = useCallback((goalId: string) => {
    setAnnotations((current) => current.filter((item) => item.ref.goalId !== goalId))
    setPopover((current) => (current && current.ref.goalId === goalId ? null : current))
  }, [])

  const numbersFor = useCallback(
    (match: AnnotationMatch): number[] =>
      numbered.filter((item) => annotationMatches(item.ref, match)).map((item) => item.number),
    [numbered]
  )

  const openPopover = useCallback((ref: AnnotationRef, rect: DOMRect) => {
    setPopover({
      id: `${ref.kind}-${Date.now()}`,
      ref,
      rect: { left: rect.left, top: rect.top, bottom: rect.bottom }
    })
    setPanelOpen(true)
  }, [])

  const closePopover = useCallback(() => setPopover(null), [])

  const openPanel = useCallback(() => setPanelOpen(true), [])

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    setPopover(null)
  }, [])

  /** Board identity changed (version/scope/restart): memory records no longer point at visible objects. */
  const clearAll = useCallback(() => {
    setAnnotations([])
    setPopover(null)
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
      setAnnotations((current) => current.filter((item) => survives(item.ref)))
      setPopover((current) => (current && !survives(current.ref) ? null : current))
    },
    []
  )

  const toggleMode = useCallback(() => {
    const next = !annotating
    setAnnotating(next)
    setPopover(null)
    setPanelOpen(next)
  }, [annotating])

  useEffect(() => {
    if (!annotating) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      // Esc closes the nearest popover first, then exits the mode and panel.
      if (popover) {
        setPopover(null)
        return
      }
      setAnnotating(false)
      setPanelOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [annotating, popover])

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
