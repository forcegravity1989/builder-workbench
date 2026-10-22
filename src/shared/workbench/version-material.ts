export * from './version-material-common'
export { PlanningMaterialSchema } from './version-planning-material'
export type { PlanningMaterial, PlanMeetingMinutes } from './version-planning-material'
export {
  AcceptanceMaterialSchema,
  AcceptanceMeetingMinutesSchema,
  AcceptanceDemoEnvironmentSchema,
  stripRetiredAcceptanceFields,
  hasRetiredAcceptanceFields
} from './version-acceptance-material'
export type {
  AcceptanceMaterial,
  AcceptanceMeetingMinutes,
  AcceptanceDemoEnvironment
} from './version-acceptance-material'
import type { PlanningMaterial } from './version-planning-material'
import type { AcceptanceMaterial } from './version-acceptance-material'
export type VersionMaterial = PlanningMaterial | AcceptanceMaterial
