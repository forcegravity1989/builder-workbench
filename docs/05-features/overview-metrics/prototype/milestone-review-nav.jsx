// Review-only links and explanation. No product workflow or shared business state.
// eslint-disable-next-line no-unused-vars
const { React } = window.BWPrototypeDependencies
const screens = [
  ['project', '① 里程碑', '../overview-metrics/prototype.html?review=590'],
  ['plan', '② 计划助手配合', '../version-planning/planning-journey-prototype.html?review=551'],
  ['acceptance', '③ 验收依据', '../version-acceptance/acceptance-journey-prototype.html?review=551']
]
const notes = {
  project:
    'Build 与 Maintain 按日期跨版安排，版本窗口独立。老特性可再次安排维护；按最后一段结束日期排序，编辑时固定顺序。时间轴连续跨月，按可见日期筛选或查看全部。名称缺失标红并定位，负责人选填，错误使用全局通知；旗帜添加里程碑、列表加号添加特性、扳手添加 Maintain；特性单元格保留 × 删除，误操作可撤销。所有数据为模拟，待本轮批注评审。',
  plan: '计划助手承接里程碑特性名，查重复用带「特性」标签的主 Issue；每目标至多一个主特性，执行 Issue 可多条。本版目标由人选择，写明确 tasks 引用；未完成沿同一主单纳入后版，不回写里程碑排期。无需新增计划确认或阶段配置控件。',
  acceptance:
    '沿现有目标达成/未达成/未判定和归档 PR。目标只含一个特性，归档后其结论就是本版特性结果；不加特性结果表、不判断延期、不标版本异常。样例只展示已有界面，不写真实结论。'
}
export function MilestoneReviewNav({ screen }) {
  return (
    <nav
      aria-label="#590 原型评审导航"
      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, whiteSpace: 'nowrap' }}
    >
      <span>原型注释: #590 · 待评审</span>
      {screens.map(([id, label, href]) => (
        <a
          key={id}
          href={href}
          aria-current={id === screen ? 'page' : undefined}
          style={{ fontWeight: id === screen ? 700 : 400, color: 'inherit' }}
        >
          {label}
        </a>
      ))}
      <details style={{ position: 'relative' }}>
        <summary style={{ cursor: 'pointer' }}>本屏改动</summary>
        <div
          style={{
            position: 'absolute',
            zIndex: 100,
            left: 0,
            top: 22,
            width: 330,
            maxWidth: '70vw',
            whiteSpace: 'normal',
            padding: 16,
            border: '1px solid var(--border)',
            borderRadius: 6,
            background: 'var(--background)',
            color: 'var(--foreground)',
            boxShadow: 'var(--shadow-dialog)',
            lineHeight: 1.7
          }}
        >
          <p style={{ margin: '0 0 8px' }}>{notes[screen]}</p>
          <a href="../overview-metrics/spec.md" target="_blank" rel="noreferrer">
            完整方案与助手配合 ↗
          </a>
        </div>
      </details>
    </nav>
  )
}
