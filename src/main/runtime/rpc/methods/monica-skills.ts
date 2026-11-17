import { defineMonicaMethod } from '../../../monica/monica-rpc-observability'
import { MonicaSkillPrepareRequest } from '../../../../shared/monica/skill-assets'
import { prepareMonicaSkill } from '../../../monica/skill-install'

export const MONICA_SKILL_METHODS = [
  defineMonicaMethod({
    name: 'workbench.skills.prepare',
    params: MonicaSkillPrepareRequest,
    handler: (params, { runtime, signal }) => prepareMonicaSkill(runtime, params, signal)
  })
]
