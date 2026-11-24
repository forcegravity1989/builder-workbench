export type AgentChatPermissionMode = 'ask' | 'accept-edits' | 'auto' | 'full-access'

/** Picker order: least to most access. */
export const AGENT_CHAT_PERMISSION_MODES = [
  'ask',
  'accept-edits',
  'auto',
  'full-access'
] as const satisfies readonly AgentChatPermissionMode[]
