import { defineMethod } from '../core'
import { WorkbenchSkillPrepareRequest } from '../../../../shared/workbench/skill-assets'
import { prepareWorkbenchSkill } from '../../../workbench/skill-install'

export const WORKBENCH_SKILL_METHODS = [
  defineMethod({
    name: 'workbench.skills.prepare',
    params: WorkbenchSkillPrepareRequest,
    handler: (params, { runtime, signal }) => prepareWorkbenchSkill(runtime, params, signal)
  })
]
