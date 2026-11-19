import type { RuntimeAccessMode } from '../../../shared/runtime-session-contracts'

// Team-read deliberately follows the existing RPC surface. It only removes
// operations that create or mutate host state; read methods remain available so
// an existing project/session can be inspected without introducing a second
// project permission system.
const TEAM_READ_DENIED_METHODS = new Set([
  'agentSession.create',
  'agentSession.createSupport',
  'agentSession.ensure',
  'agentSession.send',
  'agentSession.conversationCommand',
  'agentSession.respondToApproval',
  'agentSession.respondToQuestion',
  'agentSession.rewind',
  'orchestration.ask',
  'orchestration.dispatch',
  'orchestration.federationAttachStart',
  'orchestration.federationImport',
  'orchestration.federationPull',
  'orchestration.federationRelease',
  'orchestration.federationStop',
  'orchestration.reply',
  'orchestration.reset',
  'orchestration.run',
  'orchestration.runCreate',
  'orchestration.runStop',
  'orchestration.send',
  'orchestration.taskCreate',
  'orchestration.taskUpdate',
  'orchestration.workerAbandon',
  'orchestration.workerRelease',
  'orchestration.workerRetain',
  'orchestration.workerStart',
  'orchestration.workerStop',
  'orchestration.workerTerminalUserInput',
  'terminal.create',
  'terminal.createAgentSession',
  'terminal.ensureAgentSession',
  'terminal.send',
  'terminal.stop',
  'terminal.stopExact',
  'terminal.close',
  'terminal.closeAll',
  'terminal.closeTab',
  'terminal.split',
  'terminal.rename',
  'terminal.recoverPane',
  'terminal.clearBuffer',
  'terminal.focus',
  'terminal.resizeForClient',
  'terminal.restoreFit',
  'terminal.updateViewport',
  'terminal.adoptOrphans',
  'files.write',
  'files.writeBase64',
  'files.writeBase64Chunk',
  'files.writeTerminalArtifact',
  'files.commitUpload',
  'files.copy',
  'files.createDir',
  'files.createDirNoClobber',
  'files.createFile',
  'files.delete',
  'files.rename',
  'worktree.create',
  'worktree.rm',
  'worktree.activate',
  'worktree.set',
  'worktree.forceDeleteBranch',
  'worktree.prefetchCreateBase',
  'git.commit',
  'git.push',
  'git.pull',
  'git.checkout',
  'git.stage',
  'git.unstage',
  'git.bulkStage',
  'git.bulkUnstage',
  'git.discard',
  'git.bulkDiscard',
  'git.rebaseFromBase',
  'git.abortMerge',
  'git.abortRebase',
  'browser.exec',
  'browser.eval',
  'browser.upload',
  'computer.pasteText',
  'computer.typeText',
  'computer.hotkey',
  'computer.click',
  'computer.drag',
  'computer.pressKey',
  'computer.setValue',
  'computer.performSecondaryAction'
])

const TEAM_READ_ALLOWED_METHODS = new Set([
  'me',
  'host.platform',
  'stats.summary',
  'codehub.viewer',
  'workbench.materials.context',
  'workbench.charter.read',
  'workbench.charter.status',
  'workbench.review.identity',
  'workbench.review.inbox',
  'workbench.versionBinding.read',
  'pairing.getEndpoints',
  'runtime.clientEvents.subscribe',
  'runtime.clientEvents.unsubscribe',
  'nativeChat.readSession',
  'nativeChat.subscribe',
  'nativeChat.unsubscribe',
  'terminal.subscribe',
  'terminal.unsubscribe',
  'terminal.read',
  'terminal.list',
  'terminal.show',
  'terminal.wait',
  'session.tabs.list',
  'session.tabs.listAll',
  'session.tabs.subscribe',
  'session.tabs.subscribeAll',
  'session.tabs.unsubscribe',
  'session.tabs.unsubscribeAll'
])

const READ_METHOD_SUFFIX = /(?:^|\.)(?:list|show|get|read|history|diff|stat|status|search|find|preview|info|current|capabilities|is|console|network|snapshot|screenshot|inspect|resolve|describe|check|view|views|changes|comments?|checks|summary|open|diff|dir|all|watch|pathsexist|browse|branches|remote|upstream|submodule|ps)$/i

function isReadMethod(method: string): boolean {
  return TEAM_READ_ALLOWED_METHODS.has(method) || READ_METHOD_SUFFIX.test(method)
}

export function teamReadDenialReason(
  accessMode: RuntimeAccessMode | undefined,
  method: string
): string | null {
  if (accessMode !== 'team-read') {
    return null
  }
  if (!TEAM_READ_DENIED_METHODS.has(method) && isReadMethod(method)) {
    return null
  }
  return `Method '${method}' requires full access`
}
