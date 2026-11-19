import { readFile } from 'node:fs/promises'
import { lock } from 'proper-lockfile'
import {
  MilestoneWorkingMaterialSchema,
  upgradeMilestoneMaterial,
  type MilestoneSave,
  type MilestoneWorkingFile
} from '../../shared/monica/project-milestones'
import { VersionDocumentError } from '../../shared/monica/version-document'
import { durableWriteTempPath, writeFileDurableIfCurrent } from '../durable-file-write'
import { isMissingFile, resolveMilestoneDocumentPath } from './version-document-path'
import { materialContentRevision } from './version-history-snapshot'

export async function readMilestoneDocument(root: string): Promise<MilestoneWorkingFile> {
  const file = await resolveMilestoneDocumentPath(root)
  let raw: Buffer
  try {
    raw = await readFile(file)
  } catch (error) {
    if (isMissingFile(error)) {
      return { revision: null, material: null }
    }
    throw error
  }
  try {
    return {
      revision: materialContentRevision(raw),
      material: MilestoneWorkingMaterialSchema.parse(
        upgradeMilestoneMaterial(JSON.parse(raw.toString('utf8')))
      )
    }
  } catch {
    throw new VersionDocumentError(
      'invalid-document',
      '项目材料工作树的里程碑文件无法读取。请在工作树中核对文件。'
    )
  }
}

export function assertMilestoneRevision(
  file: MilestoneWorkingFile,
  expectedRevision: string | null
) {
  if (file.revision !== expectedRevision) {
    throw new VersionDocumentError(
      'revision-conflict',
      '里程碑文件已改动，当前输入保留。请核对后再继续。',
      file.revision
    )
  }
}

export async function withMilestoneDocumentLock<T>(
  root: string,
  run: (file: string, isCurrent: () => boolean) => Promise<T>
): Promise<T> {
  const file = await resolveMilestoneDocumentPath(root, true)
  let compromised = false
  const release = await lock(file, {
    realpath: false,
    retries: { retries: 20, factor: 1.3, minTimeout: 10, maxTimeout: 250, randomize: true },
    onCompromised: () => {
      compromised = true
    }
  })
  try {
    return await run(file, () => !compromised)
  } finally {
    await release().catch((error: unknown) => {
      if (!compromised) {
        throw error
      }
    })
  }
}

export async function saveMilestoneDocument(
  root: string,
  { expectedRevision, material }: Pick<MilestoneSave, 'expectedRevision' | 'material'>,
  authorize: () => Promise<void>
) {
  const payload = `${JSON.stringify(MilestoneWorkingMaterialSchema.parse(material), null, 2)}\n`
  return withMilestoneDocumentLock(root, async (file, isCurrent) => {
    await authorize()
    assertMilestoneRevision(await readMilestoneDocument(root), expectedRevision)
    if (!(await writeFileDurableIfCurrent(durableWriteTempPath(file), file, payload, isCurrent))) {
      throw new VersionDocumentError('lock-compromised', '文件锁已失效，请重新读取后再保存。')
    }
    return { material, revision: materialContentRevision(Buffer.from(payload)) }
  })
}
