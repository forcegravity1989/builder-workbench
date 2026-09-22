import { describe, expect, it } from 'vitest'
import {
  buildWeekPlanInjectPrompt,
  resolveWeekPlanInjectInput,
  WEEK_PLAN_PROMPT_DELIVERY
} from './plan-week-planning-prompt'

const FOUND: Parameters<typeof buildWeekPlanInjectPrompt>[0] = {
  workspacePath: '/repo/.bw/worktrees/week-plan',
  mainProjectPath: '/repo',
  systemPromptPath: '/repo/standard/system-prompt/SYSTEM.md.tmpl',
  skillMdPath: '/repo/standard/skills/week-planning/SKILL.md',
  planningPyPath: '/repo/standard/skills/week-planning/scripts/planning.py',
  issueStatePath: '/repo/standard/system-prompt/references/issue-state.md',
  weekPlanCommentPath: '/repo/standard/system-prompt/references/week-plan-comment.md',
  metricsPath: '/repo/standard/system-prompt/references/metrics.md'
}

describe('buildWeekPlanInjectPrompt', () => {
  it('points at the skill and forbids HTML start', () => {
    const prompt = buildWeekPlanInjectPrompt(FOUND)
    expect(WEEK_PLAN_PROMPT_DELIVERY).toBe('submit-after-ready')
    expect(prompt).toContain(FOUND.systemPromptPath as string)
    expect(prompt).toContain(FOUND.skillMdPath)
    expect(prompt).toContain(FOUND.planningPyPath)
    expect(prompt).toContain(FOUND.workspacePath)
    expect(prompt).toContain(FOUND.mainProjectPath)
    expect(prompt).toContain(FOUND.issueStatePath)
    expect(prompt).toMatch(/不要另开 HTML/)
    expect(prompt).toMatch(/不要 start\/serve/)
    expect(prompt).toContain('不要 orca tab create --url')
    expect(prompt).toContain('update --file')
    expect(prompt).toContain('confirm --stage')
    expect(prompt).toContain('不默认代劳')
  })

  it('does not invent missing skill or reference paths', () => {
    const prompt = buildWeekPlanInjectPrompt({
      workspacePath: '/repo',
      mainProjectPath: '/repo',
      systemPromptPath: null,
      skillMdPath: null,
      planningPyPath: null,
      issueStatePath: null,
      weekPlanCommentPath: null,
      metricsPath: null
    })
    expect(prompt).toContain('SYSTEM.md.tmpl：未找到')
    expect(prompt).toContain('未找到 SKILL.md')
    expect(prompt).toContain('planning.py 未找到')
    expect(prompt).toContain('issue-state.md：未找到，跳过')
    expect(prompt).not.toContain('/standard/skills/week-planning/SKILL.md')
  })
})

describe('resolveWeekPlanInjectInput', () => {
  it('prefers files on the planning worktree, then the main project', async () => {
    const existing = new Set([
      '/main/standard/system-prompt/SYSTEM.md.tmpl',
      '/main/standard/skills/week-planning/SKILL.md',
      '/main/standard/skills/week-planning/scripts/planning.py',
      '/main/standard/system-prompt/references/issue-state.md',
      '/plan/standard/system-prompt/references/week-plan-comment.md'
    ])
    const input = await resolveWeekPlanInjectInput(
      { workspacePath: '/plan', mainProjectPath: '/main' },
      async (filePath) => existing.has(filePath)
    )
    expect(input.systemPromptPath).toBe('/main/standard/system-prompt/SYSTEM.md.tmpl')
    expect(input.skillMdPath).toBe('/main/standard/skills/week-planning/SKILL.md')
    expect(input.planningPyPath).toBe('/main/standard/skills/week-planning/scripts/planning.py')
    expect(input.issueStatePath).toBe('/main/standard/system-prompt/references/issue-state.md')
    expect(input.weekPlanCommentPath).toBe(
      '/plan/standard/system-prompt/references/week-plan-comment.md'
    )
    expect(input.metricsPath).toBeNull()
  })
})
