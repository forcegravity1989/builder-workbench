import { describe, expect, it } from 'vitest'
import { getRemoteBrowserFrameStyle } from './remote-browser-frame-style'

describe('getRemoteBrowserFrameStyle', () => {
  it('fits the CSS viewport aspect even when stale metadata reports an oversized bitmap', () => {
    expect(
      getRemoteBrowserFrameStyle({
        imageWidth: 2266,
        imageHeight: 1309,
        deviceWidth: 958,
        deviceHeight: 609
      })
    ).toEqual({
      inset: 0,
      margin: 'auto',
      width: `min(100cqw, calc(100cqh * ${958 / 609}))`,
      height: `min(100cqh, calc(100cqw / ${958 / 609}))`,
      objectFit: 'fill'
    })
  })

  it('centers correctly sized frames within the available viewport', () => {
    expect(
      getRemoteBrowserFrameStyle({
        imageWidth: 958,
        imageHeight: 609,
        deviceWidth: 958,
        deviceHeight: 609
      })
    ).toEqual({
      inset: 0,
      margin: 'auto',
      width: `min(100cqw, calc(100cqh * ${958 / 609}))`,
      height: `min(100cqh, calc(100cqw / ${958 / 609}))`,
      objectFit: 'fill'
    })
  })

  it('does not crop high-DPI frames with a uniform device scale', () => {
    expect(
      getRemoteBrowserFrameStyle({
        imageWidth: 1998,
        imageHeight: 1218,
        deviceWidth: 999,
        deviceHeight: 609
      })
    ).toEqual({
      inset: 0,
      margin: 'auto',
      width: `min(100cqw, calc(100cqh * ${999 / 609}))`,
      height: `min(100cqh, calc(100cqw / ${999 / 609}))`,
      objectFit: 'fill'
    })
  })

  it('does not crop slightly uneven high-DPI frames after navigation', () => {
    expect(
      getRemoteBrowserFrameStyle({
        imageWidth: 3278,
        imageHeight: 2070,
        deviceWidth: 999,
        deviceHeight: 609
      })
    ).toEqual({
      inset: 0,
      margin: 'auto',
      width: `min(100cqw, calc(100cqh * ${999 / 609}))`,
      height: `min(100cqh, calc(100cqw / ${999 / 609}))`,
      objectFit: 'fill'
    })
  })

  it('ignores malformed bitmap dimensions when fitting the CSS viewport', () => {
    expect(
      getRemoteBrowserFrameStyle({
        imageWidth: 10,
        imageHeight: 10,
        deviceWidth: 958,
        deviceHeight: 609
      })
    ).toEqual({
      inset: 0,
      margin: 'auto',
      width: `min(100cqw, calc(100cqh * ${958 / 609}))`,
      height: `min(100cqh, calc(100cqw / ${958 / 609}))`,
      objectFit: 'fill'
    })
  })
})
