export type TeamDirectoryMember = {
  member_id: string
  name?: string
  avatar?: string
  host_id?: string
  identity_source: 'welink-cli'
  orca_endpoint?: string
}

export type TeamDirectoryProject = {
  repo_id: string
  name?: string
  repository?: string
  sources: string[]
}

export type TeamDirectory = {
  schema_version: 1
  team_group_id: string
  team_space_id: string
  identity_source: 'welink-cli'
  hosts: TeamDirectoryMember[]
  projects: TeamDirectoryProject[]
}
