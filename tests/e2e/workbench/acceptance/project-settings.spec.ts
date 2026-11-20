import { projectSettingsTest, verifyProjectSettings } from '../../helpers/workbench-project-settings'

projectSettingsTest(
  'BW project settings: reviewed edits, conflict protection and filesystem read-back',
  async ({ workbenchPage, seededRepoPath }, testInfo) => {
    projectSettingsTest.setTimeout(300_000)
    await verifyProjectSettings(workbenchPage, seededRepoPath, testInfo)
  }
)
