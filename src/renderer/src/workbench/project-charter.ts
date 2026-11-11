/**
 * Workbench project charter — renderer 侧 fs 包装。
 * 纯函数核心（解析/渲染/保真补空/归一化）在 shared,与 main 侧 bw/project PR 流共用。
 */
import {
  PROJECT_TOML_REL,
  joinFsPath,
  parseProjectToml,
  type ProjectCharter
} from '../../../shared/workbench/project-charter'

export {
  BW_GITIGNORE_REL,
  CHARTER_BRANCH,
  EMPTY_CHARTER,
  PROJECT_TOML_REL,
  fillBlankCharterInToml,
  joinFsPath,
  normalizeCloneUrl,
  parseProjectToml,
  renderProjectToml,
  repoNameFromRemote
} from '../../../shared/workbench/project-charter'
export type { ProjectCharter } from '../../../shared/workbench/project-charter'

export const CHARTER_LABELS = {
  name: '项目名称',
  owner: '项目负责人',
  brief: '想做什么',
  benchmark: '对标',
  opportunity: '愿景',
  groupId: '项目群'
}

export async function readProjectCharter(
  repoPath: string,
  connectionId?: string | null
): Promise<{
  charter: ProjectCharter | null
  /** 原文文本，供保真合并与知识库正文展示；缺失或不可读时为 null。 */
  raw: string | null
  existed: boolean
  error: string | null
}> {
  const filePath = joinFsPath(repoPath, PROJECT_TOML_REL)
  const ssh = connectionId ? { connectionId } : {}
  let exists = false
  try {
    exists = await window.api.fs.pathExists({ filePath, ...ssh })
    if (!exists) {
      return { charter: null, raw: null, existed: false, error: null }
    }
    const { content, isBinary } = await window.api.fs.readFile({ filePath, ...ssh })
    if (isBinary) {
      return { charter: null, raw: null, existed: true, error: '名片不是文本文件' }
    }
    return { charter: parseProjectToml(content), raw: content, existed: true, error: null }
  } catch (e) {
    // 文件存在但读取抛异常时保持 existed=true：写入侧据此拒写，不当成新文件覆盖。
    return {
      charter: null,
      raw: null,
      existed: exists,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
