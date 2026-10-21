# ShortcutKeyCombo

Key-cap chips for a keyboard shortcut — the only way to show one.

**Source:** `src/renderer/src/components/ShortcutKeyCombo.tsx`. Static rendition.

## Use
- Trailing a tooltip label on an icon button; in menus use `DropdownMenuShortcut` instead (right-aligned text).
- Never on Cancel, Dismiss or `link` actions. Never a placeholder for an unimplemented shortcut.
- Don't roll a one-off `<kbd>`.

## The consumer provides
`keys` already in platform form — the component does not translate. Mac: `⌘` `⇧` glyphs, adjacent, no separator. Windows/Linux: `Ctrl` `Shift`, joined by `+`. The label must match the real binding (`metaKey` on Mac, `ctrlKey` elsewhere). `doubleTap` renders the same key twice, no separator. `keyCapClassName` re-tints caps on a non-default surface.
