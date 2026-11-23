import type { FeatureWallWorkflow } from '../../../../shared/feature-wall-workflows'
import type { AgentsStep } from '../../../../shared/agents-orchestration-steps'
import type { WorkbenchStep } from '../../../../shared/workbench-steps'
import type { ReviewStep } from '../../../../shared/review-steps'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { isWorkbenchShell } from '@/workbench/is-workbench-shell'

const getWorkflowCopy = createLocalizedCatalog(() => {
  const product = isWorkbenchShell() ? 'BW' : 'Orca'
  return {
    workspaces: {
      title: translate('guidance.tour.workspaces.title', 'Workspaces'),
      lede: translate(
        'guidance.tour.workspaces.description',
        '{{product}} splits each task into an isolated workspace so agents can run in parallel.',
        { product }
      )
    },
    tasks: {
      title: translate('guidance.tour.tasks.title', 'Tasks'),
      lede: translate(
        'guidance.tour.tasks.description',
        'Start work directly from GitHub or Linear.'
      )
    },
    'agents-orchestration': {
      title: translate('guidance.tour.agents.title', 'Agents'),
      lede: translate(
        'guidance.tour.agents.description',
        'Run several agents at once, track their progress, and let automation drive {{product}} when it helps.',
        { product }
      )
    },
    workbench: {
      title: translate('guidance.tour.workbench.title', 'Workbench'),
      lede: translate(
        'guidance.tour.workbench.description',
        'Bring your terminal setup into {{product}}, then split panes to keep servers, tests, logs, and agents running side by side.',
        { product }
      )
    },
    review: {
      title: translate('guidance.tour.review.title', 'Code Review'),
      lede: translate(
        'guidance.tour.review.description',
        'Review what changed, leave focused feedback, and send it back to the agent.'
      )
    }
  }
})

const getAgentCopy = createLocalizedCatalog(() => ({
  statuses: {
    name: translate('guidance.tour.statuses.name', 'Visibility'),
    subtitle: translate('guidance.tour.statuses.title', 'Agent Visibility'),
    description: translate(
      'guidance.tour.statuses.description',
      'Know which agents are working, waiting, live, or blocked.'
    )
  },
  orchestration: {
    name: translate('guidance.tour.orchestration.title', 'Orchestration'),
    subtitle: translate('guidance.tour.orchestration.title', 'Orchestration'),
    description: translate(
      'guidance.tour.orchestration.description',
      'Enable agents to manage and coordinate {{product}} workspaces to execute larger tasks.',
      { product: isWorkbenchShell() ? 'BW' : 'Orca' }
    )
  },
  usage: {
    name: translate('guidance.tour.usage.title', 'Usage'),
    subtitle: translate('guidance.tour.usage.title', 'Usage'),
    description: translate(
      'guidance.tour.usage.description',
      'Watch your usage and rate limits across every connected account, so you know when to switch.'
    )
  }
}))

const getWorkbenchCopy = createLocalizedCatalog(() => ({
  terminal: {
    name: translate('guidance.tour.terminal.title', 'Terminal'),
    subtitle: translate('guidance.tour.terminal.title', 'Terminal'),
    description: translate(
      'guidance.tour.terminal.description',
      'Keep your agents, tests, and dev logs visible at once.'
    )
  },
  editor: {
    name: translate('guidance.tour.editor.title', 'Editor'),
    subtitle: translate('guidance.tour.editor.title', 'Editor'),
    description: translate(
      'guidance.tour.editor.description',
      'Use our Notion-style markdown editor to write notes without leaving {{product}}.',
      { product: isWorkbenchShell() ? 'BW' : 'Orca' }
    )
  },
  browser: {
    name: translate('guidance.tour.browser.title', 'Browser'),
    subtitle: translate('guidance.tour.browser.title', 'Browser'),
    description: translate(
      'guidance.tour.browser.description',
      'Run your app in the integrated browser, send selected UI elements to agents, and let your agents interact with your webpage.'
    )
  }
}))

const getReviewCopy = createLocalizedCatalog(() => ({
  notes: {
    name: translate('guidance.tour.notes.name', 'Notes'),
    subtitle: translate('guidance.tour.notes.title', 'Notes & diffs'),
    description: translate(
      'guidance.tour.notes.description',
      'Send focused review notes to an agent.'
    )
  },
  'pr-view': {
    name: translate('guidance.tour.pr.title', 'PR checks'),
    subtitle: translate('guidance.tour.pr.subtitle', 'PR checks & comments'),
    description: translate('guidance.tour.pr.description', 'See PR status in the Checks tab.')
  },
  ship: {
    name: translate('guidance.tour.ship.title', 'Ship with AI'),
    subtitle: translate('guidance.tour.ship.title', 'Ship with AI'),
    description: translate(
      'guidance.tour.ship.description',
      'Let AI prepare commit and PR drafts for you.'
    )
  }
}))

export function localizeFeatureWallWorkflow(workflow: FeatureWallWorkflow): FeatureWallWorkflow {
  return { ...workflow, ...getWorkflowCopy()[workflow.id] }
}

export function localizeAgentsStep(step: AgentsStep): AgentsStep {
  return { ...step, ...getAgentCopy()[step.id] }
}

export function localizeWorkbenchStep(step: WorkbenchStep): WorkbenchStep {
  return { ...step, ...getWorkbenchCopy()[step.id] }
}

export function localizeReviewStep(step: ReviewStep): ReviewStep {
  return { ...step, ...getReviewCopy()[step.id] }
}
