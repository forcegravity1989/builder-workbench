import { projectSettingsTest } from '../../helpers/workbench-project-settings'
import { verifyMilestones } from '../../helpers/workbench-milestones'
import { verifyMilestoneRestart } from '../../helpers/workbench-milestone-restart'

projectSettingsTest(
  'BW milestones: real editing, pointer drag, source return and safe submit failure @headful',
  async ({ workbenchPage, seededRepoPath, electronApp }, testInfo) => {
    projectSettingsTest.setTimeout(600_000)
    const material = await verifyMilestones(workbenchPage, seededRepoPath, testInfo)
    await verifyMilestoneRestart(electronApp, testInfo, material)
  }
)
