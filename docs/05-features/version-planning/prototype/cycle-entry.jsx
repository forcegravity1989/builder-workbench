import { React } from 'react'
import { CalendarClock, Info } from 'lucide-react'
import { ModelSessionIcon } from './shared.jsx'

export function cycleStartRequest({ view, firstEntry, hasProblems, version }) {
  const label = view === 'monday' ? '计划' : '验收'
  const file = view === 'monday' ? 'data.json' : 'acceptance.json'
  const context = firstEntry
    ? '本次版本尚未明确，请先与我确认，不自行创建版本材料。'
    : `当前查看 ${version}，请与我确认本次沿用或新建的版本，不清空或覆盖已有内容。`
  const problems = hasProblems
    ? `已发现 .bw/planning/v0.3/${file} 和 .bw/planning/v0.4/${file} 格式有问题。请先读取实际文件，说明问题与备份、处理方案，经我确认后再修改；其他正常版本可以继续使用。`
    : ''
  return `请按已登记${label}自动化的提示及对应 Skill，与我一起${label === '计划' ? '制定版本计划' : '核对版本交付'}。${context}${problems}不要伪造指标或替人作出评审、验收结论。`
}

export function PrototypeStartCard({ view, hasProblems, onStart, onConfigure }) {
  const label = view === 'monday' ? '计划' : '验收'
  return (
    <section className="card cycle-start-card" aria-label={`${label}会话入口`}>
      <div className="cycle-start-line">
        <p>与 Agent 一起{view === 'monday' ? '制定版本计划' : '核对版本交付'}</p>
        <button className="btn btn-secondary" title="打开原生自动化编辑器" onClick={onConfigure}>
          <CalendarClock />
          配置自动化
        </button>
        <button
          className="btn btn-secondary"
          title={`新建会话，${view === 'monday' ? '制定版本计划' : '核对版本交付'}`}
          onClick={onStart}
        >
          <ModelSessionIcon />
          新建{label}
        </button>
      </div>
      {hasProblems && (
        <div className="cycle-material-problem" role="alert">
          <Info />
          <span>
            v0.3、v0.4 的{label}数据文件格式有问题，暂无法读取；新建{label}时将一并带入会话。
          </span>
        </div>
      )}
    </section>
  )
}

export function PrototypeNotes({ scenario, onScenario }) {
  return (
    <details className="prototype-notes" id="prototype-notes">
      <summary>原型说明与场景（不属于最终界面）</summary>
      <label>
        查看场景
        <select
          className="input"
          value={scenario}
          onChange={(event) => onScenario(event.target.value)}
        >
          <option value="selected">已有版本</option>
          <option value="empty">首次进入 · 无版本、无会话</option>
          <option value="problem">旧数据无法读取 · 无会话</option>
          <option value="partial">当前版本正常 · 其他旧数据有问题</option>
        </select>
      </label>
      <p>
        ¹ 左侧只占位表示 Orca 原生会话工作区；实际标签栏、Agent 控件、历史及资源侧栏完整复用
        Orca，不采用此占位图。
      </p>
      <p>
        新建按钮仅模拟打开会话并发送请求；归档、拆解只预填会话内容。未连接真实会话、文件、采集或远端，编辑与保存状态仅在内存演示。
      </p>
      <p>
        默认展示 v0.5 评审快照，便于查看布局；产品首次进入不自动选择版本。本说明、场景选择和所有 ¹
        标记均不进入最终界面。
      </p>
      <p>
        指标目录也采用历史快照示意，未读取项目当前目录或验证脚本历史查询能力；刷新不会产生演示读数。
      </p>
      <p>
        配置自动化只示意打开 Orca
        原生编辑器，展示首次登记时定时关闭的状态；实际开关、时间、提示和模型以用户保存的配置为准。
      </p>
      <p>
        验收屏（2026-10-16 整改草案 v9.2，按用户两轮走查迭代）：单页、一个目标一张卡、整卡可收缩——
        收起只留结论行（结论灯、目标、结论选择、Issue 计数与遗留/风险标记）；展开按「横排故事行
        （约定交付｜实际交付｜指标实测）→ 关联 Issue 分组收缩子块（Bug/Feature/未分类）→
        进展备注（可填可不填、人主导，遗留/风险原因会前写好）」组织。展示时刻可先「全部收起」再逐卡展开讲。
        页底「领导会上指导」由人逐条记录（预置一条演示数据）。v0.5
        的验收结论与遗留标记为按真实口径预置的演示数据，正式界面不预置人的结论。
      </p>
      <p>
        周次为整改草案新增（演示数据¹）：跨周版本每周五验收一次，历史周只读、正式界面从材料轮次记录
        读回（「轮次」只作材料协议层术语，不上界面）。周报导出已按 leader 拍板取消——周报信息由
        验收屏承载，「预览纪要」仍是派生文本入口；板内搜索与底部 Issue
        快照区经走查撤销（卡片已内列）。出包区块属会前、默认收起为一行摘要，展开后布局与生产实现一致
        （一行工具栏 + 两行四列读数）。Issue 的 Bug/Feature
        分组依赖提单分类标签，为计划屏配套小需求（待拍板）。会话栏收折按钮对计划/验收两屏共用。
      </p>
    </details>
  )
}
