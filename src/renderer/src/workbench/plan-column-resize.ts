export const PLAN_CHAT_MIN_PX = 280
export const PLAN_RIGHT_MIN_PX = 360
export const PLAN_CHAT_DEFAULT_RATIO = 0.3
export const PLAN_COLUMN_RATIO_STORAGE_KEY = 'workbench.plan.chatRatio'
export const PLAN_CHAT_COLLAPSED_STORAGE_KEY = 'workbench.plan.chatCollapsed'
export const PLAN_CHAT_COLLAPSED_RAIL_PX = 36
export const PLAN_CHAT_REVEAL_EVENT = 'workbench:reveal-plan-chat'

export function revealPlanChat(): void {
  writePlanChatCollapsed(false)
  window.dispatchEvent(new Event(PLAN_CHAT_REVEAL_EVENT))
}

export function clampPlanChatWidth(width: number, containerWidth: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(containerWidth) || containerWidth <= 0) {
    return PLAN_CHAT_MIN_PX
  }
  const maxWidth = Math.max(PLAN_CHAT_MIN_PX, containerWidth - PLAN_RIGHT_MIN_PX)
  return Math.min(maxWidth, Math.max(PLAN_CHAT_MIN_PX, width))
}

export function planChatWidthFromRatio(ratio: number, containerWidth: number): number {
  return clampPlanChatWidth(ratio * containerWidth, containerWidth)
}

export function planChatRatioFromWidth(width: number, containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return PLAN_CHAT_DEFAULT_RATIO
  }
  return clampPlanChatWidth(width, containerWidth) / containerWidth
}

export function parsePlanChatRatio(raw: string | null): number {
  const parsed = raw == null ? Number.NaN : Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 1) {
    return PLAN_CHAT_DEFAULT_RATIO
  }
  return parsed
}

export function readPlanChatRatio(): number {
  try {
    return parsePlanChatRatio(window.localStorage.getItem(PLAN_COLUMN_RATIO_STORAGE_KEY))
  } catch {
    return PLAN_CHAT_DEFAULT_RATIO
  }
}

export function writePlanChatRatio(ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0 || ratio >= 1) {
    return
  }
  try {
    window.localStorage.setItem(PLAN_COLUMN_RATIO_STORAGE_KEY, String(ratio))
  } catch {
    // Quota / private mode — the in-memory ratio still applies this session.
  }
}

export function readPlanChatCollapsed(): boolean {
  try {
    return window.localStorage.getItem(PLAN_CHAT_COLLAPSED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writePlanChatCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(PLAN_CHAT_COLLAPSED_STORAGE_KEY, String(collapsed))
  } catch {
    // Quota / private mode — the in-memory state still applies this session.
  }
}
