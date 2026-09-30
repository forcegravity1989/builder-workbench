/**
 * Workbench project charter — renderer 侧 fs 包装。
 * 纯函数核心（解析/渲染/保真补空/归一化）在 shared,与 main 侧 bw/project PR 流共用。
 */
import {
  BW_GITIGNORE_REL,
  EMPTY_CHARTER,
  PROJECT_TOML_REL,
  fillBlankCharterInToml,
  joinFsPath,
  parseProjectToml,
  renderProjectToml,
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

export async function readProjectCharter(repoPath: string): Promise<{
  charter: ProjectCharter | null
  /** 原文文本，供保真合并与知识库正文展示；缺失或不可读时为 null。 */
  raw: string | null
  existed: boolean
  error: string | null
}> {
  const filePath = joinFsPath(repoPath, PROJECT_TOML_REL)
  let exists = false
  try {
    exists = await window.api.fs.pathExists({ filePath })
    if (!exists) {
      return { charter: null, raw: null, existed: false, error: null }
    }
    const { content, isBinary } = await window.api.fs.readFile({ filePath })
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

/**
 * 无远端仓的就地落盘兜底（spec 规则 2 降级分支）：已有文件只补空字段、
 * 其余内容逐字保留；不可读不覆盖、如实报错。有远端时不走这里,走
 * workbench.charter RPC 的 bw/project 固定树 + PR 流。
 */
export async function writeProjectCharter(
  repoPath: string,
  intent: ProjectCharter
): Promise<{ wrote: boolean; adopted: boolean; filled: string[]; error: string | null }> {
  const bwDir = joinFsPath(repoPath, '.bw')
  const filePath = joinFsPath(repoPath, PROJECT_TOML_REL)
  const gitignorePath = joinFsPath(repoPath, BW_GITIGNORE_REL)
  try {
    const prior = await readProjectCharter(repoPath)
    if (prior.raw === null && prior.error !== null) {
      // 文件存在但不可读（二进制/IO 异常）：不覆盖，如实报错。
      return { wrote: false, adopted: prior.existed, filled: [], error: prior.error }
    }
    let wrote = false
    let filled: string[] = []
    if (prior.raw !== null) {
      const merge = fillBlankCharterInToml(prior.raw, intent)
      filled = merge.filled
      if (filled.length > 0) {
        await window.api.fs.writeFile({ filePath, content: merge.content })
        wrote = true
      }
    } else {
      const next: ProjectCharter = { ...EMPTY_CHARTER }
      for (const key of Object.keys(next) as (keyof ProjectCharter)[]) {
        next[key] = intent[key].trim()
      }
      if (!next.name) {
        return { wrote: false, adopted: false, filled: [], error: '项目名称不能为空' }
      }
      const bwExists = await window.api.fs.pathExists({ filePath: bwDir })
      if (!bwExists) {
        await window.api.fs.createDir({ dirPath: bwDir })
      }
      await window.api.fs.writeFile({ filePath, content: renderProjectToml(next) })
      wrote = true
      filled = (Object.keys(next) as (keyof ProjectCharter)[]).filter((k) => next[k])
    }
    const giExists = await window.api.fs.pathExists({ filePath: gitignorePath })
    if (!giExists) {
      await window.api.fs.writeFile({ filePath: gitignorePath, content: 'worktrees/\n' })
    }
    return { wrote, adopted: prior.existed, filled, error: null }
  } catch (e) {
    return {
      wrote: false,
      adopted: false,
      filled: [],
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
