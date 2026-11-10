const { app } = require('electron')

// Playwright's Electron loader injects basic/mock storage on every platform.
// This test-only preload runs after that loader and before the app initializes.
app.commandLine.removeSwitch('use-mock-keychain')
app.commandLine.removeSwitch('password-store')
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'gnome-libsecret')
}
