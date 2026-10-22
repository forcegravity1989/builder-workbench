import type { CodeHubRemote } from '../../shared/codehub'
import {
  mapCodeHubGateChecks,
  mapCodeHubMrChanges,
  type CodeHubMrFileChange
} from '../../shared/codehub-mr-detail'
import type { PRCheckDetail } from '../../shared/github/check-types'
import { parseJson, projectArgs } from './mutations'
import { runCodeHubCli, type CodeHubExecOptions } from './cli'

export async function readCodeHubMrChecks(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
}): Promise<PRCheckDetail[]> {
  const parsed = parseJson(
    await runCodeHubCli(
      [
        'mr',
        'gate',
        String(args.iid),
        ...projectArgs(args.remote),
        '-f',
        'json',
        '--jq',
        '.checks'
      ],
      args.execOptions
    )
  )
  return mapCodeHubGateChecks(parsed)
}

export async function readCodeHubMrChanges(args: {
  remote: CodeHubRemote
  execOptions?: CodeHubExecOptions
  iid: number
}): Promise<CodeHubMrFileChange[]> {
  const parsed = parseJson(
    await runCodeHubCli(
      [
        'mr',
        'changes',
        String(args.iid),
        ...projectArgs(args.remote),
        '-f',
        'json',
        '--jq',
        '.changes'
      ],
      args.execOptions
    )
  )
  return mapCodeHubMrChanges(parsed)
}
