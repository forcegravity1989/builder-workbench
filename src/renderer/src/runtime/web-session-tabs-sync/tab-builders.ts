import type {
  RuntimeMobileSessionBrowserTab,
  RuntimeMobileSessionTabsResult
} from '../../../../shared/runtime-types'
import type { BrowserWorkspace } from '../../../../shared/browser-workspace-types'
import type { Tab } from '../../../../shared/tab-types'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { OpenFile } from '../../store/slices/editor'
import { buildOwnedEditorFileId } from '../../store/slices/editor/file-ids/editor-file-ids'
import { toRuntimeExecutionHostId } from '../../../../shared/execution-host'
import type { ReadyEditorSurface, MirroredEditorTab } from './state'
import type { WebSessionExistingTabIndex } from '../web-session-existing-tab-index'
import { isReadyEditorTab, localEditorFileId, editorSourceFileId } from './terminal-surfaces'

export function buildTerminalUnifiedTab(
  tab: TerminalTab,
  groupId: string,
  environmentId: string,
  // Why: viewMode is host-tracked but the client's optimistic toggle must win during the echo window; callers pass the reconciled value.
  viewMode?: Tab['viewMode']
): Tab {
  return {
    id: tab.id,
    entityId: tab.id,
    groupId,
    worktreeId: tab.worktreeId,
    executionHostId: toRuntimeExecutionHostId(environmentId),
    contentType: 'terminal',
    label: tab.title,
    ...(tab.quickCommandLabel?.trim() ? { quickCommandLabel: tab.quickCommandLabel.trim() } : {}),
    ...(tab.generatedTitle?.trim() ? { generatedLabel: tab.generatedTitle.trim() } : {}),
    ...(tab.aiVaultTitle ? { aiVaultTitle: tab.aiVaultTitle } : {}),
    customLabel: tab.customTitle,
    color: tab.color,
    sortOrder: tab.sortOrder,
    createdAt: tab.createdAt,
    isPreview: false,
    isPinned: tab.isPinned === true,
    ...(viewMode ? { viewMode } : {})
  }
}

export function buildBrowserUnifiedTab(
  tab: BrowserWorkspace,
  hostTab: RuntimeMobileSessionBrowserTab,
  existingUnifiedTab: Tab | null,
  groupId: string,
  environmentId: string
): Tab {
  return {
    id: existingUnifiedTab?.id ?? hostTab.id,
    entityId: tab.id,
    groupId,
    worktreeId: tab.worktreeId,
    executionHostId: toRuntimeExecutionHostId(environmentId),
    contentType: 'browser',
    label: tab.title,
    customLabel: null,
    color: hostTab.color !== undefined ? hostTab.color : (existingUnifiedTab?.color ?? null),
    sortOrder: tab.createdAt,
    createdAt: tab.createdAt,
    isPreview: false,
    isPinned:
      hostTab.isPinned !== undefined
        ? hostTab.isPinned === true
        : existingUnifiedTab?.isPinned === true
  }
}

export function buildEditorUnifiedTab(
  file: OpenFile,
  tab: ReadyEditorSurface,
  hostTabId: string,
  existingUnifiedTab: Tab | null,
  label: string,
  groupId: string,
  sortOrder: number,
  createdAt: number,
  environmentId: string
): Tab {
  return {
    id: hostTabId,
    entityId: file.id,
    groupId,
    worktreeId: file.worktreeId,
    executionHostId: toRuntimeExecutionHostId(environmentId),
    contentType: 'editor',
    label,
    customLabel: null,
    color: tab.color !== undefined ? tab.color : (existingUnifiedTab?.color ?? null),
    sortOrder,
    createdAt,
    isPreview: false,
    isPinned:
      tab.isPinned !== undefined ? tab.isPinned === true : existingUnifiedTab?.isPinned === true
  }
}

export function buildMirroredEditorTabs(
  snapshot: RuntimeMobileSessionTabsResult,
  environmentId: string,
  worktreeOpenFileById: ReadonlyMap<string, OpenFile>,
  existingTabIndex: WebSessionExistingTabIndex,
  hostGroupIdByTabId: ReadonlyMap<string, string>,
  fallbackGroupId: string,
  sortOffset: number,
  now: number,
  hasLocalDraft: (fileId: string) => boolean
): MirroredEditorTab[] {
  // Hydration assigns the host-qualified ID. Reuse it so reconnect keeps its draft and tab state.
  const restoredMirrorId = (path: string): string | undefined => {
    const id = buildOwnedEditorFileId(path, snapshot.worktree, environmentId)
    const file = worktreeOpenFileById.get(id)
    return file?.mirroredFromRuntimeSession === true && file.runtimeEnvironmentId === environmentId
      ? id
      : undefined
  }
  return snapshot.tabs.filter(isReadyEditorTab).map((tab, index) => {
    const localFileId = localEditorFileId(tab)
    const sourcePath = editorSourceFileId(tab)
    const fileId = sourcePath ? localFileId : (restoredMirrorId(tab.filePath) ?? localFileId)
    const existingFile = worktreeOpenFileById.get(fileId)
    const existingUnifiedTab = existingTabIndex.getEditorUnifiedTab(fileId, tab.id)
    const sourceFileId = sourcePath ? (restoredMirrorId(sourcePath) ?? sourcePath) : undefined
    const keepsLocalDraft =
      existingFile?.isDirty === true &&
      existingFile.runtimeEnvironmentId === environmentId &&
      hasLocalDraft(fileId)
    const groupId = hostGroupIdByTabId.get(tab.id) ?? fallbackGroupId
    const file: OpenFile = {
      ...existingFile,
      id: fileId,
      filePath: tab.filePath,
      relativePath: tab.relativePath,
      worktreeId: snapshot.worktree,
      language: tab.language,
      isDirty: tab.isDirty || keepsLocalDraft,
      runtimeEnvironmentId: environmentId,
      mode: tab.type === 'markdown' ? tab.mode : 'edit',
      markdownPreviewSourceFileId: sourceFileId,
      // Why: marks this tab host-owned so a later snapshot that omits it can cull it; locally opened tabs lack this flag and survive.
      mirroredFromRuntimeSession: true
    }
    return {
      file,
      hostTabId: tab.id,
      unifiedTab: buildEditorUnifiedTab(
        file,
        tab,
        tab.id,
        existingUnifiedTab,
        tab.title.trim() || tab.relativePath || 'File',
        groupId,
        sortOffset + index,
        existingUnifiedTab?.createdAt ?? now + sortOffset + index,
        environmentId
      )
    }
  })
}
