import { defineMethod } from '../core'
import { ConnectorListRequestSchema } from '../../../../shared/workbench/connector-status'
import { workbenchRuntimeResult } from '../../../workbench/workbench-runtime-result'
import { listConnectors } from '../../../workbench/connectors-runtime'

export const WORKBENCH_CONNECTOR_METHODS = [
  defineMethod({
    name: 'workbench.connectors.list',
    params: ConnectorListRequestSchema,
    handler: (params, { runtime }) => workbenchRuntimeResult(() => listConnectors(runtime, params))
  })
]
