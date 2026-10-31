import { lstat } from 'node:fs/promises'
import { join, posix, win32 } from 'node:path'
import type { AcceptanceMaterial } from '../../shared/workbench/version-material'
import type { VersionMaterialAddArtifact } from '../../shared/workbench/version-material-request'
import { VersionDocumentError } from '../../shared/workbench/version-document'
import { WorkspaceScopeError } from './workspace-scope-error'

/** 与渲染侧 acceptance-model.ts 的 PreparedArtifact 同源：材料制品条目。 */
type PreparedArtifact = AcceptanceMaterial['preparedArtifacts'][number]

/**
 * #516 制品登记的核心算法：把「报告已落盘，再登记进 preparedArtifacts」从
 * 模型的自由裁量收拢成一条命令。文件存在性必须在拥有工作树的一侧核对——
 * CLI 只有原生身份没有工作树路径，SSH 工作树时 CLI 所在机器也查不到那棵
 * 树——所以这些函数由 workspace.addArtifact 在文件系统拥有者上调用。
 */

/**
 * 工作树相对路径围栏：拒绝绝对路径与 `..` 穿越，不给出树外文件句柄。
 * location 是跨平台的材料数据，围栏却跑在拥有工作树的主机上——Linux 宿主
 * 眼里 `C:\x.html` 是合法相对文件名，Windows 消费侧却按绝对路径解——所以
 * 绝对性要按 posix 与 win32 两种语义都判，不用平台本位的 isAbsolute。
 */
export function resolveArtifactFile(root: string, location: string): string {
  const segments = location
    .split(/[\\/]/)
    .filter((segment) => segment.length > 0 && segment !== '.')
  if (
    posix.isAbsolute(location) ||
    win32.isAbsolute(location) ||
    segments.length === 0 ||
    segments.includes('..')
  ) {
    throw new VersionDocumentError(
      'unsafe-path',
      `制品 location 必须是工作树内相对路径，拒绝：${location}`
    )
  }
  return join(root, ...segments)
}

/** 只登记真实存在的文件：不存在如实报错退出，不登记幽灵制品（板面行不亮）。 */
export async function statArtifactFile(root: string, location: string): Promise<number> {
  const file = resolveArtifactFile(root, location)
  let info
  try {
    info = await lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WorkspaceScopeError(
        'artifact-missing',
        `制品文件在工作树内不存在，拒绝登记：${location}`
      )
    }
    throw error
  }
  // lstat 不跟随符号链接，与材料事务核 readRegular（version-document-store）的普通文件判定同一口径。
  if (!info.isFile()) {
    throw new VersionDocumentError(
      'unsafe-path',
      `制品路径不是普通文件（不跟随符号链接）：${location}`
    )
  }
  return info.mtimeMs
}

/** artifactId 缺省按 kind+版本+文件名生成：同文件重跑同 id，覆盖而非追加。 */
export function defaultArtifactId(kind: string, version: string, location: string): string {
  return `${kind}-${version}-${location.split(/[\\/]/).at(-1) ?? location}`
}

/**
 * candidateRef 复用材料现有值：候选未固定就拒绝，不由登记命令编造——
 * Artifact.candidateRef 必填，制品必须在候选固定之后登记。
 */
export function buildPreparedArtifact(
  document: AcceptanceMaterial,
  request: Pick<
    VersionMaterialAddArtifact,
    'kind' | 'location' | 'artifactId' | 'command' | 'checksum'
  >,
  generatedAtMs: number
): PreparedArtifact {
  if (!document.candidateRef) {
    throw new WorkspaceScopeError(
      'candidate-missing',
      '候选未固定：先在验收屏固定候选再登记制品；candidateRef 复用材料现有值，不由本命令编造'
    )
  }
  return {
    artifactId:
      request.artifactId ?? defaultArtifactId(request.kind, document.version, request.location),
    kind: request.kind,
    location: request.location,
    candidateRef: document.candidateRef,
    generatedAt: new Date(generatedAtMs).toISOString(),
    ...(request.command ? { command: request.command } : {}),
    ...(request.checksum ? { checksum: request.checksum } : {})
  }
}

/** 同 artifactId 覆盖而非追加：重跑登记不堆积重复制品。 */
export function upsertPreparedArtifact(
  document: AcceptanceMaterial,
  artifact: PreparedArtifact
): AcceptanceMaterial {
  const replaced = document.preparedArtifacts.some(
    (item) => item.artifactId === artifact.artifactId
  )
  return {
    ...document,
    preparedArtifacts: replaced
      ? document.preparedArtifacts.map((item) =>
          item.artifactId === artifact.artifactId ? artifact : item
        )
      : [...document.preparedArtifacts, artifact]
  }
}

/**
 * CAS 登记循环：读 → 只改 preparedArtifacts → 带 expectedRevision 保存；
 * revision 冲突自动重读重试一次（重试在新鲜文档上重建制品，不覆盖并发的
 * 人工输入），仍冲突则报错并带 currentRevision。read/save 注入面只为可测，
 * 生产路径就是材料事务核的 store.read/store.save。
 */
export async function registerPreparedArtifact(
  read: () => Promise<{ document: AcceptanceMaterial; revision: string } | null>,
  save: (expectedRevision: string, document: AcceptanceMaterial) => Promise<string>,
  build: (document: AcceptanceMaterial) => PreparedArtifact
): Promise<{ revision: string; artifact: PreparedArtifact }> {
  for (let attempt = 0; ; attempt++) {
    const current = await read()
    if (!current) {
      throw new VersionDocumentError('invalid-document', '验收材料不存在：先初始化材料再登记制品')
    }
    const artifact = build(current.document)
    const document = upsertPreparedArtifact(current.document, artifact)
    try {
      return { revision: await save(current.revision, document), artifact }
    } catch (error) {
      if (error instanceof VersionDocumentError && error.code === 'revision-conflict') {
        if (attempt === 0) {
          continue
        }
        throw new VersionDocumentError(
          'revision-conflict',
          `登记制品时材料被并发修改，重读重试后仍冲突；当前修订 ${error.currentRevision ?? '未知'}`,
          error.currentRevision
        )
      }
      throw error
    }
  }
}
