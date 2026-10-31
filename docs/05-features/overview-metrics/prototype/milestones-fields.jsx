// eslint-disable-next-line no-unused-vars
const { React, useRef, useState } = window.BWPrototypeDependencies
export function InlineField({
  value,
  label,
  placeholder,
  change,
  autoFocus = false,
  className = '',
  required = true
}) {
  const started = useRef(value)
  return (
    <input
      className={`ml-inline ${className}`}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      aria-invalid={required && !value.trim()}
      onFocus={() => {
        started.current = value
      }}
      onInput={(e) => change(e.currentTarget.value)}
      onBlur={(e) => change(e.currentTarget.value.trim())}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) {
          return
        }
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          e.stopPropagation()
          e.currentTarget.blur()
          change(started.current)
        }
      }}
    />
  )
}
export function WeekName({ week, commit }) {
  const [value, setValue] = useState('')
  const cancelled = useRef(false)
  return (
    <input
      className="ml-inline ml-week-name"
      aria-label={`版本名称 ${week.start}`}
      placeholder="版本名（自动）"
      value={value}
      onFocus={() => {
        cancelled.current = false
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!cancelled.current && value.trim()) {
          commit(value.trim())
        }
        setValue('')
      }}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) {
          return
        }
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          cancelled.current = true
          setValue('')
          e.currentTarget.blur()
        }
      }}
    />
  )
}
