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
        验收屏（整改草案 v9.5）：单页、一个目标一张卡、整卡可收缩——
        收起只留结论行（结论灯、目标、负责人、Issue
        计数与遗留/风险标记、结论选择）；展开按「横排三格
        （约定交付｜进展——目标级唯一自然语言输入位，未达原因直接写这里｜材料——独立块，正式界面经
        Orca 内置浏览器打开链接或 .bw 交付件）→
        指标一行状态（名称·目标·实测+刷新，仅有承诺或读数时显示， 验收指标与取值区间在会话中按 SOP
        配置）→ 关联 Issue 分组收缩子块」组织；每条开放 Issue
        单行呈现：描述、内联进展/备注、开闭状态、遗留/风险标记位；行按状态着色：开放/遗留黄、风险红。
        展示时刻「全部收起」后逐卡展开讲。v0.5 的验收结论、遗留标记、#255 备注与 G1
        材料为按真实口径预置的演示数据，正式界面不预置人的结论。
      </p>
      <p>
        页底「会议指导与遗留」属会后，总结由 SOP 流程生成而非界面按钮触发：验收 Skill
        承载会议转写总结步骤（会议 ID → 转写稿，链路见 issue #374 → 定位本项目议题 → 开 subagent
        总结）；界面只呈现结果——标题与条目明示 AI
        总结来源，逐条经人确认才写入材料，可删除、可单行人工补记；
        处置标记：本次验收已解决／纳入下周计划／记录遗留。
      </p>
      <p>
        计划屏同步统一目标卡骨架：展开态含目标句/交付件/验收标准/指标承诺、计划完成与负责人输入
        （写入计划材料既有字段，验收屏只读展示）与卡内「在会话中拆解」（拆解 Issue 逐条打
        bug/feature
        分类标签）。周次为整改草案新增（演示数据¹）：跨周版本每周五验收一次，历史周只读、正式界面
        从材料轮次记录读回（「轮次」只作材料协议层术语，不上界面）。周报信息由验收屏承载，不设导出件，
        「预览纪要」是唯一派生文本。出包区块属会前、默认收起为一行摘要，展开后布局与生产实现一致
        （一行工具栏 + 两行四列读数）。会话栏收折按钮对计划/验收两屏共用。
      </p>
    </details>
  )
}
