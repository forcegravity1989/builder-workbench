import { describe, expect, it } from 'vitest'
import {
  RPC_METHODS_WITHOUT_SHARED_PARAMS,
  RPC_PARAMS_BY_METHOD
} from '../../../shared/rpc-contract/rpc-params-catalog.generated'
import { REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION } from '../../../shared/remote-browser-viewport-probe'
import {
  isQuietTeamReadDenial,
  isRoutineReadRuntimeMethod,
  teamReadDenialReason,
  teamReadParamsDenialReason,
  teamReadRequestParams,
  teamReadTerminalStreamHandler
} from './runtime-rpc-team-read-policy'
import { TerminalStreamOpcode } from '../../../shared/terminal-stream-protocol'

// Methods whose names look like writes but that a team-read member may call. A new method that looks
// like a write must either be denied in the policy or be added here with a reason, so upstream
// additions get a deliberate decision instead of silently opening the host.
const WRITE_LOOKING_BUT_ALLOWED = new Set([
  // Lookups and listings whose names contain a verb such as resolve, commit, run, pull or launch.
  'aiVault.resolveSessionTitles',
  'files.resolveTerminalPath',
  'git.commitCompare',
  'git.commitDiff',
  'git.remoteCommitUrl',
  'github.project.resolveRef',
  'jira.listCreateFields',
  'linear.resolveCurrentIssue',
  'orchestration.dispatchShow',
  'orchestration.requestShow',
  'orchestration.runCurrent',
  'orchestration.runList',
  'orchestration.runShow',
  'preflight.refreshAgents',
  'settings.getAgentLaunch',
  'terminal.resolveActive',
  'terminal.resolveIdentity',
  'terminal.resolvePane',
  'workbench.materials.select',
  'workbench.overview.pull',
  'worktree.resolveMrBase',
  'worktree.resolvePrBase',
  'runtime.clientCapabilities.update',
  'runtime.clientEvents.subscribe',
  'runtime.clientEvents.unsubscribe',
  'ui.recordFeatureInteraction',
  'workbench.review.receive',
  'workbench.prototypeReview.receive',
  'workbench.prototypeReview.annotations.add',
  'workbench.prototypeReview.annotations.delete',
  'workbench.metrics.refresh',
  'worktree.activate',
  'git.discoverCommitMessageModels',
  'notifications.subscribe',
  'notifications.unsubscribe',
  'jira.testConnection',
  'linear.testConnection',
  'jira.searchIssues',
  'jira.searchUsers',
  'linear.searchIssues',
  'aiVault.searchSessions',
  'repo.searchRefs',
  'files.search',
  'files.searchPaths',
  'files.watch',
  'files.unwatch',
  'terminal.show',
  'terminal.wait',
  'skills.discover',
  'skills.previewInstall',
  'skills.previewDelete',
  'skills.getInstallProgress',
  'repo.setupScriptImports',
  'accounts.subscribe',
  'accounts.unsubscribe',
  'agentSession.subscribe',
  'agentSession.subscribeStatus',
  'agentSession.unsubscribe',
  'session.tabs.subscribe',
  'session.tabs.subscribeAll',
  'session.tabs.unsubscribe',
  'session.tabs.unsubscribeAll',
  'nativeChat.subscribe',
  'nativeChat.unsubscribe',
  'terminal.subscribe',
  'terminal.unsubscribe',
  'markdown.readTab',
  'workbench.share.getLink',
  'workbench.share.list',
  'workbench.package.latest',
  'workbench.package.list'
])

const WRITE_WORDS = new Set(
  (
    'create delete remove rm send write update kill stop close merge install publish add save ' +
    'submit dismiss rename move discard commit push pull checkout stage unstage run start launch ' +
    'connect disconnect import clone upload download exec eval click type press drag resolve ' +
    'request assign reorder enable disable set select mutate reset retry rerun cancel ensure ' +
    'prepare migrate refresh sleep split focus rewind respond reply ask dispatch attach detach ' +
    'grant register unregister trigger invoke apply abort rebase fetch pin mark share consent ' +
    'setup edit put post'
  ).split(' ')
)

function looksLikeAWrite(method: string): boolean {
  return method
    .split('.')
    .slice(1)
    .flatMap((part) => part.split(/(?=[A-Z])/))
    .some((word) => WRITE_WORDS.has(word.toLowerCase()))
}

