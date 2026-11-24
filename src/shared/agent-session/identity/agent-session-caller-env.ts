import { ORCA_SESSION_ADDRESS_PREFIX } from './orca-session-address-prefix'

export const ORCA_AGENT_SESSION_ID_ENV = 'ORCA_AGENT_SESSION_ID'

export function readInjectedAgentSessionId(
  env: Readonly<Record<string, string | undefined>>
): string | undefined {
  return env[ORCA_AGENT_SESSION_ID_ENV]?.trim() || undefined
}

export function injectedSessionAddress(
  env: Readonly<Record<string, string | undefined>>
): string | undefined {
  const id = readInjectedAgentSessionId(env)
  return id ? `${ORCA_SESSION_ADDRESS_PREFIX}${id}` : undefined
}
