import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { lock } from 'proper-lockfile'
import { resolveLaunchUserDataPath } from '../runtime/profile/launch-user-data-path'

export type MaintenanceIssue = { url: string; number: number }
export type MaintenanceDispatch = MaintenanceIssue & {
  item: number
  request?: string
  dispatchId?: string
}
export type MaintenanceQueue = {
  owner: string
  reports: MaintenanceDispatch[]
  waiting: MaintenanceIssue[]
  active?: MaintenanceDispatch
  handled: string[]
}

export async function withMaintenanceQueue(
  repo: string,
  bot: string,
  currentBotIds: () => Promise<string[]>,
  advance: (queue: MaintenanceQueue, save: () => Promise<void>) => Promise<unknown>
): Promise<unknown> {
  const key = createHash('sha256').update(repo).digest('hex')
  const directory = join(resolveLaunchUserDataPath(), 'bw-maintenance', key)
  await mkdir(directory, { recursive: true })
  const release = await lock(directory, { retries: 0, stale: 120_000 })
  try {
    const path = join(directory, 'queue.json')
    let queue: MaintenanceQueue
    try {
      queue = JSON.parse(await readFile(path, 'utf8')) as MaintenanceQueue
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      queue = { owner: bot, waiting: [], handled: [], reports: [] }
    }
    if (queue.owner !== bot) {
      if (queue.active || queue.reports.length || (await currentBotIds()).includes(queue.owner)) {
        throw new Error('此仓库已有另一位维护 Bot 接单，请使用原 Bot 核对在途工作。')
      }
      queue.owner = bot
    }
    return await advance(queue, async () => {
      const temporary = join(directory, `${randomUUID()}.tmp`)
      await writeFile(temporary, JSON.stringify(queue), { flush: true })
      await rename(temporary, path)
    })
  } finally {
    await release()
  }
}
