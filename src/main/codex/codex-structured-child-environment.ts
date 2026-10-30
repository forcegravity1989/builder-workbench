import type { CodexStructuredLaunch } from './codex-structured-session-state'
import { CODEX_SPAWN_TOKEN_ENV } from './codex-structured-owner-identity'
import { structuredWorkerChildIdentityEnv } from '../runtime/structured-worker-child-identity-env'

export function buildCodexStructuredChildEnvironment(
  launch: CodexStructuredLaunch,
  spawnToken: string,
  sessionId: string
): Record<string, string> {
  return {
    // All structured children reach this app's CLI; only dispatched workers receive an
    // orchestration identity. Ordinary chats retain the identity-free session marker.
    ...structuredWorkerChildIdentityEnv(sessionId, {
      ...launch.env,
      ...(launch.codexHome ? { CODEX_HOME: launch.codexHome } : {})
    }),
    [CODEX_SPAWN_TOKEN_ENV]: spawnToken
  }
}
