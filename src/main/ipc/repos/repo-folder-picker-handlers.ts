import type { BrowserWindow } from 'electron'
import { dialog, ipcMain } from 'electron'
import { authorizeExternalPath } from '../filesystem-auth'

async function pickAuthorizedDirectories(
  mainWindow: BrowserWindow,
  multi: boolean
): Promise<string[]> {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: multi ? ['openDirectory', 'multiSelections'] : ['openDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return []
  }
  // Why: OS picker is user intent; authorize so follow-up fs probes (charter / pathExists) work before repos.add.
  for (const filePath of result.filePaths) {
    authorizeExternalPath(filePath)
  }
  return result.filePaths
}

export function registerRepoFolderPickerHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('repos:pickFolder', async () => {
    const paths = await pickAuthorizedDirectories(mainWindow, false)
    return paths[0] ?? null
  })

  ipcMain.handle('repos:pickFolders', async () => pickAuthorizedDirectories(mainWindow, true))

  // Why: generic folder picker, separate from pickFolder's add-project flow; a clone destination may not be a git repo yet.
  ipcMain.handle('repos:pickDirectory', async () => {
    const paths = await pickAuthorizedDirectories(mainWindow, false)
    return paths[0] ?? null
  })
}
