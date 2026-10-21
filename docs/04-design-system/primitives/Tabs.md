# Tabs

Switch between sibling views of one surface. Two looks: `default` (segmented, on `muted`) and `line` (underline).

**Source:** `src/renderer/src/components/ui/tabs.tsx` (Radix). Static rendition.

## Use
- `default` for a compact switch inside a panel or dialog (36px list, 3px inset, active tab lifts with `shadow-sm` on `background`).
- `line` for page-level sections; the active tab gets a 2px `foreground` bar 5px below.
- Inactive text `foreground` at 60% (dark: `muted-foreground`); hover to `foreground`.

## The consumer provides
`value` / `onValueChange`, one `TabsTrigger` per view (text, optional 16px icon), matching `TabsContent`. `orientation="vertical"` stacks the list.
