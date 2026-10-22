import { React } from 'react'
import { ArrowLeft, Check, ChevronRight, ExternalLink, Pencil } from 'lucide-react'
import { Field, titleForTask } from './shared.jsx'
import { ReactMarkdown } from 'react-markdown'
import { remarkGfm } from 'remark-gfm'

function PrototypeTasks({
  backFromIssue,
  editingIssue,
  issue,
  issueDraft,
  notice,
  returnTo,
  setEditingIssue,
  setIssueDraft,
  setIssues,
  setNotice,
  taskList,
  tasks,
  version
}) {
  return (
    <div className="native-tasks-page">
      {issue ? (
        <>
          <div className="task-detail-top">
            <button className="btn btn-ghost" onClick={backFromIssue}>
              <ArrowLeft />
              {returnTo === 'monday'
                ? '返回版本计划'
                : returnTo === 'friday'
                  ? '返回版本验收'
                  : '返回任务列表'}
            </button>
            <a href={issue.url} target="_blank" rel="noreferrer">
              GitHub
              <ExternalLink />
            </a>
          </div>
          <h2 className="issue-title">
            {issue.title} <span>#{issue.number}</span>
          </h2>
          <div className="issue-properties">
            <span className={`tag ${issue.state === 'CLOSED' ? 'tag-success' : 'tag-neutral'}`}>
              {issue.state === 'CLOSED' ? '已关闭' : '开放'}
            </span>
            {issue.labels.map((l) => (
              <span className="tag tag-outline" key={l.name}>
                {l.name}
              </span>
            ))}
          </div>
          <section className="issue-description">
            <header>
              <strong>描述</strong>
              <span>更新于 {issue.updatedAt.slice(0, 10)}</span>
              {editingIssue ? (
                <>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setIssueDraft(issue.body)
                      setEditingIssue(false)
                    }}
                  >
                    取消
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={issueDraft === issue.body}
                    onClick={() => {
                      setIssues((xs) =>
                        xs.map((x) =>
                          x.number === issue.number
                            ? {
                                ...x,
                                body: issueDraft
                              }
                            : x
                        )
                      )
                      setEditingIssue(false)
                      setNotice('已保存到原型，未写入 GitHub')
                    }}
                  >
                    <Check />
                    保存
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-icon btn-ghost"
                  aria-label="编辑描述"
                  onClick={() => {
                    setIssueDraft(issue.body)
                    setEditingIssue(true)
                  }}
                >
                  <Pencil />
                </button>
              )}
            </header>
            {editingIssue ? (
              <Field label="Issue 描述" value={issueDraft} onChange={setIssueDraft} rows={12} />
            ) : (
              <div className="issue-rendered">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {issue.body || '暂无描述'}
                </ReactMarkdown>
              </div>
            )}
          </section>
          <p className="task-save-status" role="status">
            {notice}
          </p>
        </>
      ) : (
        <>
          <div className="native-task-heading">
            <strong>GitHub</strong>
            <span className="tag tag-outline">{version}</span>
            <span>{tasks.length} 项关联任务</span>
          </div>
          {taskList(tasks)}
        </>
      )}
    </div>
  )
}
function PrototypeTaskList({ items, openIssue }) {
  return (
    <div className="task-list" aria-label="版本 Issue 列表">
      {items.map((t) => (
        <button key={t.number} className="task-list-row" onClick={() => openIssue(t)}>
          <span className={`task-state ${t.state === 'CLOSED' ? 'closed' : 'open'}`}>
            {t.state === 'CLOSED' ? <Check /> : <span className="open-circle" />}
          </span>
          <span className="task-number">#{t.number}</span>
          <span className="task-title">{titleForTask(t)}</span>
          <span className="task-goal">{t.goal}</span>
          <span className="task-readable-state">
            {t.state === 'CLOSED'
              ? '已关闭'
              : t.labels?.some((l) => l.name === 'bw:status:inreview')
                ? '待评审'
                : t.labels?.some((l) => l.name === 'bw:status:inprogress')
                  ? '进行中'
                  : '开放'}
          </span>
          <ChevronRight />
        </button>
      ))}
    </div>
  )
}
export { PrototypeTasks, PrototypeTaskList }
