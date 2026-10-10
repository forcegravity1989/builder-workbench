# Badge

A small pill for persistent inline status and counts ("3 errors", "Draft").

**Source:** `src/renderer/src/components/ui/badge.tsx`. Static rendition.

## Use
- Persistent status next to the thing it describes. Transient confirmations ("Saved", "Copied") are a toast, not a Badge.
- `dot` pairs a coloured pip with a word — the way to show PR or agent state (`workspace-status-*`, `agent-question`, `status-success`): colour never stands alone.
- `default` / `secondary` / `outline` / `ghost` / `link` / `destructive` by emphasis, like Button.

## The consumer provides
Short text (one or two words), optional 12px lucide icon or a 6px pip span. Render as a link with `asChild`; only then do hover states apply.
