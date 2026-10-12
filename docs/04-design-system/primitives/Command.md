# Command

Searchable command surface (cmdk): the palette, the Cmd+J jump palette, and searchable pickers inside a Popover.

**Source:** `src/renderer/src/components/ui/command.tsx`; selection recipe `.jump-palette-item` in `assets/main.css`. Static rendition.

## Use
- Any long list the user must find something in — repositories, branches, worktrees, agents, commands, settings, files, providers — gets a search field. Prefer this over a long menu.
- `CommandDialog`: 660px, 20% from the top, dialog surface recipe; inside it inputs are 48px and items 12px tall-padded.
- **Keyboard-selected row:** on light surfaces flat `accent` vanishes (#f5f5f5 on #fff). Add `jump-palette-item`: `foreground` mixed 12% into `background` plus a 1px inset ring at 18%; dark uses `accent`. Expose it as `--jump-palette-selection-surface` when status pips need a matching cut-out.
- Mark the persistent current row with `data-current="true"`, separate from the cmdk highlight.

## The consumer provides
`CommandInput` (placeholder, optional `trailing` filter control), `CommandList` with `CommandGroup`s (heading) of `CommandItem`s (icon, label, trailing meta), `CommandEmpty` text. Focus lands in the input; Enter runs the selected item; Esc closes.
