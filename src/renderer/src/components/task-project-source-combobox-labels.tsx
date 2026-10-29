import React from 'react'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import RepoBadgeLabel from '@/components/repo/RepoBadgeLabel'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../shared/repo-types'
import type { TaskProjectPickerGroup } from './task-page-default-repo-selection'
import type { TaskProjectSourceStatus } from './task-project-source-combobox'
import {
  selectedTaskProjectGroups,
  isTaskProjectGroupSelected,
  getSelectedTaskProjectSource,
  hasMultipleTaskProjectHostsInGroup
} from './task-project-source-combobox-model'

export function renderTriggerLabel(
  groups: readonly TaskProjectPickerGroup[],
  selected: ReadonlySet<string>
): React.JSX.Element {
  if (groups.length === 0) {
    return (
      <span className="text-muted-foreground">
        {translate('auto.components.task.project.source.combobox.noProjects', 'No projects')}
      </span>
    )
  }
  const selectedProjectGroups = selectedTaskProjectGroups(groups, selected)
  if (
    selectedProjectGroups.length > 0 &&
    groups.some((group) => group.sources.length > 0) &&
    groups
      .filter((group) => group.sources.length > 0)
      .every((group) => isTaskProjectGroupSelected(group, selected))
  ) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5">
        {translate('auto.components.task.project.source.combobox.allProjects', 'All projects')}
      </span>
    )
  }
  if (selectedProjectGroups.length === 0) {
    return (
      <span className="truncate text-muted-foreground">
        {translate(
          'auto.components.task.project.source.combobox.sourceUnavailable',
          'Selected project source is unavailable'
        )}
      </span>
    )
  }
  const [first, second, ...rest] = selectedProjectGroups
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
      {first ? (
        <RepoBadgeLabel
          name={first.repo.displayName}
          color={first.repo?.badgeColor ?? '#737373'}
          badgeClassName="size-1.5"
        />
      ) : null}
      {second ? <span className="text-muted-foreground">, {second.repo.displayName}</span> : null}
      {rest.length > 0 ? <span className="text-muted-foreground">+{rest.length}</span> : null}
    </span>
  )
}

export function getProjectDetail(
  group: TaskProjectPickerGroup,
  selected: ReadonlySet<string>,
  showHostLabels: boolean,
  getRepoHostLabel?: (repo: Repo) => string | null | undefined
): string {
  const selectedSource = getSelectedTaskProjectSource(group, selected)
  if (!selectedSource) {
    return ''
  }
  const hostLabel = showHostLabels ? getRepoHostLabel?.(selectedSource)?.trim() : ''
  if (hasMultipleTaskProjectHostsInGroup(group)) {
    const hostCount = translate(
      'auto.components.task.project.source.combobox.hostCount',
      '{{value0}} hosts',
      {
        value0: String(new Set(group.sources.map(getRepoExecutionHostId)).size)
      }
    )
    return hostLabel ? `${hostLabel} · ${hostCount}` : hostCount
  }
  return hostLabel ? `${hostLabel} · ${selectedSource.path}` : selectedSource.path
}

export function getSourceDetail(repo: Repo, status?: TaskProjectSourceStatus | null): string {
  return status?.label ? `${repo.path} · ${status.label}` : repo.path
}
