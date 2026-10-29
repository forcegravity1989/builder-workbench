const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { _electron } = require('playwright-core')
const root = path.resolve(process.argv[2])
const evidence = path.resolve('pr-evidence/492')
async function main() {
  const results = []
  for (const [index, locale] of ['zh-CN', 'en-US', 'zh-CN'].entries()) {
    const userData = path.join(evidence, `profile-${locale}`)
    const home = path.join(userData, 'home')
    fs.mkdirSync(home, { recursive: true })
    const env = { ...process.env, HOME: home, USERPROFILE: home, ORCA_E2E_HOME_DIR: home, ORCA_E2E_USER_DATA_DIR: userData, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' }
    delete env.ELECTRON_RUN_AS_NODE
    console.log(`Launching packaged ${locale}, pass ${index}`)
    const app = await _electron.launch({ executablePath: path.join(root, 'Workbench.exe'), args: [`--lang=${locale}`], env, timeout: 120000 })
    try {
      const window = await app.firstWindow({ timeout: 120000 })
      await window.waitForFunction(() => document.body.innerText.trim().length > 20, undefined, { timeout: 120000 })
      await window.getByRole('button').first().waitFor({ state: 'visible', timeout: 120000 })
      await window.evaluate(() => document.fonts.ready.then(() => true))
      const info = await app.evaluate(async ({ app }) => {
        const path = process.getBuiltinModule('path')
        const require = process.getBuiltinModule('module').createRequire(path.join(process.resourcesPath, 'package.json'))
        const pty = require('node-pty')
        require('@vscode/windows-process-tree')
        require('@orca/windows-registry')
        const ptyResult = await new Promise((resolve, reject) => {
          let output = ''
          const terminal = pty.spawn(process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', ['/d', '/c', 'echo BW_PACKAGE_PTY_OK'], { name: 'xterm-color', cols: 80, rows: 24, cwd: app.getPath('home'), env: process.env })
          const timer = setTimeout(() => { terminal.kill(); reject(new Error('PTY command timed out')) }, 30000)
          terminal.onData(data => { output += data })
          terminal.onExit(({ exitCode }) => { clearTimeout(timer); resolve({ exitCode, marker: output.includes('BW_PACKAGE_PTY_OK') }) })
        })
        return { locale: app.getLocale(), version: app.getVersion(), userData: app.getPath('userData'), home: app.getPath('home'), pty: ptyResult, nativePath: require.resolve('node-pty') }
      })
      assert.equal(info.locale.toLowerCase(), locale.toLowerCase())
      assert.equal(info.userData.toLowerCase(), userData.toLowerCase())
      assert.equal(info.home.toLowerCase(), home.toLowerCase())
      assert.equal(info.pty.exitCode, 0)
      assert.equal(info.pty.marker, true)
      assert.ok(info.nativePath.toLowerCase().startsWith(root.toLowerCase()))
      const text = await window.locator('body').innerText()
      assert.ok(text.length > 20)
      await window.screenshot({ path: path.join(evidence, `${locale}-${index}.jpg`), type: 'jpeg', quality: 85 })
      results.push({ ...info, renderedCharacters: text.length, restart: index === 2 })
    } finally {
      await app.close()
    }
    if (index < 2) {
      for (const args of [['skills', 'get', 'week-planning'], ['bw', 'materials', 'schema', '--workflow', 'plan']]) {
        const result = spawnSync(path.join(root, 'resources/bin/orca.exe'), args, { env, encoding: 'utf8', timeout: 60000, windowsHide: true })
        if (result.error) throw result.error
        assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`)
        assert.ok(result.stdout.length > 100)
        fs.writeFileSync(path.join(evidence, `${locale}-${args[0]}-cli.txt`), result.stdout)
      }
    }
  }
  fs.writeFileSync(path.join(evidence, 'smoke-results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
