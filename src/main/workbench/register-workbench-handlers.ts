import type { Store } from '../persistence/loading-store/store'
import { registerCliInstallHandlers } from '../ipc/bw-cli-install'
import { registerCodeHubHandlers } from '../ipc/codehub'
import { registerMilestoneRecoveryHandlers } from './milestone-recovery-ipc'

export function registerWorkbenchHandlers(store: Store): void {
  registerCliInstallHandlers()
  registerCodeHubHandlers(store)
  registerMilestoneRecoveryHandlers()
}
