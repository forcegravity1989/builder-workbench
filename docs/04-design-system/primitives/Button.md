# Button

The one button primitive: six variants by emphasis, eight sizes matched to the row it sits in.

**Source:** `src/renderer/src/components/ui/button.tsx` (CVA). Preview is a static rendition styled by `primitives.css`.

## Use
- `default` — the single affirmative action in a flow (Save, Confirm, Create). One per surface.
- `secondary` — a lower-emphasis sibling next to a `default`.
- `outline` — toolbar or standalone actions where a filled button feels heavy.
- `ghost` — icon buttons, list-row triggers, Cancel/Dismiss/Close. Chrome that should disappear.
- `link` — inline text action inside a sentence.
- `destructive` — delete, discard, irreversible. **Never Cancel** — backing out stays `ghost`, no colour, no shortcut chip.

## Sizes
`default` 36px · `sm` 32px · `xs` 24px · `lg` 40px; square `icon` 36 · `icon-sm` 32 · `icon-xs` 24 · `icon-lg` 40. Match the surrounding row height: no `default` button in a 28px toolbar.

## The consumer provides
For BW labels, placement and icon-only cases, follow [Buttons and add actions](../guidelines.md#按钮与新增入口). Pass the visible label and optional lucide icon as children (icons auto-size to 16px, 12px in `xs`); use `variant`, `size`, and `asChild` to render a link when navigating. For an icon-only button, provide an accessible name on the button and reuse `Tooltip` as follows:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button type="button" variant="ghost" size="icon-sm" aria-label="刷新项目墙" onClick={refreshProjectWall}>
      <RefreshCw aria-hidden="true" />
    </Button>
  </TooltipTrigger>
  <TooltipContent side="top" sideOffset={4}>刷新项目墙</TooltipContent>
</Tooltip>
```

## States
Hover tints by opacity (`primary`/90, `secondary`/80, `accent` for ghost/outline). Focus-visible: `ring` border plus a 3px `ring` halo at 50%. Disabled: 50% opacity, no pointer. Loading: swap in `loader-circle` spinning and keep the button's width fixed so it does not resize mid-action; bind `disabled` immediately, show the spinner after ~200ms (SSH latency).
