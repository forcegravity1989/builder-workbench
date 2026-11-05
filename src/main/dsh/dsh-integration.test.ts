import { describe, expect, it } from 'vitest'
import { applyScrubSafeAgentEnvAliases } from '../../shared/agent-hook-scrub-safe-env'
import { recognizeAgentProcessFromCommandLine } from '../../shared/agent-process-recognition'
import { extractAgentProviderSession, getAgentResumeArgv } from '../../shared/agent-session-resume'
import { createDraftPasteReadyScanner } from '../../shared/draft-paste-ready-scanner'
import { createHookListenerState } from '../../shared/agent-hook-listener/listener-state'
import { normalizeDshEvent } from '../../shared/agent-hook-listener/providers/dsh-events'
import { buildAgentResumeStartupPlan, buildAgentStartupPlan } from '../../shared/tui-agent-startup'
import { applyManagedDshPatch, removeManagedDshPatch } from './dsh-home-patch'
import { getAgentLabel, isClaudeAgent, isGeminiTerminalTitle } from '../../shared/agent-detection'
import { collectAgentTitleEvidence } from '../../shared/agent-title-evidence'

describe('DSH launch and provider contracts', () => {
  it('selects the workspace and keeps the first task out of the command line', () => {
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const plan = buildAgentStartupPlan({
        agent: 'dsh',
        prompt: 'read the sentinel',
        cmdOverrides: {},
        platform
      })
      expect(plan?.launchCommand).toBe('dsh-tui . --backend=dsh')
      expect(plan?.followupPrompt).toBe('read the sentinel')
      expect(plan?.expectedProcess).toBe('dsh')
    }
  })

  it('distinguishes DSH profiles from launcher workspace arguments', () => {
    for (const command of ['dsh web', 'dsh headless task', 'dsh --profile=sdk', 'dsh plugin list']) {
      expect(recognizeAgentProcessFromCommandLine(command)).toBeNull()
    }
    for (const command of [
      'dsh-tui web',
      'dst plugin',
      'dsh --profile dsh-tui --resume web',
      'node --import loader.js /opt/node_modules/@deepseek-ai/dsh/lib/bin.js dsh-tui'
    ]) {
      expect(recognizeAgentProcessFromCommandLine(command)?.agent).toBe('dsh')
    }
  })

  it('gates paste on the composer inside the alternate screen', () => {
    const scanner = createDraftPasteReadyScanner('dsh-composer-prompt')
    expect(scanner.observe('shell ❯').ready).toBe(false)
    expect(scanner.observe('\x1b[?1049h').ready).toBe(false)
    expect(scanner.observe('whale intro ❯').ready).toBe(true)
    const exited = createDraftPasteReadyScanner('dsh-composer-prompt')
    expect(exited.observe('\x1b[?1049h\x1b[?1049l shell ❯').ready).toBe(false)
  })

  it('maps lead events without letting child sessions overwrite the lead', () => {
    const state = createHookListenerState()
    const event = (name: string, payload = {}) =>
      normalizeDshEvent(state, name, 'task', 'pane', payload)
    expect(event('SessionStart')?.state).toBe('done')
    expect(event('UserPromptSubmit')?.state).toBe('working')
    expect(event('PreToolUse', { tool_name: 'ask_user_question' })?.state).toBe('waiting')
    expect(event('PostToolUse')?.state).toBe('working')
    expect(event('Stop')?.state).toBe('done')
    expect(event('SubagentStop')).toBeNull()
    expect(event('PermissionRequest')).toBeNull()
  })

  it('keeps DSH title identity through both BW title consumers', () => {
    for (const title of ['✦ 🐋 task', '⠂ 🐋 task']) {
      expect(getAgentLabel(title)).toBe('DeepSeek Harness')
      expect(isClaudeAgent(title)).toBe(false)
      expect(isGeminiTerminalTitle(title)).toBe(false)
      expect(collectAgentTitleEvidence(title).agent).toBe('dsh')
    }
    for (const title of ['✳ Review 🐋 mascot', '⠂ Draw 🐋']) {
      expect(isClaudeAgent(title)).toBe(true)
      expect(collectAgentTitleEvidence(title).vendorMarkers).not.toContain('dsh')
    }
  })

  it('resumes only the hook-reported DSH id on the DSH backend', () => {
    const session = extractAgentProviderSession('dsh', { session_id: 's1', transcript_path: '' })
    expect(session).toEqual({ key: 'session_id', id: 's1' })
    expect(getAgentResumeArgv('dsh', session!)).toEqual(['dsh-tui', '--backend=dsh', '--resume', 's1'])
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      const plan = buildAgentResumeStartupPlan({
        agent: 'dsh',
        providerSession: session!,
        cmdOverrides: {},
        platform
      })
      expect(plan?.launchCommand).toContain('dsh-tui .')
      expect(plan?.launchCommand).toContain('--backend=dsh')
      expect(plan?.launchCommand).toContain('--resume')
    }
    expect(extractAgentProviderSession('dsh', { session_id: '-bad' })).toBeNull()
  })

  it('mirrors only current pane identity and clears inherited aliases', () => {
    const env: Record<string, string> = { ORCA_PANE_KEY: 'pane', ORCA_AGENT_LAUNCH_TOKEN: 'launch' }
    applyScrubSafeAgentEnvAliases(env)
    expect(env.ORCA_AGENT_PANE).toBe('pane')
    expect(env.ORCA_AGENT_LAUNCH).toBe('launch')
    delete env.ORCA_PANE_KEY
    delete env.ORCA_AGENT_LAUNCH_TOKEN
    applyScrubSafeAgentEnvAliases(env)
    expect(env.ORCA_AGENT_PANE).toBeUndefined()
    expect(env.ORCA_AGENT_LAUNCH).toBeUndefined()
  })

  it('preserves user patch rows across install and removal, including orphan markers', () => {
    const user =
      "# >>> orca-managed-dsh-hooks (managed by Orca; do not edit) >>>\n- id: user-row\n  config: {}\n"
    const installed = applyManagedDshPatch(user, "C:/owner's home/dsh-hooks.json")!
    expect(installed).toContain("configPath: 'C:/owner''s home/dsh-hooks.json'")
    expect(removeManagedDshPatch(installed).text).toBe(user)
    expect(removeManagedDshPatch(applyManagedDshPatch('[]\n', '/tmp/hooks.json')!).text).toBe('[]\n')
    expect(applyManagedDshPatch('[{id: user}]\n', '/tmp/hooks.json')).toBeNull()
  })
})
