import { describe, expect, it } from 'vitest'
import {
  parseWeeklyReport,
  preserveWeeklyReportManual,
  weeklyReportPeriod,
  type WeeklyReportDocument
} from './weekly-report'
import { exportWeeklyReportHtml, renderWeeklyReport } from './weekly-report-format'

function report(): WeeklyReportDocument {
  return {
    schemaVersion: 1,
    project: { name: 'BW', repository: 'github.com/forcegravity1989/builder-workbench' },
    period: { start: '2026-10-05', endExclusive: '2026-10-12', timezone: 'Asia/Shanghai' },
    version: null,
    generatedAt: '2026-10-10T17:34:35+08:00',
    sections: {
      goals: [],
      progress: [],
      risks: [],
      milestones: [],
      requirements: [],
      problems: [],
      members: []
    },
    sources: [],
    manual: {}
  }
}

describe('weekly report document protocol', () => {
  it('requires all fixed sections and exact cell counts without accepting extra protocol fields', () => {
    const value = report()
    expect(parseWeeklyReport(JSON.stringify(value))).toEqual(value)
    expect(() => parseWeeklyReport(JSON.stringify({ ...value, complete: true }))).toThrow()
    expect(() =>
      parseWeeklyReport(
        JSON.stringify({ ...value, sections: { ...value.sections, goals: [['only one cell']] } })
      )
    ).toThrow()
    expect(() =>
      parseWeeklyReport(JSON.stringify({ ...value, sections: { progress: [] } }))
    ).toThrow()
    const manual = {
      ...value,
      origin: 'manual' as const,
      manual: { progress: { mode: 'append' as const, text: '人工背景' } }
    }
    const generated = { ...value, generatedAt: '2026-10-10T18:00:00+08:00' }
    const records = preserveWeeklyReportManual([
      { document: value },
      { document: manual },
      { document: generated }
    ])
    expect(records[0].document.manual).toEqual({})
    expect(records[2].document.manual).toEqual(manual.manual)
    expect(generated.manual).toEqual({})
    const cleared = preserveWeeklyReportManual([
      { document: manual },
      { document: { ...generated, origin: 'manual' as const } },
      { document: generated }
    ])
    expect(cleared[2].document.manual).toEqual({})
  })

  it('keeps calendar boundaries in the selected timezone and rejects invalid or inverted periods', () => {
    expect(weeklyReportPeriod(new Date('2026-10-11T16:30:00Z'))).toEqual({
      start: '2026-10-12',
      endExclusive: '2026-10-19',
      timezone: 'Asia/Shanghai'
    })
    const value = report()
    expect(() =>
      parseWeeklyReport(
        JSON.stringify({ ...value, period: { ...value.period, start: '2026-02-30' } })
      )
    ).toThrow()
    expect(() =>
      parseWeeklyReport(
        JSON.stringify({ ...value, period: { ...value.period, endExclusive: value.period.start } })
      )
    ).toThrow()
    expect(() =>
      parseWeeklyReport(JSON.stringify({ ...value, generatedAt: 'yesterday' }))
    ).toThrow()
  })

  it('escapes untrusted source text and exports the same manual correction without exposing provenance', () => {
    const value = report()
    value.sections.progress = [['old conclusion', 'old fact', '未知']]
    value.sections.problems = [['#152', '不再计划', '未指派', '<script>alert(1)</script>', '未知']]
    value.manual.progress = { mode: 'correct', text: '<img src=x onerror=alert(1)>修正 & 保留' }
    value.sources = [{ url: 'secret-source', summary: 'internal provenance' }]
    const body = renderWeeklyReport(value)
    const html = exportWeeklyReportHtml(value)
    expect(html).toContain(body)
    expect(html).not.toContain('old conclusion')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;修正 &amp; 保留')
    expect(html).toContain('不再计划')
    expect(html).not.toContain('secret-source')
    expect(html).not.toContain('internal provenance')
  })
})
