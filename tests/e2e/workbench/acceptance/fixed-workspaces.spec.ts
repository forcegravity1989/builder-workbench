import { fixedWorkspaceTest } from '../../helpers/monica-fixed-workspace-fixture'
import { verifyFixedWorkspaceRemoteReuse } from '../../helpers/monica-fixed-workspace'

fixedWorkspaceTest(
  'BW fixed workspaces: restore remote branches with narrow fetch and existing reviews',
  async ({ monicaPage, fixedRemote }, testInfo) => {
    fixedWorkspaceTest.setTimeout(900_000)
    await verifyFixedWorkspaceRemoteReuse(monicaPage, fixedRemote, testInfo)
  }
)
