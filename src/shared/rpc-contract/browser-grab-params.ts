import { z } from 'zod'
import { BrowserTarget, requiredString } from './rpc-param-primitives'

// Why: these mirror the arguments of Orca's local element picker so a remote pane can drive the same
// picker on the host page; the page is addressed by id like every other browser command.
export const BrowserGrabSetMode = BrowserTarget.extend({
  enabled: z.boolean()
})

export const BrowserGrabAwait = BrowserTarget.extend({
  opId: requiredString('Missing required opId')
})

export const BrowserGrabScreenshot = BrowserTarget.extend({
  rect: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite()
  })
})
