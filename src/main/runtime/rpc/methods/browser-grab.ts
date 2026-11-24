import { defineMethod } from '../core'
import { BrowserTarget } from '../schemas'
import {
  BrowserGrabAwait,
  BrowserGrabScreenshot,
  BrowserGrabSetMode
} from '../../../../shared/rpc-contract/browser-grab-params'

export const BROWSER_GRAB_METHODS = [
  defineMethod({
    name: 'browser.grab.setMode',
    params: BrowserGrabSetMode,
    handler: async (params, { runtime }) => runtime.browserGrabSetMode(params)
  }),
  defineMethod({
    name: 'browser.grab.await',
    params: BrowserGrabAwait,
    handler: async (params, { runtime, signal }) => runtime.browserGrabAwait(params, signal)
  }),
  defineMethod({
    name: 'browser.grab.cancel',
    params: BrowserTarget,
    handler: async (params, { runtime }) => runtime.browserGrabCancel(params)
  }),
  defineMethod({
    name: 'browser.grab.screenshot',
    params: BrowserGrabScreenshot,
    handler: async (params, { runtime }) => runtime.browserGrabScreenshot(params)
  })
]
