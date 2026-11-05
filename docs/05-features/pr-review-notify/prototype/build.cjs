// Build the local copy of the G2 prototype with the collaboration todo overlay.
const fs = require('node:fs')
const path = require('node:path')
const esbuild = require('esbuild')
const output = path.join(__dirname, 'g2-workspace.js')
const result = esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'g2-workspace.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  charset: 'utf8',
  minifyWhitespace: true,
  minifyIdentifiers: true
}).outputFiles[0].text
fs.writeFileSync(output, result)
console.log('built', output)
