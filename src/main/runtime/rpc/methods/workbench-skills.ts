import { defineWorkbenchMethod } from '../../../workbench/workbench-rpc-observability'
import { WorkbenchSkillPrepareRequest } from '../../../../shared/workbench/skill-assets'
import { prepareWorkbenchSkill } from '../../../workbench/skill-install'

export const WORKBENCH_SKILL_METHODS = [
  defineWorkbenchMethod({
    name: 'workbench.skills.prepare',
    permission: 'skills-admin',
    params: WorkbenchSkillPrepareRequest,
    handler: (params, { runtime, signal, caller, clientId, pairedDeviceId }) => {
      if (
        params.topic === 'improve-workbench' &&
        (caller?.kind !== 'desktop' ||
          clientId !== 'desktop-renderer' ||
          pairedDeviceId !== undefined)
      ) {
        throw new Error('请在本机 Workbench 准备改进 Skill')
      }
      return prepareWorkbenchSkill(runtime, params, signal)
    }
  })
]
