export const WEEK_PLAN_SESSION_ANCHOR_STORAGE_KEY = 'workbench.plan.claudeSession'

export type WeekPlanSessionAnchor = {
  tabId: string
  worktreeId: string
  sessionId?: string
  transcriptPath?: string
}

type WeekPlanSessionAnchorMap = Record<string, WeekPlanSessionAnchor>

export function parseWeekPlanSessionAnchor(raw: unknown): WeekPlanSessionAnchor | null {
  if (!raw || typeof raw !== 'object') {
    return null
  }
  const record = raw as Record<string, unknown>
  const tabId = typeof record.tabId === 'string' ? record.tabId.trim() : ''
  const worktreeId = typeof record.worktreeId === 'string' ? record.worktreeId.trim() : ''
  if (!tabId || !worktreeId) {
    return null
  }
  const sessionId = typeof record.sessionId === 'string' ? record.sessionId.trim() : ''
  const transcriptPath =
    typeof record.transcriptPath === 'string' ? record.transcriptPath.trim() : ''
  return {
    tabId,
    worktreeId,
    ...(sessionId ? { sessionId } : {}),
    ...(transcriptPath ? { transcriptPath } : {})
  }
}

export function readWeekPlanSessionAnchor(projectKey: string): WeekPlanSessionAnchor | null {
  const map = readAnchorMap()
  return parseWeekPlanSessionAnchor(map[projectKey])
}

export function writeWeekPlanSessionAnchor(
  projectKey: string,
  anchor: WeekPlanSessionAnchor
): void {
  const parsed = parseWeekPlanSessionAnchor(anchor)
  if (!projectKey.trim() || !parsed) {
    return
  }
  const map = readAnchorMap()
  map[projectKey] = parsed
  writeAnchorMap(map)
}

function readAnchorMap(): WeekPlanSessionAnchorMap {
  try {
    const raw = window.localStorage.getItem(WEEK_PLAN_SESSION_ANCHOR_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as WeekPlanSessionAnchorMap)
      : {}
  } catch {
    return {}
  }
}

function writeAnchorMap(map: WeekPlanSessionAnchorMap): void {
  try {
    window.localStorage.setItem(WEEK_PLAN_SESSION_ANCHOR_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Quota / private mode — in-memory launch reuse still applies this session.
  }
}
