import { animateActionIcon } from './action-icon-keyframes'

const ACTION = [
  'button',
  'a[href]',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[role="switch"]'
].join(', ')
const ICON = 'svg.lucide, [data-workbench-action-icon]'
const STATIC_ICON = [
  '.lucide-loader',
  '.lucide-loader-circle',
  '.animate-spin',
  '[data-slot$="-indicator"] svg'
].join(', ')
const INACTIVE = ':disabled, [aria-disabled="true"], [aria-busy="true"], [inert]'
const SELECT_ITEM = '[data-slot="select-item"]'
// A nested Radix Slot can replace the trigger's data-slot with its own.
const SELECT_TRIGGER = 'button[role="combobox"][aria-expanded][data-state]'
const MENU_TRIGGER = `button[aria-haspopup="menu"][aria-expanded][data-state], ${SELECT_TRIGGER}`
const KEYBOARD_ACTION = `${MENU_TRIGGER}, ${SELECT_ITEM}`
const CLOSING_MENU = '[role="menu"][data-state="closed"], [role="listbox"][data-state="closed"]'

type SnapshotIcon = HTMLElement | SVGSVGElement

function findActionIcon(target: Element): Element | undefined {
  const action = target.closest(ACTION)
  if (!action || action.closest(INACTIVE)) {
    return undefined
  }

  const clickedIcon = target.closest(ICON)
  if (clickedIcon && clickedIcon.closest(ACTION) === action) {
    return clickedIcon.matches(STATIC_ICON) ? undefined : clickedIcon
  }

  return Array.from(action.querySelectorAll(ICON)).find(
    (icon) =>
      icon.closest(ACTION) === action &&
      !icon.matches(STATIC_ICON) &&
      icon.getClientRects().length > 0 &&
      getComputedStyle(icon).visibility === 'visible'
  )
}

function snapshotIcon(icon: Element): (() => SnapshotIcon) | undefined {
  if (!(icon instanceof SVGSVGElement || icon instanceof HTMLElement)) {
    return undefined
  }
  const { left, top, width, height } = icon.getBoundingClientRect()
  const { color, fill, stroke, strokeWidth } = getComputedStyle(icon)
  return () => {
    const copy = icon.cloneNode(true) as SnapshotIcon
    copy.removeAttribute('id')
    copy.setAttribute('aria-hidden', 'true')
    copy.setAttribute('focusable', 'false')
    Object.assign(copy.style, {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      color,
      fill,
      stroke,
      strokeWidth,
      pointerEvents: 'none',
      zIndex: '2147483647'
    })
    return copy
  }
}

export function installActionIconMotion(): () => void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const active = new Map<Element, Animation[]>()

  function cancelAnimations(): void {
    for (const animations of active.values()) {
      animations.forEach((animation) => animation.cancel())
    }
    active.clear()
  }

  function track(icon: Element, animations: Animation[], copy?: SnapshotIcon): void {
    active.set(icon, animations)
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      copy?.remove()
      if (active.get(icon) === animations) {
        active.delete(icon)
      }
    })
  }

  function playFrom(target: EventTarget | null): void {
    if (reducedMotion.matches || !(target instanceof Element)) {
      return
    }
    const icon = findActionIcon(target)
    if (!icon) {
      return
    }
    active.get(icon)?.forEach((animation) => animation.cancel())
    const snapshot = snapshotIcon(icon)
    const animations = animateActionIcon(icon)
    track(icon, animations)
    if (snapshot) {
      // A close action can remove the icon or leave it inside a fading menu.
      window.requestAnimationFrame(() => {
        if (active.get(icon) !== animations || (icon.isConnected && !icon.closest(CLOSING_MENU))) {
          return
        }
        animations.forEach((animation) => animation.cancel())
        const copy = snapshot()
        document.body.append(copy)
        const fade = copy.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 240,
          fill: 'forwards'
        })
        track(icon, [...animateActionIcon(copy), fade], copy)
      })
    }
  }

  function onClick(event: MouseEvent): void {
    if (event.button !== 0) {
      return
    }
    if (
      event instanceof PointerEvent &&
      event.pointerType === 'mouse' &&
      event.target instanceof Element &&
      event.target.closest(KEYBOARD_ACTION)
    ) {
      return
    }
    playFrom(event.target)
  }

  function onPointerDown(event: PointerEvent): void {
    if (
      event.button === 0 &&
      event.pointerType === 'mouse' &&
      !event.ctrlKey &&
      event.target instanceof Element &&
      event.target.closest(MENU_TRIGGER)
    ) {
      playFrom(event.target)
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (
      event.button === 0 &&
      event.pointerType === 'mouse' &&
      event.target instanceof Element &&
      event.target.closest(SELECT_ITEM)
    ) {
      playFrom(event.target)
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || event.isComposing || !(event.target instanceof Element)) {
      return
    }
    const control = event.target.closest(KEYBOARD_ACTION)
    if (!control) {
      return
    }
    const opensMenu =
      !control.matches(SELECT_ITEM) &&
      (event.key === 'ArrowDown' || (event.key === 'ArrowUp' && control.matches(SELECT_TRIGGER)))
    if (event.key === 'Enter' || event.key === ' ' || opensMenu) {
      playFrom(event.target)
    }
  }

  // Capture also sees clicks on portal controls before their actions unmount them.
  document.addEventListener('click', onClick, true)
  // Radix handles these activations directly and may suppress the native click.
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointerup', onPointerUp, true)
  document.addEventListener('keydown', onKeyDown, true)
  reducedMotion.addEventListener('change', cancelAnimations)
  return () => {
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('pointerup', onPointerUp, true)
    document.removeEventListener('keydown', onKeyDown, true)
    reducedMotion.removeEventListener('change', cancelAnimations)
    cancelAnimations()
  }
}
