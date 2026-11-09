/**
 * 评审通知入口的位置计算：按视口夹取、按相对边锚定并持久化。复制自
 * floating-terminal/floating-terminal-trigger-position，使用独立的存储键，
 * 避免与浮动工作区按钮互相覆盖位置。
 */
const TRIGGER_SIZE = 36
const DEFAULT_RIGHT_GAP = 64
const DEFAULT_BOTTOM_GAP = 16
const DRAG_MARGIN = 8
const TITLEBAR_SAFE_TOP = 36

const TRIGGER_POSITION_STORAGE_KEY = 'bw.pr-review-trigger-position.v1'

export type PrReviewTriggerPosition = {
  left: number
  top: number
}

export type PrReviewTriggerAnchorX = 'left' | 'right'
export type PrReviewTriggerAnchorY = 'top' | 'bottom'

export type PrReviewAnchoredTriggerPosition = {
  anchorX: PrReviewTriggerAnchorX
  anchorY: PrReviewTriggerAnchorY
  offsetX: number
  offsetY: number
}

export type PrReviewTriggerCommittedPosition =
  | PrReviewTriggerPosition
  | PrReviewAnchoredTriggerPosition

export type PrReviewTriggerPositionSource = 'default' | 'user'

function getViewport(): { width: number; height: number } {
  return {
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight
  }
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isAnchorX(value: unknown): value is PrReviewTriggerAnchorX {
  return value === 'left' || value === 'right'
}

function isAnchorY(value: unknown): value is PrReviewTriggerAnchorY {
  return value === 'top' || value === 'bottom'
}

function getWindowStorage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage !== undefined
    ? window.localStorage
    : null
}

function isAnchoredTriggerPosition(
  position: PrReviewTriggerCommittedPosition
): position is PrReviewAnchoredTriggerPosition {
  return 'anchorX' in position
}

export function getDefaultPrReviewTriggerCommittedPosition(): PrReviewAnchoredTriggerPosition {
  return {
    anchorX: 'right',
    anchorY: 'bottom',
    offsetX: DEFAULT_RIGHT_GAP,
    offsetY: DEFAULT_BOTTOM_GAP
  }
}

export function getDefaultPrReviewTriggerPosition(): PrReviewTriggerPosition {
  return resolvePrReviewTriggerCommittedPosition(getDefaultPrReviewTriggerCommittedPosition())
}

export function clampPrReviewTriggerPosition(
  position: PrReviewTriggerPosition
): PrReviewTriggerPosition {
  const viewport = getViewport()
  const maxLeft = Math.max(DRAG_MARGIN, viewport.width - TRIGGER_SIZE - DRAG_MARGIN)
  const maxTop = Math.max(TITLEBAR_SAFE_TOP, viewport.height - TRIGGER_SIZE - DRAG_MARGIN)
  return {
    left: Math.min(Math.max(DRAG_MARGIN, position.left), maxLeft),
    top: Math.min(Math.max(TITLEBAR_SAFE_TOP, position.top), maxTop)
  }
}

function hasUsableTriggerViewport(): boolean {
  const viewport = getViewport()
  return (
    viewport.width >= TRIGGER_SIZE + DRAG_MARGIN * 2 &&
    viewport.height >= TRIGGER_SIZE + TITLEBAR_SAFE_TOP + DRAG_MARGIN
  )
}

export function resolvePrReviewTriggerCommittedPosition(
  position: PrReviewTriggerCommittedPosition
): PrReviewTriggerPosition {
  if (!isAnchoredTriggerPosition(position)) {
    return position
  }
  const viewport = getViewport()
  return {
    left:
      position.anchorX === 'left'
        ? position.offsetX
        : viewport.width - TRIGGER_SIZE - position.offsetX,
    top:
      position.anchorY === 'top'
        ? position.offsetY
        : viewport.height - TRIGGER_SIZE - position.offsetY
  }
}

export function anchorPrReviewTriggerPosition(
  position: PrReviewTriggerPosition
): PrReviewAnchoredTriggerPosition | null {
  if (!hasUsableTriggerViewport()) {
    return null
  }
  const viewport = getViewport()
  const anchorX: PrReviewTriggerAnchorX =
    position.left + TRIGGER_SIZE / 2 <= viewport.width / 2 ? 'left' : 'right'
  const anchorY: PrReviewTriggerAnchorY =
    position.top + TRIGGER_SIZE / 2 <= viewport.height / 2 ? 'top' : 'bottom'
  return {
    anchorX,
    anchorY,
    offsetX: anchorX === 'left' ? position.left : viewport.width - position.left - TRIGGER_SIZE,
    offsetY: anchorY === 'top' ? position.top : viewport.height - position.top - TRIGGER_SIZE
  }
}

export function shouldReconcilePrReviewTriggerPosition(
  source: PrReviewTriggerPositionSource
): boolean {
  return source === 'default' || hasUsableTriggerViewport()
}

export function resolvePrReviewTriggerPosition(
  position: PrReviewTriggerCommittedPosition,
  source: PrReviewTriggerPositionSource
): PrReviewTriggerPosition {
  if (source === 'default') {
    return getDefaultPrReviewTriggerPosition()
  }
  return clampPrReviewTriggerPosition(resolvePrReviewTriggerCommittedPosition(position))
}

export function parsePrReviewTriggerPosition(
  serialized: string | null
): PrReviewTriggerCommittedPosition | null {
  if (!serialized) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (
      isAnchorX(record.anchorX) &&
      isAnchorY(record.anchorY) &&
      isFiniteCoordinate(record.offsetX) &&
      isFiniteCoordinate(record.offsetY)
    ) {
      return {
        anchorX: record.anchorX,
        anchorY: record.anchorY,
        offsetX: record.offsetX,
        offsetY: record.offsetY
      }
    }
    if (!isFiniteCoordinate(record.left) || !isFiniteCoordinate(record.top)) {
      return null
    }
    return { left: record.left, top: record.top }
  } catch {
    return null
  }
}

export function readPersistedPrReviewTriggerPosition(): PrReviewTriggerCommittedPosition | null {
  try {
    return parsePrReviewTriggerPosition(
      getWindowStorage()?.getItem(TRIGGER_POSITION_STORAGE_KEY) ?? null
    )
  } catch {
    return null
  }
}

export function persistPrReviewTriggerPosition(position: PrReviewTriggerCommittedPosition): void {
  try {
    getWindowStorage()?.setItem(TRIGGER_POSITION_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // localStorage 不可用时只保留本次会话内的位置。
  }
}
