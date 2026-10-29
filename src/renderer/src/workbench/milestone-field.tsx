import { useRef } from 'react'
export function MilestoneField({
  value,
  label,
  editable,
  onChange,
  autoFocus = false,
  placeholder = label
}: {
  value: string
  label: string
  editable: boolean
  onChange(value: string): void
  autoFocus?: boolean
  placeholder?: string
}) {
  const entered = useRef(value)
  const cancelled = useRef(false)
  return editable ? (
    <input
      autoFocus={autoFocus}
      aria-label={label}
      className="wb-ml-inline"
      value={value}
      onFocus={() => {
        entered.current = value
        cancelled.current = false
      }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        if (!cancelled.current) {
          onChange(e.target.value.trim())
        }
        cancelled.current = false
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) {
          return
        }
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          cancelled.current = true
          onChange(entered.current)
          e.currentTarget.blur()
        }
      }}
      placeholder={placeholder}
    />
  ) : (
    <span>{value || '—'}</span>
  )
}
