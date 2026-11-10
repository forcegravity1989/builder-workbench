import { describe, expect, it } from 'vitest'
import {
  browserPageZoomLevelToPercent,
  nextBrowserPageZoomLevel,
  normalizeBrowserPageZoomLevel
} from '../../../../../shared/browser-page-zoom'

const levelAt = (percent: number): number => Math.log(percent / 100) / Math.log(1.2)

describe('browserPageZoomLevelToPercent', () => {
  it('maps Electron zoom levels to Chromium preset percentages', () => {
    expect(browserPageZoomLevelToPercent(0)).toBe(100)
    expect(browserPageZoomLevelToPercent(0.5)).toBe(110)
    expect(browserPageZoomLevelToPercent(-0.5)).toBe(90)
    expect(browserPageZoomLevelToPercent(5)).toBe(250)
  })
})

describe('normalizeBrowserPageZoomLevel', () => {
  it('snaps to the nearest supported preset and clamps both bounds', () => {
    expect(normalizeBrowserPageZoomLevel(1.24)).toBeCloseTo(levelAt(125))
    expect(normalizeBrowserPageZoomLevel(1.26)).toBeCloseTo(levelAt(125))
    expect(normalizeBrowserPageZoomLevel(10)).toBeCloseTo(levelAt(500))
    expect(normalizeBrowserPageZoomLevel(-10)).toBeCloseTo(levelAt(25))
    expect(normalizeBrowserPageZoomLevel(Number.NaN)).toBe(0)
  })
})

describe('nextBrowserPageZoomLevel', () => {
  it('steps between presets, clamps both bounds and resets to 100 percent', () => {
    expect(nextBrowserPageZoomLevel(0, 'in')).toBeCloseTo(levelAt(110))
    expect(nextBrowserPageZoomLevel(0, 'out')).toBeCloseTo(levelAt(90))
    expect(nextBrowserPageZoomLevel(3, 'reset')).toBe(0)
    expect(nextBrowserPageZoomLevel(levelAt(500), 'in')).toBeCloseTo(levelAt(500))
    expect(nextBrowserPageZoomLevel(levelAt(25), 'out')).toBeCloseTo(levelAt(25))
  })

  it('resets to the configured default zoom preset', () => {
    expect(nextBrowserPageZoomLevel(3, 'reset', 1)).toBeCloseTo(levelAt(125))
    expect(nextBrowserPageZoomLevel(3, 'reset', 1.26)).toBeCloseTo(levelAt(125))
  })
})
