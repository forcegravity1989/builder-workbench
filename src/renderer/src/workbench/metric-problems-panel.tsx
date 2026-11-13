import { ErrorDetails } from './error-feedback'

export function MetricProblemsPanel({
  className,
  summary,
  problems
}: {
  className: string
  summary: string
  problems: string[]
}) {
  if (problems.length === 0) {
    return null
  }
  return (
    <ErrorDetails
      className={className}
      summary={summary}
      detail={[...new Set(problems)].join('\n')}
    />
  )
}
