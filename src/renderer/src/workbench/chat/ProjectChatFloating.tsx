/**
 * WeLink 项目群浮动按钮＋面板（pr-review-notify 方案一）。
 * 挂应用右下角（浮动工作区按钮上方）；未配置 [chat] 的项目整组不渲染。
 * 按钮与面板均可拖拽（照浮动工作区模式，位置持久化）；面板正文见 ChatPanelBody。
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isWorkbenchShell } from '../is-workbench-shell'
import { useProjectChat } from './use-project-chat'
import { ProjectChatContext, useProjectChatContext } from './project-chat-context'
import { ChatPanelBody } from './ChatPanelBody'
import {
  anchorProjectChatTriggerPosition,
  clampProjectChatPanelPosition,
  clampProjectChatTriggerPosition,
  defaultProjectChatPanelPosition,
  getDefaultProjectChatTriggerCommittedPosition,
  persistProjectChatPanelPosition,
  persistProjectChatTriggerPosition,
  readPersistedProjectChatPanelPosition,
  readPersistedProjectChatTriggerPosition,
  resolveProjectChatTriggerPosition,
  shouldReconcileProjectChatTriggerPosition,
  type ProjectChatCommittedPosition,
  type ProjectChatPosition,
  type ProjectChatPositionSource
} from './project-chat-position'

/** 拖拽超过该位移才算拖（否则视为点击）；照浮动工作区按钮阈值。 */
const DRAG_THRESHOLD = 4

type TriggerPositionState = {
  committed: ProjectChatCommittedPosition
  position: ProjectChatPosition
  source: ProjectChatPositionSource
}

function readInitialTriggerPosition(): TriggerPositionState {
  const persisted = readPersistedProjectChatTriggerPosition()
  if (persisted) {
    return {
      committed: persisted,
      position: resolveProjectChatTriggerPosition(persisted, 'user'),
      source: 'user'
    }
  }
  const committed = getDefaultProjectChatTriggerCommittedPosition()
  return {
    committed,
    position: resolveProjectChatTriggerPosition(committed, 'default'),
    source: 'default'
  }
}

