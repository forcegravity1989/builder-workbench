/**
 * The only Workbench-owned Playwright entrypoints.
 *
 * Other specs under tests/e2e belong to Orca or dedicated historical lanes and
 * are not part of BW feature coverage. Keep this list small and update it only
 * when a feature journey is deliberately admitted to the Workbench lane.
 */
export const WORKBENCH_PR_SMOKE_SPEC = 'workbench-cycle-smoke.spec.ts'
export const WORKBENCH_EXPLICIT_SPEC = 'workbench-version-overview.spec.ts'
