// Review-only links and explanation. No product workflow or shared business state.
// eslint-disable-next-line no-unused-vars
const { React } = window.BWPrototypeDependencies
const screens = [
  ['project', '① 里程碑', '../overview-metrics/prototype.html?review=551'],
  ['plan', '② 计划助手配合', '../version-planning/planning-journey-prototype.html?review=551'],
  ['acceptance', '③ 验收依据', '../version-acceptance/acceptance-journey-prototype.html?review=551']
]
const notes = {
  project:
    '本轮原型：关键里程碑可指定任意日期，同月可有多个；与特性共用日轴，支持完整描述、操作引导和提交反馈。顶部添加新特性，默认相邻已有版本；只拖整段改版或伸缩，版本边界贯穿泳道。版本标签/选择器已移除。拖条身换版不扩容，冲突时只顺移自己的维护段。实际视图：保留规划/实际日期对照，结果写明版本归属，不叠加第二排 SDLC。',
  plan: '计划助手承接里程碑特性名，查重复用带「特性」标签的主 Issue；每目标至多一个主特性，执行 Issue 可多条。本版目标由人选择，写明确 tasks 引用；未完成沿同一主单纳入后版，不回写里程碑排期。无需新增计划确认或阶段配置控件。',
  acceptance:
    '沿现有目标达成/未达成/未判定和归档 PR。目标只含一个特性，归档后其结论就是本版特性结果；不加特性结果表、不判断延期、不标版本异常。样例只展示已有界面，不写真实结论。'
}
export function MilestoneReviewNav({ screen }) {
  return (
    <nav
      aria-label="#551 原型评审导航"
      style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, whiteSpace: 'nowrap' }}
    >
      <span>原型注释: #551</span>
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
