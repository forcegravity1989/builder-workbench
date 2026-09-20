import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { KnowledgeCodeGraph } from './KnowledgeCodeGraph'
import { KnowledgeDocEditor } from './KnowledgeDocEditor'
import { KnowledgeDocsGuide } from './KnowledgeDocsGuide'
import {
  KB_AUDIT,
  KB_BIGFILES,
  KB_GAPS,
  KB_INITIAL_NOTES,
  KB_TABS,
  KB_VIEWS,
  kbDocById,
  kbGroupsForAudience,
  type KbAudience,
  type KbNote,
  type KbNoteKind,
  type KbTab
} from './knowledge-demo-data'
import { openGapCount } from './knowledge-gap-utils'
import { useKnowledgeRepo } from './use-knowledge-repo'
import { joinFsPath } from './project-charter'
import './workbench-kb.css'

/** V7 保真：文档 / 代码 / 对账 — 文档正文从 activeRepo 仓库读取。 */
export function KnowledgePage(): React.JSX.Element {
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const {
    activeRepo,
    docs,
    bodies,
    setBodies,
    savedBodies,
    loading,
    error,
    mapStatus,
    reload,
    saveDoc
  } = useKnowledgeRepo()
  const [tab, setTab] = useState<KbTab>('docs')
  const [audience, setAudience] = useState<KbAudience>('eng')
  const [groupKey, setGroupKey] = useState('eng-contract')
  const [docId, setDocId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState<KbNote[]>([...KB_INITIAL_NOTES])
  const [noteSeq, setNoteSeq] = useState(KB_INITIAL_NOTES.length)

  const audienceGroups = useMemo(() => kbGroupsForAudience(audience), [audience])
  const mains = useMemo(() => audienceGroups.filter((g) => g.role === 'main'), [audienceGroups])
  const sides = useMemo(() => audienceGroups.filter((g) => g.role === 'side'), [audienceGroups])
  const audienceDocs = useMemo(
    () => docs.filter((d) => audienceGroups.some((g) => g.key === d.group)),
    [audienceGroups, docs]
  )
  const diffCount = openGapCount()

  useEffect(() => {
    if (!audienceGroups.some((g) => g.key === groupKey)) {
      setGroupKey(audienceGroups[0]?.key ?? 'eng-contract')
    }
  }, [audience, audienceGroups, groupKey])

  useEffect(() => {
    if (docs.length === 0) {
      setDocId(null)
      setEditorOpen(false)
      return
    }
    setDocId((prev) => (prev && docs.some((d) => d.id === prev) ? prev : docs[0].id))
  }, [docs])

  const pickAudience = (next: KbAudience) => {
    setAudience(next)
    const first = kbGroupsForAudience(next)[0]
    if (first) {
      setGroupKey(first.key)
    }
  }

  const pickGroup = (key: string) => {
    setGroupKey(key)
    const first = docs.find((d) => d.group === key)
    if (first) {
      setDocId(first.id)
    }
  }

  const openDoc = (id: string) => {
    setDocId(id)
    const doc = kbDocById(docs, id)
    if (doc) {
      setGroupKey(doc.group)
    }
    setTab('docs')
    setEditorOpen(true)
  }

  const addNote = (targetDocId: string, kind: KbNoteKind, body: string) => {
    setNoteSeq((n) => n + 1)
    setNotes((prev) => [...prev, { id: `n-${noteSeq}`, docId: targetDocId, kind, body }])
  }

  const handleSave = async (targetDocId: string, content?: string) => {
    setSaving(true)
    try {
      const result = await saveDoc(targetDocId, content)
      if (result.wrote) {
        toast.success('已写回仓库')
      } else {
        toast.error(result.error ?? '写回失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const worktreeId = useAppStore((s) => {
    if (!activeRepo) {
      return ''
    }
    const list = s.worktreesByRepo[activeRepo.id] ?? []
    if (s.activeWorktreeId && list.some((w) => w.id === s.activeWorktreeId)) {
      return s.activeWorktreeId
    }
    return list[0]?.id ?? ''
  })

  const repoLabel = activeRepo?.displayName?.trim() || activeRepo?.path || '未选项目'
  const pageDesc = loading
    ? '正在从仓库加载文档…'
    : error
      ? `加载失败：${error}`
      : activeRepo
        ? `${docs.length} 份仓库文档 · ${repoLabel}`
        : '请先接入项目'

  return (
    <div className={`wb-kb${editorOpen && tab === 'docs' ? ' is-ed' : ''}`} data-screen="kb">
      <header className="page-head">
        <div>
          <h1>知识库</h1>
          <p className="page-desc">{pageDesc}</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="wb-btn wb-btn-secondary wb-btn-sm"
            disabled={!activeRepo?.path || loading}
            onClick={() => reload()}
          >
            刷新
          </button>
          <button
            type="button"
            className="wb-btn wb-btn-secondary"
            onClick={() => openSettingsPage()}
          >
            项目配置 →
          </button>
        </div>
      </header>

      <div className="kb-toolbar">
        <div className="seg" role="tablist" aria-label="知识库分区">
          {KB_TABS.map((t) => (
            <label key={t.key} className="seg-opt">
              <input
                type="radio"
                name="kb-tab"
                checked={tab === t.key}
                onChange={() => {
                  setTab(t.key)
                  if (t.key !== 'docs') {
                    setEditorOpen(false)
                  }
                }}
              />
              {t.name}
            </label>
          ))}
        </div>
        <div className="kb-toolbar-right">
          {tab === 'audit' ? (
            <button
              type="button"
              className="wb-btn wb-btn-primary wb-btn-sm"
              data-workbench-kb-rescan
              onClick={() => toast.message('原型演示：会开 asset-audit 会话，只写评论不替改')}
            >
              现在盘一遍
            </button>
          ) : (
            <button type="button" className="kb-audit-meta" onClick={() => setTab('audit')}>
              上次盘点 {KB_AUDIT.when} · {diffCount} 条差异
            </button>
          )}
        </div>
      </div>

      <div className={`kb-body${editorOpen && tab === 'docs' ? ' is-ed' : ''}`}>
        {tab === 'docs' && editorOpen && docId ? (
          <KnowledgeDocEditor
            docs={docs}
            docId={docId}
            filePath={
              activeRepo?.path
                ? joinFsPath(activeRepo.path, kbDocById(docs, docId)?.path ?? '')
                : ''
            }
            worktreeId={worktreeId}
            relativePath={kbDocById(docs, docId)?.path ?? ''}
            body={bodies[docId] ?? ''}
            savedBody={savedBodies[docId] ?? ''}
            notes={notes}
            saving={saving}
            onBack={() => setEditorOpen(false)}
            onBodyChange={(body) => setBodies((prev) => ({ ...prev, [docId]: body }))}
            onSave={(content) => void handleSave(docId, content)}
            onAddNote={addNote}
          />
        ) : null}

        {tab === 'docs' && !editorOpen ? (
          <KnowledgeDocsGuide
            audience={audience}
            groupKey={groupKey}
            docId={docId}
            docs={docs}
            audienceGroups={audienceGroups}
            mains={mains}
            sides={sides}
            audienceDocs={audienceDocs}
            notes={notes}
            loading={loading}
            hasRepo={Boolean(activeRepo)}
            mapStatus={mapStatus}
            onAudienceChange={pickAudience}
            onPickGroup={pickGroup}
            onOpenDoc={openDoc}
          />
        ) : null}

        {tab === 'code' ? (
          <>
            <div className="wb-card kb-graph">
              <span className="card-kicker">代码结构</span>
              <span className="card-title">shared → main → workbench</span>
              <KnowledgeCodeGraph />
              <div className="kb-graph-foot">索引时间 2026-09-15 · codegraph explore（演示）</div>
            </div>
            <div className="wb-card kb-graph">
              <span className="card-kicker">大文件榜</span>
              <span className="card-title">
                按符号密度排（codegraph big_files 前 20，演示前 5）
              </span>
              <div className="kb-files">
                {KB_BIGFILES.map((f) => (
                  <div key={f.path} className="kb-file-row">
                    <span className="kb-file-path">{f.path}</span>
                    <span className="kb-file-meta">
                      {f.lang} · {f.nodes} 个符号 · {f.size}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="wb-card kb-graph">
              <span className="card-kicker">架构全景</span>
              <span className="card-title">Kruchten 4+1 · 尚未交付</span>
              <p className="kb-doc-lede">
                03 主张由负责架构的 AI
                对照代码更新；人读「相对上次变了什么、哪笔债进下一次迭代」。今天没有这份正本，五格全是未知，不装绿。
              </p>
              <div className="kb-views">
                {KB_VIEWS.map((v) => (
                  <div key={v.name} className="kb-view">
                    <span className="kb-view-dot" />
                    <div className="kb-view-name">{v.name}</div>
                    <div className="kb-view-meta">未建 · {v.hint}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {tab === 'audit' ? (
          <div className="wb-card kb-audit">
            <span className="card-kicker">一致性</span>
            <span className="card-title">上次盘点 · {KB_AUDIT.issue}</span>
            <p className="kb-doc-lede">
              {KB_AUDIT.last}。对不上的点进去，回到文档页做对照。不替改；改实现或改设计都由人点。
            </p>
            <div className="kb-audit-list">
              {KB_GAPS.map((g) => {
                const d = kbDocById(docs, g.docId)
                return (
                  <button
                    key={g.id}
                    type="button"
                    className={`kb-audit-row is-${g.state}`}
                    onClick={() => openDoc(g.docId)}
                    disabled={!d}
                  >
                    <span className="kb-audit-dot" />
                    <span className="kb-audit-doc">{d?.name ?? g.docId}</span>
                    <span className="kb-audit-note">{g.impl}</span>
                  </button>
                )
              })}
            </div>
            <div className="hint">
              没有升级按钮。重盘是开一场 asset-audit 会话，不是在这屏改文件。
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
