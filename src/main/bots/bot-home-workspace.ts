import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { BotAgent } from '../../shared/bot-types'
import type { TuiAgent } from '../../shared/tui-agent'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { RuntimeStore } from '../runtime/runtime-store-contract'
import { botHomeFolder, isBotsProjectGroup, type BotHomeFilesystem } from './bot-home'

type HomeStore = Required<Pick<RuntimeStore, 'getProjectGroups' | 'createProjectGroup'>>
type HomeRecord = { folder: string; folderWorkspaceId: string }
export type BotHomeDependencies = {
  botsRoot: () => string
  filesystem: BotHomeFilesystem
  createFolderWorkspace: (input: {
    projectGroupId: string
    name: string
    folderPath: string
    createdWithAgent: TuiAgent
  }) => Promise<FolderWorkspace>
}

/** Reserves `<bots root>/<slug>` (else `<slug>-2`...) and makes its folder workspace in the
 *  hidden Bots group: a bot's home, or a group's. `fill` writes into the folder first; a failure
 *  removes the freshly reserved folder, which holds nothing of the user's yet. */
export async function makeBotsHome(
  deps: BotHomeDependencies,
  store: HomeStore,
  slug: string,
  name: string,
  agent: BotAgent,
  fill: (path: string, folder: string) => Promise<void> = async () => {}
): Promise<HomeRecord> {
  if (!isTuiAgent(agent)) {
    throw new Error('bot_agent_unavailable')
  }
  const botsRoot = deps.botsRoot()
  const folder = await reserveFolder(deps, botsRoot, slug)
  const path = botHomeFolder({ folder }, botsRoot)
  try {
    await fill(path, folder)
    const workspace = await deps.createFolderWorkspace({
      projectGroupId: botsGroupId(store, botsRoot),
      name,
      folderPath: path,
      createdWithAgent: agent
    })
    return { folder, folderWorkspaceId: workspace.id }
  } catch (error) {
    await deps.filesystem.removeTree(path)
    throw error
  }
}

function botsGroupId(store: HomeStore, botsRoot: string): string {
  const existing = store.getProjectGroups().find((group) => isBotsProjectGroup(group, botsRoot))
  return (
    existing ??
    store.createProjectGroup({
      name: 'Bots',
      parentPath: botsRoot,
      createdFrom: 'manual'
    })
  ).id
}

/** A folder already on disk may be a kept or another profile's bot, so it is never reused. */
async function reserveFolder(
  deps: Pick<BotHomeDependencies, 'filesystem'>,
  botsRoot: string,
  slug: string
): Promise<string> {
  for (let suffix = 1; ; suffix++) {
    const folder = suffix === 1 ? slug : `${slug}-${suffix}`
    if (await deps.filesystem.reserveDirectory(botHomeFolder({ folder }, botsRoot))) {
      return folder
    }
  }
}
