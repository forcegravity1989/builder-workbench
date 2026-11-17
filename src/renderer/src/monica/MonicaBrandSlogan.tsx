const MONICA_BRAND_LINES = [
  ['Milestones', 'Align on Milestones.', '以里程碑对齐目标。'],
  ['Orca', 'Build on Orca.', '以 Orca 支撑构建。'],
  ['Needs', 'Create around Needs.', '以需求驱动创造。'],
  ['Iteration', 'Develop through Iteration.', '以迭代持续完善。'],
  ['Collaboration', 'Execute through Collaboration.', '以协作推进执行。'],
  ['Acceptance', 'Finish with Acceptance.', '以验收确认完成。']
] as const

export function MonicaBrandSlogan(): React.JSX.Element {
  return (
    <div data-monica-brand-slogan className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <p
        lang="en"
        className="break-words text-[10px] font-medium leading-relaxed text-muted-foreground"
      >
        Milestones.Orca.Needs.Iteration.Collaboration.Acceptance.
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {MONICA_BRAND_LINES.map(([word, english, chinese]) => (
          <div key={word} className="min-w-0">
            <dt lang="en" className="text-[11px] font-medium leading-relaxed text-foreground">
              {english}
            </dt>
            <dd lang="zh-CN" className="text-[11px] leading-relaxed text-muted-foreground">
              {chinese}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
