import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { WorkbenchSkillPrepareRequest } from '../../../../shared/workbench/skill-assets'
import { prepareWorkbenchSkill } from '../../../workbench/skill-install'

export const WORKBENCH_SKILL_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.skills.prepare',
    params: WorkbenchSkillPrepareRequest,
    handler: (params, { runtime, signal, clientId, pairedDeviceId }) => {
      if (
        params.topic === 'improve-workbench' &&
        (clientId !== 'desktop-renderer' || pairedDeviceId)
      ) {
        throw new Error('请在本机 Workbench 准备改进 Skill')
      }
      return prepareWorkbenchSkill(runtime, params, signal)
    }
  })
]
