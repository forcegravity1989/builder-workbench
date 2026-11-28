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
  dismissResolveFailure: () => void
  reload: () => void
  choose: (space: TeamGroupSpaceOption) => void
}

// Why a module-level TTL cache rather than state: reading the list is ~5 paged
// OneBox calls and the result changes rarely, while the binding form remounts on
// every dialog open. Same pattern as the directory snapshot in TeamSettingsDialog.
const LIST_CACHE_TTL_MS = 5 * 60_000
let listCache: { at: number; spaces: TeamGroupSpaceOption[]; truncated: boolean } | null = null

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
  const [listState, setListState] = useState<TeamGroupListState>(() => readCache() ?? { phase: 'idle' })
  const [query, setQuery] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolveFailure, setResolveFailure] = useState<TeamGroupSpaceResolveFailure | null>(null)
  // Why two guards: the list walk must not run twice at once, and an
  // out-of-order resolve must not overwrite a newer pick.
  const inFlight = useRef(false)
  const resolveRequest = useRef(0)
  const reportSelection = useRef(onSelectionChange)
  reportSelection.current = onSelectionChange

  const loadList = useCallback(async (): Promise<void> => {
    const cached = readCache()
    if (cached) {
      setListState(cached)
      return
    }
    // Why an in-flight latch rather than reading the phase: the popover calls
    // this on every open, and a second concurrent walk would double the OneBox
    // paging requests for the same list.
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setListState({ phase: 'loading' })
    let result: TeamGroupSpaceListResult
    try {
      result = await window.api.teamCollaboration.listGroupSpaces()
    } catch {
      // A rejected IPC call carries no reason; the service was unreachable.
      result = { ok: false, reason: 'unreachable' }
    } finally {
      inFlight.current = false
    }
    if (result.ok) {
      listCache = { at: Date.now(), spaces: result.spaces, truncated: result.truncated }
      setListState({ phase: 'ready', spaces: result.spaces, truncated: result.truncated })
      return
    }
    listCache = null
    setListState({ phase: 'failed', reason: result.reason })
  }, [])

  useEffect(() => {
    void loadList()
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
    // Called on every popover open: a cached list is reused, a failed one is
    // retried, and loadList's latch drops the call while one is already running.
    void loadList()
  }, [loadList])

  return {
    listState,
    query,
    setQuery,
    options,
    resolving,
    resolveFailure,
    dismissResolveFailure: useCallback(() => setResolveFailure(null), []),
    reload,
    choose: useCallback((space: TeamGroupSpaceOption) => void choose(space), [choose])
  }
}
