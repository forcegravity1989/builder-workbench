import { defineMethod } from '../core'
import {
  CodeHubListTasks,
  CodeHubViewer,
  CodeHubCreateIssue,
  CodeHubUpdateIssueTitle,
  CodeHubUpdateIssueLabels,
  CodeHubListLabels,
  CodeHubListMembers,
  CodeHubSetIssueState,
  CodeHubCloseMr,
  CodeHubAssignIssue,
  CodeHubMergeMr,
  CodeHubSetReviewers,
  CodeHubListPipelines,
  CodeHubMrChecks,
  CodeHubMrChanges,
  CodeHubViewTask,
  CodeHubListComments,
  CodeHubCreateComment,
  CodeHubDeleteComment
} from '../../../../shared/codehub-api'

export const CODEHUB_METHODS = [
  defineMethod({
    name: 'codehub.viewer',
    permission: 'workspace',
    params: CodeHubViewer,
    handler: (params, { runtime }) => runtime.codehub.viewer(params)
  }),
  defineMethod({
    name: 'codehub.listTasks',
    permission: 'workspace',
    params: CodeHubListTasks,
    handler: (params, { runtime }) => runtime.codehub.listTasks(params)
  }),
  defineMethod({
    name: 'codehub.createIssue',
    permission: 'workspace',
    params: CodeHubCreateIssue,
    handler: (params, { runtime }) => runtime.codehub.createIssue(params)
  }),
  defineMethod({
    name: 'codehub.updateIssueTitle',
    permission: 'workspace',
    params: CodeHubUpdateIssueTitle,
    handler: (params, { runtime }) => runtime.codehub.updateIssueTitle(params)
  }),
  defineMethod({
    name: 'codehub.updateIssueLabels',
    permission: 'workspace',
    params: CodeHubUpdateIssueLabels,
    handler: (params, { runtime }) => runtime.codehub.updateIssueLabels(params)
  }),
  defineMethod({
    name: 'codehub.listLabels',
    permission: 'workspace',
    params: CodeHubListLabels,
    handler: (params, { runtime }) => runtime.codehub.listLabels(params)
  }),
  defineMethod({
    name: 'codehub.listMembers',
    permission: 'workspace',
    params: CodeHubListMembers,
    handler: (params, { runtime }) => runtime.codehub.listMembers(params)
  }),
  defineMethod({
    name: 'codehub.setIssueState',
    permission: 'workspace',
    params: CodeHubSetIssueState,
    handler: (params, { runtime }) => runtime.codehub.setIssueState(params)
  }),
  defineMethod({
    name: 'codehub.closeMr',
    permission: 'workspace',
    params: CodeHubCloseMr,
    handler: (params, { runtime }) => runtime.codehub.closeMr(params)
  }),
  defineMethod({
    name: 'codehub.assignIssue',
    permission: 'workspace',
    params: CodeHubAssignIssue,
    handler: (params, { runtime }) => runtime.codehub.assignIssue(params)
  }),
  defineMethod({
    name: 'codehub.mergeMr',
    permission: 'workspace',
    params: CodeHubMergeMr,
    handler: (params, { runtime }) => runtime.codehub.mergeMr(params)
  }),
  defineMethod({
    name: 'codehub.setReviewers',
    permission: 'workspace',
    params: CodeHubSetReviewers,
    handler: (params, { runtime }) => runtime.codehub.setReviewers(params)
  }),
  defineMethod({
    name: 'codehub.listPipelines',
    permission: 'workspace',
    params: CodeHubListPipelines,
    handler: (params, { runtime }) => runtime.codehub.listPipelines(params)
  }),
  defineMethod({
    name: 'codehub.mrChecks',
    permission: 'workspace',
    params: CodeHubMrChecks,
    handler: (params, { runtime }) => runtime.codehub.mrChecks(params)
  }),
  defineMethod({
    name: 'codehub.mrChanges',
    permission: 'workspace',
    params: CodeHubMrChanges,
    handler: (params, { runtime }) => runtime.codehub.mrChanges(params)
  }),
  defineMethod({
    name: 'codehub.viewTask',
    permission: 'workspace',
    params: CodeHubViewTask,
    handler: (params, { runtime }) => runtime.codehub.viewTask(params)
  }),
  defineMethod({
    name: 'codehub.listComments',
    permission: 'workspace',
    params: CodeHubListComments,
    handler: (params, { runtime }) => runtime.codehub.listComments(params)
  }),
  defineMethod({
    name: 'codehub.createComment',
    permission: 'workspace',
    params: CodeHubCreateComment,
    handler: (params, { runtime }) => runtime.codehub.createComment(params)
  }),
  defineMethod({
    name: 'codehub.deleteComment',
    permission: 'workspace',
    params: CodeHubDeleteComment,
    handler: (params, { runtime }) => runtime.codehub.deleteComment(params)
  })
]
