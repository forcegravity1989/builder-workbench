import { describe, expect, it } from 'vitest'
import {
  clampWorkbenchDefaultWindowBounds,
  isWorkbenchProduct,
  WORKBENCH_DEFAULT_WINDOW_HEIGHT,
  WORKBENCH_DEFAULT_WINDOW_WIDTH
} from './workbench-product'

describe('isWorkbenchProduct', () => {
  it('detects ORCA_PRODUCT_NAME=Workbench', () => {
    expect(isWorkbenchProduct({ ORCA_PRODUCT_NAME: 'Workbench' })).toBe(true)
  })

  it('detects WORKBENCH_SHELL=1', () => {
    expect(isWorkbenchProduct({ WORKBENCH_SHELL: '1' })).toBe(true)
  })

  it('is false for plain Orca env', () => {
    expect(isWorkbenchProduct({})).toBe(false)
  })
})

describe('clampWorkbenchDefaultWindowBounds', () => {
  it('uses 1920×1080 when the work area is large enough', () => {
    expect(clampWorkbenchDefaultWindowBounds({ width: 2560, height: 1440 })).toEqual({
      width: WORKBENCH_DEFAULT_WINDOW_WIDTH,
      height: WORKBENCH_DEFAULT_WINDOW_HEIGHT
    })
  })

  it('shrinks to the work area on smaller laptop displays', () => {
    expect(clampWorkbenchDefaultWindowBounds({ width: 1440, height: 900 })).toEqual({
      width: 1440,
      height: 900
    })
  })
})
