// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import {
  clampPlanChatWidth,
  parsePlanChatRatio,
  PLAN_CHAT_DEFAULT_RATIO,
  PLAN_CHAT_MIN_PX,
  PLAN_COLUMN_RATIO_STORAGE_KEY,
  PLAN_RIGHT_MIN_PX,
  planChatRatioFromWidth,
  planChatWidthFromRatio,
  readPlanChatRatio,
  writePlanChatRatio
} from './plan-column-resize'

describe('plan column resize', () => {
  afterEach(() => {
    window.localStorage.removeItem(PLAN_COLUMN_RATIO_STORAGE_KEY)
  })

  it('keeps the chat column between its min and the remaining right min', () => {
    expect(clampPlanChatWidth(100, 1200)).toBe(PLAN_CHAT_MIN_PX)
    expect(clampPlanChatWidth(400, 1200)).toBe(400)
    expect(clampPlanChatWidth(1100, 1200)).toBe(1200 - PLAN_RIGHT_MIN_PX)
  })

  it('round-trips a ratio through pixel width', () => {
    const containerWidth = 1000
    const width = planChatWidthFromRatio(0.4, containerWidth)
    expect(width).toBe(400)
    expect(planChatRatioFromWidth(width, containerWidth)).toBe(0.4)
  })

  it('falls back to the default ratio for junk storage', () => {
    expect(parsePlanChatRatio(null)).toBe(PLAN_CHAT_DEFAULT_RATIO)
    expect(parsePlanChatRatio('nope')).toBe(PLAN_CHAT_DEFAULT_RATIO)
    expect(parsePlanChatRatio('0')).toBe(PLAN_CHAT_DEFAULT_RATIO)
    expect(parsePlanChatRatio('1')).toBe(PLAN_CHAT_DEFAULT_RATIO)
    expect(parsePlanChatRatio('0.45')).toBe(0.45)
  })

  it('persists a valid ratio', () => {
    writePlanChatRatio(0.42)
    expect(readPlanChatRatio()).toBe(0.42)
    writePlanChatRatio(2)
    expect(readPlanChatRatio()).toBe(0.42)
  })
})
