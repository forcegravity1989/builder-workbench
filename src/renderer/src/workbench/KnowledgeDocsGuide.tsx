import { ChevronRight } from 'lucide-react'
import React, { useState } from 'react'
import {
  KB_AUDIENCES,
  KB_ENG_FLOW,
  KB_ENG_LIST_ORDER,
  KB_NOT_YOURS,
  type KbAudience,
  type KbDoc,
  type KbGroup,
  type KbNote
} from './knowledge-demo-data'
import type { KnowledgeMapStatus } from './knowledge-map'
import { gapMark } from './knowledge-gap-utils'
import { openProjectOnboard } from './project-onboard-state'

type Props = {
  audience: KbAudience
  groupKey: string
  docId: string | null
  docs: KbDoc[]
  audienceGroups: KbGroup[]
  mains: KbGroup[]
  sides: KbGroup[]
  audienceDocs: KbDoc[]
  notes: KbNote[]
  loading: boolean
  hasRepo: boolean
  mapStatus: KnowledgeMapStatus | 'missing'
  onAudienceChange: (audience: KbAudience) => void
  onPickGroup: (key: string) => void
  onOpenDoc: (id: string) => void
}

const ENG_LIST_RANK = new Map<string, number>(KB_ENG_LIST_ORDER.map((key, index) => [key, index]))

function byEngListOrder(groups: KbGroup[]): KbGroup[] {
  return [...groups].sort(
    (a, b) => (ENG_LIST_RANK.get(a.key) ?? 99) - (ENG_LIST_RANK.get(b.key) ?? 99)
  )
}

