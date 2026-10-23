import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { editor as monacoEditor } from 'monaco-editor'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { PRFilesCombinedDiffBody } from '@/components/github-item-dialog/inspect-pull-request/pr-files-combined-diff-body'
import { getCombinedDiffBranchEntriesInTreeOrder } from '@/components/editor/combined-diff/browse-files/combined-diff-file-tree-filter'
import { useCombinedDiffSectionIndexMap } from '@/components/editor/combined-diff/resolve-changes/use-combined-diff-section-index-map'
import { handleCombinedDiffFileTreeNavigation } from '@/components/editor/combined-diff/browse-files/combined-diff-file-tree-navigation'
import { getDiffSectionRowEstimatedHeight } from '@/components/editor/diff-section-layout'
import type { DiffSection } from '@/components/editor/diff-section-types'
import type { CombinedDiffFileTreeEntry } from '@/components/editor/combined-diff/resolve-changes/combined-diff-section-identity'
import {
  PR_DIFF_OVERSCAN,
  getPRFileSectionKey,
  gitHubPRFileToBranchEntry
} from '@/components/github/pr-file-diff-mapping'
import { parseCodeHubPatch } from '../../../../../shared/codehub-mr-detail'
import type { CodeHubMrFileChange } from '../../../../../shared/codehub-mr-detail'
import type { GitBranchChangeEntry } from '../../../../../shared/git-diff-compare-types'
import type { CodeHubDetailState } from './use-codehub-detail'

const EMPTY_VIEWED_KEYS: Set<string> = new Set<string>()

export function CodeHubFilesTab({ state }: { state: CodeHubDetailState }): React.JSX.Element {
  const { files, mrExtrasLoading, reloadMrExtras } = state
  if (mrExtrasLoading && (files === null || files.length === 0)) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (files === null || files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="text-[12px] text-muted-foreground">
          {translate('auto.components.PullRequestPage.6ad2c1ab9c', 'No files changed.')}
        </div>
        <Button variant="outline" size="sm" onClick={() => reloadMrExtras()}>
          <RefreshCw className="size-3.5" />
          {translate('auto.components.PullRequestPage.5df7c41d2a', 'Retry')}
        </Button>
      </div>
    )
  }
  // Why: remounting on the file signature retires the previous diff set's sections
  // and virtualizer state in one step when the MR or its refresh swaps the files.
  return <CodeHubFilesSections key={filesSignature(files)} state={state} files={files} />
}

function filesSignature(files: CodeHubMrFileChange[]): string {
  return files
    .map((file) =>
      [
        file.path,
        file.oldPath ?? '',
        file.status,
        file.additions,
        file.deletions,
        file.patch.length
      ].join('')
    )
    .join('\0')
}

