import type { MarkdownDocument } from '../../../shared/filesystem-entry-types'
import {
  classifyKbDocGroup,
  kbDocIdFromPath,
  ledeFromMarkdownBody,
  sortKbDocs
} from './knowledge-doc-classify'
import { normalizeKbRelativePath, registryMetaForPath, type KbDoc } from './knowledge-doc-registry'
import {
  classifyWithMap,
  readKnowledgeMap,
  type KnowledgeMap,
  type KnowledgeMapStatus
} from './knowledge-map'
import {
  joinFsPath,
  PROJECT_TOML_REL,
  readProjectCharter,
  renderProjectToml
} from './project-charter'

export type KnowledgeRepoSnapshot = {
  docs: KbDoc[]
  bodies: Record<string, string>
  mapStatus: KnowledgeMapStatus | 'missing'
  mapError: string | null
}

export type WriteKnowledgeDocResult = {
  wrote: boolean
  error: string | null
}

function parentDir(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/'
  const idx = filePath.lastIndexOf(sep)
  return idx <= 0 ? '' : filePath.slice(0, idx)
}

function classifyDocGroup(relativePath: string, map: KnowledgeMap | null): string | null {
  if (map) {
    return classifyWithMap(relativePath, map)
  }
  return classifyKbDocGroup(relativePath)
}

/** Write edited KB body back to the repo (MVP: main checkout). */
export async function writeKnowledgeDocToRepo(
  repoPath: string,
  relativePath: string,
  content: string
): Promise<WriteKnowledgeDocResult> {
  const norm = normalizeKbRelativePath(relativePath)
  if (!norm || norm.split('/').includes('..')) {
    return { wrote: false, error: '非法路径' }
  }
  const filePath = joinFsPath(repoPath, norm)
  try {
    const dir = parentDir(filePath)
    if (dir) {
      const parentExists = await window.api.fs.pathExists({ filePath: dir })
      if (!parentExists) {
        await window.api.fs.createDir({ dirPath: dir })
      }
    }
    await window.api.fs.writeFile({ filePath, content })
    return { wrote: true, error: null }
  } catch (e) {
    return {
      wrote: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

export async function loadKnowledgeFromRepo(repoPath: string): Promise<KnowledgeRepoSnapshot> {
  const mapResult = await readKnowledgeMap(repoPath)
  const map = mapResult.map
  const mapStatus: KnowledgeMapStatus | 'missing' = map
    ? map.status
    : mapResult.existed
      ? 'draft'
      : 'missing'
  const markdowns = await window.api.fs.listMarkdownDocuments({ rootPath: repoPath })
  const docs: KbDoc[] = []
  const bodies: Record<string, string> = {}
  const seenPaths = new Set<string>()

  await appendProjectToml(repoPath, docs, bodies, seenPaths, map)

  for (const md of markdowns) {
    await appendMarkdownDoc(md, docs, bodies, seenPaths, map)
  }

  return {
    docs: sortKbDocs(docs),
    bodies,
    mapStatus: map ? map.status : mapStatus,
    mapError: mapResult.error
  }
}

async function appendProjectToml(
  repoPath: string,
  docs: KbDoc[],
  bodies: Record<string, string>,
  seenPaths: Set<string>,
  map: KnowledgeMap | null
): Promise<void> {
  const filePath = joinFsPath(repoPath, PROJECT_TOML_REL)
  const exists = await window.api.fs.pathExists({ filePath })
  if (!exists) {
    return
  }
  const group = classifyDocGroup(PROJECT_TOML_REL, map)
  if (!group) {
    return
  }
  seenPaths.add(PROJECT_TOML_REL)
  const charter = await readProjectCharter(repoPath)
  const meta = registryMetaForPath(PROJECT_TOML_REL)
  const id = meta?.id ?? kbDocIdFromPath(PROJECT_TOML_REL)
  docs.push({
    id,
    group,
    name: meta?.name ?? 'project.toml',
    path: PROJECT_TOML_REL,
    lede: meta?.lede ?? '项目名片：叫啥、目标是啥。',
    body: ''
  })
  bodies[id] =
    charter.error != null
      ? `（读取失败：${charter.error}）`
      : charter.charter
        ? renderProjectToml(charter.charter)
        : ''
}

async function appendMarkdownDoc(
  md: MarkdownDocument,
  docs: KbDoc[],
  bodies: Record<string, string>,
  seenPaths: Set<string>,
  map: KnowledgeMap | null
): Promise<void> {
  const norm = md.relativePath.replace(/\\/g, '/')
  if (seenPaths.has(norm)) {
    return
  }
  const group = classifyDocGroup(norm, map)
  if (!group) {
    return
  }
  seenPaths.add(norm)
  const meta = registryMetaForPath(norm)
  const id = meta?.id ?? kbDocIdFromPath(norm)
  const { content, isBinary } = await window.api.fs.readFile({ filePath: md.filePath })
  const body = isBinary ? '（二进制文件，无法预览）' : content
  docs.push({
    id,
    group,
    name: meta?.name ?? md.basename,
    path: norm,
    lede: meta?.lede ?? ledeFromMarkdownBody(body),
    body: ''
  })
  bodies[id] = body
}
