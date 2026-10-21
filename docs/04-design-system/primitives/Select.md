# Select

Single choice from a short, known list.

**Source:** `src/renderer/src/components/ui/select.tsx` (Radix). Static rendition — the open list is drawn in place.

## Use
- Known list, no search → Select. Needs search or fuzzy filtering → `Command` inside a `Popover`. Multi-select with search → mirror `repo-multi-combobox`.
- Trigger sizes `default` 36px, `sm` 32px. The list uses the shared translucent menu recipe (82% white / 72% black, 14% border, dual shadow, 40px backdrop blur), the same as DropdownMenu.

## The consumer provides
`value`, `onValueChange`, `SelectItem`s with text; optional `SelectLabel` and `SelectSeparator` for groups.
