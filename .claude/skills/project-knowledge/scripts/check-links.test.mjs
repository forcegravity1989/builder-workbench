import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFiles } from './check-links.mjs';

const script = fileURLToPath(new URL('./check-links.mjs', import.meta.url));
async function fixture(t) {
  const tempRoot = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, 'project-knowledge-check-'));
  t.after(async () => {
    const resolved = await realpath(directory);
    const relative = path.relative(tempRoot, resolved);
    assert.ok(relative.startsWith('project-knowledge-check-') && !relative.includes(path.sep));
    await rm(resolved, { recursive: true, force: true });
  });
  await mkdir(path.join(directory, 'docs'));
  await writeFile(path.join(directory, 'docs', 'space name.md'), '# Existing\n');
  return directory;
}

test('local links, imports and reference definitions resolve; examples are not treated as live links', async t => {
  const root = await fixture(t);
  const source = '# Entry\n[valid](docs/space%20name.md)\n[with title](<docs/space name.md> "title")\n[x][ref]\n[ref]: docs/space%20name.md\n@docs/space%20name.md\n`[example](missing-inline.md)`\n```md\n[example](missing-fence.md)\n```\n~~~\n[example](missing-tilde.md)\n~~~\n';
  await writeFile(path.join(root, 'AGENTS.md'), source);
  const result = await checkFiles(root, ['AGENTS.md']);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.references, 4);
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), source);
});

test('missing paths and explicit undefined references are reported at source lines', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'AGENTS.md'), '# Entry\n[missing](lost.md)\n[x][unknown]\n');
  const result = await checkFiles(root, ['AGENTS.md']);
  assert.equal(result.summary.errors, 2);
  assert.deepEqual(result.files[0].links.map(x => [x.line, x.reason]), [[2, 'missing-path'], [3, 'missing-reference-definition']]);
});

test('unverified external, anchor, HTML and complex syntax stay visibly unverified', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'AGENTS.md'), '[web](https://example.invalid)\n[heading](#nothing)\n[path](docs/space%20name.md#unknown)\n[complex](path(with-parens).md)\n<a href="no.html">x</a>\n');
  const result = await checkFiles(root, ['AGENTS.md']);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.summary.unchecked, 5);
});

test('path escape and symlink escape cannot validate outside-repository files', async t => {
  const root = await fixture(t);
  const inner = path.join(root, 'inner');
  await mkdir(inner);
  await symlink(path.join(root, 'docs'), path.join(inner, 'alias'), 'junction');
  await writeFile(path.join(inner, 'AGENTS.md'), '[outside](../docs/space%20name.md)\n[symlink](alias/space%20name.md)\n');
  const result = await checkFiles(inner, ['AGENTS.md']);
  assert.deepEqual(result.files[0].links.map(x => x.reason), ['outside-root', 'symlink-outside-root']);
  await assert.rejects(checkFiles(inner, ['../docs/space name.md']), /outside root/);
  await assert.rejects(checkFiles(inner, ['alias/space name.md']), /symlink outside root/);
});

test('CLI exit codes distinguish findings, success and invalid invocation', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root, 'good.md'), '# No file links\n');
  await writeFile(path.join(root, 'bad.md'), '[x](missing.md)\n');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(run('--root', root, '--file', 'good.md').status, 0);
  const bad = run('--root', root, '--file', 'bad.md');
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stdout).summary.errors, 1);
  assert.equal(run('--root', root).status, 2);
  assert.equal(run('--root', root, '--file', 'good.md', '--fix', 'all').status, 2);
});
