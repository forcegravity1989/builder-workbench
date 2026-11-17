/**
 * 常用链接的项目级持久化（renderer 侧 fs 包装）。
 * 落点为项目根下 `.bw/quick-links.json`，遵守本仓「本地零业务数据库」：
 * 小 JSON 文件，不走 sqlite，也不新增主进程 store。
 */
import {
  QUICK_LINKS_SCHEMA_VERSION,
  QuickLinksDocumentSchema,
  type QuickLink
} from '../../../../shared/monica/quick-links'
import { joinFsPath } from '../../../../shared/monica/project-charter'

export const QUICK_LINKS_REL = '.bw/quick-links.json'

export function quickLinksFilePath(repoPath: string): string {
  return joinFsPath(repoPath, QUICK_LINKS_REL)
}

export type QuickLinksLoadResult = {
  links: QuickLink[]
  /** 文件存在但无法解析（坏 JSON / 版本不符 / 二进制）时为 true，原文件保留不覆盖。 */
  corrupt: boolean
}

/** 读取当前项目的常用链接；缺失视为空列表，坏文件保留原样并标记 corrupt。 */
export async function loadQuickLinks(
  repoPath: string,
  connectionId?: string | null
): Promise<QuickLinksLoadResult> {
  const filePath = quickLinksFilePath(repoPath)
  const ssh = connectionId ? { connectionId } : {}
  const exists = await window.api.fs.pathExists({ filePath, ...ssh })
  if (!exists) {
    return { links: [], corrupt: false }
  }
  const { content, isBinary } = await window.api.fs.readFile({ filePath, ...ssh })
  if (isBinary) {
    return { links: [], corrupt: true }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return { links: [], corrupt: true }
  }
  const result = QuickLinksDocumentSchema.safeParse(parsed)
  if (!result.success) {
    return { links: [], corrupt: true }
  }
  return { links: result.data.links, corrupt: false }
}

/** 写回当前项目的常用链接；必要时先建 `.bw` 目录。 */
export async function saveQuickLinks(
  repoPath: string,
  connectionId: string | null | undefined,
  links: QuickLink[]
): Promise<void> {
  const ssh = connectionId ? { connectionId } : {}
  const monicaDir = joinFsPath(repoPath, '.bw')
  const monicaExists = await window.api.fs.pathExists({ filePath: monicaDir, ...ssh })
  if (!monicaExists) {
    await window.api.fs.createDir({ dirPath: monicaDir, ...ssh })
  }
  const content = JSON.stringify({ schemaVersion: QUICK_LINKS_SCHEMA_VERSION, links }, null, 2)
  await window.api.fs.writeFile({ filePath: quickLinksFilePath(repoPath), content, ...ssh })
}
