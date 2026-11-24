import { normalizeBrowserNavigationUrl } from '../../../shared/browser-url'
import { REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION } from '../../../shared/remote-browser-viewport-probe'
import type { RuntimeAccessMode } from '../../../shared/runtime-session-contracts'
import {
  TerminalStreamOpcode,
  type TerminalStreamFrame
} from '../../../shared/terminal-stream-protocol'

// A team-read member may look at everything the shared team project exposes and browse the pages
// the host shares. The boundary is what would let them act on the host: start or drive models,
// sessions and terminals, create worktrees or projects, change host or integration state, or reach
// outside the shared project (desktop control, browser scripts and credentials, file writes). Every
// other method is allowed; the policy test lists new methods that look like writes so they get a
// deliberate decision.
const TEAM_READ_DENIED_METHODS = new Set([
  // Models, agent sessions and orchestration
  'agentHooks.prepareCodexForWslPane',
  'agentSession.cancel',
  'agentSession.close',
  'agentSession.conversationCommand',
  'agentSession.create',
  'agentSession.createSupport',
  'agentSession.ensure',
  'agentSession.hold',
  'agentSession.release',
  'agentSession.requestHandoff',
  'agentSession.respondToApproval',
  'agentSession.respondToQuestion',
  'agentSession.reveal',
  'agentSession.rewind',
  'agentSession.send',
  'agentSession.setOption',
  'agentTeams.prepareLaunch',
  'agentTeams.tmuxCompat',
  'aiVault.prepareSessionResume',
  'automation.create',
  'automation.delete',
  'automation.runNow',
  'automation.update',
  'git.cancelGenerateCommitMessage',
  'git.cancelGeneratePullRequestFields',
  'git.generateCommitMessage',
  'git.generatePullRequestFields',
  'orchestration.ask',
  'orchestration.check',
  'orchestration.dispatch',
  'orchestration.federationAck',
  'orchestration.federationAttachStart',
  'orchestration.federationImport',
  'orchestration.federationPull',
  'orchestration.federationRelease',
  'orchestration.federationStop',
  'orchestration.gateCreate',
  'orchestration.gateResolve',
  'orchestration.reply',
  'orchestration.reset',
  'orchestration.run',
  'orchestration.runCreate',
  'orchestration.runStop',
  'orchestration.runUse',
  'orchestration.send',
  'orchestration.taskCreate',
  'orchestration.taskUpdate',
  'orchestration.workerAbandon',
  'orchestration.workerRelease',
  'orchestration.workerRetain',
  'orchestration.workerStart',
  'orchestration.workerStop',
  'orchestration.workerTerminalUserInput',
  // Terminals and session tabs. Activating a tab can start its process on the host.
  'session.tabs.activate',
  'session.tabs.close',
  'session.tabs.closeLifecycle',
  'session.tabs.createTerminal',
  'session.tabs.move',
  'session.tabs.setTabProps',
  'session.tabs.updatePaneLayout',
  'terminal.adoptOrphans',
  'terminal.clearBuffer',
  'terminal.close',
  'terminal.closeAll',
  'terminal.closeTab',
  'terminal.create',
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'terminal.focus',
  'terminal.multiplex',
  'terminal.recoverPane',
  'terminal.rename',
  'terminal.resizeForClient',
  'terminal.restoreFit',
  'terminal.send',
  'terminal.setAutoRestoreFit',
  'terminal.setDisplayMode',
  'terminal.sleep',
  'terminal.split',
  'terminal.stop',
  'terminal.stopExact',
  'terminal.updateViewport',
  // Worktrees, projects and files
  // Lists any directory on the host, not only the shared project.
  'files.browseServerDir',
  'files.commitUpload',
  'files.copy',
  'files.createDir',
  'files.createDirNoClobber',
  'files.createFile',
  'files.delete',
  'files.rename',
  'files.write',
  'files.writeBase64',
  'files.writeBase64Chunk',
  'files.writeTerminalArtifact',
  'folderWorkspace.create',
  'folderWorkspace.delete',
  'folderWorkspace.getPathStatus',
  'folderWorkspace.update',
  'markdown.saveTab',
  'project.update',
  'projectGroup.create',
  'projectGroup.delete',
  'projectGroup.importNested',
  'projectGroup.moveProject',
  'projectGroup.scanNested',
  'projectGroup.update',
  'projectHostSetup.clone',
  'projectHostSetup.create',
  'projectHostSetup.delete',
  'projectHostSetup.setupExistingFolder',
  'projectHostSetup.update',
  'repo.add',
  'repo.clone',
  'repo.create',
  'repo.issueCommandWrite',
  'repo.reorder',
  'repo.rm',
  'repo.saveSparsePreset',
  'repo.setBaseRef',
  'repo.update',
  'workspacePorts.kill',
  'worktree.create',
  'worktree.forceDeleteBranch',
  'worktree.persistSortOrder',
  'worktree.prefetchCreateBase',
  'worktree.rm',
  'worktree.set',
  'worktree.sleep',
  'worktree.teardownMissingTerminals',
  // Git writes
  'git.abortMerge',
  'git.abortRebase',
  'git.bulkDiscard',
  'git.bulkStage',
  'git.bulkUnstage',
  'git.checkout',
  'git.commit',
  'git.discard',
  'git.fastForward',
  'git.fetch',
  'git.forkSync',
  'git.pull',
  'git.push',
  'git.rebaseFromBase',
  'git.stage',
  'git.unstage',
  // Changes made through the host's code-hosting and tracker credentials
  'codehub.assignIssue',
  'codehub.closeMr',
  'codehub.createComment',
  'codehub.createIssue',
  'codehub.deleteComment',
  'codehub.mergeMr',
  'codehub.setIssueState',
  'codehub.setReviewers',
  'codehub.updateIssueLabels',
  'codehub.updateIssueTitle',
  'github.addIssueComment',
  'github.addPRReviewComment',
  'github.addPRReviewCommentReply',
  'github.createIssue',
  'github.markPRReadyForReview',
  'github.mergePR',
  'github.project.addIssueCommentBySlug',
  'github.project.clearItemField',
  'github.project.deleteIssueCommentBySlug',
  'github.project.updateIssueBySlug',
  'github.project.updateIssueCommentBySlug',
  'github.project.updateIssueTypeBySlug',
  'github.project.updateItemField',
  'github.project.updatePullRequestBySlug',
  'github.removePRReviewers',
  'github.requestPRReviewers',
  'github.rerunPRChecks',
  'github.resolveReviewThread',
  'github.setPRAutoMerge',
  'github.setPRCommentReaction',
  'github.setPRFileViewed',
  'github.updateIssue',
  'github.updatePR',
  'github.updatePRState',
  'github.updatePRTitle',
  'gitlab.addIssueComment',
  'gitlab.addMRComment',
  'gitlab.addMRInlineComment',
  'gitlab.createIssue',
  'gitlab.mergeMR',
  'gitlab.resolveMRDiscussion',
  'gitlab.retryJob',
  'gitlab.updateIssue',
  'gitlab.updateMR',
  'gitlab.updateMRReviewers',
  'gitlab.updateMRState',
  'hostedReview.create',
  'hostedReview.createStacked',
  'jira.addIssueComment',
  'jira.connect',
  'jira.createIssue',
  'jira.disconnect',
  'jira.selectSite',
  'jira.updateIssue',
  'linear.addIssueComment',
  'linear.connect',
  'linear.createIssue',
  'linear.createProject',
  'linear.disconnect',
  'linear.issueAddComment',
  'linear.issueAttachLink',
  'linear.issueCreate',
  'linear.issueRelationWrite',
  'linear.issueSetState',
  'linear.issueUpdateTask',
  'linear.saveIssue',
  'linear.selectWorkspace',
  'linear.updateIssue',
  // Host accounts, settings, plugins, skills and integrations
  'accounts.addClaudeFromConfigDir',
  'accounts.addCodexFromHome',
  'accounts.consumeCodexResetCredit',
  'accounts.removeClaude',
  'accounts.removeCodex',
  'accounts.selectClaude',
  'accounts.selectCodex',
  'accounts.selectCodexForTarget',
  'notifications.registerPush',
  'notifications.testPush',
  'notifications.unregisterPush',
  'pairing.provisionRelay',
  'plugins.consent',
  'plugins.invokeCommand',
  'plugins.panelAction',
  'plugins.setEnabled',
  'settings.mutateAgentLaunch',
  'settings.mutateNativeChatSessionOptions',
  'settings.update',
  'settings.updatePRBotAuthorOverride',
  'settings.updateTerminalQuickCommands',
  'skills.beginUpload',
  'skills.cancelInstall',
  'skills.cancelUpload',
  'skills.commitUpload',
  'skills.delete',
  'skills.install',
  // Reads any local file path the caller names, so it is outside the shared project.
  'skills.previewInstall',
  'skills.installBundle',
  'skills.removeInstall',
  'skills.share',
  'skills.uploadChunk',
  'ssh.connect',
  'ui.set',
  'updater.check',
  'updater.download',
  'updater.install',
  // Builders' Workbench writes
  'workbench.charter.submit',
  'workbench.fixedWorkspace.ensure',
  'workbench.materials.addArtifact',
  'workbench.materials.migrate',
  'workbench.materials.save',
  'workbench.metrics.refresh',
  'workbench.milestones.discard',
  'workbench.milestones.save',
  'workbench.milestones.submit',
  'workbench.package.download',
  'workbench.package.launch',
  'workbench.prototypeReview.dismiss',
  'workbench.repo.deleteGroup',
  'workbench.repo.removeRegistration',
  'workbench.review.dismiss',
  'workbench.share.publish',
  'workbench.share.remove',
  'workbench.skills.prepare',
  'workbench.trunk.update',
  'workbench.versionBinding.set',
  'workbench.versionWorkspace.prepare',
  // Reaching outside the shared project: scripts, credentials and the host's network
  'browser.capture.start',
  'browser.capture.stop',
  'browser.certificate.proceed',
  'browser.clipboardRead',
  'browser.clipboardWrite',
  'browser.cookie.delete',
  'browser.cookie.get',
  'browser.cookie.set',
  'browser.download',
  'browser.exec',
  'browser.geolocation',
  'browser.intercept.disable',
  'browser.intercept.enable',
  'browser.intercept.list',
  'browser.pdf',
  'browser.profileClearDefaultCookies',
  'browser.profileCreate',
  'browser.profileDelete',
  'browser.profileDetectBrowsers',
  'browser.profileImportFromBrowser',
  'browser.profileList',
  'browser.setCredentials',
  'browser.setHeaders',
  'browser.setOffline',
  'browser.storage.local.clear',
  'browser.storage.local.get',
  'browser.storage.local.set',
  'browser.storage.session.clear',
  'browser.storage.session.get',
  'browser.storage.session.set',
  'browser.tabClose',
  'browser.tabProfileClone',
  'browser.tabProfileShow',
  'browser.tabSetProfile',
  'browser.upload',
  'network.browserTunnel'
])

