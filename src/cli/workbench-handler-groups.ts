import type { HandlerGroup } from './handler-group-manifest'

export const WORKBENCH_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'workbench-meeting',
    keys: ['bw meeting transcript'],
    load: async () => (await import('./handlers/workbench-meeting.js')).WORKBENCH_MEETING_HANDLERS
  },
  {
    name: 'workbench-materials',
    keys: [
      'bw materials context',
      'bw materials select',
      'bw materials schema',
      'bw materials list',
      'bw materials read',
      'bw materials save',
      'bw materials add-artifact',
      'bw materials migration-preview',
      'bw materials migrate'
    ],
    load: async () =>
      (await import('./handlers/workbench-materials.js')).WORKBENCH_MATERIAL_HANDLERS
  }
]
