import { describe, expect, it } from 'vitest'
import {
  AUDITED_TEAM_READ_METHODS,
  TEAM_READ_DENIED_METHODS,
  isExpectedTeamReadError,
  isQuietTeamReadDenial,
  isRoutineReadRuntimeMethod,
  isRoutineReadRuntimeRequest,
  teamReadDenialReason,
  teamReadParamsDenialReason,
  teamReadRequestParams,
  teamReadTerminalStreamHandler
} from './runtime-rpc-team-read-policy'
import {
  RPC_METHODS_WITHOUT_SHARED_PARAMS,
  RPC_PARAMS_BY_METHOD
} from '../../../shared/rpc-contract/rpc-params-catalog.generated'
import { REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION } from '../../../shared/remote-browser-viewport-probe'
import { TerminalStreamOpcode } from '../../../shared/terminal-stream-protocol'

describe('team-read RPC policy', () => {
  it('treats only the fixed terminal existence checks as expected errors', () => {
    expect(isExpectedTeamReadError('terminal.resolvePane', 'terminal_not_found')).toBe(true)
    expect(isExpectedTeamReadError('terminal.list', 'terminal_liveness_unavailable')).toBe(true)
    expect(isExpectedTeamReadError('terminal.resolvePane', 'something_else')).toBe(false)
    expect(isExpectedTeamReadError('terminal.create', 'terminal_not_found')).toBe(false)
    expect(isExpectedTeamReadError('terminal.list', undefined)).toBe(false)
  })

  it('only lists methods that exist, so a rename cannot silently turn a rule off', () => {
    const known = new Set([
      ...Object.keys(RPC_PARAMS_BY_METHOD),
      ...RPC_METHODS_WITHOUT_SHARED_PARAMS
    ])
    expect([...TEAM_READ_DENIED_METHODS].filter((m) => !known.has(m))).toEqual([])
    expect([...AUDITED_TEAM_READ_METHODS].filter((m) => !known.has(m))).toEqual([])
  })

  it('denies each blocked action at its core entry', () => {
    for (const method of [
      // Sending input or messages to a terminal, an agent or a model
      'terminal.send',
      'agentSession.send',
      'orchestration.send',
      'orchestration.workerTerminalUserInput',
      'git.generateCommitMessage',
      // Reading files outside the shared project
      'files.browseServerDir',
      'browser.upload',
      'skills.previewInstall',
      // Writing back under the host owner's accounts
      'github.mergePR',
      'gitlab.updateMR',
      'jira.addIssueComment',
      // Changing project files, Git and worktrees
      'files.write',
      'git.commit',
      'worktree.create',
      'repo.add',
      // Driving the host's desktop and devices
      'computer.click',
      'emulator.exec'
    ]) {
      expect(teamReadDenialReason('team-read', method)).toContain('授予完全访问')
    }
  })

  it('allows everything else a member can click, including sessions, terminals and settings', () => {
    for (const method of [
      'worktree.list',
      'files.read',
      'terminal.read',
      'terminal.multiplex',
      'terminal.updateViewport',
      'terminal.create',
      'terminal.close',
      'terminal.createAgentSession',
      'session.tabs.activate',
      'session.tabs.createTerminal',
      'session.tabs.close',
      'agentSession.create',
      'agentSession.history',
      'workbench.materials.save',
      'workbench.milestones.save',
      'settings.update',
      'browser.eval',
      'browser.exec',
      'browser.goto'
    ]) {
      expect(teamReadDenialReason('team-read', method)).toBeNull()
    }
    expect(teamReadDenialReason('full', 'terminal.send')).toBeNull()
    expect(teamReadDenialReason(undefined, 'terminal.send')).toBeNull()
  })

  it('keeps a member from moving the owner window and from opening local files', () => {
    expect(teamReadRequestParams('team-read', 'worktree.activate', { worktree: 'id:1' })).toEqual({
      worktree: 'id:1',
      notifyClients: false,
      navigation: 'caller'
    })
    expect(teamReadRequestParams('team-read', 'session.tabs.activate', { tabId: 't1' })).toEqual({
      tabId: 't1',
      notifyClients: false,
      navigation: 'caller'
    })
    expect(teamReadRequestParams('full', 'worktree.activate', { worktree: 'id:1' })).toEqual({
      worktree: 'id:1'
    })
    for (const url of [
      'file:///C:/Users/x/.ssh/id_rsa',
      'C:\\Users\\x\\secret.txt',
      '/etc/passwd'
    ]) {
      expect(teamReadParamsDenialReason('team-read', 'browser.goto', { url })).toContain('本地文件')
    }
    expect(
      teamReadParamsDenialReason('team-read', 'browser.goto', { url: 'localhost:3000' })
    ).toBeNull()
    expect(
      teamReadParamsDenialReason('full', 'browser.goto', { url: 'file:///etc/passwd' })
    ).toBeNull()
  })

  it('lets a member start a session but not hand it a prompt', () => {
    for (const method of [
      'terminal.createAgentSession',
      'terminal.ensureAgentSession',
      'agentSession.create'
    ]) {
      expect(teamReadParamsDenialReason('team-read', method, { prompt: '请改代码' })).toContain(
        '提示词'
      )
      expect(teamReadParamsDenialReason('team-read', method, { prompt: '   ' })).toBeNull()
      expect(teamReadParamsDenialReason('team-read', method, {})).toBeNull()
      expect(teamReadParamsDenialReason('full', method, { prompt: '请改代码' })).toBeNull()
    }
  })

  it('keeps terminal output and window size flowing but drops a member keystrokes', () => {
    const frames: number[] = []
    const handler = (frame: { opcode: number }): void => {
      frames.push(frame.opcode)
    }
    let mode: 'team-read' | 'full' = 'team-read'
    const streamHandler = teamReadTerminalStreamHandler(() => mode, handler as never)
    const send = (): void => {
      for (const opcode of [
        TerminalStreamOpcode.Input,
        TerminalStreamOpcode.Resize,
        TerminalStreamOpcode.ClaimViewport,
        TerminalStreamOpcode.Ack
      ]) {
        streamHandler({ opcode, payload: new Uint8Array() } as never)
      }
    }
    send()
    expect(frames).toEqual([
      TerminalStreamOpcode.Resize,
      TerminalStreamOpcode.ClaimViewport,
      TerminalStreamOpcode.Ack
    ])

    // The host switches the member to full access while the terminal is open, then back.
    frames.length = 0
    mode = 'full'
    send()
    expect(frames).toEqual([
      TerminalStreamOpcode.Input,
      TerminalStreamOpcode.Resize,
      TerminalStreamOpcode.ClaimViewport,
      TerminalStreamOpcode.Ack
    ])
    frames.length = 0
    mode = 'team-read'
    send()
    expect(frames).toEqual([
      TerminalStreamOpcode.Resize,
      TerminalStreamOpcode.ClaimViewport,
      TerminalStreamOpcode.Ack
    ])
  })

  it('logs actions that run or change things on the host, and hides routine reads', () => {
    expect(isQuietTeamReadDenial('browser.clientHost.attach')).toBe(true)
    expect(isQuietTeamReadDenial('worktree.create')).toBe(false)
    for (const method of [
      'project.list',
      'terminal.read',
      'terminal.multiplex',
      'browser.mouseMove',
      'browser.screencast',
      'workbench.metrics.refresh'
    ]) {
      expect(isRoutineReadRuntimeMethod(method)).toBe(true)
    }
    for (const method of [
      'terminal.send',
      'browser.eval',
      'settings.update',
      'terminal.createAgentSession',
      'session.tabs.close',
      'workbench.review.receive',
      'workbench.prototypeReview.annotations.add',
      'terminal.stop',
      'agentSession.cancel',
      'skills.install',
      'automation.runNow'
    ]) {
      expect(isRoutineReadRuntimeMethod(method)).toBe(false)
    }
    // The viewer's fixed size probe is a read; any other page script is still logged.
    expect(
      isRoutineReadRuntimeRequest('browser.eval', {
        expression: REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION
      })
    ).toBe(true)
    expect(isRoutineReadRuntimeRequest('browser.eval', { expression: 'document.title' })).toBe(
      false
    )
    expect(isRoutineReadRuntimeRequest('project.list', undefined)).toBe(true)
  })
})
