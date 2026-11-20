import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import { ACCEPTANCE_SECTIONS, type AcceptanceSectionId } from './acceptance-sections'

/**
 * Top-navigation scroll spy for the acceptance board: a navigation click
 * suppresses the spy until user activity clears it; hitting the scroll bottom
 * selects archive (a short final section may never reach the top), otherwise the
 * last section whose top passed the container top + 60px wins.
 */
export function useAcceptanceJourneySpy() {
  const sectionRefs: Record<AcceptanceSectionId, RefObject<HTMLElement | null>> = {
    prepare: useRef<HTMLElement>(null),
    showcase: useRef<HTMLElement>(null),
    minutes: useRef<HTMLElement>(null),
    archive: useRef<HTMLElement>(null)
  }
  const [activeSection, setActiveSection] = useState<AcceptanceSectionId>('prepare')
  // Set while a navigation click is settling; user activity clears it so the spy
  // does not fight the programmatic scroll.
  const navigation = useRef<AcceptanceSectionId | null>(null)
  const navigate = (id: AcceptanceSectionId) => {
    navigation.current = id
    setActiveSection(id)
    sectionRefs[id].current?.scrollIntoView({ block: 'start' })
  }
  /** Re-anchor after layout shifts (chat column toggle) without changing the active section. */
  const reanchor = (id: AcceptanceSectionId) => {
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
    let current: AcceptanceSectionId | undefined
    for (const [id] of ACCEPTANCE_SECTIONS) {
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
