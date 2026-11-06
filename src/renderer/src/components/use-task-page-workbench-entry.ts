import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { parseTaskQuery } from '../../../shared/task-query'
import {
  workbenchTaskEntryQuery,
  workbenchVersionTaskLabel
} from '../../../shared/workbench/task-scope'
import type { TaskPageJiraCreationMetadataModel } from './use-task-page-jira-creation-metadata'

/** An explicit goal visit starts fresh. Subsequent native filters narrow its reference set. */
export function useTaskPageWorkbenchEntry(model: TaskPageJiraCreationMetadataModel) {
  const { pageData, taskResumeApplied } = model
  const entry = pageData.workbenchTaskScope ?? null
  const versionLabel = entry ? workbenchVersionTaskLabel(entry.version) : null
  const query = parseTaskQuery(model.appliedTaskSearch)
  const entryKey = entry
    ? JSON.stringify([entry.version, entry.goalId, pageData.preselectedRepoId])
    : ''
  const [seededEntryKey, setSeededEntryKey] = useState(entry?.goalId ? '' : entryKey)
  const previousEntry = useRef(entry)
  const scope =
    entry &&
    (entry.goalId ||
      model.taskSource !== 'github' ||
      query.labels.includes(versionLabel!) ||
      seededEntryKey !== entryKey)
      ? entry
      : null
  useEffect(() => {
    if (!entry) {
      previousEntry.current = null
      setSeededEntryKey('')
      return
    }
    if (!taskResumeApplied || seededEntryKey === entryKey) {
      return
    }
    setSeededEntryKey(entryKey)
    const next = workbenchTaskEntryQuery(model.appliedTaskSearch, entry, previousEntry.current)
    if (entry.goalId) {
      model.setRepoSelection(model.resolvedInitialSelection)
      model.setGithubMode('items')
      model.setActiveTaskPreset(null)
      model.setCodehubView('issues')
      model.setCodehubState('all')
      model.setCodehubPreset('open')
      model.setCodehubQuery('')
      model.setCodehubAuthor('')
      model.setCodehubAssignee('')
      model.setCodehubLabels([])
    }
    previousEntry.current = entry
    model.setTaskSearchInput(next)
    model.setAppliedTaskSearch(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, seededEntryKey, taskResumeApplied])
  useEffect(() => {
    if (!entry || scope || !taskResumeApplied) {
      return
    }
    useAppStore.setState((state) => ({
      taskPageData: { ...state.taskPageData, workbenchTaskScope: null }
    }))
  }, [entry, scope, taskResumeApplied])

  return { entry, scope }
}
