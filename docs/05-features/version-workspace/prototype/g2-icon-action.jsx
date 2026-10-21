const { React, useState, ArrowRight } = window.BWPrototypeDependencies

// Prototype counterpart of Orca IconButton + Tooltip; production uses its native primitives.
export function IconAction({
  children,
  label,
  icon: Icon = ArrowRight,
  glyph,
  primary,
  href,
  type = 'button',
  className = '',
  onClick,
  ...props
}) {
  const [tip, setTip] = useState(null)
  const name =
    label ||
    React.Children.toArray(children)
      .filter((value) => typeof value === 'string' || typeof value === 'number')
      .join('')
  const showTip = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setTip({
      left: Math.max(125, Math.min(innerWidth - 125, rect.left + rect.width / 2)),
      top: rect.bottom + 8,
      above: rect.bottom + 55 > innerHeight
    })
  }
  const Tag = href ? 'a' : 'button'
  return (
    <>
      <Tag
        {...props}
        {...(href ? { href } : { type })}
        className={`icon-action ${primary ? 'primary ' : ''}${className}`}
        aria-label={name}
        onMouseEnter={showTip}
        onMouseLeave={() => setTip(null)}
        onFocus={showTip}
        onBlur={() => setTip(null)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setTip(null)
          }
        }}
        onClick={(event) => {
          setTip(null)
          onClick?.(event)
        }}
      >
        {glyph ? (
          <span aria-hidden="true">{glyph}</span>
        ) : (
          <Icon size={16} strokeWidth={2} aria-hidden="true" />
        )}
      </Tag>
      {tip && (
        <span
          className="icon-action-tooltip"
          aria-hidden="true"
          style={{ left: tip.left, top: tip.above ? tip.top - 47 : tip.top }}
        >
          {name}
        </span>
      )}
    </>
  )
}
