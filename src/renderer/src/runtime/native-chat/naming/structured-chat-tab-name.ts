import type { Tab } from '../../../../../shared/tab-types'

import type { ExecutionHostId } from '../../../../../shared/execution-host'

export type StructuredChatTabName = Readonly<{
  owner: ExecutionHostId | null
  sessionId: string
  savedName: string | null
}>

export type StructuredChatTabNames = ReadonlyMap<Tab, StructuredChatTabName>
