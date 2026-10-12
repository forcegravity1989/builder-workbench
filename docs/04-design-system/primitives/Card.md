# Card

A panel lifted off its parent: `card` fill, `border` at 50%, `radius-xl` (14px), `shadow-sm`, 24px padding.

**Source:** `src/renderer/src/components/ui/card.tsx`. Static rendition.

## Use
- Repeated items, framed tools, settings groups. Must read as distinct from the parent surface through `card`/`border`.
- Never nest cards in cards. A section that is not a repeated item, modal or framed tool goes unframed or as a full-width band.
- In dark mode `card` (#171717) on `background` (#0a0a0a) is a small step — keep the border.

## The consumer provides
`CardHeader` (`CardTitle`, `CardDescription`, optional `data-slot="card-action"` element top-right) and `CardContent`.
