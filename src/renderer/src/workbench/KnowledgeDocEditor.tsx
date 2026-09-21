import React, { Suspense, useLayoutEffect, useMemo, useState } from 'react'
import { MarkdownPreview, RichMarkdownEditor } from '@/components/editor/editor-lazy-views'
import { RichMarkdownErrorBoundary } from '@/components/editor/RichMarkdownErrorBoundary'
import { getCachedMarkdownRichModeEligibility } from '@/components/editor/markdown-rich-mode-eligibility-cache'
import { getMarkdownRenderMode } from '@/components/editor/markdown-render-mode'
import { extractFrontMatter, prependFrontMatter } from '@/components/editor/markdown-frontmatter'
import { RICH_MARKDOWN_MAX_SIZE_BYTES } from '../../../shared/constants'
import { formatBytes } from '@/components/status-bar/workspace-space-format'
import type { KbDoc, KbNote, KbNoteKind } from './knowledge-demo-data'
import { kbDocById, kbGroupByKey } from './knowledge-doc-registry'
import { KnowledgeDocEditorRail } from './KnowledgeDocEditorRail'

type Side = 'gap' | 'note'
/** Align with Orca markdown edit toggles; preview covers HTML-heavy READMEs. */
type PaneMode = 'rich' | 'preview' | 'source'

type Props = {
  docs: KbDoc[]
  docId: string
  filePath: string
  /** Repo-relative path — required for Orca paragraph annotations. */
  relativePath: string
  worktreeId: string
  body: string
  savedBody: string
  notes: KbNote[]
  saving: boolean
  onBack: () => void
  onBodyChange: (body: string) => void
  onSave: (content?: string) => void
  onAddNote: (docId: string, kind: KbNoteKind, body: string) => void
}

function KbEditorFallback(): React.JSX.Element {
  return <div className="kb-ed-fallback wb-muted">加载编辑器…</div>
}

