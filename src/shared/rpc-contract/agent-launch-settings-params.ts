import { z } from 'zod'
import { isTuiAgent } from '../tui-agent-config'
import type { TuiAgent } from '../tui-agent'

const Agent = z.custom<TuiAgent>((value) => typeof value === 'string' && isTuiAgent(value))
const Value = z
  .string()
  .max(8 * 1024)
  .refine((value) => !value.includes('\0'), 'Invalid value')
const Name = z.string().min(1).max(256).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Invalid variable name')

export const AgentLaunchSettingsMutation = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('default'),
    agent: z.union([Agent, z.literal('blank'), z.null()]),
    setupOnly: z.boolean().optional()
  }).strict(),
  z.object({ type: z.literal('availability'), agent: Agent, enabled: z.boolean() }).strict(),
  z.object({ type: z.literal('permissions'), mode: z.enum(['manual', 'yolo']) }).strict(),
  z.object({ type: z.literal('command'), agent: Agent, value: Value }).strict(),
  z.object({ type: z.literal('arguments'), agent: Agent, value: Value }).strict(),
  z.object({ type: z.literal('environment-set'), agent: Agent, name: Name, value: Value }).strict(),
  z.object({ type: z.literal('environment-remove'), agent: Agent, name: Name }).strict()
])

import { AGENT_PERMISSION_CHOICES } from '../agent-launch/permissions/tui-agent-permission-choice'

const ChoiceValue = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !value.includes('\0'))

export const OptionKey = ChoiceValue.refine(
  (key) =>
    !['__proto__', 'constructor', 'prototype', 'agentId', 'model', 'permissionMode'].includes(key)
)

export const ChoicePatch = z
  .object({
    model: ChoiceValue.nullable().optional(),
    options: z
      .record(OptionKey, ChoiceValue.nullable())
      .refine((value) => Object.keys(value).length <= 32)
      .optional(),
    permissionMode: z.enum([...AGENT_PERMISSION_CHOICES, 'default']).optional()
  })
  .strict()
