import { projectSettingsTest } from '../../helpers/monica-project-settings'
import { verifyMilestones } from '../../helpers/monica-milestones'
import { verifyMilestoneRestart } from '../../helpers/monica-milestone-restart'

projectSettingsTest(
  'BW milestones: real editing, pointer drag, source return and safe submit failure @headful',
  async ({ monicaPage, seededRepoPath, electronApp }, testInfo) => {
    projectSettingsTest.setTimeout(600_000)
    const material = await verifyMilestones(monicaPage, seededRepoPath, testInfo)
    await verifyMilestoneRestart(electronApp, testInfo, material)
  }
)