/** V7 文档编辑器：全宽 + Orca rich/preview/source + 按段批注。 */
export function KnowledgeDocEditor(props: Props): React.JSX.Element | null {
  const {
    docs,
    docId,
    filePath,
    relativePath,
    worktreeId,
    body,
    savedBody,
    notes,
    saving,
    onBack,
    onBodyChange,
    onSave,
    onAddNote
  } = props
  const doc = kbDocById(docs, docId)
  const [side, setSide] = useState<Side>('gap')
  const [noteKind, setNoteKind] = useState<KbNoteKind>('verbose')
  const [noteBody, setNoteBody] = useState('')
  const [paneMode, setPaneMode] = useState<PaneMode>('rich')
  const [modeForDocId, setModeForDocId] = useState(docId)
  // Why: keep the doc column wide for Orca's in-pane annotation rail; open on demand.
  const [railOpen, setRailOpen] = useState(false)
  if (modeForDocId !== docId) {
    setModeForDocId(docId)
    const eligibility = getCachedMarkdownRichModeEligibility({
      content: body,
      sizeOverridden: false
    })
    setPaneMode(eligibility.unsupportedMessage || eligibility.exceedsSizeLimit ? 'preview' : 'rich')
    setRailOpen(false)
  }

  const richEligibility = useMemo(
    () => getCachedMarkdownRichModeEligibility({ content: body, sizeOverridden: false }),
    [body]
  )
  const renderMode = useMemo(
    () =>
      getMarkdownRenderMode({
        exceedsRichModeSizeLimit: richEligibility.exceedsSizeLimit,
        hasRichModeUnsupportedContent: richEligibility.unsupportedMessage !== null,
        viewMode: paneMode === 'preview' ? 'preview' : paneMode === 'source' ? 'source' : 'rich'
      }),
    [paneMode, richEligibility.exceedsSizeLimit, richEligibility.unsupportedMessage]
  )

  // Why: leaving the hidden terminal's xterm helper focused makes typing land in
  // the PTY instead of this document. Blur before TipTap's mount autofocus so
  // the rich editor can take the caret.
  useLayoutEffect(() => {
    if (paneMode !== 'rich') {
      return
    }
    const active = document.activeElement
    if (active instanceof HTMLElement && !active.closest('[data-screen="kb"]')) {
      active.blur()
    }
  }, [docId, paneMode])

  if (!doc) {
    return null
  }
  const grp = kbGroupByKey(doc.group)
  const dirty = body !== savedBody
  const isToml = doc.path.endsWith('.toml')
  const fileId = `workbench-kb:${docId}`
  const canAnnotate = Boolean(worktreeId && relativePath && !isToml)
  const richUnsupportedMessage = paneMode === 'rich' ? richEligibility.unsupportedMessage : null
  const sizeFallbackMessage =
    paneMode === 'rich' && richEligibility.exceedsSizeLimit && !richUnsupportedMessage
      ? `文件超过 ${formatBytes(RICH_MARKDOWN_MAX_SIZE_BYTES)} 富文本上限，已改用源码。`
      : null
  const fallbackBanner = richUnsupportedMessage ?? sizeFallbackMessage

  const frontMatter = extractFrontMatter(body)
  const richBody = frontMatter ? frontMatter.body : body
  const onRichContentChange = frontMatter
    ? (next: string): void => onBodyChange(prependFrontMatter(frontMatter.raw, next))
    : onBodyChange
  const onRichSave = frontMatter
    ? (next: string): void => onSave(prependFrontMatter(frontMatter.raw, next))
    : (next: string): void => onSave(next)

  let paneBody: React.JSX.Element
  if (isToml || renderMode === 'source') {
    paneBody = (
      <>
        {fallbackBanner ? <div className="kb-ed-banner">{fallbackBanner}</div> : null}
        <textarea
          className="kb-ed-ta"
          spellCheck={false}
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
        />
      </>
    )
  } else if (renderMode === 'rich-editor') {
    paneBody = (
      <div className="kb-ed-md min-h-0 flex h-full flex-1 flex-col">
        <Suspense fallback={<KbEditorFallback />}>
          <RichMarkdownErrorBoundary fileId={fileId}>
            <RichMarkdownEditor
              fileId={fileId}
              viewStateId={fileId}
              content={richBody}
              filePath={filePath}
              worktreeId={worktreeId || fileId}
              scrollCacheKey={`workbench-kb-rich:${docId}`}
              onContentChange={onRichContentChange}
              onDirtyStateHint={() => {}}
              onSave={onRichSave}
              markdownAnnotationsEnabled={canAnnotate}
              markdownAnnotationFilePath={relativePath}
              markdownReviewContent={body}
            />
          </RichMarkdownErrorBoundary>
        </Suspense>
      </div>
    )
  } else {
    paneBody = (
      <div className="kb-ed-md min-h-0 flex-1">
        <Suspense fallback={<KbEditorFallback />}>
          <MarkdownPreview
            content={body}
            filePath={filePath}
            sourceWorktreeId={worktreeId || null}
            scrollCacheKey={`workbench-kb-preview:${docId}`}
            markdownAnnotationsEnabled={canAnnotate}
          />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="kb-ed">
      <div className="kb-ed-bar">
        <button type="button" className="wb-btn wb-btn-ghost wb-btn-sm" onClick={onBack}>
          ← 清单
        </button>
        <div className="kb-ed-title">
          <strong>{doc.name}</strong>
          <span className="kb-ed-path">{doc.path}</span>
        </div>
        {grp ? (
          <span className="wb-tag wb-tag-outline kb-doc-chan">
            {grp.name} · {grp.who}
          </span>
        ) : null}
        <button
          type="button"
          className={`wb-btn wb-btn-sm${railOpen ? ' wb-btn-secondary' : ' wb-btn-ghost'}`}
          aria-pressed={railOpen}
          onClick={() => setRailOpen((open) => !open)}
        >
          {railOpen ? '收起侧栏' : '对照 / 意见'}
        </button>
        <button
          type="button"
          className="wb-btn wb-btn-primary wb-btn-sm"
          data-workbench-kb-save
          disabled={!dirty || saving}
          onClick={() => onSave()}
        >
          {saving ? '保存中…' : dirty ? '写回仓库' : '已保存'}
        </button>
      </div>
      <div className={`kb-ed-split${railOpen ? ' is-rail-open' : ''}`}>
        <div className="kb-ed-pane">
          <div className="kb-ed-pane-head">
            <span className="kb-ed-lang">{isToml ? 'TOML' : 'Markdown'}</span>
            <div className="kb-ed-pane-tools">
              {!isToml ? (
                <div className="seg kb-ed-mode-seg" role="radiogroup" aria-label="正文模式">
                  <label className="seg-opt">
                    <input
                      type="radio"
                      name="kb-pane-mode"
                      checked={paneMode === 'rich'}
                      onChange={() => setPaneMode('rich')}
                    />
                    富文本
                  </label>
                  <label className="seg-opt">
                    <input
                      type="radio"
                      name="kb-pane-mode"
                      checked={paneMode === 'preview'}
                      onChange={() => setPaneMode('preview')}
                    />
                    预览
                  </label>
                  <label className="seg-opt">
                    <input
                      type="radio"
                      name="kb-pane-mode"
                      checked={paneMode === 'source'}
                      onChange={() => setPaneMode('source')}
                    />
                    源码
                  </label>
                </div>
              ) : null}
              <span className="wb-muted">
                {canAnnotate ? '可按段批注 · ' : ''}
                {dirty ? '有未保存修改' : '与仓库一致'}
              </span>
            </div>
          </div>
          {paneBody}
        </div>
        {railOpen ? (
          <KnowledgeDocEditorRail
            docId={docId}
            notes={notes}
            side={side}
            noteKind={noteKind}
            noteBody={noteBody}
            onSideChange={setSide}
            onNoteKindChange={setNoteKind}
            onNoteBodyChange={setNoteBody}
            onAddNote={onAddNote}
            onClose={() => setRailOpen(false)}
          />
        ) : null}
      </div>
    </div>
  )
}
