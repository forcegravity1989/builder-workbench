/**
 * WeLink 项目群面板状态（pr-review-notify 方案一）：
 * [chat] 配置读回、welink-cli 登录态、历史/轮询/未读游标、发送与「发送评审」预填。
 * 未读游标与面板开合按项目分域存 localStorage；轮询不承诺实时（spec 待决 1 首版口径）。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { ProjectCharterChat } from '../../../../shared/workbench/project-charter'
import type { WelinkChatMessage } from '../../../../shared/welink-chat-types'
import { readProjectCharter } from '../project-charter'

const CURSOR_STORAGE_KEY = 'bw-pr-review-chat-cursor-v1'
const OPEN_STORAGE_KEY = 'bw-project-chat-panel-open-v1'
const HISTORY_COUNT = 30
const UNREAD_POLL_COUNT = 50
const POLL_INTERVAL_MS = 30_000

/** 「发送评审」预填＋自动展开的窗口事件名（worktree 右键菜单派发）。 */
export const PROJECT_CHAT_COMPOSE_EVENT = 'bw-project-chat-compose'

type CursorMap = Record<string, number>

function readCursors(): CursorMap {
  try {
    const raw = window.localStorage.getItem(CURSOR_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as CursorMap
    }
  } catch {
    // 坏值按无游标处理：首次轮询重建基线。
  }
  return {}
}

function writeCursor(repoId: string, msgId: number): void {
  try {
    const next = { ...readCursors(), [repoId]: msgId }
    window.localStorage.setItem(CURSOR_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // 存不进就丢游标：代价只是未读数从基线重算，不值得崩面板。
  }
}

function readPersistedOpen(repoId: string): boolean {
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return (parsed as Record<string, unknown>)[repoId] === true
    }
  } catch {
    // 坏值按收起处理。
  }
  return false
}

function persistOpen(repoId: string, open: boolean): void {
  try {
    const raw = window.localStorage.getItem(OPEN_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    const base =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify({ ...base, [repoId]: open }))
  } catch {
    // 同 writeCursor：丢持久化不崩面板。
  }
}

export type ProjectChatState = ReturnType<typeof useProjectChat>

