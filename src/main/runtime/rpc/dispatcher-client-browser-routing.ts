import type { RpcContext } from './core'
import { getActiveRpcCaller } from './rpc-active-caller'
import type { OrcaRuntimeService } from '../orca-runtime'

export function routeDispatcherClientHostedBrowserRpc(
  runtime: OrcaRuntimeService,
  method: string,
  params: unknown
) {
  const candidate = runtime as OrcaRuntimeService & {
    routeClientHostedBrowserRpc?: OrcaRuntimeService['routeClientHostedBrowserRpc']
  }
  return (
    candidate.routeClientHostedBrowserRpc?.(method, params, getActiveRpcCaller()) ?? {
      handled: false as const
    }
  )
}

export function routeDispatcherDesktopBrowserBridgeRpc(
  runtime: OrcaRuntimeService,
  method: string,
  params: unknown,
  context: Pick<RpcContext, 'caller' | 'signal'>
) {
  return runtime.routeDesktopBrowserBridgeRpc(method, params, context)
}
