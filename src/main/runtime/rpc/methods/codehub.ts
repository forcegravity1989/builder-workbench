import { defineMethod } from '../core'
import {
  CodeHubListTasks,
  CodeHubViewer,
  CodeHubCreateIssue,
  CodeHubUpdateIssueTitle,
  CodeHubUpdateIssueLabels,
  CodeHubListLabels,
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
    params: CodeHubViewer,
    handler: (params, { runtime }) => runtime.codehub.viewer(params)
  }),
  defineMethod({
    name: 'codehub.listTasks',
    params: CodeHubListTasks,
    handler: (params, { runtime }) => runtime.codehub.listTasks(params)
  }),
  defineMethod({
    name: 'codehub.createIssue',
    params: CodeHubCreateIssue,
    handler: (params, { runtime }) => runtime.codehub.createIssue(params)
  }),
  defineMethod({
    name: 'codehub.updateIssueTitle',
    params: CodeHubUpdateIssueTitle,
    handler: (params, { runtime }) => runtime.codehub.updateIssueTitle(params)
  }),
  defineMethod({
    name: 'codehub.updateIssueLabels',
    params: CodeHubUpdateIssueLabels,
    handler: (params, { runtime }) => runtime.codehub.updateIssueLabels(params)
  }),
  defineMethod({
    name: 'codehub.listLabels',
    params: CodeHubListLabels,
    handler: (params, { runtime }) => runtime.codehub.listLabels(params)
  }),
  defineMethod({
    name: 'codehub.setIssueState',
    params: CodeHubSetIssueState,
    handler: (params, { runtime }) => runtime.codehub.setIssueState(params)
  }),
  defineMethod({
    name: 'codehub.closeMr',
    params: CodeHubCloseMr,
    handler: (params, { runtime }) => runtime.codehub.closeMr(params)
  }),
  defineMethod({
    name: 'codehub.assignIssue',
    params: CodeHubAssignIssue,
    handler: (params, { runtime }) => runtime.codehub.assignIssue(params)
  }),
  defineMethod({
    name: 'codehub.mergeMr',
    params: CodeHubMergeMr,
    handler: (params, { runtime }) => runtime.codehub.mergeMr(params)
  }),
  defineMethod({
    name: 'codehub.setReviewers',
    params: CodeHubSetReviewers,
    handler: (params, { runtime }) => runtime.codehub.setReviewers(params)
  }),
  defineMethod({
    name: 'codehub.listPipelines',
    params: CodeHubListPipelines,
    handler: (params, { runtime }) => runtime.codehub.listPipelines(params)
  }),
  defineMethod({
    name: 'codehub.mrChecks',
    params: CodeHubMrChecks,
    handler: (params, { runtime }) => runtime.codehub.mrChecks(params)
  }),
  defineMethod({
    name: 'codehub.mrChanges',
    params: CodeHubMrChanges,
    handler: (params, { runtime }) => runtime.codehub.mrChanges(params)
  }),
  defineMethod({
    name: 'codehub.viewTask',
    params: CodeHubViewTask,
    handler: (params, { runtime }) => runtime.codehub.viewTask(params)
  }),
  defineMethod({
    name: 'codehub.listComments',
    params: CodeHubListComments,
    handler: (params, { runtime }) => runtime.codehub.listComments(params)
  }),
  defineMethod({
    name: 'codehub.createComment',
    params: CodeHubCreateComment,
    handler: (params, { runtime }) => runtime.codehub.createComment(params)
  }),
  defineMethod({
    name: 'codehub.deleteComment',
    params: CodeHubDeleteComment,
    handler: (params, { runtime }) => runtime.codehub.deleteComment(params)
  })
]
