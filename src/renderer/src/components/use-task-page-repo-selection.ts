import type { TaskPageStoreBindingsModel } from './use-task-page-store-bindings'
import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { getTaskProjectPickerGroups } from '@/components/task-page-default-repo-selection'
import { areStringSetsEqual } from '@/components/task-page-string-set-equality'
import { buildSelectedReposKey } from '@/components/task-page-work-item-pagination'
import {
  ensureDefaultedTaskProvider,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider,
  resolveVisibleTaskProvider
} from '../../../shared/task-providers'
import {
  getSourceOptions,
  getGitHubModeButtons,
  getLinearModeOptions,
  getJiraPresets,
  getGitLabIssueFilters,
  getGitLabMRFilters,
  getLinearViewOptions,
  getLinearGroupOptions,
  getLinearOrderOptions,
  getLinearDisplayProperties
} from '@/components/task-page-localized-options'
import type { TaskProvider } from '../../../shared/task-providers'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { getTaskPageRepoSourceContext } from './task-page-source-context'
import { useTaskProjectGrouping } from './use-task-project-grouping'
import {
  buildBuilderTaskProjects,
  builderTaskRepoSelectionId
} from '@/workbench/task-builder-projects'
import { findRepoForHost } from '@/store/slices/repo-host-identity'
export function useTaskPageRepoSelection(model: TaskPageStoreBindingsModel) {
  const {
    settings,
    pageData,
    updateSettings,
    linearStatus,
    preflightStatus,
    jiraStatus,
    preflightStatusCurrent,
    linearConnected
  } = model
  const {
    eligibleRepos,
    builderProjects,
    builderHosts,
    normalizeRepoSelection,
    allTaskRepoSelection
  } = useTaskProjectGrouping(model)

  // Why: initial selection precedence — explicit preselection > persisted defaultRepoSelection > all eligible; preselection wins so "open tasks for this repo" lands single-repo.
  const resolvedInitialSelection = useMemo<ReadonlySet<string>>(() => {
    const preferred = pageData.preselectedRepoId
    if (preferred && eligibleRepos.some((repo) => repo.id === preferred)) {
      if (builderProjects) {
        const context = pageData.openCodeHubSourceContext
        const repo = findRepoForHost(eligibleRepos, preferred, {
          settings,
          hostId: context?.repoId === preferred ? context.hostId : undefined
        })
        return repo
          ? normalizeRepoSelection(new Set([builderTaskRepoSelectionId(repo)]))
          : allTaskRepoSelection
      }
      return new Set([preferred])
    }
    const persisted = settings?.defaultRepoSelection
    if (Array.isArray(persisted)) {
      return normalizeRepoSelection(new Set(persisted))
    }
    return allTaskRepoSelection
  }, [
    eligibleRepos,
    pageData.preselectedRepoId,
    pageData.openCodeHubSourceContext,
    settings,
    builderProjects,
    normalizeRepoSelection,
    allTaskRepoSelection
  ])
  const [repoSelection, setRepoSelection] = useState<ReadonlySet<string>>(resolvedInitialSelection)
  const taskPickerGroups = useMemo(
    () =>
      builderProjects
        ? buildBuilderTaskProjects(eligibleRepos, builderHosts, repoSelection)
        : getTaskProjectPickerGroups(eligibleRepos, repoSelection),
    [builderProjects, eligibleRepos, builderHosts, repoSelection]
  )
  const taskPickerRepos = useMemo(
    () => taskPickerGroups.flatMap((group) => (group.repo ? [group.repo] : [])),
    [taskPickerGroups]
  )

  // Why: prune removed repos and preserve sticky-all (selection == all projects stays == all), without recreating the Set each time and churning the fetch effect.
  const previousAllSelectionRef = useRef(allTaskRepoSelection)
  useEffect(() => {
    const previousAll = previousAllSelectionRef.current
    previousAllSelectionRef.current = allTaskRepoSelection
    const eligibleIds = new Set(
      eligibleRepos.map((r) => (builderProjects ? builderTaskRepoSelectionId(r) : r.id))
    )
    const wasAll = previousAll.size > 0 && areStringSetsEqual(repoSelection, previousAll)
    const pruned = new Set<string>()
    for (const id of repoSelection) {
      if (builderProjects || eligibleIds.has(id)) {
        pruned.add(id)
      }
    }
    if (wasAll) {
      const allNow = allTaskRepoSelection
      if (!areStringSetsEqual(allNow, repoSelection)) {
        setRepoSelection(allNow)
      }
      return
    }
    if (pruned.size === 0 && eligibleIds.size === 0) {
      return
    }
    const normalized = normalizeRepoSelection(pruned)
    if (!areStringSetsEqual(normalized, repoSelection)) {
      setRepoSelection(normalized)
    }
  }, [eligibleRepos, repoSelection, builderProjects, allTaskRepoSelection, normalizeRepoSelection])
  const selectedRepos = useMemo(
    () =>
      eligibleRepos.filter((r) =>
        repoSelection.has(builderProjects ? builderTaskRepoSelectionId(r) : r.id)
      ),
    [eligibleRepos, repoSelection, builderProjects]
  )
  const selectedNativeRepoIds = useMemo(
    () => new Set(selectedRepos.map((repo) => repo.id)),
    [selectedRepos]
  )

  // Why: see buildSelectedReposKey — array-identity deps re-fire on every
  // repos:changed even when the selection is unchanged. The context part is
  // resolved as GitHub, but every provider-independent field (projectId,
  // hostId, projectHostSetupId, repoId) is identical across providers, so the
  // GitLab effect can key off this too — it passes no gitlabProjectRef, so its
  // context carries no providerIdentity of its own. Thread a projectRef into
  // that call and this key needs a GitLab-scoped part.
  const selectedReposKey = useMemo(
    () => buildSelectedReposKey(selectedRepos, (r) => getTaskPageRepoSourceContext(r, 'github')),
    [selectedRepos]
  )

  // Why: many affordances need *a* repo; use the first selected as default, while cross-repo dialogs still let the user override per-action.
  const primaryRepo = selectedRepos[0] ?? null
  const linearWorkspaces = linearStatus.workspaces ?? []
  const selectedLinearWorkspaceId =
    linearStatus.selectedWorkspaceId ??
    linearStatus.activeWorkspaceId ??
    linearWorkspaces[0]?.id ??
    null
  const selectedLinearWorkspace =
    selectedLinearWorkspaceId && selectedLinearWorkspaceId !== 'all'
      ? (linearWorkspaces.find((workspace) => workspace.id === selectedLinearWorkspaceId) ?? null)
      : null
  const jiraSites = useMemo(() => jiraStatus.sites ?? [], [jiraStatus.sites])
  const selectedJiraSiteId =
    jiraStatus.selectedSiteId ?? jiraStatus.activeSiteId ?? jiraSites[0]?.id ?? null
  const selectedJiraSite =
    selectedJiraSiteId && selectedJiraSiteId !== 'all'
      ? (jiraSites.find((site) => site.id === selectedJiraSiteId) ?? null)
      : null
  const preferredVisibleTaskProviders = useMemo(() => {
    const normalized = normalizeVisibleTaskProviders(settings?.visibleTaskProviders)
    // Older profiles saved the provider list before CodeHub existed. Show it once;
    // a later opt-out sets visibleTaskProvidersDefaultedForCodehub and is kept.
    if (settings?.visibleTaskProvidersDefaultedForCodehub === true) {
      return normalized
    }
    return ensureDefaultedTaskProvider(normalized, 'codehub', 'gitlab')
  }, [settings?.visibleTaskProviders, settings?.visibleTaskProvidersDefaultedForCodehub])
  const defaultTaskSource = settings?.defaultTaskSource ?? 'github'
  const visibleTaskProviders = useMemo(
    () =>
      restoreAvailableDefaultTaskProvider(
        preferredVisibleTaskProviders,
        {
          gitlabInstalled: preflightStatusCurrent && preflightStatus?.glab?.installed === true,
          linearConnected: linearConnected === true
        },
        defaultTaskSource
      ),
    [
      defaultTaskSource,
      linearConnected,
      preferredVisibleTaskProviders,
      preflightStatusCurrent,
      preflightStatus?.glab?.installed
    ]
  )
  const sourceOptions = getSourceOptions()
  const githubModeButtons = getGitHubModeButtons()
  const linearModeOptions = getLinearModeOptions()
  const jiraPresets = getJiraPresets()
  const gitLabIssueFilters = getGitLabIssueFilters()
  const gitLabMRFilters = getGitLabMRFilters()
  const linearViewOptions = getLinearViewOptions()
  const linearGroupOptions = getLinearGroupOptions()
  const linearOrderOptions = getLinearOrderOptions()
  const linearDisplayPropertyOptions = getLinearDisplayProperties()
  const visibleSourceOptions = useMemo(
    () => sourceOptions.filter((source) => visibleTaskProviders.includes(source.id)),
    [sourceOptions, visibleTaskProviders]
  )
  const hideTaskSource = useCallback(
    (provider: TaskProvider, label: string) => {
      const visibleWithoutProvider = preferredVisibleTaskProviders.filter(
        (visibleProvider) => visibleProvider !== provider
      )
      // Why: an empty provider list normalizes to "all providers", so keep one other source visible or hiding this one has no effect.
      const nextVisibleTaskProviders: TaskProvider[] =
        visibleWithoutProvider.length > 0 ? visibleWithoutProvider : ['github']
      const nextDefaultTaskSource = resolveVisibleTaskProvider(
        defaultTaskSource,
        nextVisibleTaskProviders
      )
      void updateSettings({
        visibleTaskProviders: nextVisibleTaskProviders,
        defaultTaskSource: nextDefaultTaskSource
      }).catch(() => {
        toast.error(
          translate('auto.components.TaskPage.e9139db03f', 'Failed to hide {{value0}}.', {
            value0: label
          })
        )
      })
    },
    [defaultTaskSource, preferredVisibleTaskProviders, updateSettings]
  )

  // Why: seed preset + query synchronously so the first fetch issues one request; a prior post-mount re-seed caused a throwaway empty-query fetch, doubling time-to-first-paint.
  const nextModel = model as typeof model & {
    eligibleRepos: typeof eligibleRepos
    resolvedInitialSelection: typeof resolvedInitialSelection
    repoSelection: typeof repoSelection
    setRepoSelection: typeof setRepoSelection
    taskPickerGroups: typeof taskPickerGroups
    taskPickerRepos: typeof taskPickerRepos
    normalizeRepoSelection: typeof normalizeRepoSelection
    allTaskRepoSelection: typeof allTaskRepoSelection
    selectedRepos: typeof selectedRepos
    selectedNativeRepoIds: typeof selectedNativeRepoIds
    selectedReposKey: typeof selectedReposKey
    primaryRepo: typeof primaryRepo
    linearWorkspaces: typeof linearWorkspaces
    selectedLinearWorkspaceId: typeof selectedLinearWorkspaceId
    selectedLinearWorkspace: typeof selectedLinearWorkspace
    jiraSites: typeof jiraSites
    selectedJiraSiteId: typeof selectedJiraSiteId
    selectedJiraSite: typeof selectedJiraSite
    preferredVisibleTaskProviders: typeof preferredVisibleTaskProviders
    defaultTaskSource: typeof defaultTaskSource
    visibleTaskProviders: typeof visibleTaskProviders
    sourceOptions: typeof sourceOptions
    githubModeButtons: typeof githubModeButtons
    linearModeOptions: typeof linearModeOptions
    jiraPresets: typeof jiraPresets
    gitLabIssueFilters: typeof gitLabIssueFilters
    gitLabMRFilters: typeof gitLabMRFilters
    linearViewOptions: typeof linearViewOptions
    linearGroupOptions: typeof linearGroupOptions
    linearOrderOptions: typeof linearOrderOptions
    linearDisplayPropertyOptions: typeof linearDisplayPropertyOptions
    visibleSourceOptions: typeof visibleSourceOptions
    hideTaskSource: typeof hideTaskSource
  }
  nextModel.eligibleRepos = eligibleRepos
  nextModel.resolvedInitialSelection = resolvedInitialSelection
  nextModel.repoSelection = repoSelection
  nextModel.setRepoSelection = setRepoSelection
  nextModel.taskPickerGroups = taskPickerGroups
  nextModel.taskPickerRepos = taskPickerRepos
  nextModel.normalizeRepoSelection = normalizeRepoSelection
  nextModel.allTaskRepoSelection = allTaskRepoSelection
  nextModel.selectedRepos = selectedRepos
  nextModel.selectedNativeRepoIds = selectedNativeRepoIds
  nextModel.selectedReposKey = selectedReposKey
  nextModel.primaryRepo = primaryRepo
  nextModel.linearWorkspaces = linearWorkspaces
  nextModel.selectedLinearWorkspaceId = selectedLinearWorkspaceId
  nextModel.selectedLinearWorkspace = selectedLinearWorkspace
  nextModel.jiraSites = jiraSites
  nextModel.selectedJiraSiteId = selectedJiraSiteId
  nextModel.selectedJiraSite = selectedJiraSite
  nextModel.preferredVisibleTaskProviders = preferredVisibleTaskProviders
  nextModel.defaultTaskSource = defaultTaskSource
  nextModel.visibleTaskProviders = visibleTaskProviders
  nextModel.sourceOptions = sourceOptions
  nextModel.githubModeButtons = githubModeButtons
  nextModel.linearModeOptions = linearModeOptions
  nextModel.jiraPresets = jiraPresets
  nextModel.gitLabIssueFilters = gitLabIssueFilters
  nextModel.gitLabMRFilters = gitLabMRFilters
  nextModel.linearViewOptions = linearViewOptions
  nextModel.linearGroupOptions = linearGroupOptions
  nextModel.linearOrderOptions = linearOrderOptions
  nextModel.linearDisplayPropertyOptions = linearDisplayPropertyOptions
  nextModel.visibleSourceOptions = visibleSourceOptions
  nextModel.hideTaskSource = hideTaskSource
  return nextModel
}
export type TaskPageRepoSelectionModel = ReturnType<typeof useTaskPageRepoSelection>
