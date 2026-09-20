import React from 'react'
import { KB_NOTE_KINDS, type KbNote, type KbNoteKind } from './knowledge-demo-data'
import { gapsOfDoc, noteKindName, notesOfDoc, openGapsOfDoc } from './knowledge-gap-utils'

type Side = 'gap' | 'note'

function GapCard({ gap }: { gap: ReturnType<typeof gapsOfDoc>[number] }): React.JSX.Element {
  return (
    <div className={`kb-gap is-${gap.state}`}>
      <div className="kb-gap-k">设计说</div>
      <div className="kb-gap-v">{gap.design}</div>
      <div className="kb-gap-k">现在是</div>
      <div className="kb-gap-v">{gap.impl}</div>
      {gap.state !== 'ok' && gap.ask === 'wait' ? (
        <div className="kb-gap-acts">
          <button type="button" className="wb-btn wb-btn-ghost wb-btn-sm">
            提交给人确认
          </button>
        </div>
      ) : null}
      {gap.state !== 'ok' && gap.ask !== 'wait' ? (
        <div className="kb-gap-acts">
          <button type="button" className="wb-btn wb-btn-primary wb-btn-sm">
            改实现
          </button>
          <button type="button" className="wb-btn wb-btn-ghost wb-btn-sm">
            提交改设计
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** 对照 / 意见侧栏（默认可收起，避免挤占按段批注栏）。 */
export function KnowledgeDocEditorRail({
  docId,
  notes,
  side,
  noteKind,
  noteBody,
  onSideChange,
  onNoteKindChange,
  onNoteBodyChange,
  onAddNote,
  onClose
}: {
  docId: string
  notes: KbNote[]
  side: Side
  noteKind: KbNoteKind
  noteBody: string
  onSideChange: (side: Side) => void
  onNoteKindChange: (kind: KbNoteKind) => void
  onNoteBodyChange: (body: string) => void
  onAddNote: (docId: string, kind: KbNoteKind, body: string) => void
  onClose: () => void
}): React.JSX.Element {
  const openGaps = openGapsOfDoc(docId)
  const docNotes = notesOfDoc(notes, docId)
  const allGaps = gapsOfDoc(docId)

  return (
    <aside className="kb-ed-rail">
      <div className="kb-ed-rail-head">
        <div className="seg kb-ed-side-seg" role="radiogroup" aria-label="侧栏">
          <label className="seg-opt">
            <input
              type="radio"
              name="kb-side"
              checked={side === 'gap'}
              onChange={() => onSideChange('gap')}
            />
            对照
          </label>
          <label className="seg-opt">
            <input
              type="radio"
              name="kb-side"
              checked={side === 'note'}
              onChange={() => onSideChange('note')}
            />
            意见{docNotes.length > 0 ? ` · ${docNotes.length}` : ''}
          </label>
        </div>
        <button type="button" className="wb-btn wb-btn-ghost wb-btn-sm" onClick={onClose}>
          收起
        </button>
      </div>
      {side === 'gap' ? (
        <div className="kb-ed-side-body">
          <p className="kb-doc-lede">
            设计约束实现。对不上：改实现，或提交给人改设计。不把现状写回文档。
          </p>
          {openGaps.length > 0 ? (
            openGaps.map((g) => <GapCard key={g.id} gap={g} />)
          ) : allGaps.some((g) => g.state === 'ok') ? (
            <p className="kb-doc-lede">对照过，实现跟这份设计一致。</p>
          ) : (
            <p className="kb-doc-lede">还没对照过这份。</p>
          )}
        </div>
      ) : (
        <div className="kb-ed-side-body">
          {docNotes.length > 0 ? (
            docNotes.map((n) => (
              <div key={n.id} className="kb-note">
                <span className="wb-tag wb-tag-outline">{noteKindName(n.kind)}</span>
                <p className="kb-note-body">{n.body}</p>
              </div>
            ))
          ) : (
            <p className="kb-doc-lede">还没有意见。内容啰嗦、或写偏了定位，都可以提。</p>
          )}
          <div className="kb-note-form">
            <div className="seg">
              {KB_NOTE_KINDS.map((k) => (
                <label key={k.key} className="seg-opt">
                  <input
                    type="radio"
                    name="kb-note-kind"
                    checked={noteKind === k.key}
                    onChange={() => onNoteKindChange(k.key)}
                  />
                  {k.name}
                </label>
              ))}
            </div>
            <textarea
              className="kb-ed-note-input"
              rows={3}
              placeholder="说清楚：哪一段不够简洁，或哪句偏离了这份文档该干什么"
              value={noteBody}
              onChange={(e) => onNoteBodyChange(e.target.value)}
            />
            <div className="kb-gap-acts">
              <button
                type="button"
                className="wb-btn wb-btn-primary wb-btn-sm"
                disabled={!noteBody.trim()}
                onClick={() => {
                  const text = noteBody.trim()
                  if (!text) {
                    return
                  }
                  onAddNote(docId, noteKind, text)
                  onNoteBodyChange('')
                }}
              >
                提交修改意见
              </button>
            </div>
            <p className="kb-note-hint">只写意见，不替改。你确认后才改这份文档。</p>
          </div>
        </div>
      )}
    </aside>
  )
}
