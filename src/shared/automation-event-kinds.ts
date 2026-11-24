export const AUTOMATION_EVENT_KINDS = {
  slack: ['mentioned', 'message', 'reaction'],
  github: [
    'issue_opened',
    'pr_opened',
    'pr_pushed',
    'pr_merged',
    'comment',
    'review_comment',
    'review',
    'mentioned',
    'review_requested',
    'assigned',
    'ci_failed',
    'ci_passed',
    'ci_finished',
    'pr_conflicted',
    'pr_closed',
    'pr_ready',
    'labeled',
    'issue_closed',
    'deploy_finished',
    'security_alert',
    'workflow_finished'
  ],
  linear: ['assigned', 'mentioned', 'issue_created', 'issue_moved'],
  // The automation's own URL; whoever holds its key or signature can call it.
  webhook: ['call'],
  // Checked on the host that holds the Google sign-in; never sent to Orca Cloud.
  gmail: ['new_email'],
  calendar: ['starting_soon']
} as const

export type AutomationEventSource = keyof typeof AUTOMATION_EVENT_KINDS