// Families that are entirely out of bounds: driving the host's desktop and devices, speech input
// and clipboard staging. New methods in these families are denied without a list entry.
const TEAM_READ_DENIED_PREFIXES = [
  'browser.clientHost.',
  'clipboard.',
  'computer.',
  'emulator.',
  'speech.'
]

// Allowed methods whose successful calls are worth a log line. Routine reads (sidebars, plan screen,
// PR status, settings, session and terminal output) stay out of the log; the log keeps denials,
// failures, connections, grants and these actions.
const AUDITED_TEAM_READ_METHODS = new Set([
  'workbench.review.receive',
  'workbench.prototypeReview.receive',
  'workbench.prototypeReview.annotations.add',
  'workbench.prototypeReview.annotations.delete',
  // Driving a page on the host's browser is something its owner should be able to see afterwards.
  // Pointer movement, scrolling and single key presses are left out because they arrive in bursts.
  'browser.screencast',
  'browser.screenshot',
  'browser.fullScreenshot',
  'browser.goto',
  'browser.openUrl',
  'browser.reload',
  'browser.back',
  'browser.forward',
  'browser.click',
  'browser.dblclick',
  'browser.mouseClick',
  'browser.drag',
  'browser.type',
  'browser.fill',
  'browser.select',
  'browser.tabCreate'
])