/** 文档页：用户 / 工程受众切换 + 分组清单。 */
export function KnowledgeDocsGuide(props: Props): React.JSX.Element {
  const {
    audience,
    groupKey,
    docId,
    docs,
    audienceGroups,
    mains,
    sides,
    audienceDocs,
    notes,
    loading,
    hasRepo,
    mapStatus,
    onAudienceChange,
    onPickGroup,
    onOpenDoc
  } = props
  const [openGroups, setOpenGroups] = useState<ReadonlySet<string>>(() => new Set())
  const tableGroups = audience === 'eng' ? byEngListOrder(audienceGroups) : audienceGroups
  const sideGroups = audience === 'eng' ? byEngListOrder(sides) : sides

  const toggleGroup = (key: string): void => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const pickGroup = (key: string): void => {
    setOpenGroups((prev) => {
      if (prev.has(key)) {
        return prev
      }
      const next = new Set(prev)
      next.add(key)
      return next
    })
    onPickGroup(key)
  }

  const mapHint =
    mapStatus === 'reviewed'
      ? null
      : mapStatus === 'draft'
        ? '分类地图为草稿（.bw/knowledge-map.toml），可用 bw-knowledge-docs Skill 审阅。'
        : hasRepo
          ? '还没有分类地图；接入时会写草稿，也可用 bw-knowledge-docs Skill 生成。'
          : null

  return (
    <div className="kb-guide">
      <div className="wb-card kb-logic">
        <div className="seg kb-audience-seg" role="radiogroup" aria-label="文档受众">
          {KB_AUDIENCES.map((a) => (
            <label key={a.key} className="seg-opt">
              <input
                type="radio"
                name="kb-audience"
                checked={audience === a.key}
                onChange={() => onAudienceChange(a.key)}
              />
              {a.name}
            </label>
          ))}
        </div>
        <p className="kb-logic-lede">
          {audience === 'user'
            ? '用户文档：产品帮助与对外 README。给访客看，不进工程对账。'
            : '工程文档：愿景/契约约束当前活跃特性与实现。对账只盯工程契约与活跃特性；参考与 Agent 入口在侧栏。'}
        </p>
        {mapHint ? <p className="kb-logic-lede kb-map-hint">{mapHint}</p> : null}
        {audience === 'eng' ? (
          <div className="kb-flow">
            {mains.map((g, i) => (
              <React.Fragment key={g.key}>
                <button
                  type="button"
                  className={`kb-node${groupKey === g.key ? ' is-on' : ''}`}
                  onClick={() => pickGroup(g.key)}
                >
                  <span className="kb-node-n">{i + 1}</span>
                  <strong>{g.name}</strong>
                  <span>{g.hint}</span>
                </button>
                {i < mains.length - 1 ? (
                  <div className="kb-edge" aria-hidden="true">
                    <span>{KB_ENG_FLOW[i]?.say ?? ''}</span>
                  </div>
                ) : null}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="kb-sides kb-user-mains">
            {mains.map((g) => (
              <button
                key={g.key}
                type="button"
                className={`kb-side${groupKey === g.key ? ' is-on' : ''}`}
                onClick={() => pickGroup(g.key)}
              >
                <strong>{g.name}</strong>
                <span>
                  {g.path} · {g.hint}
                </span>
              </button>
            ))}
          </div>
        )}
        {sides.length > 0 ? (
          <>
            <p className="kb-flow-back">
              {audience === 'eng'
                ? '工程参考给人查阅；Agent 入口约束日常改动；.bw/ 是机器名片。'
                : null}
            </p>
            <div className="kb-sides">
              {sideGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className={`kb-side${groupKey === g.key ? ' is-on' : ''}`}
                  onClick={() => pickGroup(g.key)}
                >
                  <strong>{g.name}</strong>
                  <span>
                    {g.who} · {g.when}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="wb-card kb-list">
        <span className="card-kicker">{audience === 'user' ? '用户文档清单' : '工程文档清单'}</span>
        <p className="kb-doc-lede">
          {audience === 'user'
            ? '来自文档站 MDX 与对外 README；可浏览编辑，默认不参与对账。'
            : '契约 / 当前活跃特性可对账；参考与 Agent 入口可查可改。点一行打开编辑器。'}
        </p>
        {loading ? (
          <p className="kb-doc-lede">正在扫描仓库…</p>
        ) : !hasRepo ? (
          <p className="kb-doc-lede">
            请先接入项目。
            <button
              type="button"
              className="wb-btn wb-btn-primary wb-btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => openProjectOnboard()}
            >
              + 接入项目
            </button>
          </p>
        ) : audienceDocs.length === 0 ? (
          <p className="kb-doc-lede">
            {audience === 'user'
              ? '仓库里还没有用户文档（docs/site/content/docs/ 或 README）。'
              : '仓库里还没有纳入工程线的文档。可放在 docs/、活跃特性目录或仓根 AGENTS.md；接入时会写 knowledge-map 草稿。'}
          </p>
        ) : (
          <table className="kb-table">
            <thead>
              <tr>
                <th>文档</th>
                <th>干什么</th>
                <th>{audience === 'eng' ? '对照' : '—'}</th>
              </tr>
            </thead>
            <tbody>
              {tableGroups.map((g) => {
                const groupDocs = docs.filter((d) => d.group === g.key)
                if (groupDocs.length === 0) {
                  return null
                }
                const folded = !openGroups.has(g.key)
                const heading = (
                  <>
                    {g.name} · <code>{g.path}</code>
                    <span className="kb-sec-meta">
                      {g.who} · {g.when}
                    </span>
                  </>
                )
                return (
                  <React.Fragment key={g.key}>
                    <tr className="kb-sec">
                      <td colSpan={3}>
                        <button
                          type="button"
                          className="kb-sec-toggle"
                          aria-expanded={!folded}
                          onClick={() => toggleGroup(g.key)}
                        >
                          <ChevronRight
                            className={`kb-sec-chevron${folded ? '' : ' is-open'}`}
                            aria-hidden="true"
                          />
                          <span>{heading}</span>
                        </button>
                      </td>
                    </tr>
                    {folded
                      ? null
                      : groupDocs.map((d) => {
                          const mark = gapMark(d.id, notes)
                          return (
                            <tr
                              key={d.id}
                              className={`rowbtn${docId === d.id ? ' is-on' : ''}${groupKey === g.key ? ' in-layer' : ''}`}
                            >
                              <td>
                                <button
                                  type="button"
                                  className="kb-row-btn"
                                  onClick={() => onOpenDoc(d.id)}
                                >
                                  <code>{d.name}</code>
                                </button>
                              </td>
                              <td>{d.lede}</td>
                              <td className="kb-gap-col">
                                {audience !== 'eng' ? (
                                  <span className="wb-muted">浏览</span>
                                ) : mark.openCount > 0 ? (
                                  <span className="wb-tag wb-tag-warning">{mark.openCount} 处</span>
                                ) : mark.allOk ? (
                                  <span className="wb-tag wb-tag-success">一致</span>
                                ) : (
                                  <span className="wb-muted">—</span>
                                )}
                                {audience === 'eng' && mark.noteCount > 0 ? (
                                  <span className="wb-tag wb-tag-outline">
                                    {' '}
                                    {mark.noteCount} 意见
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          )
                        })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="kb-out">
          不在这屏：
          {KB_NOT_YOURS.map((x) => `${x.name} → ${x.go}`).join('；')}
        </p>
      </div>
    </div>
  )
}
