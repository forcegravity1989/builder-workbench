import type { RuntimeTerminalListResult } from '../../../src/shared/terminal/runtime/runtime-terminal-contracts'

export async function readFreshTerminalInventory(
  read: () => Promise<RuntimeTerminalListResult>
): Promise<RuntimeTerminalListResult | null> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof Error && error.message.includes('terminal_liveness_unavailable')) {
      return null
    }
    throw error
  }
}
