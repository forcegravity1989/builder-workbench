/**
 * The Workbench E2E inventory and CI allowlists.
 *
 * TDD stays beside the implementation under src/**. The two user-facing E2E
 * kinds share the workbench/ parent and are separated by purpose:
 * - journeys/ proves one cross-feature work journey;
 * - acceptance/ proves one feature's acceptance boundary.
 *
 * Keep every Workbench spec named here. Other files under tests/e2e belong to
 * Orca or a dedicated lane and are never admitted through a wildcard.
 */
export const WORKBENCH_PR_ALLOWLIST = [
  'workbench/journeys/w01-project-handoff.spec.ts',
  'workbench/journeys/w02-cycle-main.spec.ts',
  'workbench/acceptance/project-settings.spec.ts'
] as const

export const WORKBENCH_EXPLICIT_ALLOWLIST = [
  ...WORKBENCH_PR_ALLOWLIST,
  'workbench/acceptance/fixed-workspaces.spec.ts',
  'workbench/acceptance/milestones.spec.ts'
] as const

export const WORKBENCH_VERSION_OVERVIEW_SPEC =
  'workbench/acceptance/version-overview.spec.ts' as const