describe('team-read RPC policy', () => {
  it('denies creating worktrees, sessions, model messages, and shell input', () => {
    for (const method of [
      'worktree.create',
      'agentSession.create',
      'orchestration.send',
      'orchestration.check',
      'skills.previewInstall',
      'files.browseServerDir',
      'terminal.send',
      'session.tabs.createTerminal',
      'repo.add',
      'computer.click',
      'computer.listApps',
      'emulator.exec',
      'browser.exec',
      'browser.upload',
      'browser.cookie.get',
      'github.mergePR',
      'settings.update'
    ]) {
      expect(teamReadDenialReason('team-read', method)).toContain('授予完全访问')
    }
  })

  it('allows reading and browsing, and every new write-looking method gets a decision', () => {
    for (const method of [
      'worktree.list',
      'files.read',
      'files.search',
      'workbench.review.receive',
      'workbench.history.readPlan',
      'workbench.materials.read',
      'workbench.metrics.list',
      'workbench.metrics.refresh',
      'hostedReview.forBranch',
      'github.issue',
      'aiVault.resolveSessionTitles',
      'workspacePorts.scan',
      'settings.get',
      'settings.getTerminalQuickCommands',
      'repo.hooksCheck',
      'ssh.listTargetSummaries',
      'workbench.package.list',
      'terminal.read',
      'agentSession.history',
      'worktree.activate',
      'browser.tabList',
      'browser.tabShow',
      'browser.screencast',
      'browser.viewport',
      'browser.mouseMove',
      'browser.mouseClick',
      'browser.mouseWheel',
      'browser.keypress',
      'browser.goto',
      'browser.reload'
    ]) {
      expect(teamReadDenialReason('team-read', method)).toBeNull()
    }
    expect(teamReadDenialReason('team-read', 'workbench.materials.save')).toContain('授予完全访问')
    expect(teamReadDenialReason('full', 'terminal.send')).toBeNull()
    expect(teamReadDenialReason(undefined, 'terminal.send')).toBeNull()
    // A worktree opened by a member must not navigate the owner's own window.
    expect(teamReadRequestParams('team-read', 'worktree.activate', { worktree: 'id:1' })).toEqual({
      worktree: 'id:1',
      notifyClients: false,
      navigation: 'caller'
    })
    expect(teamReadRequestParams('full', 'worktree.activate', { worktree: 'id:1' })).toEqual({
      worktree: 'id:1'
    })
    expect(
      teamReadRequestParams('team-read', 'browser.tabCreate', {
        url: 'https://a.test',
        navigation: 'host'
      })
    ).toEqual({ url: 'https://a.test', navigation: 'caller' })

    // Shared pages open web addresses only; local files would expose the host outside the project.
    for (const url of [
      'file:///C:/Users/x/.ssh/id_rsa',
      'C:\\Users\\x\\secret.txt',
      '/etc/passwd'
    ]) {
      expect(teamReadParamsDenialReason('team-read', 'browser.goto', { url })).toContain('本地文件')
    }
    // The viewer's own viewport probe is the only page script a member may run.
    expect(
      teamReadParamsDenialReason('team-read', 'browser.eval', {
        expression: REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION
      })
    ).toBeNull()
    expect(
      teamReadParamsDenialReason('team-read', 'browser.eval', { expression: 'document.cookie' })
    ).toContain('授予完全访问')
    expect(isQuietTeamReadDenial('worktree.teardownMissingTerminals')).toBe(true)
    expect(isQuietTeamReadDenial('worktree.prefetchCreateBase')).toBe(true)
    expect(isQuietTeamReadDenial('worktree.create')).toBe(false)
    expect(
      teamReadParamsDenialReason('team-read', 'browser.tabCreate', { url: 'https://a.test' })
    ).toBeNull()
    expect(
      teamReadParamsDenialReason('team-read', 'browser.goto', { url: 'localhost:3000' })
    ).toBeNull()
    expect(
      teamReadParamsDenialReason('full', 'browser.goto', { url: 'file:///etc/passwd' })
    ).toBeNull()

    // Terminal streams keep delivering output but drop keystrokes and window-size claims.
    const frames: number[] = []
    const handler = (frame: { opcode: number }): void => {
      frames.push(frame.opcode)
    }
    const readOnlyHandler = teamReadTerminalStreamHandler('team-read', handler as never)
    for (const opcode of [
      TerminalStreamOpcode.Input,
      TerminalStreamOpcode.Resize,
      TerminalStreamOpcode.ClaimViewport,
      TerminalStreamOpcode.Ack
    ]) {
      readOnlyHandler({ opcode, payload: new Uint8Array() } as never)
    }
    expect(frames).toEqual([TerminalStreamOpcode.Ack])
    expect(teamReadTerminalStreamHandler('full', handler as never)).toBe(handler)

    const unreviewed = [
      ...Object.keys(RPC_PARAMS_BY_METHOD),
      ...RPC_METHODS_WITHOUT_SHARED_PARAMS
    ].filter(
      (method) =>
        looksLikeAWrite(method) &&
        teamReadDenialReason('team-read', method) === null &&
        !WRITE_LOOKING_BUT_ALLOWED.has(method) &&
        !method.startsWith('browser.')
    )
    expect(unreviewed).toEqual([])
  })

  it('suppresses successful routine reads but keeps deliberate actions auditable', () => {
    expect(isRoutineReadRuntimeMethod('project.list')).toBe(true)
    expect(isRoutineReadRuntimeMethod('terminal.read')).toBe(true)
    expect(isRoutineReadRuntimeMethod('aiVault.resolveSessionTitles')).toBe(true)
    expect(isRoutineReadRuntimeMethod('browser.mouseMove')).toBe(true)
    expect(isRoutineReadRuntimeMethod('workbench.review.receive')).toBe(false)
    expect(isRoutineReadRuntimeMethod('workbench.metrics.refresh')).toBe(false)
    expect(isRoutineReadRuntimeMethod('workbench.prototypeReview.annotations.add')).toBe(false)
    expect(isRoutineReadRuntimeMethod('browser.screencast')).toBe(false)
    expect(isRoutineReadRuntimeMethod('browser.goto')).toBe(false)
    expect(isRoutineReadRuntimeMethod('terminal.send')).toBe(false)
  })
})
