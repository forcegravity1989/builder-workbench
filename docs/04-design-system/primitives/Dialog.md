# Dialog

A modal that demands a decision before the user continues.

**Source:** `src/renderer/src/components/ui/dialog.tsx` (Radix). Static rendition — drawn in place over a scrim.

## Recipe
Scrim black 55% + 2px blur. Surface `background` at 96% (dark rgba(23,23,23,.96)), solid 14% border, dual shadow (light `0 20px 60px rgba(0,0,0,.28)`, dark `0 24px 72px rgba(0,0,0,.55)`, both with a 1px inset top highlight), 40px backdrop blur, `radius-lg`, 24px padding, 16px gaps, max 512px. Title `dialog-title`; description `body` in `muted-foreground`.

## Use
- Size matches input: short confirmations compact; multi-line text, path pickers, provider setup or review content → a larger dialog or a Sheet.
- Footer: actions right-aligned, Cancel as `ghost`, the affirmative as `default` (or `destructive` when it deletes). Default focus on the field or action most likely used; Enter triggers the primary; Esc backs out.
- Not for click-revealed pickers (Popover) or edge panels (Sheet).

## The consumer provides
`open`/`onOpenChange`, `DialogHeader` (`DialogTitle`, `DialogDescription`), body, `DialogFooter`. `showCloseButton` defaults on.
