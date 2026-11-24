import { describe, expect, it } from 'vitest'
import { isElementRevealedInScrollContainer } from './worktree-sidebar-reveal'

function makeContainer(scrollTop: number, clientHeight: number) {
  const container = {
    clientHeight,
    scrollTop,
    contains: () => true,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, bottom: clientHeight })
  }
  return { container: container as unknown as HTMLElement }
}

function makeElement(top: number, bottom: number): Element {
  return {
    getBoundingClientRect: () => ({ top, bottom }),
    hasAttribute: () => false,
    closest: () => null
  } as unknown as Element
}

describe('isElementRevealedInScrollContainer', () => {
  it('is true when the element sits inside the viewport below the top inset', () => {
    const { container } = makeContainer(0, 673)
    expect(isElementRevealedInScrollContainer(container, makeElement(200, 260))).toBe(true)
  })

  it('is false when a scroll correction pushed the element below the fold', () => {
    const { container } = makeContainer(0, 673)
    expect(isElementRevealedInScrollContainer(container, makeElement(1005, 1060))).toBe(false)
  })

  it('is false when the element is scrolled above the top inset', () => {
    const { container } = makeContainer(0, 673)
    expect(isElementRevealedInScrollContainer(container, makeElement(10, 30))).toBe(false)
  })

  it('is false when the element is not inside the container', () => {
    const { container } = makeContainer(0, 673)
    ;(container as unknown as { contains: () => boolean }).contains = () => false
    expect(isElementRevealedInScrollContainer(container, makeElement(200, 260))).toBe(false)
  })
})