/** 按钮位：锚点持久化＋视口夹取＋resize 重对齐（照浮动工作区按钮模式）。 */
function useProjectChatTriggerPosition(): {
  position: ProjectChatPosition
  preview: (next: ProjectChatPosition) => void
  commit: () => void
} {
  const initial = useRef<TriggerPositionState | null>(null)
  if (initial.current === null) {
    initial.current = readInitialTriggerPosition()
  }
  const committedRef = useRef(initial.current.committed)
  const sourceRef = useRef(initial.current.source)
  const stagedRef = useRef<ProjectChatPosition | null>(null)
  const [position, setPosition] = useState(initial.current.position)

  const preview = useCallback((next: ProjectChatPosition): void => {
    const clamped = clampProjectChatTriggerPosition(next)
    stagedRef.current = clamped
    setPosition(clamped)
  }, [])

  const commit = useCallback((): void => {
    const staged = stagedRef.current
    stagedRef.current = null
    if (!staged) {
      return
    }
    const anchored = anchorProjectChatTriggerPosition(staged)
    if (!anchored) {
      return
    }
    committedRef.current = anchored
    sourceRef.current = 'user'
    persistProjectChatTriggerPosition(anchored)
  }, [])

  const reconcile = useCallback((): void => {
    setPosition((current) => {
      // 启动期视口未定尺寸时不得用安全夹取覆盖人保存的位置。
      if (!shouldReconcileProjectChatTriggerPosition(sourceRef.current)) {
        return current
      }
      return resolveProjectChatTriggerPosition(committedRef.current, sourceRef.current)
    })
  }, [])

  useLayoutEffect(() => {
    reconcile()
  }, [reconcile])

  useEffect(() => {
    const handleResize = (): void => reconcile()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [reconcile])

  return { position, preview, commit }
}

/** 面板标题栏内的按钮不参与拖拽（收起按钮点击不被拖拽劫持）。 */
function isPanelDragTarget(target: EventTarget): boolean {
  return !(target instanceof Element && target.closest('button'))
}

function ChatFloatingSurface(): React.JSX.Element | null {
  const chat = useProjectChatContext()
  const {
    position: triggerPosition,
    preview: previewTrigger,
    commit: commitTrigger
  } = useProjectChatTriggerPosition()

  // 面板位：被人拖过后独立记忆；此前默认锚在按钮上方、随按钮走。
  const [panelPosition, setPanelPosition] = useState<ProjectChatPosition | null>(() =>
    readPersistedProjectChatPanelPosition()
  )
  const stagedPanelRef = useRef<ProjectChatPosition | null>(null)
  const panelDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    left: number
    top: number
  } | null>(null)
  const panelPositionResolved = panelPosition
    ? clampProjectChatPanelPosition(panelPosition)
    : defaultProjectChatPanelPosition(triggerPosition)

  useEffect(() => {
    const handleResize = (): void => {
      setPanelPosition((current) => (current ? clampProjectChatPanelPosition(current) : current))
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handlePanelDragStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !isPanelDragTarget(event.target)) {
      return
    }
    panelDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: panelPositionResolved.left,
      top: panelPositionResolved.top
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePanelDragMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = panelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const next = clampProjectChatPanelPosition({
      left: drag.left + (event.clientX - drag.startX),
      top: drag.top + (event.clientY - drag.startY)
    })
    stagedPanelRef.current = next
    setPanelPosition(next)
  }

  const handlePanelDragEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = panelDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    panelDragRef.current = null
    // 只在真拖过后落盘；标题栏上的普通点击不改变默认锚位。
    if (stagedPanelRef.current) {
      persistProjectChatPanelPosition(stagedPanelRef.current)
      stagedPanelRef.current = null
    }
  }

  // 按钮拖拽：阈值内算点击（开合面板），超过阈值移动按钮、拖完落盘。
  const triggerDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    left: number
    top: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)

  const handleTriggerPointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) {
      return
    }
    triggerDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: triggerPosition.left,
      top: triggerPosition.top,
      moved: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleTriggerPointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = triggerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
      return
    }
    drag.moved = true
    previewTrigger({ left: drag.left + dx, top: drag.top + dy })
  }

  const handleTriggerPointerEnd = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = triggerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    suppressClickRef.current = drag.moved
    if (drag.moved) {
      commitTrigger()
    }
    triggerDragRef.current = null
  }

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>): void => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    chat.setOpen(!chat.open)
  }

  // 挂载由外层 config 闸保证；此处收窄只为类型与防御（hooks 已全部调用完）。
  if (!chat.config) {
    return null
  }

  return (
    <>
      {chat.open ? (
        <div
          data-project-chat-panel
          className="fixed z-[46] flex h-[420px] w-[340px] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          style={{ left: panelPositionResolved.left, top: panelPositionResolved.top }}
        >
          <div
            className="flex cursor-grab items-center gap-2 border-b border-border px-3 py-2.5 text-xs active:cursor-grabbing"
            onPointerDown={handlePanelDragStart}
            onPointerMove={handlePanelDragMove}
            onPointerUp={handlePanelDragEnd}
            onPointerCancel={handlePanelDragEnd}
          >
            <span className="font-medium">WeLink 项目群</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {chat.config.groupId}
            </span>
            <button
              type="button"
              aria-label="收起"
              className="ml-auto text-muted-foreground hover:text-foreground"
              onClick={() => chat.setOpen(false)}
            >
              <X className="size-3.5" />
            </button>
          </div>
          <ChatPanelBody />
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="fixed z-[46] cursor-grab rounded-lg border-transparent bg-card text-foreground shadow-[0_4px_12px_rgb(0_0_0_/_0.22),0_0_0_1px_color-mix(in_srgb,var(--foreground)_12%,transparent)] hover:-translate-y-0.5 hover:bg-accent active:translate-y-0 active:cursor-grabbing dark:bg-accent dark:shadow-[0_6px_16px_rgb(0_0_0_/_0.55),0_0_0_1px_rgb(255_255_255_/_0.22)]"
        style={{ left: triggerPosition.left, top: triggerPosition.top }}
        data-project-chat-toggle
        aria-label={chat.open ? '收起项目群面板' : '展开项目群面板'}
        aria-pressed={chat.open}
        onPointerDown={handleTriggerPointerDown}
        onPointerMove={handleTriggerPointerMove}
        onPointerUp={handleTriggerPointerEnd}
        onPointerCancel={handleTriggerPointerEnd}
        onClick={handleTriggerClick}
      >
        <MessageCircle className="size-4" />
        {chat.unread > 0 ? (
          <span
            aria-hidden
            data-project-chat-unread
            className="pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-card dark:ring-accent"
          >
            {chat.unread > 99 ? '99+' : chat.unread}
          </span>
        ) : null}
      </Button>
    </>
  )
}

export function WorkbenchProjectChatFloating(): React.JSX.Element | null {
  const chat = useProjectChat()
  // Workbench 壳外（纯 Orca 形态）与未配 [chat] 的项目都不出现（spec N01）。
  if (!isWorkbenchShell() || !chat.config) {
    return null
  }
  return (
    <ProjectChatContext.Provider value={chat}>
      <ChatFloatingSurface />
    </ProjectChatContext.Provider>
  )
}
