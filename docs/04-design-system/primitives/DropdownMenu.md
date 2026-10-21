# DropdownMenu

Click-revealed list of actions. Right-click actions use ContextMenu with the same item styles.

**Source:** `src/renderer/src/components/ui/dropdown-menu.tsx` (Radix). Static rendition.

## Recipe
Translucent surface: 82% white / 72% black, 14% border, 11px radius, 4px padding, dual shadow, 40px backdrop blur; min width 176px. Items `menu-item` (12px / 17px, weight 450), 14px icons in `muted-foreground`, highlight black 8% (dark white 14%). Group label 11px semibold `muted-foreground`. Separator `border` at 60%. Destructive items in `destructive`, highlight at 10% (dark 20%).

## Use
- High-frequency actions first; split or group a menu before it gets long; a long list of choices wants Command.
- Shortcuts go in `DropdownMenuShortcut` (right-aligned 11px text), never positioned by hand.
- Content sets `-webkit-app-region: no-drag` so menus that overlap the titlebar stay clickable.

## The consumer provides
Trigger (usually a ghost `icon-sm` Button), items with icon + label (+ shortcut), `CheckboxItem`/`RadioItem` for toggles.
