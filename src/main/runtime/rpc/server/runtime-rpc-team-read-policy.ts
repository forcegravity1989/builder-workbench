import { DELEGATED_MOBILE_DEVICE_SYNC_METHOD } from '../../../../shared/remote-runtime/pairing/delegated-mobile-device-contract'
import { normalizeBrowserNavigationUrl } from '../../../../shared/browser/navigation/browser-url'
import { REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION } from '../../../../shared/remote-browser-viewport-probe'
import type { RuntimeAccessMode } from '../../../../shared/remote-runtime/session-graph/runtime-session-contracts'
import {
  TerminalStreamOpcode,
  type TerminalStreamFrame
} from '../../../../shared/terminal/stream/terminal-stream-protocol'

// A team-read member may use the host's shared team project the way its owner does, except for a
// few actions: sending input or messages to terminals, agents and models, reading files outside the
// project, writing back to code hosts and trackers under the owner's accounts, and changing project
// files, Git or worktrees. Each action is denied at its core entry only; the steps behind it need
// no entry because the interface never reaches them. Every other method is allowed.
export const TEAM_READ_DENIED_METHODS = new Set([
  // Sending input or messages to a terminal, an agent or a model
  'agentSession.conversationCommand',
  'agentSession.respondToApproval',
  'agentSession.respondToQuestion',
  'agentSession.send',
  'agentSession.queuedMessageSend',
  'agentSession.queuedMessagesResume',
  'agentSession.approveAutoReviewDenial',
  'agentSession.threadGoal',
  'agentSession.rewind',
  'agentSession.delete',
  'git.generateCommitMessage',
  'git.generatePullRequestFields',
  'orchestration.ask',
  'orchestration.dispatch',
  'orchestration.reply',
  'orchestration.send',
  'orchestration.workerTerminalUserInput',
  'terminal.send',
  DELEGATED_MOBILE_DEVICE_SYNC_METHOD,
  // Reading files outside the shared project (browser.upload names host file paths)
  'browser.upload',
  'files.browseServerDir',
  'skills.previewInstall',
  // Writing back to code hosts and trackers under the host owner's accounts
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
  'jira.createIssue',
  'jira.updateIssue',
  'linear.addIssueComment',
  'linear.createIssue',
  'linear.createProject',
  'linear.issueAddComment',
  'linear.issueAttachLink',
  'linear.issueCreate',
  'linear.issueRelationWrite',
  'linear.issueSetState',
  'linear.issueUpdateTask',
  'linear.saveIssue',
  'linear.updateIssue',
  // Changing project files, Git, worktrees and the project list
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
  'folderWorkspace.update',
  'git.abortMerge',
  'git.abortRebase',
  'git.bulkDiscard',
  'git.bulkStage',
  'git.bulkUnstage',
  'git.cancelGenerateCommitMessage',
  'git.cancelGeneratePullRequestFields',
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
  'markdown.saveTab',
  'project.update',
  'projectGroup.create',
  'projectGroup.delete',
  'projectGroup.importNested',
  'projectGroup.scanNested',
  'projectHostSetup.clone',
  'projectHostSetup.create',
  'projectHostSetup.delete',
  'projectHostSetup.setupExistingFolder',
  'projectHostSetup.update',
  'repo.add',
  'repo.clone',
  'repo.create',
  'repo.issueCommandWrite',
  'repo.rm',
  'repo.saveSparsePreset',
  'repo.setBaseRef',
  'workbench.fixedWorkspace.ensure',
  'workbench.trunk.update',
  'workbench.repo.removeRegistration',
  'workbench.versionWorkspace.prepare',
  'worktree.create',
  'worktree.forceDeleteBranch',
  'worktree.rm'
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
export const AUDITED_TEAM_READ_METHODS = new Set([
  'workbench.review.receive',
  'workbench.prototypeReview.receive',
  'workbench.prototypeReview.annotations.add',
  'workbench.prototypeReview.annotations.delete',
  // Driving a page on the host's browser is something its owner should be able to see afterwards.
  // Pointer movement, scrolling, single key presses and the screen stream itself are left out
  // because they arrive in bursts.
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
  'browser.tabCreate',
  // Actions that run or change things on the host. Plain reads stay out of the log.
  'browser.eval',
  'browser.exec',
  'settings.update',
  'updater.install',
  'terminal.create',
  'agentSession.create',
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'terminal.close',
  'terminal.closeTab',
  'terminal.closeAll',
  'terminal.stop',
  'terminal.stopExact',
  'terminal.rename',
  'terminal.clearBuffer',
  'agentSession.cancel',
  'agentSession.close',
  'agentSession.rewind',
  'agentSession.setOption',
  'session.tabs.createTerminal',
  'session.tabs.close',
  'worktree.sleep',
  'worktree.set',
  // Host-level configuration and installs: they change what later sessions can do on this machine.
  'settings.mutateAgentLaunch',
  'settings.updateTerminalQuickCommands',
  'skills.install',
  'skills.installBundle',
  'skills.delete',
  'skills.removeInstall',
  'skills.share',
  'automation.create',
  'automation.update',
  'automation.delete',
  'automation.runNow',
  'workbench.package.launch',
  'workbench.share.publish',
  'workbench.share.remove',
  'workbench.versionBinding.set',
  'workbench.skills.prepare',
  'workbench.materials.save',
  'workbench.milestones.save',
  'workbench.milestones.submit',
  'workbench.charter.submit'
])

const TEAM_READ_DENIAL_MESSAGE =
  '这台主机只授予了只读访问：可以查看，不能创建、修改或发送输入。请让主机持有人在“共享此主机”中授予完全访问。'

const TEAM_READ_BOT_METHODS = new Set([
  'bots.activity',
  'bots.agentChoices',
  'bots.avatar.read',
  'bots.chatTree',
  'bots.chats',
  'bots.chats.search',
  'bots.chats.unseen',
  'bots.groups.list',
  'bots.groups.read',
  'bots.items.list',
  'bots.items.show',
  'bots.items.owner.list',
  'bots.items.owner.show',
  'bots.list',
  'bots.memory.history',
  'bots.roster',
  'bots.tidyUp.get',
  'bots.upNext.unseen',
  'bots.work.list'
])

function isDeniedForTeamRead(method: string): boolean {
  return (
    (method.startsWith('bots.') && !TEAM_READ_BOT_METHODS.has(method)) ||
    TEAM_READ_DENIED_METHODS.has(method) ||
    TEAM_READ_DENIED_PREFIXES.some((prefix) => method.startsWith(prefix))
  )
}

export function isRoutineReadRuntimeMethod(method: string): boolean {
  return !AUDITED_TEAM_READ_METHODS.has(method) && !isDeniedForTeamRead(method)
}

// A shared page viewer measures the page with one fixed script on every resize. That is a read, not
// "running a script on the host", so it stays out of the log while other scripts are recorded.
export function isRoutineReadRuntimeRequest(method: string, params: unknown): boolean {
  if (method === 'browser.eval') {
    const expression = (params as { expression?: unknown } | null | undefined)?.expression
    return expression === REMOTE_BROWSER_VIEWPORT_PROBE_EXPRESSION
  }
  return isRoutineReadRuntimeMethod(method)
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

// Attached by the member's browser on its own to host pages for the owner's sessions. Refused, but
// the member did not choose it, so the refusal stays out of the access log.
const TEAM_READ_QUIET_DENIAL_METHODS = new Set(['browser.clientHost.attach'])

// The member's client checks whether the host's terminals still exist when it connects or opens a
// session; a terminal that is gone answers with these fixed errors. Nothing was attempted, so they
// are not audit material.
const EXPECTED_ERRORS: Record<string, string> = {
  'terminal.resolvePane': 'terminal_not_found',
  'terminal.list': 'terminal_liveness_unavailable'
}

export function isExpectedTeamReadError(method: string, errorMessage: string | undefined): boolean {
  return errorMessage !== undefined && EXPECTED_ERRORS[method] === errorMessage
}

export function isQuietTeamReadDenial(method: string): boolean {
  return TEAM_READ_QUIET_DENIAL_METHODS.has(method)
}

// A member opening one of the owner's worktrees or pages must not move the owner's own window along.
const TEAM_READ_FORCED_PARAMS: Record<string, Record<string, unknown>> = {
  'worktree.activate': { notifyClients: false, navigation: 'caller' },
  'session.tabs.activate': { notifyClients: false, navigation: 'caller' },
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

// Starting a session is allowed, but a prompt handed over at start is the same as sending a message
// to the agent, so it is refused. Starting without a prompt goes through.
const TEAM_READ_PROMPT_METHODS = new Set([
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'agentSession.create',
  'agentSession.ensure'
])
const TEAM_READ_PROMPT_DENIAL_MESSAGE =
  '这台主机只授予了只读访问：不能向 Agent 发送提示词，可以不带提示词启动会话。请让主机持有人在“共享此主机”中授予完全访问。'

function hasPrompt(prompt: unknown): boolean {
  return typeof prompt === 'string'
    ? prompt.trim().length > 0
    : prompt !== undefined && prompt !== null
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
  if (
    (method === 'terminal.create' || method === 'terminal.split') &&
    (hasPrompt(fields.command) ||
      fields.shell !== undefined ||
      fields.launchConfig !== undefined ||
      (fields.env && typeof fields.env === 'object' && Object.keys(fields.env).length > 0) ||
      (Array.isArray(fields.envToDelete) && fields.envToDelete.length > 0))
  ) {
    return TEAM_READ_DENIAL_MESSAGE
  }
  if (TEAM_READ_PROMPT_METHODS.has(method) && hasPrompt(fields.prompt)) {
    return TEAM_READ_PROMPT_DENIAL_MESSAGE
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
// members still receive output and report their window size so the view fits and scrolls like the
// host's; only keystrokes are dropped.
const TEAM_READ_DROPPED_TERMINAL_OPCODES = new Set<TerminalStreamOpcode>([
  TerminalStreamOpcode.Input
])

export function teamReadTerminalStreamHandler(
  currentAccessMode: () => RuntimeAccessMode | undefined,
  handler: (frame: TerminalStreamFrame) => void
): (frame: TerminalStreamFrame) => void {
  return (frame) => {
    if (
      currentAccessMode() !== 'team-read' ||
      !TEAM_READ_DROPPED_TERMINAL_OPCODES.has(frame.opcode)
    ) {
      handler(frame)
    }
  }
}
