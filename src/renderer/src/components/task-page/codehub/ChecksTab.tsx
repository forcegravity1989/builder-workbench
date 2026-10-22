import React, { useMemo, useState } from 'react'
import { CircleDashed, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ChecksTabLayouts } from '@/components/pull-request-page/checks/layouts'
import { CheckRow } from '@/components/pull-request-page/checks/row'
import { CHECK_COLOR, CHECK_ICON } from '@/components/right-sidebar/checks-panel/check-presentation'
import { getCheckCounts, getChecksSummaryLabel } from '@/components/pr-check-counts'
import { getCheckDetailsKey } from '@/components/github/pr-check-presentation'
import { sortChecksBySeverity } from '../../../../../shared/pr-check-severity-order'
import { translate } from '@/i18n/i18n'
import type { PRCheckDetail } from '../../../../../shared/github/check-types'
import type { CodeHubDetailState } from './use-codehub-detail'

// CodeHub 版 Checks:同一套行/布局/图标件,数据来自 `mr gate`,详情面板只给
// 状态与外链(无 gh 的 job 拉取),rerun/fix 不出现。
export function CodeHubChecksTab({ state }: { state: CodeHubDetailState }): React.JSX.Element {
  const { checks, mrExtrasLoading, reloadMrExtras } = state
  const list = useMemo(() => checks ?? [], [checks])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const sorted = useMemo(() => sortChecksBySeverity(list), [list])
  const counts = getCheckCounts(list)
  const summaryLabel = getChecksSummaryLabel(list)
  const SummaryIcon =
    counts.failing > 0
      ? CHECK_ICON.failure
      : counts.needsAction > 0
        ? CHECK_ICON.action_required
        : counts.pending > 0
          ? CHECK_ICON.pending
          : counts.passing > 0
            ? CHECK_ICON.success
            : CircleDashed
  const summaryColor =
    counts.failing > 0
      ? CHECK_COLOR.failure
      : counts.needsAction > 0
        ? CHECK_COLOR.action_required
        : counts.pending > 0
          ? CHECK_COLOR.pending
          : counts.passing > 0
            ? CHECK_COLOR.success
            : 'text-muted-foreground'
  const actions = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-7 shrink-0"
          disabled={mrExtrasLoading}
          onClick={() => reloadMrExtras()}
          aria-label={translate('auto.components.PullRequestPage.5d0f42766d', 'Refresh checks')}
        >
          <RefreshCw className={cn('size-3.5', mrExtrasLoading && 'animate-spin')} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {translate('auto.components.PullRequestPage.5d0f42766d', 'Refresh checks')}
      </TooltipContent>
    </Tooltip>
  )
  return (
    <ChecksTabLayouts
      loading={mrExtrasLoading}
      listLength={list.length}
      variant="page"
      compactHeader={<div />}
      actions={actions}
      SummaryIcon={SummaryIcon}
      summaryColor={summaryColor}
      summaryLabel={summaryLabel}
      counts={counts}
      sorted={sorted}
      renderCheckRow={(check: PRCheckDetail) => {
        const key = getCheckDetailsKey(check)
        return (
          <CheckRow
            key={key}
            check={check}
            variant="page"
            expanded={expandedKey === key}
            detailsState={undefined}
            onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
            onRetryDetails={() => {}}
            openUrlLabel={translate('auto.components.TaskPage.codehubOpenCheck', 'Open in CodeHub')}
          />
        )
      }}
      fixChecksAgentDialog={<div />}
    />
  )
}
