import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { text } from 'node:stream/consumers'
import { z } from 'zod'
import {
  AcceptanceMaterialSchema,
  PlanningMaterialSchema
} from '../../shared/workbench/version-material'
import type { CommandHandler, HandlerContext } from '../dispatch'
import {
  VersionMigrationReadSchema,
  VersionMigrationApplySchema
} from '../../shared/workbench/version-material-migration'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime/types'
import {
  VersionMaterialReadSchema,
  VersionMaterialSaveSchema,
  VersionMaterialScopeSchema,
  type VersionMaterialResult
} from '../../shared/workbench/version-material-request'

function scope(ctx: HandlerContext) {
  return {
    repoId: getRequiredStringFlag(ctx.flags, 'repo-id'),
    worktreeId: getRequiredStringFlag(ctx.flags, 'worktree-id'),
    hostId: getOptionalStringFlag(ctx.flags, 'host-id') ?? 'local',
    workflow: getRequiredStringFlag(ctx.flags, 'workflow')
  }
}

async function invoke(ctx: HandlerContext, operation: string, params: unknown): Promise<void> {
  const response = await ctx.client.call<VersionMaterialResult<unknown>>(
    `workbench.materials.${operation}`,
    params
  )
  if (!response.result.ok) {
    const error = response.result.error
    throw new RuntimeClientError(error.code, error.message, {
      currentRevision: error.currentRevision
    })
  }
  printResult({ ...response, result: response.result.value }, ctx.json, (value) =>
    JSON.stringify(value, null, 2)
  )
}

export const WORKBENCH_MATERIAL_HANDLERS: Record<string, CommandHandler> = {
  'bw materials context': async (ctx) => invoke(ctx, 'context', VersionMaterialScopeSchema.parse(scope(ctx))),
  'bw materials select': async (ctx) => invoke(ctx, 'select', VersionMaterialReadSchema.parse({
    ...scope(ctx), version: getRequiredStringFlag(ctx.flags, 'version')
  })),
  'bw materials migration-preview': async (ctx) =>
    invoke(
      ctx,
      'previewMigration',
      VersionMigrationReadSchema.parse({
        ...scope(ctx),
        version: getRequiredStringFlag(ctx.flags, 'version'),
        cycleId: getRequiredStringFlag(ctx.flags, 'cycle-id'),
        sourceRevision: getOptionalStringFlag(ctx.flags, 'source-revision')
      })
    ),
  'bw materials migrate': async (ctx) =>
    invoke(
      ctx,
      'migrate',
      VersionMigrationApplySchema.parse({
        ...scope(ctx),
        version: getRequiredStringFlag(ctx.flags, 'version'),
        cycleId: getRequiredStringFlag(ctx.flags, 'cycle-id'),
        expectedRevision: getRequiredStringFlag(ctx.flags, 'expected-revision')
      })
    ),
  'bw materials schema': async (ctx) => {
    const workflow = z
      .enum(['plan', 'acceptance'])
      .parse(getRequiredStringFlag(ctx.flags, 'workflow'))
    const schema = workflow === 'plan' ? PlanningMaterialSchema : AcceptanceMaterialSchema
    console.log(JSON.stringify(z.toJSONSchema(schema, { io: 'input' }), null, 2))
  },
  'bw materials list': async (ctx) =>
    invoke(ctx, 'list', VersionMaterialScopeSchema.parse(scope(ctx))),
  'bw materials read': async (ctx) =>
    invoke(
      ctx,
      'read',
      VersionMaterialReadSchema.parse({
        ...scope(ctx),
        version: getRequiredStringFlag(ctx.flags, 'version')
      })
    ),
  'bw materials save': async (ctx) => {
    const target = scope(ctx)
    const create = ctx.flags.get('create')
    const revision = getOptionalStringFlag(ctx.flags, 'expected-revision')
    if (
      (create !== undefined && create !== true) ||
      (create === true) === (revision !== undefined)
    ) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use either --create or --expected-revision.'
      )
    }
    const input = getOptionalStringFlag(ctx.flags, 'input')
    const stdin = ctx.flags.get('input-stdin')
    let raw: string
    if (stdin === true && input === undefined) {
      raw = await text(process.stdin)
    } else if (stdin === undefined && input !== undefined) {
      raw = await readFile(resolve(ctx.cwd, input), 'utf8')
    } else {
      throw new RuntimeClientError(
        'invalid_argument',
        'Use either --input <file> or --input-stdin.'
      )
    }
    const document: unknown = JSON.parse(raw)
    await invoke(
      ctx,
      'save',
      VersionMaterialSaveSchema.parse({
        ...target,
        version: getRequiredStringFlag(ctx.flags, 'version'),
        expectedRevision: revision ?? null,
        document
      })
    )
  }
}
