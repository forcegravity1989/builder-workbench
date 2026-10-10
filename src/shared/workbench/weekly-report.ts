import { z } from 'zod'

export const weeklyReportTemplate = [
  {
    key: 'goals',
    title: '一、目标',
    columns: ['目标', '交付要求', '计划完成', '当前情况'],
    widths: [22, 40, 14, 24]
  },
  {
    key: 'progress',
    title: '二、关键进展',
    columns: ['工作方向', '关键进展', '下周计划'],
    widths: [20, 45, 35]
  },
  {
    key: 'risks',
    title: '三、关键风险',
    columns: ['风险等级', '风险描述', '应对措施', '责任人', '计划关闭', '状态'],
    widths: [8, 28, 32, 8, 12, 12]
  },
  {
    key: 'milestones',
    title: '四、里程碑',
    columns: ['节点', '计划完成', '达成条件', '当前情况'],
    widths: [20, 14, 38, 28]
  },
  {
    key: 'requirements',
    title: '五、子目标／需求详细进展',
    columns: ['子目标', '任务', '计划完成', '责任人', '状态', '本周进展'],
    widths: [15, 21, 11, 8, 10, 35]
  },
  {
    key: 'problems',
    title: '六、问题单进展',
    columns: ['问题', '状态', '责任人', '处理进展', '下一步'],
    widths: [24, 10, 10, 30, 26]
  },
  {
    key: 'members',
    title: '七、项目成员',
    columns: ['姓名', '角色', '负责范围'],
    widths: [16, 24, 60]
  }
] as const

export type WeeklyReportSection = (typeof weeklyReportTemplate)[number]['key']
const date = z.iso.date()
const rows = (width: number) => z.array(z.array(z.string().max(10000)).length(width)).max(200)
export const WeeklyReportDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    project: z.strictObject({ name: z.string().min(1), repository: z.string().min(1) }),
    period: z.strictObject({ start: date, endExclusive: date, timezone: z.string().min(1) }),
    version: z.string().nullable(),
    generatedAt: z.iso.datetime({ offset: true }),
    origin: z.enum(['conversation', 'manual']).optional(),
    sections: z.strictObject({
      goals: rows(4),
      progress: rows(3),
      risks: rows(6),
      milestones: rows(4),
      requirements: rows(6),
      problems: rows(5),
      members: rows(3)
    }),
    problemSummary: z.string().optional(),
    sources: z.array(z.strictObject({ url: z.string(), summary: z.string() })).max(500),
    manual: z
      .partialRecord(
        z.enum(['goals', 'progress', 'risks', 'milestones', 'requirements', 'problems', 'members']),
        z.strictObject({ text: z.string().min(1).max(10000), mode: z.enum(['append', 'correct']) })
      )
      .default({})
  })
  .refine((value) => value.period.start < value.period.endExclusive, '周报结束日期必须晚于开始日期')

export type WeeklyReportDocument = z.infer<typeof WeeklyReportDocumentSchema>
export function parseWeeklyReport(raw: string): WeeklyReportDocument {
  return WeeklyReportDocumentSchema.parse(JSON.parse(raw))
}

export function preserveWeeklyReportManual<T extends { document: WeeklyReportDocument }>(
  records: T[]
): T[] {
  const manualByPeriod = new Map<string, WeeklyReportDocument['manual']>()
  return records.map((record) => {
    const document = record.document
    if (document.origin === 'manual') {
      manualByPeriod.set(document.period.start, document.manual)
    }
    const manual = manualByPeriod.get(document.period.start)
    return manual && document.origin !== 'manual'
      ? { ...record, document: { ...document, manual: structuredClone(manual) } }
      : record
  })
}

export function weeklyReportPeriod(now = new Date(), timezone = 'Asia/Shanghai') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)!.value
  const day = new Date(`${value('year')}-${value('month')}-${value('day')}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
  const start = day.toISOString().slice(0, 10)
  day.setUTCDate(day.getUTCDate() + 7)
  return { start, endExclusive: day.toISOString().slice(0, 10), timezone }
}

export function weeklyReportPeriodLabel(period: WeeklyReportDocument['period']) {
  const end = new Date(`${period.endExclusive}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() - 1)
  return `${period.start.replaceAll('-', '.')} — ${end.toISOString().slice(0, 10).replaceAll('-', '.')}`
}
