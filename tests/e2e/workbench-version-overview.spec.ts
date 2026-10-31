import { overviewTest } from './helpers/workbench-version-overview-fixture'
import { verifyVersionOverview } from './helpers/workbench-version-overview'

overviewTest(
  'BW version overview: real sources, version identity and process restart',
  async ({ workbenchPage, electronApp, seededRepoPath }, info) => {
    overviewTest.setTimeout(600_000)
    await verifyVersionOverview(workbenchPage, electronApp, seededRepoPath, info)
  }
)
