# Switch

A setting that takes effect immediately. Monochrome: checked track is `foreground`, unchecked `muted-foreground` at 30%.

**Source:** `src/renderer/src/components/ui/switch.tsx` (Radix) — also exports `SwitchIndicator`, a non-interactive look-alike for rows that are themselves the button. Static rendition.

## Sizes
Default 36×20 with a 14px thumb; `SwitchIndicator size="compact"` 24×14 with a 10px thumb for dense rows and menus.

## The consumer provides
`checked`, `onCheckedChange`, and a visible label (settings row text). No colour for "on" — the thumb position carries it.
