import { describe, expect, it } from 'vitest'
import { getDefaultAgentCapabilitySetupSelection } from './agent-capability-setup-status'

const READY_INPUT = {
  browserUseSkillInstalled: true,
  browserUseSkillLoading: false,
  orchestrationSkillInstalled: true,
  orchestrationSkillLoading: false
}

describe('getDefaultAgentCapabilitySetupSelection', () => {
  it('leaves already-ready capabilities unchecked by default', () => {
    expect(getDefaultAgentCapabilitySetupSelection(READY_INPUT)).toEqual({
      browserUse: false,
      orchestration: false,
      linearTickets: false
    })
  })

  it('keeps missing skills selected by default', () => {
    expect(
      getDefaultAgentCapabilitySetupSelection({
        ...READY_INPUT,
        browserUseSkillInstalled: false,
        orchestrationSkillInstalled: false
      })
    ).toEqual({
      browserUse: true,
      orchestration: true,
      linearTickets: false
    })
  })
})
