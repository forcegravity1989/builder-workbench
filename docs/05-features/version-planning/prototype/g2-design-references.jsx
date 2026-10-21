// React is used by the shared JSX build factory.
// eslint-disable-next-line no-unused-vars
const { React } = window.BWPrototypeDependencies
const references = [
  [
    '图标表达动作，悬停与聚焦给出名称',
    'GitHub Primer · IconButton',
    'https://primer.style/product/components/icon-button/guidelines/',
    '新建、关闭、查看和评审工具使用图标，保留可访问名称与悬停/键盘聚焦提示。图标不能清楚表达的选择仍用文字；项目、版本、目标名称属于导航内容。'
  ],
  [
    '版本标题旁 ＋，只填写必要信息',
    'GitHub Primer · Create',
    'https://primer.style/product/scenario-patterns/create/',
    '同一入口输入版本名，错误在输入处显示，成功后直接看到新版本。原型采用简短表单；图标提交是 BW 在明确创建上下文中的选择。两树初始化是 BW 方案，不是该案例的通用要求。'
  ],
  [
    '目标负责筛选，更多动作放在 …',
    'Linear · Project milestones',
    'https://linear.app/docs/project-milestones',
    '点击目标限定现有任务列表；目标开工与打开工作区放到行尾菜单。菜单保留文字以区分动作。里程碑只参考交互，不等同 Git 工作树，也不代替人工验收。'
  ],
  [
    '选中项目，统一主区域与侧栏上下文',
    'Linear · Team pages',
    'https://linear.app/docs/default-team-pages',
    '从项目墙进入后围绕该项目工作，版本集中展示。版本下方统一保留当前项目及其他 Orca 项目的原生入口是 BW 的兼容安排，不照搬 Linear 的团队或周期模型。'
  ],
  [
    '保留描述性目录，复用已有页面',
    'VS Code · Views UX',
    'https://code.visualstudio.com/api/ux-guidelines/views',
    '保留版本、目标、分支和会话名称；压缩重复入口与常驻动作。计划、任务、验收及会话继续挂载已有组件，原型只标明复用位置。'
  ],
  [
    '同一开工入口，选择工作区与代码起点',
    'VS Code · Agents window',
    'https://code.visualstudio.com/docs/agents/run/agents-window',
    '目标与 Issue 使用同一个 Orca 创建器，BW 预填上下文，用户仍可调整名称、执行方式与代码起点。Orca 父树只表示嵌套；目标绑定与父级预填仍需适配。'
  ]
]
export function DesignReferences() {
  return (
    <>
      <p className="muted">
        参考的是具体操作方式。工作树、材料和共享权限以 BW 当前源码及本轮规格为准；以下案例不证明 G2
        已实现。
      </p>
      <div className="reference-list">
        {references.map(([title, source, url, adoption]) => (
          <section className="reference-item" key={url}>
            <h3>{title}</h3>
            <a href={url} target="_blank" rel="noreferrer">
              {source} ↗
            </a>
            <p>{adoption}</p>
          </section>
        ))}
      </div>
      <p className="muted">
        图标触达区域至少 24 × 24；正文与目录名不因“极简”而消失。每版两棵流程树、目标树按需创建是 BW
        的设计取舍（已定稿）。资料核对：2026-10-20。
      </p>
    </>
  )
}
