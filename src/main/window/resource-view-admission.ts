import type { BrowserWindow } from 'electron'

export function isResourceWindowVisible(window: BrowserWindow | null): boolean {
  return !!window && !window.isDestroyed() && window.isVisible() && !window.isMinimized()
}
