import { useEffect } from 'react'
import { syncTeamHosts } from './team-hosts'

const STARTUP_SYNC_DELAY_MS = 3000

/** Pulls teammates' hosts into the remote host list once after launch, without blocking startup. */
export function TeamHostSyncOnStart(): null {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void syncTeamHosts().catch(() => undefined)
    }, STARTUP_SYNC_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return null
}
