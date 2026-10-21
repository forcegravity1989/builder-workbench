# Textarea

Multi-line text field; same border, focus and invalid treatment as Input.

**Source:** `src/renderer/src/components/ui/textarea.tsx`. Static rendition.

## Use
Prompts, commit messages, notes. Min height 64px; it carries `scrollbar-sleek` so long content never paints Chromium's default light scrollbar on dark surfaces. A dialog that holds one needs a larger dialog or a Sheet, not the compact confirmation size.

## The consumer provides
Native textarea props and its Label/description, as for Input.
