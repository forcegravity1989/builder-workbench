import { normalizeBrowserNavigationUrl } from '../../../shared/browser-url'
import type { RuntimeAccessMode } from '../../../shared/runtime-session-contracts'
import {
  TerminalStreamOpcode,
  type TerminalStreamFrame
} from '../../../shared/terminal-stream-protocol'

// A team-read member may use the host's shared team project the way its owner does, except for a
// few actions: sending input or messages to terminals, agents and models, reading files outside the
// project, writing back to code hosts and trackers under the owner's accounts, and changing project
// files, Git or worktrees. Each action is denied at its core entry only; the steps behind it need
// no entry because the interface never reaches them. Every other method is allowed.
const TEAM_READ_DENIED_METHODS = new Set([
  // Sending input or messages to a terminal, an agent or a model
  'agentSession.conversationCommand',
  'agentSession.respondToApproval',
  'agentSession.respondToQuestion',
  'agentSession.send',
  'git.generateCommitMessage',
  'git.generatePullRequestFields',
  'orchestration.ask',
  'orchestration.dispatch',
  'orchestration.reply',
  'orchestration.send',
  'orchestration.workerTerminalUserInput',
  'terminal.send',
  // Reading files outside the shared project
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
  'repo.rm',
  'repo.saveSparsePreset',
  'repo.setBaseRef',
  'repo.update',
  'workbench.fixedWorkspace.ensure',
  'workbench.repo.deleteGroup',
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
const AUDITED_TEAM_READ_METHODS = new Set([
  'workbench.review.receive',
  'workbench.prototypeReview.receive',
  'workbench.prototypeReview.annotations.add',
  'workbench.prototypeReview.annotations.delete',
  // Recomputes metrics from the host's data without writing any source of truth; members need it to
  // see current numbers, so it is allowed and logged.
  'workbench.metrics.refresh',
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
  'browser.tabCreate',
  // Starting element picking and capturing a page image are the visible actions; the wait and cancel
  // calls around them are plumbing and stay out of the log.
  'browser.grab.setMode',
  'browser.grab.screenshot',
  // Actions that run or change things on the host. Plain reads stay out of the log.
  'browser.eval',
  'browser.exec',
  'settings.update',
  'updater.install',
  'terminal.create',
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'terminal.close',
  'session.tabs.createTerminal',
  'session.tabs.close',
  'worktree.sleep',
  'workbench.skills.prepare',
  'workbench.materials.save',
  'workbench.milestones.save',
  'workbench.milestones.submit',
  'workbench.charter.submit'
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

// Attached by the member's browser on its own to host pages for the owner's sessions. Refused, but
// the member did not choose it, so the refusal stays out of the access log.
const TEAM_READ_QUIET_DENIAL_METHODS = new Set(['browser.clientHost.attach'])

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
