import type { ComponentType } from 'react'
import type { AgentsStepId } from '../../../../shared/agents-orchestration-steps'
import type { WorkbenchStepId } from '../../../../shared/workbench-steps'
import type { ReviewStepId } from '../../../../shared/review-steps'
import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'

export type ExploreDemo =
  | { workflow: 'workspaces' | 'tasks' }
  | { workflow: 'agents-orchestration'; step: AgentsStepId }
  | { workflow: 'workbench'; step: WorkbenchStepId }
  | { workflow: 'review'; step: ReviewStepId }

type ExploreContent = {
  title: string
  summary: string
  content?: ComponentType
}

function getFeatures() {
  return {
    workspace: {
      title: translate('guidance.catalog.feature.workspace.title', 'Workspace'),
      summary: translate(
        'guidance.catalog.feature.workspace.summary',
        'Keep each task in an isolated workspace.'
      ),
      demo: { workflow: 'workspaces' },
      related: ['agent-status', 'workspace-board', 'quick-jump']
    },
    tasks: {
      title: translate('guidance.catalog.feature.tasks.title', 'Task management'),
      summary: translate(
        'guidance.catalog.feature.tasks.summary',
        'Find a task, start work, and return to its results.'
      ),
      demo: { workflow: 'tasks' },
      related: ['internal-integrations']
    },
    'agent-status': {
      title: translate('guidance.catalog.feature.agent-status.title', 'Agent status'),
      summary: translate(
        'guidance.catalog.feature.agent-status.summary',
        'See which agents are running, waiting, or blocked.'
      ),
      demo: { workflow: 'agents-orchestration', step: 'statuses' }
    },
    orchestration: {
      title: translate('guidance.catalog.feature.orchestration.title', 'Agent orchestration'),
      summary: translate(
        'guidance.catalog.feature.orchestration.summary',
        'Coordinate agents across workspaces.'
      ),
      demo: { workflow: 'agents-orchestration', step: 'orchestration' }
    },
    usage: {
      title: translate('guidance.catalog.feature.usage.title', 'Account usage'),
      summary: translate(
        'guidance.catalog.feature.usage.summary',
        'Check usage and limits for your account.'
      ),
      demo: { workflow: 'agents-orchestration', step: 'usage' }
    },
    terminal: {
      title: translate('guidance.catalog.feature.terminal.title', 'Terminal and sessions'),
      summary: translate(
        'guidance.catalog.feature.terminal.summary',
        'Work in terminal splits and return to an existing session.'
      ),
      demo: { workflow: 'workbench', step: 'terminal' },
      related: ['agent-status', 'usage', 'editor']
    },
    editor: {
      title: translate('guidance.catalog.feature.editor.title', 'Editor'),
      summary: translate(
        'guidance.catalog.feature.editor.summary',
        'Open and edit files while you work.'
      ),
      demo: { workflow: 'workbench', step: 'editor' }
    },
    browser: {
      title: translate('guidance.catalog.feature.browser.title', 'Browser and annotations'),
      summary: translate(
        'guidance.catalog.feature.browser.summary',
        'Open a page or prototype and bring focused feedback back to the work.'
      ),
      demo: { workflow: 'workbench', step: 'browser' },
      related: ['review-notifications']
    },
    review: {
      title: translate('guidance.catalog.feature.review.title', 'Diffs and review'),
      summary: translate(
        'guidance.catalog.feature.review.summary',
        'Inspect changes, leave feedback, and continue the work.'
      ),
      demo: { workflow: 'review', step: 'notes' },
      related: ['editor', 'pr-checks', 'ship']
    },
    'pr-checks': {
      title: translate('guidance.catalog.feature.pr-checks.title', 'PR checks'),
      summary: translate(
        'guidance.catalog.feature.pr-checks.summary',
        'Check the status and comments on a pull request.'
      ),
      demo: { workflow: 'review', step: 'pr-view' }
    },
    ship: {
      title: translate('guidance.catalog.feature.ship.title', 'Commits and delivery'),
      summary: translate(
        'guidance.catalog.feature.ship.summary',
        'Have AI prepare a commit and pull request for your review.'
      ),
      demo: { workflow: 'review', step: 'ship' }
    },
    'workspace-board': {
      title: translate('guidance.catalog.feature.workspace-board.title', 'Workspace board'),
      summary: translate(
        'guidance.catalog.feature.workspace-board.summary',
        'Check workspace status and switch back to active work.'
      )
    },
    automation: {
      title: translate('guidance.catalog.feature.automation.title', 'Automation'),
      summary: translate(
        'guidance.catalog.feature.automation.summary',
        'Create, enable, and run an automation.'
      )
    },
    'quick-jump': {
      title: translate('guidance.catalog.feature.quick-jump.title', 'Quick jump'),
      summary: translate(
        'guidance.catalog.feature.quick-jump.summary',
        'Find and open a workspace or session.'
      )
    },
    milestones: {
      title: translate('guidance.catalog.feature.milestones.title', 'Project milestones'),
      summary: translate(
        'guidance.catalog.feature.milestones.summary',
        'Plan milestone outcomes and compare them with actual delivery.'
      )
    },
    'project-wall': {
      title: translate('guidance.catalog.feature.project-wall.title', 'Project wall'),
      summary: translate(
        'guidance.catalog.feature.project-wall.summary',
        'Find the project that needs your attention.'
      )
    },
    'project-intake': {
      title: translate('guidance.catalog.feature.project-intake.title', 'Add a project'),
      summary: translate(
        'guidance.catalog.feature.project-intake.summary',
        'Add a project and continue working, then provide background as needed.'
      )
    },
    'project-overview': {
      title: translate('guidance.catalog.feature.project-overview.title', 'Project overview'),
      summary: translate(
        'guidance.catalog.feature.project-overview.summary',
        'Review project direction, milestones, and actual results.'
      )
    },
    'version-planning': {
      title: translate('guidance.catalog.feature.version-planning.title', 'Version planning'),
      summary: translate(
        'guidance.catalog.feature.version-planning.summary',
        'Decide what to deliver, how to accept it, and which tasks to start.'
      ),
      related: ['version-navigation']
    },
    'version-navigation': {
      title: translate(
        'guidance.catalog.feature.version-navigation.title',
        'Version and session navigation'
      ),
      summary: translate(
        'guidance.catalog.feature.version-navigation.summary',
        'Find the workspace and session associated with a version or goal.'
      ),
      related: ['quick-jump']
    },
    'review-notifications': {
      title: translate(
        'guidance.catalog.feature.review-notifications.title',
        'Review notifications and shared hosts'
      ),
      summary: translate(
        'guidance.catalog.feature.review-notifications.summary',
        'Connect to a shared host when needed, request review, and open the PR from the notification.'
      ),
      related: ['browser', 'internal-integrations']
    },
    'version-acceptance': {
      title: translate('guidance.catalog.feature.version-acceptance.title', 'Version acceptance'),
      summary: translate(
        'guidance.catalog.feature.version-acceptance.summary',
        'Check evidence against goals, confirm the result, and archive it.'
      ),
      related: ['internal-integrations']
    },
    'version-overview': {
      title: translate('guidance.catalog.feature.version-overview.title', 'Version overview'),
      summary: translate(
        'guidance.catalog.feature.version-overview.summary',
        'See this version’s goals, tasks, and acceptance results.'
      ),
      related: ['version-acceptance']
    },
    metrics: {
      title: translate('guidance.catalog.feature.metrics.title', 'Metrics setup and collection'),
      summary: translate(
        'guidance.catalog.feature.metrics.summary',
        'Define how to measure results and find readings or reasons they are missing.'
      )
    },
    'internal-integrations': {
      title: translate('guidance.catalog.feature.internal-integrations.title', 'CodeHub / WeLink'),
      summary: translate(
        'guidance.catalog.feature.internal-integrations.summary',
        'Set up connections in Getting Started and use them for tasks and collaboration.'
      )
    }
  } as const satisfies Record<
    string,
    ExploreContent & { demo?: ExploreDemo; related?: readonly string[] }
  >
}

