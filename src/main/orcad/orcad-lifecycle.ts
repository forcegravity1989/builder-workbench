import { setDesktopBrowserBridgeHostEnabled } from '../runtime/desktop-browser-bridge/desktop-browser-bridge-registry'
import { ORCAD_MANAGED_ACTIVATION_ROOT_ENV } from '../../shared/orcad-managed-launch-env'
function createIdempotentOrcadCleanup(cleanup: () => Promise<void>): () => Promise<void> {
  let completion: Promise<void> | null = null
  return () => {
    completion ??= Promise.resolve().then(cleanup)
    return completion
  }
}

export async function startOrcadWithLifecycle<T extends object>(
  start: (registerRuntimeCleanup: (cleanup: () => Promise<void>) => void) => Promise<T>,
  cleanupHost: () => Promise<void>
): Promise<T & { stop(): Promise<void> }> {
  setDesktopBrowserBridgeHostEnabled(Boolean(process.env[ORCAD_MANAGED_ACTIVATION_ROOT_ENV]))
  let cleanupRuntime = async (): Promise<void> => {}
  const cleanup = createIdempotentOrcadCleanup(async () => {
    try {
      await cleanupRuntime()
    } finally {
      setDesktopBrowserBridgeHostEnabled(false)
      await cleanupHost()
    }
  })
  try {
    const handle = await start((nextCleanup) => {
      cleanupRuntime = nextCleanup
    })
    return { ...handle, stop: cleanup }
  } catch (error) {
    try {
      await cleanup()
    } catch (cleanupError) {
      // Keep the launch failure as the supervisor-facing verdict; cleanup still needs a breadcrumb.
      console.error('[orcad] startup cleanup failed:', cleanupError)
    }
    throw error
  }
}
