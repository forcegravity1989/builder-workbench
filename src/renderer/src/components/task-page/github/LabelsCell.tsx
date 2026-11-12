import type { GitHubWorkItem } from '../../../../../shared/github/work-item-types'
import type { Repo } from '../../../../../shared/repo-types'
import {
  type TaskSourceContext,
  getTaskSourceRuntimeSettings
} from '../../../../../shared/task-source-context'
import React, { useMemo, useState, useCallback } from 'react'
import { useAppStore } from '@/store'
import { useShallow } from 'zustand/react/shallow'
import { getSettingsForRepoRuntimeOwner } from '@/lib/repo-runtime-owner'
import { parseGitHubIssueOrPRLink } from '@/lib/github-links'
import { useRepoLabelsBySlug } from '@/hooks/useGitHubSlugMetadata'
import { translate } from '@/i18n/i18n'
import { getActiveRuntimeTarget, callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { githubProjectHost } from '../../../../../shared/github/project-identity'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { LoaderCircle, ChevronDown, Check } from 'lucide-react'
import type { TaskPageGitHubWorkItemMutationRunner } from '../../task-page-linear-jira-list-model'

/** Issue-only labels cell; PR rows keep their management columns untouched. */
export function GHLabelsCell({
  item,
  repo,
  sourceContext,
  workItemMutation
}: {
  item: GitHubWorkItem
  repo: Repo | null
  sourceContext?: TaskSourceContext | null
  workItemMutation: TaskPageGitHubWorkItemMutationRunner
}): React.JSX.Element {
  const repoOwnerSettings = useAppStore(
    useShallow((s) => getSettingsForRepoRuntimeOwner(s, repo?.id ?? null))
  )
  const sourceSettings = useMemo(
    () =>
      sourceContext?.provider === 'github'
        ? ({
            ...repoOwnerSettings,
            ...getTaskSourceRuntimeSettings(sourceContext)
          } as typeof repoOwnerSettings)
        : repoOwnerSettings,
    [repoOwnerSettings, sourceContext]
  )
  const [open, setOpen] = useState(false)
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)
  const labels = useMemo(() => item.labels ?? [], [item.labels])
  const parsed = useMemo(() => parseGitHubIssueOrPRLink(item.url), [item.url])
  const owner = parsed?.slug.owner ?? null
  const repoName = parsed?.slug.repo ?? null
  const metadata = useRepoLabelsBySlug(
    open ? owner : null,
    open ? repoName : null,
    sourceSettings,
    parsed?.slug.host
  )
  const toggleLabel = useCallback(
    async (label: string): Promise<void> => {
      if (item.type !== 'issue') {
        return
      }
      const isOn = labels.some((name) => name.toLowerCase() === label.toLowerCase())
      if (
        workItemMutation.isIntentPending({
          item,
          intent: {
            type: 'toggleLabel',
            label
          },
          sourceContext
        })
      ) {
        return
      }
      setPendingLabel(label)
      try {
        await workItemMutation.run({
          item,
          intent: {
            type: 'toggleLabel',
            label
          },
          sourceContext,
          errorToast: translate(
            'auto.components.TaskPage.ghLabelsUpdateFailed',
            'Failed to update labels.'
          ),
          mutate: async () => {
            const updates = isOn
              ? {
                  removeLabels: [label]
                }
              : {
                  addLabels: [label]
                }
            const target = getActiveRuntimeTarget(sourceSettings)
            if (owner && repoName) {
              const args = {
                owner,
                repo: repoName,
                host: githubProjectHost(parsed?.slug.host),
                number: item.number,
                updates
              }
              const res =
                target.kind === 'environment'
                  ? await callRuntimeRpc<
                      Awaited<ReturnType<typeof window.api.gh.updateIssueBySlug>>
                    >(target, 'github.project.updateIssueBySlug', args, {
                      timeoutMs: 30_000
                    })
                  : await window.api.gh.updateIssueBySlug(args)
              if (!res.ok) {
                throw new Error(res.error.message)
              }
              return res
            }
            if (repo) {
              const runtimeRepoId =
                sourceContext?.provider === 'github' ? (sourceContext.repoId ?? repo.id) : repo.id
              const res =
                target.kind === 'environment'
                  ? await callRuntimeRpc<{
                      ok?: boolean
                      error?: string
                    }>(
                      target,
                      'github.updateIssue',
                      {
                        repo: runtimeRepoId,
                        number: item.number,
                        updates
                      },
                      {
                        timeoutMs: 30_000
                      }
                    )
                  : await window.api.gh.updateIssue({
                      repoPath: repo.path,
                      repoId: repo.id,
                      sourceContext,
                      number: item.number,
                      updates
                    })
              if (res && res.ok === false) {
                throw new Error(res.error)
              }
              return res
            }
            throw new Error('No GitHub repository context available for this issue.')
          }
        })
      } finally {
        setPendingLabel(null)
      }
    },
    [
      item,
      labels,
      owner,
      parsed?.slug.host,
      repo,
      repoName,
      sourceContext,
      sourceSettings,
      workItemMutation
    ]
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
        {!owner || !repoName ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.53e002d895', 'Issue has no repo slug.')}
          </div>
        ) : metadata.loading ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.0eacf48491', 'Loading…')}
          </div>
        ) : metadata.error ? (
          <div className="px-2 py-2 text-xs text-destructive">{metadata.error}</div>
        ) : metadata.data.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">
            {translate('auto.components.TaskPage.b36f4bf9de', 'No labels.')}
          </div>
        ) : (
          metadata.data.map((label) => {
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
