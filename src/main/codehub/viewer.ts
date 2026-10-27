import type { CodeHubViewerIdentity } from '../../shared/codehub-api'
import type { CodeHubRemote } from '../../shared/codehub'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'

export async function getCodeHubViewer(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
}): Promise<CodeHubViewerIdentity> {
  const stdout = await runCodeHubCli(
    [
      '--no-cache',
      'user',
      'view',
      '-H',
      args.remote.host.replace(/:\d+$/, ''),
      '--json',
      'id,username,name,state'
    ],
    args.execOptions
  )
  const value = JSON.parse(stdout) as Partial<CodeHubViewerIdentity> | null
  if (
    !value ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    value.id <= 0 ||
    typeof value.username !== 'string' ||
    !value.username.trim()
  ) {
    throw new Error('CodeHub current user is unavailable')
  }
  return {
    id: value.id,
    username: value.username.trim(),
    name: typeof value.name === 'string' ? value.name : '',
    state: typeof value.state === 'string' ? value.state : ''
  }
}
