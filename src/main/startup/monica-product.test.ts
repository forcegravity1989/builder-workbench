import { describe, expect, it } from 'vitest'
import {
  clampMonicaDefaultWindowBounds,
  isMonicaProduct,
  MONICA_DEFAULT_WINDOW_HEIGHT,
  MONICA_DEFAULT_WINDOW_WIDTH
} from './monica-product'

describe('isMonicaProduct', () => {
  it('detects ORCA_PRODUCT_NAME=Monica', () => {
    expect(isMonicaProduct({ ORCA_PRODUCT_NAME: 'Monica' })).toBe(true)
  })

  it('detects MONICA_SHELL=1', () => {
    expect(isMonicaProduct({ MONICA_SHELL: '1' })).toBe(true)
  })

  it('is false for plain Orca env', () => {
    expect(isMonicaProduct({})).toBe(false)
  })
})

describe('clampMonicaDefaultWindowBounds', () => {
  it('uses 1920×1080 when the work area is large enough', () => {
    expect(clampMonicaDefaultWindowBounds({ width: 2560, height: 1440 })).toEqual({
      width: MONICA_DEFAULT_WINDOW_WIDTH,
      height: MONICA_DEFAULT_WINDOW_HEIGHT
    })
  })

  it('shrinks to the work area on smaller laptop displays', () => {
    expect(clampMonicaDefaultWindowBounds({ width: 1440, height: 900 })).toEqual({
      width: 1440,
      height: 900
    })
  })
})