const TEAM_READ_DENIAL_MESSAGE =
  '这台主机只授予了只读访问：可以查看，不能创建、修改或发送输入。请让主机持有人在“共享此主机”中授予完全访问。'

function isDeniedForTeamRead(method: string): boolean {
  return (
    TEAM_READ_DENIED_METHODS.has(method) ||
    TEAM_READ_DENIED_PREFIXES.some((prefix) => method.startsWith(prefix))
  )
}

export function isRoutineReadRuntimeMethod(method: string): boolean {
  return !AUDITED_TEAM_READ_METHODS.has(method) && !isDeniedForTeamRead(method)
}

export function teamReadDenialReason(
  accessMode: RuntimeAccessMode | undefined,
  method: string
): string | null {
  if (accessMode !== 'team-read' || !isDeniedForTeamRead(method)) {
    return null
  }
  return TEAM_READ_DENIAL_MESSAGE
}

// A member's interface fires these on its own when they open a worktree (select a tab, restore a
// layout, add a terminal, store the label). They are refused, but the member did not choose them, so
// the refusals stay out of the access log.
const TEAM_READ_QUIET_DENIAL_METHODS = new Set([
  'session.tabs.activate',
  'session.tabs.createTerminal',
  'session.tabs.updatePaneLayout',
  'worktree.set',
  'worktree.teardownMissingTerminals',
  // Attached by the member's browser on its own to host pages for the owner's sessions.
  'browser.clientHost.attach'
])

