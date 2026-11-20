import { fixedWorkspaceTest } from '../../helpers/workbench-fixed-workspace-fixture'
import { verifyFixedWorkspaceRemoteReuse } from '../../helpers/workbench-fixed-workspace'

fixedWorkspaceTest(
  'BW fixed workspaces: restore remote branches with narrow fetch and existing reviews',
  async ({ workbenchPage, fixedRemote }, testInfo) => {
    fixedWorkspaceTest.setTimeout(900_000)
    await verifyFixedWorkspaceRemoteReuse(workbenchPage, fixedRemote, testInfo)
  }
)