export function useProjectChat() {
  const repos = useAppStore((s) => s.repos)
  const activeRepoId = useAppStore((s) => s.activeRepoId ?? s.repos[0]?.id ?? null)
  const repo = repos.find((r) => r.id === activeRepoId) ?? repos[0] ?? null
  const repoId = repo?.id ?? ''
  const repoPath = repo?.path ?? ''
  const repoConnectionId = repo?.connectionId ?? null

  const [config, setConfig] = useState<ProjectCharterChat | null>(null)
  const groupId = config?.groupId ?? ''
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [open, setOpenRaw] = useState(() => (repoId ? readPersistedOpen(repoId) : false))
  const [unread, setUnread] = useState(0)
  const [messages, setMessages] = useState<readonly WelinkChatMessage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [draft, setDraft] = useState('')

  const openRef = useRef(open)
  openRef.current = open
  // 历史拉取代际号：切换项目或发起新一轮拉取时递增，旧响应按号丢弃。
  const historySeqRef = useRef(0)

  // [chat] 配置随活跃项目读回；未配置时按钮与面板都不出现（spec N01）。
  useEffect(() => {
    let cancelled = false
    // 代际号先递增：切换项目时在途的历史响应全部作废，旧群消息不得落进新项目面板。
    historySeqRef.current += 1
    setConfig(null)
    setAuthed(null)
    setMessages(null)
    setLoadError(null)
    setUnread(0)
    setLoading(false)
    if (!repoPath) {
      return
    }
    readProjectCharter(repoPath, repoConnectionId)
      .then((result) => {
        if (cancelled) {
          return
        }
        setConfig(result.charter?.chat ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setConfig(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [repoId, repoPath, repoConnectionId])

  // 登录态：配置就绪查一次；未登录不装绿（EXPIRED 判未登录，connectors 口径）。
  useEffect(() => {
    if (!groupId) {
      return
    }
    let cancelled = false
    window.api.welinkChat
      .authStatus()
      .then((value) => {
        if (!cancelled) {
          setAuthed(value)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthed(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const refreshOpenHistory = useCallback(async (): Promise<void> => {
    if (!groupId) {
      return
    }
    const seq = ++historySeqRef.current
    setLoading(true)
    try {
      const result = await window.api.welinkChat.history({
        groupId,
        count: HISTORY_COUNT
      })
      // 过期响应丢弃：拉取期间切换了项目或又发起一轮，旧结果不得覆盖新状态。
      if (seq !== historySeqRef.current) {
        return
      }
      if (result.error) {
        setLoadError(result.error)
        toast.error(`群历史读取失败：${result.error}`)
        return
      }
      setLoadError(null)
      setMessages(result.messages)
      // 展开即视作已读：游标推进到最新，未读清零（spec N04）。
      if (result.maxMsgId !== null && repoId) {
        writeCursor(repoId, result.maxMsgId)
      }
      setUnread(0)
    } finally {
      // 过期响应不动 loading：新请求或项目切换的复位负责收尾。
      if (seq === historySeqRef.current) {
        setLoading(false)
      }
    }
  }, [groupId, repoId])

  // 轮询：展开时整页刷新历史；收起时只向新查，新消息累计未读、游标不动。
  // 首次无游标只建基线不计数——装上那一刻的历史不算未读。
  // 门槛只看 groupId：welink-cli 的 IM 命令会先自动续期再执行（EXPIRED 的 token
  // 也能拉到历史），authStatus 的 EXPIRED 判未登录是信号口径，不阻塞面板能力。
  useEffect(() => {
    if (!groupId) {
      return
    }
    let cancelled = false
    const tick = async (): Promise<void> => {
      if (openRef.current) {
        await refreshOpenHistory()
        return
      }
      const cursors = readCursors()
      const cursor = repoId ? cursors[repoId] : undefined
      const result = await window.api.welinkChat.history({
        groupId,
        count: cursor === undefined ? 1 : UNREAD_POLL_COUNT,
        ...(cursor === undefined ? {} : { cursor, direction: 1 as const })
      })
      if (cancelled || result.error) {
        return
      }
      if (cursor === undefined) {
        if (result.maxMsgId !== null && repoId) {
          writeCursor(repoId, result.maxMsgId)
        }
        return
      }
      if (result.messages.length > 0) {
        setUnread((current) => current + result.messages.length)
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [groupId, repoId, refreshOpenHistory])

  const setOpen = useCallback(
    (next: boolean): void => {
      setOpenRaw(next)
      if (repoId) {
        persistOpen(repoId, next)
      }
      if (next) {
        setUnread(0)
      }
    },
    [repoId]
  )

  // 展开时拉历史（轮询之外的即时加载，含手动重开）。
  useEffect(() => {
    if (open && groupId) {
      void refreshOpenHistory()
    }
  }, [open, groupId, refreshOpenHistory])

  // 「发送评审」：右键菜单经窗口事件预填＋展开；发送仍由人点发送按钮。
  useEffect(() => {
    const onCompose = (event: Event): void => {
      const detail = (event as CustomEvent<{ text?: string }>).detail
      if (typeof detail?.text === 'string') {
        setDraft(detail.text)
      }
      setOpen(true)
    }
    window.addEventListener(PROJECT_CHAT_COMPOSE_EVENT, onCompose)
    return () => window.removeEventListener(PROJECT_CHAT_COMPOSE_EVENT, onCompose)
  }, [setOpen])

  const send = useCallback(async (): Promise<void> => {
    const text = draft.trim()
    if (!config || !text || sending) {
      return
    }
    setSending(true)
    try {
      const result = await window.api.welinkChat.send({ groupId: config.groupId, text })
      if (!result.ok) {
        toast.error(`发送失败：${result.error ?? '未知错误'}`)
        return
      }
      setDraft('')
      await refreshOpenHistory()
    } finally {
      setSending(false)
    }
  }, [config, draft, sending, refreshOpenHistory])

  return {
    config,
    authed,
    open,
    unread,
    messages,
    loadError,
    loading,
    sending,
    draft,
    setOpen,
    setDraft,
    send,
    refresh: refreshOpenHistory
  }
}
