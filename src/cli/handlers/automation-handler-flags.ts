import type { AutomationPrecheck } from '../../shared/automations-types'
import {
  normalizeTaskSourceContext,
  type TaskSourceContext
} from '../../shared/task-source-context'
import type { TuiAgent } from '../../shared/tui-agent'
import {
  DEFAULT_AUTOMATION_PRECHECK_TIMEOUT_SECONDS,
  MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS
} from '../../shared/automation-precheck'
import { isTuiAgent } from '../../shared/tui-agent-config'
import {
  getOptionalPositiveIntegerFlag,
  getOptionalStringFlag,
  getRequiredStringFlag
} from '../flags'
import { RuntimeClientError } from '../runtime-client'

export function getProviderFlag(flags: Map<string, string | boolean>): TuiAgent {
  const provider = getRequiredStringFlag(flags, 'provider')
  if (!isTuiAgent(provider)) {
    throw new RuntimeClientError('invalid_argument', `Unknown provider: ${provider}`)
  }
  return provider
}

export function getOptionalProviderFlag(
  flags: Map<string, string | boolean>
): TuiAgent | undefined {
  const provider = getOptionalStringFlag(flags, 'provider')
  if (provider === undefined) {
    return undefined
  }
  if (!isTuiAgent(provider)) {
    throw new RuntimeClientError('invalid_argument', `Unknown provider: ${provider}`)
  }
  return provider
}

export function getEnabledFlag(flags: Map<string, string | boolean>): boolean | undefined {
  const enabledFlag = flags.get('enabled')
  const disabledFlag = flags.get('disabled')
  if (typeof enabledFlag === 'string') {
    throw new RuntimeClientError('invalid_argument', '--enabled does not take a value')
  }
  if (typeof disabledFlag === 'string') {
    throw new RuntimeClientError('invalid_argument', '--disabled does not take a value')
  }
  const enabled = enabledFlag === true
  const disabled = disabledFlag === true
  if (enabled && disabled) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --enabled or --disabled, not both.'
    )
  }
  if (enabled) {
    return true
  }
  if (disabled) {
    return false
  }
  return undefined
}

export function getReuseSessionFlag(flags: Map<string, string | boolean>): boolean | undefined {
  const reuseFlag = flags.get('reuse-session')
  const freshFlag = flags.get('fresh-session')
  if (typeof reuseFlag === 'string') {
    throw new RuntimeClientError('invalid_argument', '--reuse-session does not take a value')
  }
  if (typeof freshFlag === 'string') {
    throw new RuntimeClientError('invalid_argument', '--fresh-session does not take a value')
  }
  const reuse = reuseFlag === true
  const fresh = freshFlag === true
  if (reuse && fresh) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Use either --reuse-session or --fresh-session, not both.'
    )
  }
  if (reuse) {
    return true
  }
  if (fresh) {
    return false
  }
  return undefined
}

export function getPrecheckFlag(
  flags: Map<string, string | boolean>
): AutomationPrecheck | null | undefined {
  const hasPrecheck = flags.has('precheck')
  const timeoutSeconds = getOptionalPositiveIntegerFlag(flags, 'precheck-timeout')
  if (!hasPrecheck) {
    if (timeoutSeconds !== undefined) {
      throw new RuntimeClientError('invalid_argument', '--precheck-timeout requires --precheck')
    }
    return undefined
  }
  const value = flags.get('precheck')
  if (typeof value !== 'string') {
    throw new RuntimeClientError('invalid_argument', '--precheck requires a command')
  }
  const command = value.trim()
  if (!command) {
    return null
  }
  if (timeoutSeconds !== undefined && timeoutSeconds > MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS) {
    throw new RuntimeClientError(
      'invalid_argument',
      `--precheck-timeout must be at most ${MAX_AUTOMATION_PRECHECK_TIMEOUT_SECONDS} seconds`
    )
  }
  return {
    command,
    timeoutSeconds: timeoutSeconds ?? DEFAULT_AUTOMATION_PRECHECK_TIMEOUT_SECONDS
  }
}

export function getSourceContextFlag(
  flags: Map<string, string | boolean>
): TaskSourceContext | null | undefined {
  if (!flags.has('source-context')) {
    return undefined
  }
  const value = flags.get('source-context')
  if (typeof value !== 'string') {
    throw new RuntimeClientError(
      'invalid_argument',
      '--source-context requires a JSON TaskSourceContext or null'
    )
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new RuntimeClientError('invalid_argument', '--source-context must be valid JSON')
  }
  if (parsed === null) {
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new RuntimeClientError(
      'invalid_argument',
      '--source-context must be a JSON TaskSourceContext or null'
    )
  }
  const sourceContext = normalizeTaskSourceContext(
    parsed as Parameters<typeof normalizeTaskSourceContext>[0]
  )
  if (!sourceContext) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--source-context is not a valid TaskSourceContext'
    )
  }
  return sourceContext
}

export function getWorkspaceModeFlag(
  flags: Map<string, string | boolean>
): 'existing' | 'new_per_run' | undefined {
  const value = getOptionalStringFlag(flags, 'workspace-mode')
  if (value === undefined) {
    return undefined
  }
  if (value === 'existing') {
    return 'existing'
  }
  if (value === 'new-per-run' || value === 'new_per_run') {
    return 'new_per_run'
  }
  throw new RuntimeClientError(
    'invalid_argument',
    '--workspace-mode must be existing or new-per-run'
  )
}
