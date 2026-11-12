import { expect, it } from 'vitest'
import { AcceptanceMaterialSchema, PlanningMaterialSchema } from './version-material'

it('keeps the workflow section optional and rejects stages outside the workflow', () => {
  const plan = {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    summary: { progress: '', risks: '' },
    goals: [],
    tasks: []
  }
  expect(PlanningMaterialSchema.safeParse(plan).success).toBe(true)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: { stage: 'breakdown', updatedAt: '2026-10-13T08:00:00Z' }
    }).success
  ).toBe(true)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-13T08:00:00Z',
        archivePr: { provider: 'github', repository: 'github.com/acme/project', number: 12 }
      }
    }).success
  ).toBe(true)
  // Acceptance-only stage names must not validate on plan material.
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: { stage: 'showcase', updatedAt: '2026-10-13T08:00:00Z' }
    }).success
  ).toBe(false)
  expect(
    AcceptanceMaterialSchema.safeParse({
      schema_version: 3,
      version: 'v1',
      cycleId: 'cycle',
      planRef: {
        kind: 'committed',
        version: 'v1',
        cycleId: 'plan-cycle',
        revision: `sha256:${'a'.repeat(64)}`,
        sourceCommit: '1'.repeat(40)
      },
      preparedArtifacts: [],
      results: [],
      workflow: { stage: 'showcase', updatedAt: '2026-10-13T08:00:00Z' }
    }).success
  ).toBe(true)
  // #462: the acceptance workflow carries the release read-back key (tag only);
  // plan material has no release row, so the reference stays acceptance-only.
  expect(
    AcceptanceMaterialSchema.safeParse({
      schema_version: 3,
      version: 'v1',
      cycleId: 'cycle',
      planRef: {
        kind: 'committed',
        version: 'v1',
        cycleId: 'plan-cycle',
        revision: `sha256:${'a'.repeat(64)}`,
        sourceCommit: '1'.repeat(40)
      },
      preparedArtifacts: [],
      results: [],
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-13T08:00:00Z',
        release: { tag: 'v0.7.0' }
      }
    }).success
  ).toBe(true)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      workflow: {
        stage: 'archive',
        updatedAt: '2026-10-13T08:00:00Z',
        release: { tag: 'v0.7.0' }
      }
    }).success
  ).toBe(false)
  // #471: the version-level booked meeting is acceptance-only; plan material has
  // no meeting row, mirroring the release read-back key's screen ownership.
  const acceptanceBase = {
    schema_version: 3,
    version: 'v1',
    cycleId: 'cycle',
    planRef: {
      kind: 'committed',
      version: 'v1',
      cycleId: 'plan-cycle',
      revision: `sha256:${'a'.repeat(64)}`,
      sourceCommit: '1'.repeat(40)
    },
    preparedArtifacts: [],
    results: []
  }
  expect(
    AcceptanceMaterialSchema.safeParse({
      ...acceptanceBase,
      meeting: { title: 'v1 版本验收会', time: '周五 16:00', id: 'meeting-1' }
    }).success
  ).toBe(true)
  // #516: booked meeting carries the invitees and page link read back from
  // welink-cli, so the board can show who is invited without reopening WeLink.
  // enMeetingId is the eMeeting-side key the minutes-draft write addresses.
  expect(
    AcceptanceMaterialSchema.safeParse({
      ...acceptanceBase,
      meeting: {
        title: 'v1 版本验收会',
        time: '10-31(周五) 14:00–15:00',
        id: '203422177',
        enMeetingId: '4028808b8f99a1a2018f9b7c6d5e4f3a',
        link: 'https://w3.huawei.com/emeeting/#/agendaController/abc/manage',
        attendees: ['z30026659', 'c00975486']
      }
    }).success
  ).toBe(true)
  expect(
    AcceptanceMaterialSchema.safeParse({
      ...acceptanceBase,
      meeting: { title: 'v1 版本验收会', time: '周五 16:00', attendees: [1] }
    }).success
  ).toBe(false)
  expect(
    PlanningMaterialSchema.safeParse({
      ...plan,
      meeting: { title: 'v1 版本验收会', time: '周五 16:00' }
    }).success
  ).toBe(false)
})
