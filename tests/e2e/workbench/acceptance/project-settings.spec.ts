import { projectSettingsTest, verifyProjectSettings } from '../../helpers/monica-project-settings'

projectSettingsTest(
  'BW project settings: reviewed edits, conflict protection and filesystem read-back',
  async ({ monicaPage, seededRepoPath }, testInfo) => {
    projectSettingsTest.setTimeout(300_000)
    await verifyProjectSettings(monicaPage, seededRepoPath, testInfo)
  }
)
