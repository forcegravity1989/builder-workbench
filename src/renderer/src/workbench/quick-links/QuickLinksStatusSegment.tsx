import React, { useCallback, useEffect, useState } from 'react'
import { Copy, Link, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from '@/components/status-bar/status-bar-context-menu-policy'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import {
  displayQuickLinkUrl,
  generateQuickLinkId,
  validateQuickLinkDraft,
  type QuickLink
} from '../../../../shared/workbench/quick-links'
import { loadQuickLinks, saveQuickLinks } from './quick-links-store'

type QuickLinksStatusSegmentProps = {
  compact?: boolean
  iconOnly: boolean
}

type FormMode = { kind: 'list' } | { kind: 'edit'; editingId: string | null }

/**
 * 状态栏「常用链接」入口：图标 + 条目数，与端口入口并列同构。
 * 点开自己的 popover，行点击在内置浏览器打开；hover 出复制/编辑/删除。
 * 常用链接不探活、不显示任何健康状态（它不是服务，没有可推导信号）。
 */
export function QuickLinksStatusSegment({
  iconOnly
}: QuickLinksStatusSegmentProps): React.JSX.Element {
  const repo = useActiveRepo()
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const createBrowserTab = useAppStore((s) => s.createBrowserTab)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<QuickLink[]>([])
  const [corrupt, setCorrupt] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>({ kind: 'list' })
  const [nameDraft, setNameDraft] = useState('')
  const [urlDraft, setUrlDraft] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const repoPath = repo?.path ?? null
  const connectionId = repo?.connectionId ?? null

  useEffect(() => {
    let cancelled = false
    setFormMode({ kind: 'list' })
    setFormError(null)
    if (!repoPath) {
      setLinks([])
      setCorrupt(false)
      return
    }
    void loadQuickLinks(repoPath, connectionId)
      .then((result) => {
        if (cancelled) {
          return
        }
        setLinks(result.links)
        setCorrupt(result.corrupt)
      })
      .catch(() => {
        if (!cancelled) {
          setLinks([])
          setCorrupt(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [repoPath, connectionId])

  const persist = useCallback(
    async (next: QuickLink[]): Promise<void> => {
      // 先更新内存态：写盘失败时保留用户刚做的改动并如实提示，不假装已保存。
      setLinks(next)
      if (!repoPath) {
        return
      }
      try {
        await saveQuickLinks(repoPath, connectionId, next)
        setCorrupt(false)
      } catch (error) {
        toast.error(
          translate('auto.workbench.quickLinks.saveFailed', 'Failed to save quick links'),
          { description: error instanceof Error ? error.message : String(error) }
        )
      }
    },
    [repoPath, connectionId]
  )

  const startAdd = useCallback(() => {
    setFormMode({ kind: 'edit', editingId: null })
    setNameDraft('')
    setUrlDraft('')
    setFormError(null)
  }, [])

  const startEdit = useCallback((link: QuickLink) => {
    setFormMode({ kind: 'edit', editingId: link.id })
    setNameDraft(link.name)
    setUrlDraft(link.url)
    setFormError(null)
  }, [])

  const cancelForm = useCallback(() => {
    setFormMode({ kind: 'list' })
    setFormError(null)
  }, [])

  const submitForm = useCallback(async () => {
    const editingId = formMode.kind === 'edit' ? formMode.editingId : null
    const result = validateQuickLinkDraft({
      name: nameDraft,
      url: urlDraft,
      existing: links,
      editingId
    })
    if (!result.ok) {
      setFormError(result.message)
      return
    }
    recordFeatureInteraction('quick-links')
    const next = editingId
      ? links.map((link) =>
          link.id === editingId ? { ...link, name: result.name, url: result.url } : link
        )
      : [...links, { id: generateQuickLinkId(), name: result.name, url: result.url }]
    await persist(next)
    setFormMode({ kind: 'list' })
    setFormError(null)
  }, [formMode, links, nameDraft, urlDraft, persist, recordFeatureInteraction])

  const removeLink = useCallback(
    (link: QuickLink) => {
      recordFeatureInteraction('quick-links')
      void persist(links.filter((item) => item.id !== link.id))
    },
    [links, persist, recordFeatureInteraction]
  )

  const copyLink = useCallback(
    (link: QuickLink) => {
      recordFeatureInteraction('quick-links')
      void window.api.ui.writeClipboardText(link.url)
      toast.success(
        translate('auto.workbench.quickLinks.copied', 'Copied {{url}}', { url: link.url })
      )
    },
    [recordFeatureInteraction]
  )

  const openLink = useCallback(
    (link: QuickLink, modifiers: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
      recordFeatureInteraction('quick-links')
      const isMac = navigator.userAgent.includes('Mac')
      // 与端口行一致：Shift+Cmd/Ctrl 是转系统浏览器的快捷方式。
      const toSystemBrowser =
        modifiers.shiftKey && (isMac ? modifiers.metaKey : modifiers.ctrlKey)
      if (toSystemBrowser || !activeWorktreeId) {
        void window.api.shell.openUrl(link.url)
        return
      }
      createBrowserTab(activeWorktreeId, link.url)
    },
    [activeWorktreeId, createBrowserTab, recordFeatureInteraction]
  )

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen)
      if (!nextOpen) {
        setFormMode({ kind: 'list' })
        setFormError(null)
      }
    },
    []
  )

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-accent/70"
              aria-label={translate(
                'auto.workbench.quickLinks.trigger',
                'Quick Links, {{count}}',
                { count: links.length }
              )}
            >
              <Link className="size-3 text-muted-foreground" />
              {!iconOnly && (
                <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                  {links.length}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {translate('auto.workbench.quickLinks.tooltip', 'Quick Links — {{count}}', {
            count: links.length
          })}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
        className="w-[24rem] max-w-[calc(100vw-2rem)]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-foreground">
            <Link className="size-3 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {translate('auto.workbench.quickLinks.title', 'Quick Links')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">{links.length}</span>
            {formMode.kind === 'list' && (
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={startAdd}
              >
                <Plus className="size-3" />
                {translate('auto.workbench.quickLinks.add', 'Add')}
              </button>
            )}
          </div>
        </div>

        {formMode.kind === 'edit' ? (
          <div className="space-y-2 px-3 py-3">
            <input
              type="text"
              value={nameDraft}
              placeholder={translate('auto.workbench.quickLinks.namePlaceholder', 'Name')}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring"
              onChange={(event) => setNameDraft(event.target.value)}
            />
            <input
              type="text"
              value={urlDraft}
              placeholder={translate(
                'auto.workbench.quickLinks.urlPlaceholder',
                'https://example.com'
              )}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:border-ring"
              onChange={(event) => setUrlDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void submitForm()
                }
              }}
            />
            {formError && <p className="text-[11px] text-destructive">{formError}</p>}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                className="cursor-pointer rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={cancelForm}
              >
                {translate('auto.workbench.quickLinks.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                className="cursor-pointer rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground hover:bg-primary/90"
                onClick={() => void submitForm()}
              >
                {translate('auto.workbench.quickLinks.save', 'Save')}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto scrollbar-sleek">
            {corrupt && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                {translate(
                  'auto.workbench.quickLinks.corrupt',
                  'Quick links file could not be read; existing file was left untouched.'
                )}
              </div>
            )}
            {links.length > 0 ? (
              <div className="px-1 py-1">
                {links.map((link) => (
                  <div
                    key={link.id}
                    role="button"
                    tabIndex={0}
                    className="group/link flex min-w-0 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
                    onClick={(event) => openLink(link, event)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openLink(link, event)
                      }
                    }}
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="relative flex h-5 min-w-0 items-center">
                        <span className="block min-w-0 truncate text-[12px] font-medium text-foreground">
                          {link.name}
                        </span>
                        <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 rounded-md border border-border/40 bg-popover/95 px-0.5 shadow-xs transition-opacity can-hover:opacity-0 group-hover/link:opacity-100 group-focus-within/link:opacity-100">
                          <QuickLinkAction
                            label={translate('auto.workbench.quickLinks.copy', 'Copy')}
                            onClick={(event) => {
                              event.stopPropagation()
                              copyLink(link)
                            }}
                          >
                            <Copy className="size-3" />
                          </QuickLinkAction>
                          <QuickLinkAction
                            label={translate('auto.workbench.quickLinks.edit', 'Edit')}
                            onClick={(event) => {
                              event.stopPropagation()
                              startEdit(link)
                            }}
                          >
                            <Pencil className="size-3" />
                          </QuickLinkAction>
                          <QuickLinkAction
                            label={translate('auto.workbench.quickLinks.delete', 'Delete')}
                            onClick={(event) => {
                              event.stopPropagation()
                              removeLink(link)
                            }}
                          >
                            <Trash2 className="size-3" />
                          </QuickLinkAction>
                        </div>
                      </div>
                      <div className="truncate text-[10px] text-muted-foreground/70">
                        {displayQuickLinkUrl(link.url)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {translate(
                  'auto.workbench.quickLinks.empty',
                  'No quick links yet. Click Add to create one.'
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function QuickLinkAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="z-[70]">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
