import { toast } from 'sonner'

// The host's refusal for a read-only member always opens with this sentence (see the team-read
// policy on the host), so it tells that refusal apart from any other 'forbidden' error.
const TEAM_READ_DENIAL_PREFIX = '这台主机只授予了只读访问'
const TEAM_READ_DENIED_TOAST_ID = 'team-read-denied'
// Why: a refused call can repeat from a background poll; one notice per window is enough.
const TEAM_READ_DENIED_TOAST_WINDOW_MS = 10_000
let lastShownAt = 0

/** One light notice when the host refuses a read-only member's action; repeats replace it. */
export function notifyTeamReadDenied(error: unknown): void {
  if (
    !(error instanceof Error) ||
    (error as { code?: unknown }).code !== 'forbidden' ||
    !error.message.startsWith(TEAM_READ_DENIAL_PREFIX)
  ) {
    return
  }
  const now = Date.now()
  if (now - lastShownAt < TEAM_READ_DENIED_TOAST_WINDOW_MS) {
    return
  }
  lastShownAt = now
  toast.error(error.message, { id: TEAM_READ_DENIED_TOAST_ID })
}
