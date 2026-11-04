import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import {
  ORCAD_ARTIFACTS,
  ORCAD_PLAYWRIGHT_ARTIFACTS,
  orcadTemplateCommonFilenames
} from '../../shared/orcad-artifacts'
import { stageOrcadPlaywright } from '../../../config/scripts/orcad-playwright-package.mjs'

it('ships the complete lazy Chromium runtime through the template manifest without host dependencies', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bw-orcad-playwright-'))
  expect(dirname(resolve(directory))).toBe(resolve(tmpdir()))
  try {
    stageOrcadPlaywright(join(import.meta.dirname, '../../..'), directory)
    for (const file of ORCAD_PLAYWRIGHT_ARTIFACTS) {
      expect(ORCAD_ARTIFACTS.some((artifact) => artifact.filename === file)).toBe(true)
      expect(orcadTemplateCommonFilenames()).toContain(file)
      expect(existsSync(join(directory, file))).toBe(true)
    }
    const probe = join(directory, 'probe.cjs')
    writeFileSync(
      probe,
      `
      const assert = require('node:assert/strict');
      const Module = require('node:module');
      const load = Module._load;
      Module._load = function(name, ...args) {
        assert.ok(!/^(electron|chromium-bidi)(\\/|$)/.test(name), name);
        return load.call(this, name, ...args);
      };
      const { chromium } = require('playwright-core');
      assert.equal(chromium.name(), 'chromium');
      assert.equal(typeof chromium.launch, 'function');
      console.log('isolated chromium runtime loaded');
    `
    )
    const result = spawnSync(process.execPath, [probe], {
      cwd: directory,
      env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
      encoding: 'utf8',
      timeout: 15_000
    })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('isolated chromium runtime loaded')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