function CodeHubFilesSections({
  state,
  files
}: {
  state: CodeHubDetailState
  files: CodeHubMrFileChange[]
}): React.JSX.Element {
  const { item, detail } = state
  const settings = useAppStore((s) => s.settings)
  const isDark =
    settings?.theme === 'dark' ||
    (settings?.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [sideBySide, setSideBySide] = useState(false)
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)
  const [sectionHeights, setSectionHeights] = useState<Record<number, number>>({})
  const [activeTreeSectionKey, setActiveTreeSectionKey] = useState<string | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const modifiedEditorsRef = useRef<Map<number, monacoEditor.IStandaloneCodeEditor>>(new Map())
  const handleSectionSaveRef = useRef<(index: number) => Promise<void>>(async () => {})

  // Why: this subtree is keyed by the files signature, so its file set is fixed
  // for the mount; sections are built once with patch-rebuilt inline content.
  const [entries] = useState<GitBranchChangeEntry[]>(() =>
    getCombinedDiffBranchEntriesInTreeOrder('commit', files.map(gitHubPRFileToBranchEntry))
  )
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const [sections, setSections] = useState<DiffSection[]>(() =>
    entries.map((entry) => {
      const file = fileByPath.get(entry.path)
      const { original, modified } =
        file && !file.isBinary ? parseCodeHubPatch(file.patch) : { original: '', modified: '' }
      return {
        key: getPRFileSectionKey(entry.path),
        path: entry.path,
        oldPath: entry.oldPath,
        status: entry.status,
        added: entry.added,
        removed: entry.removed,
        originalContent: original,
        modifiedContent: modified,
        collapsed: false,
        loading: false,
        error: undefined,
        dirty: false,
        diffResult: null,
        largeDiffRenderLimit: null
      }
    })
  )
  const sectionsRef = useRef<DiffSection[]>(sections)
  useLayoutEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  // CodeHub 内容随 patch 内联,没有按需加载;折叠只翻转 collapsed。
  const toggleSection = useCallback((index: number) => {
    setSections((current) =>
      current.map((section, i) =>
        i === index ? { ...section, collapsed: !section.collapsed } : section
      )
    )
  }, [])
  const setAllSectionsCollapsed = useCallback((collapsed: boolean) => {
    setSections((current) => current.map((section) => ({ ...section, collapsed })))
  }, [])
  const allSectionsCollapsed = sections.length > 0 && sections.every((section) => section.collapsed)

  const signature = useMemo(() => filesSignature(files), [files])
  const sectionIndexByKey = useCombinedDiffSectionIndexMap({ entrySignature: signature, sections })

  const virtualizer = useVirtualizer({
    count: sections.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const section = sections[index]
      if (!section) {
        return 88
      }
      return getDiffSectionRowEstimatedHeight(section, sectionHeights[index])
    },
    overscan: PR_DIFF_OVERSCAN,
    getItemKey: (index) => {
      const section = sections[index]
      return section ? `${section.key}:${section.collapsed ? 'collapsed' : 'expanded'}` : `${index}`
    }
  })
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [sideBySide, virtualizer])

  const handleTreeNavigate = useCallback(
    (entry: CombinedDiffFileTreeEntry) => {
      const navigatedIndex = handleCombinedDiffFileTreeNavigation({
        mode: 'commit',
        entry,
        sections: sectionsRef.current,
        sectionIndexByKey,
        toggleSection,
        scrollToIndex: (index) => virtualizer.scrollToIndex(index, { align: 'start' })
      })
      if (navigatedIndex !== null) {
        setActiveTreeSectionKey(sectionsRef.current[navigatedIndex]?.key ?? null)
      }
    },
    [sectionIndexByKey, toggleSection, virtualizer]
  )

  const openMrChangesOnCodeHub = useCallback(() => {
    const url = detail?.url || item.url
    if (url) {
      void window.api.shell.openUrl(`${url.replace(/\/$/, '')}/changes`)
    }
  }, [detail?.url, item.url])

  const noOp = useCallback(() => {}, [])
  const noComment = useCallback(async (): Promise<boolean> => false, [])
  const noCommentableLines = useCallback((): readonly number[] | undefined => undefined, [])
  const renderNoCheckbox = useCallback(() => null, [])

  return (
    <PRFilesCombinedDiffBody
      files={files}
      repoPath={item.repoPath ?? ''}
      repoId={item.repoId ?? ''}
      prNumber={item.iid}
      fileTreeCollapsed={fileTreeCollapsed}
      allSectionsCollapsed={allSectionsCollapsed}
      sideBySide={sideBySide}
      setFileTreeCollapsed={setFileTreeCollapsed}
      setAllSectionsCollapsed={setAllSectionsCollapsed}
      setSideBySide={setSideBySide}
      entries={entries}
      sectionIndexByKey={sectionIndexByKey}
      activeTreeSectionKey={activeTreeSectionKey}
      viewedSectionKeys={EMPTY_VIEWED_KEYS}
      handleTreeNavigate={handleTreeNavigate}
      scrollContainerRef={scrollContainerRef}
      virtualizer={virtualizer}
      sections={sections}
      isDark={isDark}
      settings={settings}
      sectionHeights={sectionHeights}
      inlineReviewComments={[]}
      loadSection={noOp}
      retrySection={noOp}
      toggleSection={toggleSection}
      openFilesOnGitHub={openMrChangesOnCodeHub}
      openSectionLabel={translate(
        'auto.components.TaskPage.codehubOpenMrChanges',
        'Open changes in CodeHub'
      )}
      renderViewedCheckbox={renderNoCheckbox}
      handleAddLineComment={noComment}
      getCommentableLineNumbers={noCommentableLines}
      setSectionHeights={setSectionHeights}
      setSections={setSections}
      modifiedEditorsRef={modifiedEditorsRef}
      handleSectionSaveRef={handleSectionSaveRef}
    />
  )
}
