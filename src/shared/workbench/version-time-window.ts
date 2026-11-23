import { z } from 'zod'
import { materialObject } from './version-material-common'

/** Planning dates, inclusive; never inferred from releases or Git timestamps. */
export const VersionTimeWindowSchema = materialObject({
    start: z.iso.date(),
    end: z.iso.date()
  })
  .refine((value) => value.start <= value.end, '结束日期不能早于开始日期')

export type VersionTimeWindow = z.infer<typeof VersionTimeWindowSchema>
