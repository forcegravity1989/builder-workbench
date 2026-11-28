import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  TeamGroupSpaceListFailure,
  TeamGroupSpaceListResult,
  TeamGroupSpaceOption,
  TeamGroupSpaceResolveFailure,
  TeamGroupSpaceResolveResult
} from '../../../shared/team-group-discovery'
import { searchTeamGroupSpaces } from './team-group-search'

/** The picked group, carrying both IDs the team directory is keyed by. */
export type TeamBindingSelection = {
  spaceId: string
  groupId: string
  name: string
}

export type TeamGroupListState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; spaces: TeamGroupSpaceOption[]; truncated: boolean }
  | { phase: 'failed'; reason: TeamGroupSpaceListFailure }

export type TeamGroupPicker = {
  listState: TeamGroupListState
  query: string
  setQuery: (next: string) => void
  options: TeamGroupSpaceOption[]
  resolving: boolean
  resolveFailure: TeamGroupSpaceResolveFailure | null
  reload: () => void
  choose: (space: TeamGroupSpaceOption) => void
}

// Why a module-level TTL cache rather than state: reading the list is ~5 paged
// OneBox calls and the result changes rarely, while the binding form remounts on
// every dialog open. Same pattern as the directory snapshot in TeamSettingsDialog.
const LIST_CACHE_TTL_MS = 5 * 60_000
let listCache: { at: number; spaces: TeamGroupSpaceOption[]; truncated: boolean } | null = null
let listCacheEpoch = 0
let watchingW3Account = false
const accountChangeListeners = new Set<() => void>()

function watchW3Account(): void {
  if (watchingW3Account) {
    return
  }
  // The cache outlives the form, including while the user is in W3 settings.
  window.api.w3Account.onStatusChanged(() => {
    listCache = null
    listCacheEpoch += 1
    for (const listener of accountChangeListeners) {
      listener()
    }
  })
  watchingW3Account = true
}

function readCache(): TeamGroupListState | null {
  if (!listCache || Date.now() - listCache.at >= LIST_CACHE_TTL_MS) {
    return null
  }
  return { phase: 'ready', spaces: listCache.spaces, truncated: listCache.truncated }
}

/**
 * Own the group-name picker: fetch the list once, narrow it locally as the user
 * types, and resolve the single picked space into its WeLink group id.
 * Selection lives with the caller because the dialog submits it.
 */
export function useTeamGroupPicker(
  onSelectionChange: (next: TeamBindingSelection | null) => void
): TeamGroupPicker {
  const [listState, setListState] = useState<TeamGroupListState>(
    () => readCache() ?? { phase: 'idle' }
  )
  const [query, setQuery] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveFailure, setResolveFailure] = useState<TeamGroupSpaceResolveFailure | null>(null)
  const listRequest = useRef<{ epoch: number } | null>(null)
  const resolveRequest = useRef(0)
  const reportSelection = useRef(onSelectionChange)
  reportSelection.current = onSelectionChange

  const loadList = useCallback(async (): Promise<void> => {
    const epoch = listCacheEpoch
    const cached = readCache()
    if (cached) {
      setListState(cached)
      return
    }
    if (listRequest.current?.epoch === epoch) {
      return
    }
    const request = { epoch }
    listRequest.current = request
    setListState({ phase: 'loading' })
    let result: TeamGroupSpaceListResult
    try {
      result = await window.api.teamCollaboration.listGroupSpaces()
    } catch {
      // A rejected IPC call carries no reason; the service was unreachable.
      result = { ok: false, reason: 'unreachable' }
    }
    if (epoch !== listCacheEpoch || listRequest.current !== request) {
      return
    }
    listRequest.current = null
    if (result.ok) {
      listCache = { at: Date.now(), spaces: result.spaces, truncated: result.truncated }
      setListState({ phase: 'ready', spaces: result.spaces, truncated: result.truncated })
      return
    }
    listCache = null
    setListState({ phase: 'failed', reason: result.reason })
  }, [])

  useEffect(() => {
    watchW3Account()
    const resetForAccount = (): void => {
      resolveRequest.current += 1
      reportSelection.current(null)
      setQuery('')
      setResolving(false)
      setResolveFailure(null)
      void loadList()
    }
    accountChangeListeners.add(resetForAccount)
    void loadList()
    return () => {
      accountChangeListeners.delete(resetForAccount)
      listRequest.current = null
      resolveRequest.current += 1
    }
  }, [loadList])

  const choose = useCallback(async (space: TeamGroupSpaceOption): Promise<void> => {
    const requestId = ++resolveRequest.current
    setResolving(true)
    setResolveFailure(null)
    // Why clear first: the submit button must not keep offering the previous
    // group while the new one is still being resolved.
    reportSelection.current(null)
    let result: TeamGroupSpaceResolveResult
    try {
      result = await window.api.teamCollaboration.resolveGroupSpace({ spaceId: space.spaceId })
    } catch {
      result = { ok: false, reason: 'unreachable' }
    }
    if (requestId !== resolveRequest.current) {
      return
    }
    setResolving(false)
    if (result.ok) {
      reportSelection.current({
        spaceId: result.spaceId,
        groupId: result.groupId,
        name: space.name
      })
      return
    }
    setResolveFailure(result.reason)
  }, [])

  const options = useMemo(
    () => (listState.phase === 'ready' ? searchTeamGroupSpaces(listState.spaces, query) : []),
    [listState, query]
  )

  const reload = useCallback((): void => {
    void loadList()
  }, [loadList])

  return {
    listState,
    query,
    setQuery,
    options,
    resolving,
    resolveFailure,
    reload,
    choose: useCallback((space: TeamGroupSpaceOption) => void choose(space), [choose])
  }
}
