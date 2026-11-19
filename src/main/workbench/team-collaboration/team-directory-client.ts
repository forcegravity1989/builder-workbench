import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createFolder,
  downloadOneboxFile,
  findOneboxFile,
  listFolder,
  type WelinkRoute,
  uploadOneboxFile
} from '../reporting/welink-onebox-client'
import type { TeamDirectory } from '../../../shared/team-directory'
export type { TeamDirectory } from '../../../shared/team-directory'

export type TeamDirectoryReadResult = {
  directory: TeamDirectory
  fileId: string | null
}

function parseDirectory(text: string, groupId: string, spaceId: string): TeamDirectory {
  const parsed = JSON.parse(text) as Partial<TeamDirectory>
  return {
    schema_version: 1,
    team_group_id: groupId,
    team_space_id: spaceId,
    identity_source: 'welink-cli',
    hosts: Array.isArray(parsed.hosts) ? parsed.hosts : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : []
  }
}

async function resolveTeamFolder(route: WelinkRoute, spaceId: string): Promise<string> {
  const listing = await listFolder(route, spaceId, '0')
  const existing = listing.folders.find((folder) => folder.name === 'BW')
  return existing?.id ?? createFolder(route, spaceId, '0', 'BW')
}

export async function readTeamDirectory(args: {
  route: WelinkRoute
  groupId: string
  spaceId: string
}): Promise<TeamDirectoryReadResult> {
  const node = await findOneboxFile(args.route, args.spaceId, 'team.json')
  if (!node) {
    return {
      directory: {
        schema_version: 1,
        team_group_id: args.groupId,
        team_space_id: args.spaceId,
        identity_source: 'welink-cli',
        hosts: [],
        projects: []
      },
      fileId: null
    }
  }
  const root = await mkdtemp(join(tmpdir(), 'bw-team-directory-'))
  try {
    await downloadOneboxFile(args.route, args.spaceId, node.id, root)
    const candidates = ['team.json', join(root, 'team.json')]
    for (const candidate of candidates) {
      try {
        return { directory: parseDirectory(await readFile(candidate, 'utf8'), args.groupId, args.spaceId), fileId: node.id }
      } catch {
        // The CLI may create a directory named after the file id; inspect below.
      }
    }
    const files = await import('node:fs/promises').then(({ readdir }) => readdir(root))
    for (const file of files) {
      if (file.endsWith('.json')) {
        return { directory: parseDirectory(await readFile(join(root, file), 'utf8'), args.groupId, args.spaceId), fileId: node.id }
      }
    }
    throw new Error('team.json download did not produce a JSON file')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export async function writeTeamDirectory(args: {
  route: WelinkRoute
  directory: TeamDirectory
}): Promise<{ fileId: string }> {
  const root = await mkdtemp(join(tmpdir(), 'bw-team-directory-write-'))
  const path = join(root, 'team.json')
  try {
    await writeFile(path, `${JSON.stringify(args.directory, null, 2)}\n`, 'utf8')
    const folderId = await resolveTeamFolder(args.route, args.directory.team_space_id)
    return { fileId: await uploadOneboxFile(args.route, args.directory.team_space_id, folderId, path) }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}
