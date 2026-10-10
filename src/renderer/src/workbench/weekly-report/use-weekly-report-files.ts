import { useCallback, useEffect, useRef, useState } from 'react'
import type { Worktree } from '../../../../shared/worktree/types'
import { listWeeklyReports, type WeeklyReportRecord } from './report-port'
import { weeklyReportFileContext } from './native-weekly-report-session'
import { subscribeRuntimeFileChanges } from '@/runtime/runtime-file-client'

const canonicalRepository = (value: string) =>
  value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.git\/?$/i, '')
    .replace(/\/$/, '')
    .toLowerCase()

export function assertWeeklyReportRepository(records: WeeklyReportRecord[], repository: string) {
  if (
    records.some(
      (record) =>
        canonicalRepository(record.document.project.repository) !== canonicalRepository(repository)
    )
  ) {
    throw new Error('周报文件所属仓库与当前项目不一致，请核对文件后重新读取')
  }
}

export function useWeeklyReportFiles(
  identity: string,
  worktree: Worktree | null,
  repository: string
) {
  const [state, setState] = useState<{
    identity: string
    records: WeeklyReportRecord[]
    error: string | null
    busy: boolean
  }>({ identity, records: [], error: null, busy: false })
  const request = useRef(0)
  const mounted = useRef(false)
  const currentIdentity = useRef(identity)
  currentIdentity.current = identity
  const reload = useCallback(
    async (targetTree: Worktree | null = worktree) => {
      const ticket = ++request.current
      if (!targetTree) {
        setState({ identity, records: [], error: null, busy: false })
        return
      }
      setState((previous) => ({
        identity,
        records: previous.identity === identity ? previous.records : [],
        error: null,
        busy: true
      }))
      try {
        const records = await listWeeklyReports(weeklyReportFileContext(targetTree))
        assertWeeklyReportRepository(records, repository)
        if (mounted.current && ticket === request.current && currentIdentity.current === identity) {
          setState({ identity, records, error: null, busy: false })
        }
      } catch (reason) {
        if (mounted.current && ticket === request.current && currentIdentity.current === identity) {
          setState((previous) => ({
            identity,
            records: previous.identity === identity ? previous.records : [],
            error: reason instanceof Error ? reason.message : String(reason),
            busy: false
          }))
        }
      }
    },
    [identity, worktree, repository]
  )
  useEffect(() => {
    mounted.current = true
    void reload()
    return () => {
      mounted.current = false
    }
  }, [reload])
  useEffect(() => {
    const refresh = () => {
      void reload()
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [reload])
  useEffect(() => {
    if (!worktree) {
      return
    }
    let disposed = false
    let unsubscribe: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      void subscribeRuntimeFileChanges(weeklyReportFileContext(worktree), (payload) => {
        if (
          disposed ||
          payload.worktreePath.replace(/\\/g, '/') !== worktree.path.replace(/\\/g, '/')
        ) {
          return
        }
        if (
          !payload.events.some(
            (event) =>
              event.kind === 'overflow' ||
              event.absolutePath.replace(/\\/g, '/').includes('/.bw/weekly-reports/')
          )
        ) {
          return
        }
        clearTimeout(timer)
        timer = setTimeout(refresh, 150)
      })
        .then((stop) => {
          if (disposed) {
            stop()
          } else {
            unsubscribe = stop
          }
        })
        .catch(() => {})
    } catch {}
    function refresh() {
      void reload()
    }
    return () => {
      disposed = true
      clearTimeout(timer)
      unsubscribe?.()
    }
  }, [worktree, reload])
  return {
    records: state.identity === identity ? state.records : [],
    error: state.identity === identity ? state.error : null,
    busy: state.identity === identity ? state.busy : false,
    reload
  }
}
