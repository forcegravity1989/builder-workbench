import { describe, expect, it } from 'vitest'
import { acceptanceVersionChoices } from './use-acceptance-plan'

describe('acceptanceVersionChoices', () => {
  it('lists local acceptance files and plan folders from the adopted tree', () => {
    expect(
      acceptanceVersionChoices({
        materials: [{ version: 'v0.2' }],
        treePlans: [{ version: 'v0.1' }, { version: 'v0.3' }]
      })
    ).toEqual(['v0.1', 'v0.2', 'v0.3'])
  })
})
