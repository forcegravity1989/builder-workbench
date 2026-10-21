# Input

Single-line text field, 36px, the house form anatomy around it.

**Source:** `src/renderer/src/components/ui/input.tsx`; anatomy from `components/settings/SettingsFormControls.tsx`. Static rendition.

## Anatomy (match it for every form)
- Outer stack `space-y-3` for a full section, `space-y-2` for a compact single field.
- Label group `space-y-1`: `Label` + description in `secondary` (12px) `muted-foreground`.
- Control: this Input (or Select, Textarea…).
- Trailing metadata in `trailing` (11px) `muted-foreground` **below** the control ("Current: 14px · Default: 13px"), never beside the label.

## States
Border `input`; dark mode fills `input` at 30%. Focus: `ring` border + 3px halo. Errors: set `aria-invalid` — the primitive paints the `destructive` border and ring; don't paint your own. Placeholder `muted-foreground` at 60%.

## The consumer provides
Native input props; a `Label` with `htmlFor`; description and error text outside the control.
