/**
 * 本地分支的完整 ref（`refs/heads/` + 分支名）。原生侧该映射处处内联字面量、
 * 无可复用的构造器，BW 侧只写这里；剥前缀复用各进程原生单实现（renderer
 * lib/git-utils 的 branchName、main runtime 的 normalizeLocalBranchName），
 * 不另造 BW 平行副本。
 */
export function branchFullRef(branch: string): string {
  return `refs/heads/${branch}`
}
