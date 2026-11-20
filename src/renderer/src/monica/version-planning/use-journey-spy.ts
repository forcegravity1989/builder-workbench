import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { PLANNING_SECTIONS, type PlanningSectionId } from './PlanningSections'

/**
 * Top-navigation scroll spy (prototype logic): a navigation click suppresses
 * the spy until user activity clears it; hitting the scroll bottom selects
 * archive (a short final section may never reach the top), otherwise the last
 * section whose top passed the container top + 60px wins.
 */
export function useJourneySpy() {
  const sectionRefs: Record<PlanningSectionId, RefObject<HTMLElement | null>> = {
    context: useRef<HTMLElement>(null),
    goals: useRef<HTMLElement>(null),
    minutes: useRef<HTMLElement>(null),
    archive: useRef<HTMLElement>(null)
  }
  const [activeSection, setActiveSection] = useState<PlanningSectionId>('context')
  // Set while a navigation click is settling; user activity clears it so the
  // spy does not fight the programmatic scroll.
  const navigation = useRef<PlanningSectionId | null>(null)
  const navigate = (id: PlanningSectionId) => {
    navigation.current = id
    setActiveSection(id)
    sectionRefs[id].current?.scrollIntoView({ block: 'start' })
  }
  /** Re-anchor after layout shifts (chat column toggle) without changing the active section. */
  const reanchor = (id: PlanningSectionId) => {
    navigation.current = id
    requestAnimationFrame(() => sectionRefs[id].current?.scrollIntoView({ block: 'start' }))
  }
  const onPaneScroll = (pane: HTMLDivElement | null) => {
    if (!pane || navigation.current) {
      return
    }
    if (pane.scrollHeight - pane.scrollTop - pane.clientHeight < 2) {
      setActiveSection('archive')
      return
    }
    const top = pane.getBoundingClientRect().top
    let current: PlanningSectionId | undefined
    for (const [id] of PLANNING_SECTIONS) {
      const element = sectionRefs[id].current
      if (element && element.getBoundingClientRect().top <= top + 60) {
        current = id
      }
    }
    if (current) {
      setActiveSection(current)
    }
  }
  const clearNavigation = () => {
    navigation.current = null
  }
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(event.key)) {
      clearNavigation()
    }
  }
  return {
    sectionRefs,
    activeSection,
    navigate,
    reanchor,
    onPaneScroll,
    clearNavigation,
    onKeyDown
  }
}
