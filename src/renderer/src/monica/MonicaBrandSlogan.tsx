const MONICA_BRAND_LINES = [
  ['Milestones', 'Align on Milestones.', '以里程碑对齐目标。'],
  ['Orca', 'Build on Orca.', '以 Orca 支撑构建。'],
  ['Needs', 'Create around Needs.', '以需求驱动创造。'],
  ['Iteration', 'Develop through Iteration.', '以迭代持续完善。'],
  ['Collaboration', 'Execute through Collaboration.', '以协作推进执行。'],
  ['Acceptance', 'Finish with Acceptance.', '以验收确认完成。']
] as const

/**
 * 把句子中关键词的首字母高亮，使其拼出 MONICA（M·O·N·I·C·A）。
 * 只包裹首个字母为 span，保持元素完整文本不变，避免影响基于文本的断言与读屏。
 */
function highlightKeywordInitial(english: string, word: string): React.ReactNode {
  const index = english.indexOf(word)
  if (index === -1) {
    return english
  }
  const before = english.slice(0, index)
  const after = english.slice(index + word.length)
  return (
    <>
      {before}
      <span className="font-bold text-foreground underline decoration-2 underline-offset-2">
        {word[0]}
      </span>
      {word.slice(1)}
      {after}
    </>
  )
}

export function MonicaBrandSlogan(): React.JSX.Element {
  return (
    <div data-monica-brand-slogan className="rounded-lg border border-border/70 bg-muted/20 p-3">
      <p
        lang="en"
        className="break-words text-[10px] font-medium leading-relaxed text-muted-foreground"
      >
        {MONICA_BRAND_LINES.map(([word]) => (
          <span key={word}>
            <span className="font-bold text-foreground">{word[0]}</span>
            {word.slice(1)}.
          </span>
        ))}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
        {MONICA_BRAND_LINES.map(([word, english, chinese]) => (
          <div key={word} className="min-w-0">
            <dt lang="en" className="text-[11px] font-medium leading-relaxed text-foreground">
              {highlightKeywordInitial(english, word)}
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
