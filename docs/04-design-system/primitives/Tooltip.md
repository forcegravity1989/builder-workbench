# Tooltip

Names a control whose meaning is not obvious from its look. Not for teaching, persuading or warning.

**Source:** `src/renderer/src/components/ui/tooltip.tsx` (Radix). Static rendition.

## Recipe
Inverted: `foreground` fill, `background` text, `secondary` type (12px), 6px × 12px padding, `radius-md`, 10px arrow. z-index 90 so it clears menus and popovers.

## Use
- Icon-only buttons, abbreviated badges, truncated paths. Not on controls with a visible label, not for interactive content, never for errors or blocking warnings (those go inline).
- One app-root `TooltipProvider delayDuration={400}`; nest another only when a tightly scoped surface needs a different delay. (The primitive itself defaults `delayDuration` to 0 — the 400 comes from the app root.)
- Wrap the trigger with `TooltipTrigger asChild` so keyboard focus shows it. Pass `side="top" sideOffset={4}` (the toolbar convention); `TooltipContent` itself defaults `sideOffset` to 0.
- If the action has a shortcut, append `ShortcutKeyCombo` after the label.

## The consumer provides
The trigger and a short label (+ optional ShortcutKeyCombo).
