// React is required by the shared bundle JSX factory.
// eslint-disable-next-line no-unused-vars
const { React, useEffect, useRef } = window.BWPrototypeDependencies

// Reuse the existing feature artifact without changing its files or content.
// Its snapshot is historical; the outer review strip labels that boundary.
export function ExistingProjectOverview({ dark }) {
  const ref = useRef(null)
  const applyFrame = () => {
    const doc = ref.current?.contentDocument
    if (!doc) {
      return
    }
    doc.documentElement.dataset.theme = dark ? 'dark' : 'light'
    if (doc.getElementById('g2-frame-chrome')) {
      return
    }
    const style = doc.createElement('style')
    style.id = 'g2-frame-chrome'
    style.textContent =
      '.app-sidebar{display:none!important}.app-shell{display:block!important;width:100%!important;height:100vh!important}.main-pane{width:100%!important;max-width:none!important;height:100vh!important}.app-shell>.session-pane,.app-shell>.prototype-splitter{display:none!important}'
    doc.head.append(style)
  }
  useEffect(applyFrame, [dark])
  return (
    <iframe
      ref={ref}
      title="既有项目总览原型：历史 v0.5 快照，本轮不改造"
      className="existing-overview-frame"
      src="../overview-metrics/prototype.html#overview"
      onLoad={applyFrame}
    />
  )
}
