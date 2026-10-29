/**
 * 项目群浮动按钮/面板的拖拽定位（pr-review-notify 方案一）。
 * 照浮动工作区按钮的定位模式：按钮按锚点持久化（窗口尺寸变化后仍在同一角落）、
 * 视口夹取、resize 重对齐；面板默认锚在按钮上方，被人拖过后独立记忆位置。
 */

const TRIGGER_SIZE = 36
const PANEL_WIDTH = 340
const PANEL_HEIGHT = 420
const DRAG_MARGIN = 8
const TITLEBAR_SAFE_TOP = 36
const DEFAULT_RIGHT_GAP = 24
const DEFAULT_BOTTOM_GAP = 124
const PANEL_GAP = 12

const TRIGGER_STORAGE_KEY = 'bw-project-chat-trigger-position-v1'
const PANEL_STORAGE_KEY = 'bw-project-chat-panel-position-v1'

export type ProjectChatPosition = { left: number; top: number }

export type ProjectChatAnchor = {
  anchorX: 'left' | 'right'
  anchorY: 'top' | 'bottom'
  offsetX: number
  offsetY: number
}

/** 按钮的持久化形态：锚点偏移（随窗口尺寸重解析）或原始坐标。 */
export type ProjectChatCommittedPosition = ProjectChatPosition | ProjectChatAnchor

export type ProjectChatPositionSource = 'default' | 'user'

function getViewport(): { width: number; height: number } {
  return {
    width: typeof window === 'undefined' ? 1200 : window.innerWidth,
    height: typeof window === 'undefined' ? 800 : window.innerHeight
  }
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getWindowStorage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage !== undefined
    ? window.localStorage
    : null
}

function clampToViewport(
  position: ProjectChatPosition,
  width: number,
  height: number
): ProjectChatPosition {
  const viewport = getViewport()
  const maxLeft = Math.max(DRAG_MARGIN, viewport.width - width - DRAG_MARGIN)
  const maxTop = Math.max(TITLEBAR_SAFE_TOP, viewport.height - height - DRAG_MARGIN)
  return {
    left: Math.min(Math.max(DRAG_MARGIN, position.left), maxLeft),
    top: Math.min(Math.max(TITLEBAR_SAFE_TOP, position.top), maxTop)
  }
}

export function clampProjectChatTriggerPosition(
  position: ProjectChatPosition
): ProjectChatPosition {
  return clampToViewport(position, TRIGGER_SIZE, TRIGGER_SIZE)
}

export function clampProjectChatPanelPosition(position: ProjectChatPosition): ProjectChatPosition {
  return clampToViewport(position, PANEL_WIDTH, PANEL_HEIGHT)
}

function isAnchoredPosition(position: ProjectChatCommittedPosition): position is ProjectChatAnchor {
  return 'anchorX' in position
}

export function resolveProjectChatCommittedPosition(
  position: ProjectChatCommittedPosition
): ProjectChatPosition {
  if (!isAnchoredPosition(position)) {
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

/** 还原成锚点持久化；视口小到放不下控件时不落盘（保持会话内位置）。 */
export function anchorProjectChatTriggerPosition(
  position: ProjectChatPosition
): ProjectChatAnchor | null {
  const viewport = getViewport()
  if (
    viewport.width < TRIGGER_SIZE + DRAG_MARGIN * 2 ||
    viewport.height < TRIGGER_SIZE + TITLEBAR_SAFE_TOP + DRAG_MARGIN
  ) {
    return null
  }
  const anchorX: ProjectChatAnchor['anchorX'] =
    position.left + TRIGGER_SIZE / 2 <= viewport.width / 2 ? 'left' : 'right'
  const anchorY: ProjectChatAnchor['anchorY'] =
    position.top + TRIGGER_SIZE / 2 <= viewport.height / 2 ? 'top' : 'bottom'
  return {
    anchorX,
    anchorY,
    offsetX: anchorX === 'left' ? position.left : viewport.width - position.left - TRIGGER_SIZE,
    offsetY: anchorY === 'top' ? position.top : viewport.height - position.top - TRIGGER_SIZE
  }
}

export function getDefaultProjectChatTriggerCommittedPosition(): ProjectChatAnchor {
  // 默认停在浮动工作区按钮正上方（right-6 / bottom-[124px] 的既有落点）。
  return {
    anchorX: 'right',
    anchorY: 'bottom',
    offsetX: DEFAULT_RIGHT_GAP,
    offsetY: DEFAULT_BOTTOM_GAP
  }
}

export function shouldReconcileProjectChatTriggerPosition(
  source: ProjectChatPositionSource
): boolean {
  if (source === 'default') {
    return true
  }
  const viewport = getViewport()
  return (
    viewport.width >= TRIGGER_SIZE + DRAG_MARGIN * 2 &&
    viewport.height >= TRIGGER_SIZE + TITLEBAR_SAFE_TOP + DRAG_MARGIN
  )
}

export function resolveProjectChatTriggerPosition(
  position: ProjectChatCommittedPosition,
  source: ProjectChatPositionSource
): ProjectChatPosition {
  if (source === 'default') {
    return clampProjectChatTriggerPosition(
      resolveProjectChatCommittedPosition(getDefaultProjectChatTriggerCommittedPosition())
    )
  }
  return clampProjectChatTriggerPosition(resolveProjectChatCommittedPosition(position))
}

export function parseProjectChatTriggerPosition(
  serialized: string | null
): ProjectChatCommittedPosition | null {
  if (!serialized) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null
    }
    const record = parsed as Record<string, unknown>
    if (
      (record.anchorX === 'left' || record.anchorX === 'right') &&
      (record.anchorY === 'top' || record.anchorY === 'bottom') &&
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

export function readPersistedProjectChatTriggerPosition(): ProjectChatCommittedPosition | null {
  try {
    return parseProjectChatTriggerPosition(getWindowStorage()?.getItem(TRIGGER_STORAGE_KEY) ?? null)
  } catch {
    return null
  }
}

export function persistProjectChatTriggerPosition(position: ProjectChatCommittedPosition): void {
  try {
    getWindowStorage()?.setItem(TRIGGER_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // localStorage 不可用时按钮位置只活在本次会话。
  }
}

export function readPersistedProjectChatPanelPosition(): ProjectChatPosition | null {
  try {
    const raw = getWindowStorage()?.getItem(PANEL_STORAGE_KEY) ?? null
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed) ||
      !isFiniteCoordinate((parsed as Record<string, unknown>).left) ||
      !isFiniteCoordinate((parsed as Record<string, unknown>).top)
    ) {
      return null
    }
    return {
      left: (parsed as Record<string, unknown>).left as number,
      top: (parsed as Record<string, unknown>).top as number
    }
  } catch {
    return null
  }
}

export function persistProjectChatPanelPosition(position: ProjectChatPosition): void {
  try {
    getWindowStorage()?.setItem(PANEL_STORAGE_KEY, JSON.stringify(position))
  } catch {
    // 同按钮：存不进就丢，位置退回会话内。
  }
}

/** 面板默认位：按钮上方右对齐；上方放不下翻到按钮下方，再夹进视口。 */
export function defaultProjectChatPanelPosition(trigger: ProjectChatPosition): ProjectChatPosition {
  const aboveTop = trigger.top - PANEL_GAP - PANEL_HEIGHT
  const top = aboveTop >= TITLEBAR_SAFE_TOP ? aboveTop : trigger.top + TRIGGER_SIZE + PANEL_GAP
  return clampProjectChatPanelPosition({
    left: trigger.left + TRIGGER_SIZE - PANEL_WIDTH,
    top
  })
}
