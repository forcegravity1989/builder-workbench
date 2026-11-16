import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import { createShareService, type ShareService } from './self-hosted-share-service'

let service: ShareService | null = null

/**
 * Workbench-owned share state; deliberately outside Orca's settings and artifact cloud
 * stores. Reads userData through the host port so this module stays reachable from the
 * plain-Node runtime graph.
 */
export function nativeShareService(): ShareService {
  service ??= createShareService({
    dataDir: () => join(getAppEnvironment().getPath('userData'), 'workbench-share')
  })
  return service
}
