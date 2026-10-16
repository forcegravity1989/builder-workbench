import {
  createRuntimePath,
  deleteRuntimePath,
  readRuntimeDirectory,
  readRuntimeFileContent,
  renameRuntimePath,
  runtimePathExists,
  writeRuntimeFile,
  type RuntimeFileOperationArgs
} from '@/runtime/runtime-file-client'
import { joinFsPath } from '../../../../shared/workbench/project-charter'
import {
  parseWeeklyReport,
  preserveWeeklyReportManual,
  WeeklyReportDocumentSchema,
  type WeeklyReportDocument
} from '../../../../shared/workbench/weekly-report'

export type WeeklyReportContext = RuntimeFileOperationArgs & {
  worktreeId: string
  worktreePath: string
}
export type WeeklyReportRecord = {
  relativePath: string
  document: WeeklyReportDocument
  raw: string
}
export const WEEKLY_REPORT_ROOT = '.bw/weekly-reports'
export class WeeklyReportConflictError extends Error {
  constructor() {
    super('周报已更新，请重新读取后补充；当前输入仍保留。')
  }
}
const fileName = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.json$/i

async function readRecord(
  context: WeeklyReportContext,
  relativePath: string
): Promise<WeeklyReportRecord> {
  const file = await readRuntimeFileContent({
    ...context,
    filePath: joinFsPath(context.worktreePath, relativePath),
    relativePath
  })
  if (file.isBinary) {
    throw new Error('周报文件不是文本')
  }
  const document = parseWeeklyReport(file.content)
  if (relativePath.split('/')[2] !== document.period.start) {
    throw new Error('周报周期与存放目录不一致')
  }
  return { relativePath, document, raw: file.content }
}
export async function listWeeklyReports(
  context: WeeklyReportContext
): Promise<WeeklyReportRecord[]> {
  const root = joinFsPath(context.worktreePath, WEEKLY_REPORT_ROOT)
  if (!(await runtimePathExists(context, root))) {
    return []
  }
  const records: WeeklyReportRecord[] = []
  for (const period of await readRuntimeDirectory(context, root)) {
    if (!period.isDirectory || period.isSymlink || !/^\d{4}-\d{2}-\d{2}$/.test(period.name)) {
      continue
    }
    for (const file of await readRuntimeDirectory(context, joinFsPath(root, period.name))) {
      if (file.isDirectory || file.isSymlink || !fileName.test(file.name)) {
        continue
      }
      records.push(await readRecord(context, `${WEEKLY_REPORT_ROOT}/${period.name}/${file.name}`))
    }
  }
  return preserveWeeklyReportManual(
    records.sort(
      (a, b) =>
        Date.parse(a.document.generatedAt) - Date.parse(b.document.generatedAt) ||
        a.relativePath.localeCompare(b.relativePath)
    )
  )
}
export async function saveWeeklyReport(
  context: WeeklyReportContext,
  document: WeeklyReportDocument,
  expectedRaw: string | null
): Promise<WeeklyReportRecord> {
  const parsed = WeeklyReportDocumentSchema.parse({ ...document, origin: 'manual' })
  const records = await listWeeklyReports(context)
  const latest = records.findLast((record) => record.document.period.start === parsed.period.start)
  if ((latest?.raw ?? null) !== expectedRaw) {
    throw new WeeklyReportConflictError()
  }
  const relativePath = `${WEEKLY_REPORT_ROOT}/${parsed.period.start}/${crypto.randomUUID()}.json`
  const pendingPath = `${relativePath}.pending`
  for (const relativeDirectory of [
    '.bw',
    WEEKLY_REPORT_ROOT,
    `${WEEKLY_REPORT_ROOT}/${parsed.period.start}`
  ]) {
    const directory = joinFsPath(context.worktreePath, relativeDirectory)
    if (!(await runtimePathExists(context, directory))) {
      try {
        await createRuntimePath(context, directory, 'directory')
      } catch (error) {
        if (!(await runtimePathExists(context, directory))) {
          throw error
        }
      }
    }
  }
  const raw = `${JSON.stringify(parsed, null, 2)}\n`
  const absolutePath = joinFsPath(context.worktreePath, relativePath)
  const pendingAbsolutePath = joinFsPath(context.worktreePath, pendingPath)
  const baseline = records.filter((record) => record.document.period.start === parsed.period.start)
  const unchanged = (values: WeeklyReportRecord[]) => {
    const peers = values.filter(
      (record) =>
        record.document.period.start === parsed.period.start && record.relativePath !== relativePath
    )
    return (
      peers.length === baseline.length &&
      peers.every((record) =>
        baseline.some(
          (prior) => prior.relativePath === record.relativePath && prior.raw === record.raw
        )
      )
    )
  }
  try {
    await writeRuntimeFile(context, pendingAbsolutePath, raw)
    if (!unchanged(await listWeeklyReports(context))) {
      throw new WeeklyReportConflictError()
    }
    await renameRuntimePath(context, pendingAbsolutePath, absolutePath)
    const after = await listWeeklyReports(context)
    if (!unchanged(after)) {
      throw new WeeklyReportConflictError()
    }
    const saved = after.find((record) => record.relativePath === relativePath)
    if (!saved || saved.raw !== raw) {
      throw new Error('周报保存后读回不一致，当前输入仍保留。')
    }
    return saved
  } catch (error) {
    try {
      for (const target of [absolutePath, pendingAbsolutePath]) {
        if (await runtimePathExists(context, target)) {
          await deleteRuntimePath(context, target)
        }
      }
    } catch {
      throw new Error('本次保存结果未确认，请重新读取核对；当前输入仍保留。')
    }
    throw error
  }
}
