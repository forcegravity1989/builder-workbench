import { React, useState } from 'react'
import { Check, Copy, Download } from 'lucide-react'
import { remote } from '../../version-planning/prototype/snapshot.js'
import { titleForTask } from '../../version-planning/prototype/shared.jsx'

// 七栏固定列沿已认可的 PT 周报模板（继承自 weekly-report 试点，PR #321）；
// 合并形态下周报不再是独立屏，而是验收材料某一轮次的派生导出件。
const TEMPLATE = [
  { key: 'goals', title: '目标', columns: ['目标', '交付要求', '计划完成', '当前情况'] },
  { key: 'progress', title: '关键进展', columns: ['工作方向', '关键进展', '下周计划'] },
  {
    key: 'risks',
    title: '关键风险',
    columns: ['风险等级', '风险描述', '应对措施', '责任人', '计划关闭', '状态']
  },
  { key: 'milestones', title: '里程碑', columns: ['节点', '计划完成', '达成条件', '当前情况'] },
  {
    key: 'requirements',
    title: '子目标／需求详细进展',
    columns: ['子目标', '任务', '计划完成', '责任人', '状态', '本轮进展']
  },
  {
    key: 'problems',
    title: '问题单进展',
    columns: ['问题', '状态', '责任人', '处理进展', '下一步']
  },
  { key: 'members', title: '项目成员', columns: ['姓名', '角色', '负责范围'] }
]

function readableState(t) {
  if (t.state === 'CLOSED') {
    return `已关闭${t.closedAt ? `（${t.closedAt.slice(0, 10)}）` : ''}`
  }
  return t.labels?.some((l) => l.name === 'bw:status:inreview')
    ? '待评审'
    : t.labels?.some((l) => l.name === 'bw:status:inprogress')
      ? '进行中'
      : '开放'
}

/**
 * 从验收材料（目标 + Issue 快照 + 遗留/风险人工标记 + 出包读数）派生七栏周报。
 * 只装数据给得出的内容；缺证据的字段如实写未知/未记录，不伪造指标与责任人。
 */
export function buildWeeklySections({
  goals,
  tasks,
  hasGap,
  marks,
  latestPackage,
  roundLabel,
  version
}) {
  const carryover = tasks.filter((t) => t.state !== 'CLOSED' && marks[t.number]?.carry)
  const risky = carryover.filter((t) => marks[t.number]?.risk)
  const goalOfTask = (t) => goals.find((g) => g.label === t.goal)
  const sections = {
    goals: goals.map((g) => [
      g.title,
      g.delivery || g.metric || '未约定交付件',
      '未记录',
      g.decision === '待核对'
        ? '待核对'
        : `${g.decision}${g.decision !== '达成' && g.reason ? `：${g.reason}` : ''}`
    ]),
    progress: [
      ...goals.map((g) => [
        `${g.label} ${g.title.slice(0, 18)}${g.title.length > 18 ? '…' : ''}`,
        g.actualDelivery || g.note || '未提供',
        g.next || '未记录'
      ]),
      latestPackage
        ? [
            '出包',
            `${latestPackage.project} ${latestPackage.version}（${latestPackage.created}）`,
            '未记录'
          ]
        : ['出包', '本轮无制品包读数', '未记录']
    ],
    risks: [
      ...goals
        .filter(hasGap)
        .map((g) => [
          '待评估',
          `${g.label} 未达：${g.reason || '原因待填写'}`,
          g.next || '待会话安排',
          '未指派',
          '未记录',
          '目标未达'
        ]),
      ...risky.map((t) => [
        '待评估',
        `遗留 Issue 带风险：#${t.number} ${titleForTask(t)}`,
        goalOfTask(t)?.next || `随 ${t.goal} 在会话中跟踪安排`,
        '未指派',
        '未记录',
        'Issue 遗留'
      ])
    ],
    milestones: [],
    requirements: tasks.map((t) => [
      t.goal,
      `#${t.number} ${titleForTask(t)}`,
      '未记录',
      '未指派',
      readableState(t),
      t.progress_note ||
        (t.state === 'CLOSED'
          ? '已关闭'
          : marks[t.number]?.carry
            ? '开放；本轮标记为遗留，随目标验收跟踪'
            : '开放；本轮材料未记录进展')
    ]),
    problems: [],
    members: [['gravity', '维护者', '单人项目：需求、开发、验收；其他参与者按 PR 记录核实']]
  }
  const summaries = {
    milestones: '未定义里程碑；保留栏目骨架与短空值，不自造节点。',
    problems: `本轮快照未读取到已分类问题单；开放 Issue ${
      tasks.filter((t) => t.state !== 'CLOSED').length
    } 条、人工标记遗留 ${carryover.length} 条（其中带风险 ${risky.length} 条），见「关键风险」与「子目标／需求详细进展」。`
  }
  return {
    title: `${version} 项目周报 · ${roundLabel}`,
    source: `派生自验收材料与 Issue 快照（读取于 ${remote.readAt.slice(0, 10)}）；导出件不写回材料`,
    sections: TEMPLATE.map((section) => ({
      ...section,
      rows: sections[section.key],
      summary: summaries[section.key]
    }))
  }
}

function toMarkdown(report) {
  return `# ${report.title}\n\n${report.sections
    .map(
      (section) =>
        `## ${section.title}\n\n${
          section.rows.length
            ? `| ${section.columns.join(' | ')} |\n|${section.columns
                .map(() => '---')
                .join('|')}|\n${section.rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}`
            : ''
        }${section.summary ? `\n\n${section.summary}` : ''}`
    )
    .join('\n\n')}\n`
}

export function WeeklyExportPreview({ modal, setNotice }) {
  const report = buildWeeklySections(modal)
  const markdown = toMarkdown(report)
  const [copied, setCopied] = useState(false)
  return (
    <div className="weekly-export">
      <p className="weekly-export-meta">
        来源：{modal.version} 验收材料 · {modal.roundLabel}；Issue 快照读取于{' '}
        {remote.readAt.slice(0, 10)}
        {modal.latestPackage ? '；出包读数为 CloudDragon 制品页真实字段' : ''}
        。缺值如实写未知/未记录，不伪造指标、责任人或日期。
      </p>
      <div className="weekly-sheet" aria-label="周报导出预览">
        {report.sections.map((section) => (
          <article key={section.key}>
            <h3>{section.title}</h3>
            <table>
              <thead>
                <tr>
                  {section.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(section.rows.length ? section.rows : [[]]).map((row, r) => (
                  <tr key={r}>
                    {section.columns.map((_, c) => (
                      <td
                        key={c}
                        className={section.key === 'risks' && row.length ? 'wk-risk' : undefined}
                      >
                        {row.length ? (row[c] ?? '') || '未知' : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {section.summary && <p className="weekly-summary">{section.summary}</p>}
          </article>
        ))}
      </div>
      <div className="weekly-export-actions">
        <button
          className="btn btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(markdown)
              setCopied(true)
            } catch {
              setNotice('复制未成功；正式界面同时提供 Markdown 与 HTML 导出件')
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? '已复制 Markdown' : '复制 Markdown'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setNotice('原型未接原生下载；正式界面按同一模板与配色生成 HTML 导出件')}
        >
          <Download />
          导出 HTML¹
        </button>
        <span className="weekly-export-note">
          人工填写的实际交付、结论与下一步来自验收材料，导出时不重新生成、不覆盖。
        </span>
      </div>
    </div>
  )
}
