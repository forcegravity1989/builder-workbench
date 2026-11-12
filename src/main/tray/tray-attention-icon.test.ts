import { describe, expect, it, vi } from 'vitest'

const createFromBitmapMock = vi.hoisted(() =>
  vi.fn((buffer: Buffer, options: { width: number; height: number }) => ({
    __image: true,
    buffer,
    ...options
  }))
)

vi.mock('electron', () => ({
  nativeImage: { createFromBitmap: createFromBitmapMock }
}))

import { composeTrayAttentionIcon } from './tray-attention-icon'

// The compositor receives BGRA. amber-500 = #f59e0b.
const AMBER = { b: 0x0b, g: 0x9e, r: 0xf5 }

describe('composeTrayAttentionIcon', () => {
  it('returns the base unchanged when it has no pixels', () => {
    const base = { getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) }

    expect(composeTrayAttentionIcon(base as never)).toBe(base)
    expect(createFromBitmapMock).not.toHaveBeenCalled()
  })

  it('reads the requested Retina pixels and creates the corresponding image size', () => {
    createFromBitmapMock.mockClear()
    const toBitmap = vi.fn(() => Buffer.alloc(32 * 32 * 4))
    const result = composeTrayAttentionIcon(
      { getSize: () => ({ width: 16, height: 16 }), toBitmap } as never,
      2
    )

    expect(createFromBitmapMock).toHaveBeenCalledTimes(1)
    const [, options] = createFromBitmapMock.mock.calls[0]
    expect(toBitmap).toHaveBeenCalledWith({ scaleFactor: 2 })
    expect(options).toEqual({ width: 32, height: 32 })
    expect(result).toMatchObject({ __image: true, width: 32, height: 32 })
  })

  it('paints an amber dot in the top-right corner and leaves the rest untouched', () => {
    createFromBitmapMock.mockClear()
    const width = 16
    const height = 16
    const source = Buffer.alloc(width * height * 4)
    for (let i = 0; i < source.length; i += 4) {
      source.set([0x12, 0x34, 0x56, 0xff], i)
    }
    const original = Buffer.from(source)
    composeTrayAttentionIcon({
      getSize: () => ({ width, height }),
      toBitmap: () => source
    } as never)
    const bitmap = createFromBitmapMock.mock.calls[0][0]

    const pixel = (x: number, y: number): [number, number, number, number] => {
      const o = (y * width + x) * 4
      return [bitmap[o], bitmap[o + 1], bitmap[o + 2], bitmap[o + 3]]
    }

    // The dot must exist, be centered in the top-right, and never touch the
    // opposite (bottom-left) corner where the app glyph is most visible.
    let amberCount = 0
    let sumX = 0
    let sumY = 0
    let paintedInBottomLeft = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [b, g, r, a] = pixel(x, y)
        if (b === AMBER.b && g === AMBER.g && r === AMBER.r && a === 0xff) {
          amberCount++
          sumX += x
          sumY += y
        }
        if (
          x < width / 2 &&
          y >= height / 2 &&
          (b !== 0x12 || g !== 0x34 || r !== 0x56 || a !== 0xff)
        ) {
          paintedInBottomLeft++
        }
      }
    }

    expect(amberCount).toBeGreaterThan(0)
    expect(sumX / amberCount).toBeGreaterThan(width / 2) // centroid sits right of center
    expect(sumY / amberCount).toBeLessThan(height / 2) // centroid sits above center
    expect(paintedInBottomLeft).toBe(0) // the product colors remain intact
    expect(source).toEqual(original)
  })
})
