import { useAppStore } from '@/store'

const TEAM_GROUP_STORAGE_KEY = 'bw:team-group-id'
const TEAM_SPACE_STORAGE_KEY = 'bw:team-space-id'

export function rememberedTeamBinding(): { groupId: string; spaceId: string } {
  try {
    return {
      groupId: window.localStorage.getItem(TEAM_GROUP_STORAGE_KEY) ?? '',
      spaceId: window.localStorage.getItem(TEAM_SPACE_STORAGE_KEY) ?? ''
    }
  } catch {
    return { groupId: '', spaceId: '' }
  }
}

export function rememberTeamBinding(groupId: string, spaceId: string): void {
  try {
    window.localStorage.setItem(TEAM_GROUP_STORAGE_KEY, groupId)
    window.localStorage.setItem(TEAM_SPACE_STORAGE_KEY, spaceId)
  } catch {
    // The directory remains authoritative when browser storage is unavailable.
  }
}

export function forgetTeamBinding(): void {
  try {
    window.localStorage.removeItem(TEAM_GROUP_STORAGE_KEY)
    window.localStorage.removeItem(TEAM_SPACE_STORAGE_KEY)
  } catch {
    // Without browser storage there is no remembered binding to forget.
  }
}

export function hasTeamBinding(): boolean {
  const binding = rememberedTeamBinding()
  return Boolean(binding.groupId && binding.spaceId)
}

/** Saves the other members' published links as disconnected remote hosts; null without a binding. */
export async function syncTeamHosts(): Promise<{ added: number; updated: number } | null> {
  const { groupId, spaceId } = rememberedTeamBinding()
  if (!groupId || !spaceId) {
    return null
  }
  const result = await window.api.teamCollaboration.syncHosts({ groupId, spaceId })
  if (result.added + result.updated > 0) {
    await useAppStore.getState().hydrateRuntimeEnvironmentStatuses()
  }
  return result
}
