import React from 'react'

export function PlanText({
  value,
  onChange,
  placeholder,
  multiline,
  ariaLabel
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
  ariaLabel?: string
}): React.JSX.Element {
  if (multiline) {
    return (
      <textarea
        className="plan-text plan-text-multi"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        rows={6}
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <input
      className="plan-text"
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}
