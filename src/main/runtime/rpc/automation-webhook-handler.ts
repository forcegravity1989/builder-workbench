/**
 * Serve-mode webhook trigger endpoint: POST /webhooks/automations/<id> with the
 * record's per-task token, dispatches through the same runNow chain the manual
 * button uses. Honest 4xx answers only — a refused call never triggers and never
 * writes a run row (design「错误处理」).
 *
 * Mounted on the serve WebSocket port's plain-HTTP face; desktop mode never
 * constructs one, so no endpoint exists to answer there.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Automation, AutomationWebhookRunResult } from '../../../shared/automations-types'
import { isAutomationWebhookTokenMatch } from '../../automations/webhook-token'

const WEBHOOK_PATH_PREFIX = '/webhooks/automations/'
const TOKEN_HEADER = 'x-webhook-token'

export type AutomationWebhookHandlerDeps = {
  getAutomation: (id: string) => Automation | null | undefined
  runWebhook: (id: string) => Promise<AutomationWebhookRunResult>
}

/** The runtime surface the endpoint needs; structural so tests can stub it. */
export type AutomationWebhookRuntime = {
  listAutomationsForScope(): { automations: Automation[] }
  runAutomationWebhook(id: string): Promise<AutomationWebhookRunResult>
}

/** Adapts the runtime to the endpoint deps so the launcher only wires. */
export function createRuntimeAutomationWebhookHandler(
  runtime: AutomationWebhookRuntime
): (req: IncomingMessage, res: ServerResponse) => boolean {
  return createAutomationWebhookHandler({
    getAutomation: (id) =>
      runtime.listAutomationsForScope().automations.find((entry) => entry.id === id) ?? null,
    runWebhook: (id) => runtime.runAutomationWebhook(id)
  })
}

function sendJson(res: ServerResponse, status: number, body: Record<string, string>): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function automationIdFromPath(url: string): string | null {
  const path = url.slice(WEBHOOK_PATH_PREFIX.length).split('?')[0]
  if (path.length === 0 || path.includes('/')) {
    return null
  }
  return path
}

async function handleWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AutomationWebhookHandlerDeps
): Promise<void> {
  // The request body carries no semantics; drain it so a keep-alive connection
  // isn't left with unread bytes stalling the next request.
  req.resume()
  const id = automationIdFromPath(req.url ?? '')
  if (id === null) {
    sendJson(res, 404, { error: 'not found' })
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return
  }
  const automation = deps.getAutomation(id)
  if (!automation) {
    sendJson(res, 404, { error: 'automation not found' })
    return
  }
  const presented =
    typeof req.headers[TOKEN_HEADER] === 'string'
      ? (req.headers[TOKEN_HEADER] as string)
      : undefined
  if (!isAutomationWebhookTokenMatch(automation.webhookToken, presented)) {
    sendJson(res, 401, { error: 'invalid webhook token' })
    return
  }
  if (!automation.enabled) {
    sendJson(res, 409, { error: 'automation is disabled' })
    return
  }
  const result = await deps.runWebhook(id)
  if (result.outcome === 'skipped_overlap') {
    sendJson(res, 200, { outcome: 'skipped_overlap' })
    return
  }
  sendJson(res, 200, { outcome: 'dispatched', runId: result.run.id, status: result.run.status })
}

/**
 * Returns true when the path is claimed (a response is being written); false
 * falls through to the next plain-HTTP handler, e.g. the bundled web client.
 */
export function createAutomationWebhookHandler(
  deps: AutomationWebhookHandlerDeps
): (req: IncomingMessage, res: ServerResponse) => boolean {
  return (req, res) => {
    if (!req.url || !req.url.startsWith(WEBHOOK_PATH_PREFIX)) {
      return false
    }
    void handleWebhookRequest(req, res, deps).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      // The response may already be committed; a late failure can only be logged.
      if (!res.headersSent) {
        sendJson(res, 500, { error: message })
      } else {
        console.error('[automation-webhook] failed after response started:', message)
      }
    })
    return true
  }
}
