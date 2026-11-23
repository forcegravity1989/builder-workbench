const EXACT_LABELS: Record<string, string> = {
  'connection.open': '建立共享连接',
  'connection.close': '断开共享连接',
  'access.grant.full': '授予完全访问',
  'access.revoke': '撤销访问',
  'workbench.review.receive': '接收评审通知',
  'workbench.review.comments': '读取评审评论',
  'workbench.prototypeReview.receive': '接收原型评审通知',
  'workbench.prototypeReview.annotations.add': '添加原型批注',
  'workbench.prototypeReview.annotations.delete': '删除原型批注',
  'browser.screencast': '观看浏览器页面',
  'browser.screenshot': '截取浏览器页面',
  'repo.list': '读取项目目录',
  'projectGroup.list': '读取项目分组',
  'project.list': '读取项目',
  'projectHostSetup.list': '读取项目主机配置',
  'folderWorkspace.list': '读取工作区',
  'worktree.list': '读取工作树',
  'worktree.show': '读取工作树详情',
  'worktree.listRetiredNames': '读取已归档工作树名称',
  'files.read': '读取文件',
  'files.list': '读取文件列表',
  'files.search': '搜索文件',
  'files.searchPaths': '搜索文件路径',
  'files.readTerminalArtifact': '读取终端产物',
  'files.readTerminalArtifactPreview': '读取终端产物预览',
  'git.status': '读取 Git 状态',
  'git.history': '读取 Git 历史',
  'terminal.read': '读取终端输出',
  'terminal.list': '读取终端列表',
  'terminal.resolveActive': '读取活动终端',
  'terminal.resolvePane': '读取终端面板',
  'terminal.resolveIdentity': '读取终端身份',
  'terminal.inspectProcess': '读取终端进程',
  'terminal.agentStatus': '读取终端 Agent 状态',
  'preflight.check': '读取主机预检状态',
  'preflight.detectAgents': '读取可用 Agent',
  'codehub.mrForBranch': '读取 CodeHub 合并请求',
  'codehub.listTasks': '读取 CodeHub 任务列表',
  'codehub.listLabels': '读取 CodeHub 标签',
  'codehub.listMembers': '读取 CodeHub 成员',
  'codehub.listPipelines': '读取 CodeHub 流水线',
  'codehub.viewTask': '读取 CodeHub 任务',
  'codehub.mrChecks': '读取 CodeHub 检查',
  'github.workItem': '读取 GitHub 工作项',
  'github.workItemDetails': '读取 GitHub 工作项详情',
  'github.prComments': '读取 PR 评论',
  'github.prChecks': '读取 PR 检查',
  'github.prFileContents': '读取 PR 文件',
  'github.repoSlug': '读取 GitHub 仓库信息',
  'github.repoUpstream': '读取 GitHub 上游仓库',
  'github.rateLimit': '读取 GitHub 速率限制',
  'github.listWorkItems': '读取 GitHub 工作项列表',
  'github.listIssues': '读取 GitHub Issue 列表',
  'github.countWorkItems': '读取 GitHub 工作项数量',
  'github.listLabels': '读取 GitHub 标签',
  'github.listAssignableUsers': '读取 GitHub 可分配成员',
  'github.project.listAccessible': '读取 GitHub 项目列表',
  'github.project.listLabelsBySlug': '读取 GitHub 项目标签',
  'github.project.listAssignableUsersBySlug': '读取 GitHub 项目成员',
  'github.project.listIssueTypesBySlug': '读取 GitHub 项目类型',
  'github.project.resolveRef': '读取 GitHub 项目引用',
  'github.project.listViews': '读取 GitHub 项目视图',
  'github.project.viewTable': '读取 GitHub 项目表格'
}

// Families without an exact label share one neutral label, so a denied write and a failed read
// on the same family read the same and neither is mislabelled as a change.
const FAMILY_LABELS: Record<string, string> = {
  agentSession: 'Agent 会话操作',
  orchestration: 'Agent 任务调度',
  terminal: '终端操作',
  files: '文件操作',
  worktree: '工作树操作',
  git: 'Git 操作',
  browser: '浏览器操作',
  computer: '本机桌面操作'
}

const OTHER_KEY = 'other'
const FAMILY_KEY_PREFIX = 'family:'

// The filter groups methods by what the host owner sees, not by RPC name.
export function runtimeAccessAuditActionKey(method: string): string {
  if (Object.hasOwn(EXACT_LABELS, method)) {
    return method
  }
  const family = method.split('.')[0]
  return Object.hasOwn(FAMILY_LABELS, family) ? `${FAMILY_KEY_PREFIX}${family}` : OTHER_KEY
}

export function runtimeAccessAuditActionLabel(key: string): string {
  if (Object.hasOwn(EXACT_LABELS, key)) {
    return EXACT_LABELS[key]
  }
  if (key.startsWith(FAMILY_KEY_PREFIX)) {
    return FAMILY_LABELS[key.slice(FAMILY_KEY_PREFIX.length)] ?? '其他操作'
  }
  return '其他操作'
}