export type ExploreFeatureId = keyof ReturnType<typeof getFeatures>
export type ExploreFeature = ExploreContent & {
  demo?: ExploreDemo
  related?: readonly ExploreFeatureId[]
}

export type ExploreJourney = ExploreContent & {
  id: string
  building?: boolean
  related?: readonly ExploreFeatureId[]
}

export const getBwExploreCatalog = createLocalizedCatalog(() => ({
  labels: {
    journeys: translate('guidance.catalog.labels.journeys', 'Work journeys'),
    features: translate('guidance.catalog.labels.features', 'Features'),
    types: translate('guidance.catalog.labels.types', 'Explore categories'),
    preparing: translate('guidance.catalog.labels.preparing', 'Content in preparation'),
    building: translate('guidance.catalog.labels.building', 'In development'),
    related: translate('guidance.catalog.labels.related', 'Related features and actions')
  },
  features: getFeatures() satisfies Record<ExploreFeatureId, ExploreFeature>,
  groups: [
    {
      id: 'projects',
      title: translate('guidance.catalog.group.projects', 'Project wall and intake'),
      items: ['project-wall', 'project-intake']
    },
    {
      id: 'overview',
      title: translate('guidance.catalog.group.overview', 'Project overview'),
      items: ['project-overview', 'milestones', 'metrics']
    },
    {
      id: 'planning',
      title: translate('guidance.catalog.group.planning', 'Version planning and navigation'),
      items: ['version-planning', 'version-navigation']
    },
    {
      id: 'execution',
      title: translate('guidance.catalog.group.execution', 'Tasks and execution'),
      items: ['tasks', 'workspace', 'terminal']
    },
    {
      id: 'browser',
      title: translate('guidance.catalog.group.browser', 'Integrated browser'),
      items: ['browser']
    },
    {
      id: 'review',
      title: translate('guidance.catalog.group.review', 'Review and collaboration'),
      items: ['review', 'review-notifications']
    },
    {
      id: 'acceptance',
      title: translate('guidance.catalog.group.acceptance', 'Acceptance and version facts'),
      items: ['version-acceptance', 'version-overview']
    },
    {
      id: 'automation',
      title: translate('guidance.catalog.group.automation', 'Automation'),
      items: ['automation']
    },
    {
      id: 'agents',
      title: translate('guidance.catalog.group.agents', 'Agent orchestration'),
      items: ['orchestration']
    }
  ] as const satisfies readonly { id: string; title: string; items: readonly ExploreFeatureId[] }[],
  journeys: [
    {
      id: 'direction',
      title: translate(
        'guidance.catalog.journey.direction.title',
        'Establish project direction and milestones'
      ),
      summary: translate(
        'guidance.catalog.journey.direction.summary',
        'Agree on what the project should accomplish and plan its milestones.'
      ),
      related: ['project-overview', 'milestones']
    },
    {
      id: 'commitments',
      title: translate(
        'guidance.catalog.journey.commitments.title',
        'Set version commitments and start work'
      ),
      summary: translate(
        'guidance.catalog.journey.commitments.summary',
        'Use past results and new requirements to agree on goals, tasks, and acceptance criteria.'
      ),
      related: ['version-planning', 'version-navigation', 'tasks']
    },
    {
      id: 'delivery',
      title: translate(
        'guidance.catalog.journey.delivery.title',
        'Take a task through review and delivery'
      ),
      summary: translate(
        'guidance.catalog.journey.delivery.summary',
        'Start from an issue, validate the change, review it with a teammate, and merge the PR.'
      ),
      related: ['tasks', 'workspace', 'browser', 'review', 'review-notifications']
    },
    {
      id: 'acceptance',
      title: translate(
        'guidance.catalog.journey.acceptance.title',
        'Verify what this version delivered'
      ),
      summary: translate(
        'guidance.catalog.journey.acceptance.summary',
        'Check evidence against the goals and record the outcome and next actions.'
      ),
      related: ['version-acceptance', 'version-overview']
    },
    {
      id: 'outcomes',
      title: translate(
        'guidance.catalog.journey.outcomes.title',
        'Use actual results to guide the next step'
      ),
      summary: translate(
        'guidance.catalog.journey.outcomes.summary',
        'Review progress and outcomes, identify gaps, and decide what to change.'
      ),
      related: ['project-overview', 'metrics', 'version-planning']
    },
    {
      id: 'maintenance',
      title: translate(
        'guidance.catalog.journey.maintenance.title',
        'Keep the project maintainable'
      ),
      summary: translate(
        'guidance.catalog.journey.maintenance.summary',
        'Review architecture and technical debt, then decide what to address or defer.'
      ),
      building: true
    },
    {
      id: 'reuse',
      title: translate('guidance.catalog.journey.reuse.title', 'Reuse a proven way of working'),
      summary: translate(
        'guidance.catalog.journey.reuse.summary',
        'Capture a method that worked and verify it on the next similar task.'
      ),
      building: true
    }
  ] satisfies readonly ExploreJourney[]
}))