export function isQuietTeamReadDenial(method: string): boolean {
  return TEAM_READ_QUIET_DENIAL_METHODS.has(method)
}

// A member opening one of the owner's worktrees or pages must not move the owner's own window along.
const TEAM_READ_FORCED_PARAMS: Record<string, Record<string, unknown>> = {
  'worktree.activate': { notifyClients: false, navigation: 'caller' },
  'browser.tabCreate': { navigation: 'caller' }
}

export function teamReadRequestParams(
  accessMode: RuntimeAccessMode | undefined,
  method: string,
  params: unknown
): unknown {
  const forced = accessMode === 'team-read' ? TEAM_READ_FORCED_PARAMS[method] : undefined
  if (!forced) {
    return params
  }
  return { ...(params && typeof params === 'object' ? params : {}), ...forced }
}

const TEAM_READ_URL_METHODS = new Set(['browser.goto', 'browser.openUrl', 'browser.tabCreate'])

// Shared pages may open web addresses only. A local file address would let a member read files
// outside the shared project through the screenshot and snapshot calls.
export function teamReadParamsDenialReason(
  accessMode: RuntimeAccessMode | undefined,
  method: string,
  params: unknown
): string | null {
  if (accessMode !== 'team-read') {
    return null
  }
  const fields = params && typeof params === 'object' ? (params as Record<string, unknown>) : {}
  if (method === 'browser.eval') {
    return fields.expression === REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION
      ? null
      : TEAM_READ_DENIAL_MESSAGE
  }
  if (!TEAM_READ_URL_METHODS.has(method)) {
    return null
  }
  const url = fields.url
  if (typeof url !== 'string') {
    return null
  }
  const normalized = normalizeBrowserNavigationUrl(url)
  if (normalized === null || /^file:/i.test(normalized)) {
    return '这台主机只授予了只读访问：共享页面只能打开网页地址，不能打开主机上的本地文件。'
  }
  return null
}

// A terminal stream carries the member's keystrokes and window size back to the host. Read-only
// members still receive output, but their input and size claims are dropped.
const TEAM_READ_DROPPED_TERMINAL_OPCODES = new Set<TerminalStreamOpcode>([
  TerminalStreamOpcode.Input,
  TerminalStreamOpcode.Resize,
  TerminalStreamOpcode.ClaimViewport
])

export function teamReadTerminalStreamHandler(
  accessMode: RuntimeAccessMode | undefined,
  handler: (frame: TerminalStreamFrame) => void
): (frame: TerminalStreamFrame) => void {
  if (accessMode !== 'team-read') {
    return handler
  }
  return (frame) => {
    if (!TEAM_READ_DROPPED_TERMINAL_OPCODES.has(frame.opcode)) {
      handler(frame)
    }
  }
}
