import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { editor as monacoEditor } from 'monaco-editor'
import { LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import { codehubApi } from '@/lib/codehub-api'
import { PRFilesCombinedDiffBody } from '@/components/github-item-dialog/inspect-pull-request/pr-files-combined-diff-body'
import { getCombinedDiffBranchEntriesInTreeOrder } from '@/components/editor/combined-diff/browse-files/combined-diff-file-tree-filter'
import { useCombinedDiffSectionIndexMap } from '@/components/editor/combined-diff/resolve-changes/use-combined-diff-section-index-map'
import { handleCombinedDiffFileTreeNavigation } from '@/components/editor/combined-diff/browse-files/combined-diff-file-tree-navigation'
import { getDiffSectionRowEstimatedHeight } from '@/components/editor/diff-section-layout'
import type { DiffSection } from '@/components/editor/diff-section-types'
import type { CombinedDiffFileTreeEntry } from '@/components/editor/combined-diff/resolve-changes/combined-diff-section-identity'
import type { DecoratedDiffComment } from '@/components/diff-comments/decorated-diff-comment'
import { formatRelativeTime } from '@/components/github/work-item-state-presentation'
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
  const { item, detail, comments, setComments } = state
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
  // for the mount; each patch is parsed once and shared between the section
  // contents and the rebuilt→real line-number mapping.
  const [entries] = useState<GitBranchChangeEntry[]>(() =>
    getCombinedDiffBranchEntriesInTreeOrder('commit', files.map(gitHubPRFileToBranchEntry))
  )
  const [patchByPath] = useState(() => {
    const map = new Map<
      string,
      { original: string; modified: string; modifiedRealLines: number[] } | null
    >()
    for (const file of files) {
      map.set(file.path, file.isBinary ? null : parseCodeHubPatch(file.patch))
    }
    return map
  })
  const [sections, setSections] = useState<DiffSection[]>(() =>
    entries.map((entry) => {
      const parsed = patchByPath.get(entry.path)
      return {
        key: getPRFileSectionKey(entry.path),
        path: entry.path,
        oldPath: entry.oldPath,
        status: entry.status,
        added: entry.added,
        removed: entry.removed,
        originalContent: parsed?.original ?? '',
        modifiedContent: parsed?.modified ?? '',
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
  const noCommentableLines = useCallback((): readonly number[] | undefined => undefined, [])
  const renderNoCheckbox = useCallback(() => null, [])

  // Line-anchored notes decorate the rebuilt diff; their real file line must be
  // mapped back to the rebuilt position. Notes on lines the patch omits (hunk
  // gaps) and notes whose anchor went stale (isOutdated — the file changed
  // under them) have no rebuilt line to sit on, so they stay in the
  // conversation tab only, matching GitHub's inline behavior. The worktree id
  // must equal the body's `github-pr:<repoId>:<prNumber>` or the decorator
  // filters the comment out.
  const inlineReviewComments = useMemo<DecoratedDiffComment[]>(() => {
    if (comments.length === 0) {
      return []
    }
    const worktreeId = `github-pr:${item.repoId ?? ''}:${item.iid}`
    return comments.flatMap((comment) => {
      if (!comment.path || comment.line == null || comment.isOutdated) {
        return []
      }
      const realLines = patchByPath.get(comment.path)?.modifiedRealLines
      const rebuiltLine = realLines ? realLines.indexOf(comment.line) : -1
      if (rebuiltLine < 0) {
        return []
      }
      const createdAtMs = new Date(comment.createdAt).getTime()
      return [
        {
          id: `codehub-mr-comment:${comment.id}`,
          worktreeId,
          filePath: comment.path,
          source: 'diff',
          lineNumber: rebuiltLine + 1,
          body: comment.body,
          createdAt: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(),
          side: 'modified',
          author: comment.author ?? undefined,
          authorAvatarUrl: comment.authorAvatarUrl ?? undefined,
          createdAtLabel: formatRelativeTime(comment.createdAt),
          canDelete: false,
          canEdit: false
        }
      ]
    })
  }, [comments, item.iid, item.repoId, patchByPath])

  const handleAddLineComment = useCallback(
    async (
      section: DiffSection,
      { lineNumber, startLine, body }: { lineNumber: number; startLine?: number; body: string }
    ): Promise<boolean> => {
      const repoPath = item.repoPath
      if (!repoPath) {
        return false
      }
      // The rebuilt diff concatenates hunks, so the editor's line number is a
      // rebuilt position; map it to the real new-file line before anchoring
      // the DiffNote, or the note lands on the wrong line on CodeHub.
      const realLines = patchByPath.get(section.path)?.modifiedRealLines
      const realLine = realLines ? realLines[lineNumber - 1] : undefined
      if (!realLine) {
        toast.error(
          translate('auto.components.GitHubItemDialog.b0b09778c8', 'Failed to add review comment.')
        )
        return false
      }
      const realStartLine = startLine != null ? realLines?.[startLine - 1] : undefined
      return codehubApi
        .createComment({
          repoPath,
          repoId: item.repoId,
          kind: item.type,
          iid: item.iid,
          body,
          path: section.path,
          line: realLine,
          startLine: realStartLine != null && realStartLine !== realLine ? realStartLine : null
        })
        .then(async () => {
          const rows = await codehubApi.listComments({
            repoPath,
            repoId: item.repoId,
            kind: item.type,
            iid: item.iid
          })
          setComments(rows)
          toast.success(
            translate('auto.components.GitHubItemDialog.a341343303', 'Review comment added.')
          )
          return true
        })
        .catch((reason: unknown) => {
          toast.error(reason instanceof Error ? reason.message : String(reason))
          return false
        })
    },
    [item, patchByPath, setComments]
  )

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
      inlineReviewComments={inlineReviewComments}
      loadSection={noOp}
      retrySection={noOp}
      toggleSection={toggleSection}
      openFilesOnGitHub={openMrChangesOnCodeHub}
      openSectionLabel={translate(
        'auto.components.TaskPage.codehubOpenMrChanges',
        'Open changes in CodeHub'
      )}
      renderViewedCheckbox={renderNoCheckbox}
      handleAddLineComment={handleAddLineComment}
      getCommentableLineNumbers={noCommentableLines}
      setSectionHeights={setSectionHeights}
      setSections={setSections}
      modifiedEditorsRef={modifiedEditorsRef}
      handleSectionSaveRef={handleSectionSaveRef}
    />
  )
}
