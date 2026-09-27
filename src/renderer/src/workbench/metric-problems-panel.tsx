/** Fixable read/config problems render as an honest list, never flattened into "not configured". */
export function MetricProblemsPanel({
  className,
  problems
}: {
  className: string
  problems: string[]
}) {
  if (problems.length === 0) {
    return null
  }
  return (
    <div className={className} role="status">
      存在待修复问题（读取或配置有错误，不是未配置）：
      <ul>
        {problems.map((problem, index) => (
          <li key={`${index}:${problem}`}>{problem}</li>
        ))}
      </ul>
    </div>
  )
}
