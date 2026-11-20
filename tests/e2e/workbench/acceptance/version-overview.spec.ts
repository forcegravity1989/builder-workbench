import { overviewTest } from '../../helpers/monica-version-overview-fixture'
import { verifyVersionOverview } from '../../helpers/monica-version-overview'

overviewTest(
  'BW version overview: real sources, version identity and process restart',
  async ({ monicaPage, electronApp, seededRepoPath }, info) => {
    overviewTest.setTimeout(600_000)
    await verifyVersionOverview(monicaPage, electronApp, seededRepoPath, info)
  }
)
