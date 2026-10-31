import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, LoaderCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { codehubApi } from '@/lib/codehub-api'
import { toast } from 'sonner'
import type { CodeHubTaskItem } from '../../../../../shared/codehub-tasks'

/**
 * 任务列表行的标签单元格。CLI `issue update --labels` 是整组替换语义，
 * 所以每次点击都按「当前全量 ± 该标签」发送完整数组（去重），点击即
 * 保存——与详情页的草稿模式不同，列表层要的是快速单点操作。
 */
export function CodeHubLabelsCell({
  item,
  onChanged
}: {
  item: CodeHubTaskItem
  onChanged: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [projectLabels, setProjectLabels] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const labels = useMemo(() => item.labels ?? [], [item.labels])
  // 候选名单在 popover 打开时拉取（重开重拉），新建标签下次打开可见。
  useEffect(() => {
    if (!open || !item.repoPath) {
      return
    }
    let stale = false
    setLoading(true)
    setError(null)
    codehubApi
      .listLabels({ repoPath: item.repoPath, repoId: item.repoId })
      .then((names) => {
        if (!stale) {
          setProjectLabels(names)
        }
      })
      .catch((reason: unknown) => {
        if (!stale) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setProjectLabels(null)
        }
      })
      .finally(() => {
        if (!stale) {
          setLoading(false)
        }
      })
    return () => {
      stale = true
    }
  }, [open, item.repoPath, item.repoId])

  const toggleLabel = useCallback(
    async (label: string): Promise<void> => {
      if (!item.repoPath || pendingLabel) {
        return
      }
      const isOn = labels.some((name) => name.toLowerCase() === label.toLowerCase())
      const nextLabels = isOn
        ? labels.filter((name) => name.toLowerCase() !== label.toLowerCase())
        : [...labels, label]
      setPendingLabel(label)
      try {
        await codehubApi.updateIssueLabels({
          repoPath: item.repoPath,
          repoId: item.repoId,
          iid: item.iid,
          labels: [...new Set(nextLabels.map((name) => name.trim()).filter(Boolean))]
        })
        toast.success(translate('auto.components.TaskPage.codehubLabelsSaved', 'Labels updated'))
        onChanged()
      } catch (reason: unknown) {
        toast.error(reason instanceof Error ? reason.message : String(reason))
      } finally {
        setPendingLabel(null)
      }
    },
    [item.iid, item.repoId, item.repoPath, labels, onChanged, pendingLabel]
  )

  const triggerContent =
    labels.length > 0 ? (
      <>
        <span className="flex min-w-0 items-center gap-0.5">
          {labels.slice(0, 2).map((label) => (
            <span
              key={label}
              className="max-w-16 truncate rounded-full border border-border/40 bg-muted/30 px-1.5 py-0 text-[10px] text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </span>
        {labels.length > 2 ? (
          <span className="ml-1 shrink-0 text-[10px] font-medium text-muted-foreground">
            +{labels.length - 2}
          </span>
        ) : null}
      </>
    ) : (
      <span className="text-xs text-muted-foreground/60">-</span>
    )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            labels.length
              ? translate('auto.components.GitHubItemDialog.217e55d87c', 'Labels')
              : translate('auto.components.TaskPage.codehubAddLabel', 'Add label…')
          }
          aria-busy={pendingLabel !== null}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex h-6 max-w-full items-center gap-1 text-left transition disabled:opacity-60',
            labels.length > 0
              ? 'rounded-full border border-border/40 bg-background/70 px-1.5 hover:bg-muted/60'
              : 'w-full rounded-sm border border-transparent bg-transparent px-1 hover:bg-muted/40'
          )}
        >
          {triggerContent}
          {pendingLabel ? (
            <LoaderCircle className="size-3 shrink-0 animate-spin text-muted-foreground" />
          ) : labels.length > 0 ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="popover-scroll-content scrollbar-sleek w-64 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        {!item.repoPath ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.53e002d895', 'Issue has no repo slug.')}
          </div>
        ) : loading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.0eacf48491', 'Loading…')}
          </div>
        ) : error ? (
          <div className="px-2 py-2 text-xs text-destructive">{error}</div>
        ) : (projectLabels ?? []).length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.b36f4bf9de', 'No labels.')}
          </div>
        ) : (
          (projectLabels ?? []).map((label) => {
            const isOn = labels.some((name) => name.toLowerCase() === label.toLowerCase())
            const pending = pendingLabel === label
            return (
              <button
                key={label}
                type="button"
                disabled={pendingLabel !== null}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted/50 disabled:opacity-60"
                onClick={(event) => {
                  event.stopPropagation()
                  void toggleLabel(label)
                }}
              >
                <span
                  className={cn(
                    'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
                    isOn ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
                  )}
                >
                  {pending ? (
                    <LoaderCircle className="size-3 animate-spin" />
                  ) : isOn ? (
                    <Check className="size-3" />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </button>
            )
          })
        )}
      </PopoverContent>
    </Popover>
  )
}
