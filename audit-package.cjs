const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { getRawHeader } = createRequire(require.resolve('app-builder-lib'))('@electron/asar')
const label = process.argv[2]
const root = path.resolve(process.argv[3])
const setup = path.resolve(process.argv[4])
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (entry.isFile()) files.push({ path: path.relative(root, file).replaceAll('\\', '/'), bytes: fs.statSync(file).size })
  }
}
walk(root)
const entries = []
function scan(tree, prefix = '') {
  for (const [name, item] of Object.entries(tree.files || {})) {
    if (item.files) scan(item, prefix + name + '/')
    else entries.push(prefix + name)
  }
}
scan(getRawHeader(path.join(root, 'resources/app.asar')).header)
const native = Object.fromEntries(files.filter(f => /^resources\/node_modules\//.test(f.path) && /\.(node|dll|exe)$/i.test(f.path)).map(f => [f.path, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f.path))).digest('hex')]))
const buildArtifacts = files.filter(f => /^resources\/node_modules\//.test(f.path) && /\.(pdb|obj|ipdb|iobj|ilk|tlog|exp|lib|lastbuildstate)$/i.test(f.path))
const relay = files.filter(f => f.path.startsWith('resources/relay/'))
for (const f of relay) assert.deepEqual(fs.readFileSync(path.join(root, f.path)), fs.readFileSync(path.resolve('out/relay', f.path.slice('resources/relay/'.length))))
const ready = fs.existsSync(setup) && fs.statSync(setup).size > 0
const report = { label, setup, installerBytes: ready ? fs.statSync(setup).size : null, installerSha256: ready ? crypto.createHash('sha256').update(fs.readFileSync(setup)).digest('hex') : null, installedBytes: files.reduce((n,f) => n + f.bytes, 0), locales: files.filter(f => f.path.startsWith('locales/')).map(f => f.path).sort(), buildArtifactCount: buildArtifacts.length, buildArtifactBytes: buildArtifacts.reduce((n,f) => n + f.bytes,0), relayFiles: relay.length, relayBytes: relay.reduce((n,f) => n + f.bytes,0), relayTargets: fs.readdirSync(path.join(root,'resources/relay')).sort(), asarRelayEntries: entries.filter(e => e.startsWith('out/relay/')).length, native }
if (label === 'after') {
  assert.deepEqual(report.locales, ['locales/en-US.pak','locales/zh-CN.pak'])
  assert.equal(report.buildArtifactCount,0)
  assert.equal(report.asarRelayEntries,0)
}
fs.writeFileSync(path.resolve(`pr-evidence/492/${label}-sizes.json`),JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,native:Object.keys(native).length},null,2))
