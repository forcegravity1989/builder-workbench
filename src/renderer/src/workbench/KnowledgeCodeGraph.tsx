import React from 'react'

/** V7 代码页：Orca 执行核 → shared/main → Workbench 壳。 */
export function KnowledgeCodeGraph(): React.JSX.Element {
  return (
    <svg viewBox="0 0 640 175" width="100%" className="kb-graph-svg" aria-hidden>
      <defs>
        <marker id="kbArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" fillOpacity="0.45" />
        </marker>
      </defs>
      <line
        x1="148"
        y1="87"
        x2="240"
        y2="87"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.3"
        markerEnd="url(#kbArrow)"
      />
      <line
        x1="384"
        y1="87"
        x2="476"
        y2="87"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="1.3"
        markerEnd="url(#kbArrow)"
      />
      {[
        { x: 20, label: 'shared', sub: '契约 · 类型' },
        { x: 256, label: 'main', sub: '执行 · Git · IPC' },
        { x: 492, label: 'workbench', sub: '壳 · 四屏' }
      ].map((box) => (
        <g key={box.label}>
          <rect
            x={box.x}
            y="58"
            width="128"
            height="58"
            rx="8"
            fill="var(--color-card)"
            stroke="var(--color-accent)"
            strokeWidth="1.3"
          />
          <text
            x={box.x + 64}
            y="82"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="12.5"
            fill="var(--color-text)"
          >
            {box.label}
          </text>
          <text
            x={box.x + 64}
            y="99"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="10.5"
            fill="var(--color-text)"
            opacity="0.6"
          >
            {box.sub}
          </text>
        </g>
      ))}
    </svg>
  )
}
