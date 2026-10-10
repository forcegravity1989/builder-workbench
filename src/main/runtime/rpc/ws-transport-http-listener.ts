/**
 * Plain-HTTP request routing for the WS transport's server.
 *
 * The custom handler (serve mode's automation webhooks) claims its own path
 * prefix first; unclaimed paths fall through to the bundled web client, and a
 * transport with no static root answers 404 rather than stalling the socket —
 * once any handler exists, an unclaimed path deserves an answer.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createStaticWebClientHandler } from './static-web-client-handler'

/** Returns true when it wrote a response; false falls through to the next handler. */
export type HttpUpgradeRequestHandler = (req: IncomingMessage, res: ServerResponse) => boolean

export function composeHttpRequestListener(
  customHandler: HttpUpgradeRequestHandler,
  staticHandler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (customHandler(req, res)) {
      return
    }
    if (staticHandler) {
      staticHandler(req, res)
      return
    }
    res.writeHead(404)
    res.end()
  }
}

/**
 * The transport's whole plain-HTTP face: the static web client when present,
 * composed behind the custom handler when serve mode mounted one.
 */
export function requestListenerFor(
  staticRoot: string | undefined,
  customHandler: HttpUpgradeRequestHandler | undefined
): ((req: IncomingMessage, res: ServerResponse) => void) | undefined {
  const staticHandler = staticRoot ? createStaticWebClientHandler(staticRoot) : undefined
  return customHandler ? composeHttpRequestListener(customHandler, staticHandler) : staticHandler
}
