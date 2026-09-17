import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, link } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanKnowledge, writeReport, renderReport, markdownShape } from './scan-knowledge.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'knowledge-scan-test-'));
  t.after(async () => {
    const resolved = path.resolve(base);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('knowledge-scan-test-'));
    await rm(resolved, { recursive: true, force: true });
  });
  const root = path.join(base, 'repo');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'target'), { recursive: true });
  const duplicate = '重复段落需要明确来源，不能因为内容重复就自动删除。'.repeat(5);
  await writeFile(path.join(root, 'AGENTS.md'), '# 规则\n\n[指南](docs/guide.md)\n\n[缺失](missing.md)\n\n' + duplicate);
  await writeFile(path.join(root, 'docs/guide.md'), '# 指南\n\n' + duplicate + '\n\n| 验收点 | 场景/用例入口 | 运行证据 |\n| --- | --- | --- |\n| 可重开 | ./case | 未运行 |\n');
  await writeFile(path.join(root, 'CHANGELOG.md'), '# 记录\n\n## 2026-01-01\n\n- 修复一项\n\n' + '长段落。'.repeat(80));
  await writeFile(path.join(root, 'docs/page.html'), '<script>throw new Error("must not execute")</script>');
  await writeFile(path.join(root, 'target/ignored.md'), '# 不计入');
  const profile = path.join(base, 'profile.json');
  const config = { id: 'fixture', version: '1', include: ['.'], extensions: ['.md', '.html'], rules: [{ pattern: '^CHANGELOG\\.md$', type: '变更记录' }], acceptanceTableHeaders: ['验收点', '场景/用例入口', '运行证据'] };
  await writeFile(profile, JSON.stringify(config));
  return { base, root, profile, config };
}

test('counts content and links within declared scope without changing sources', async t => {
  const f = await fixture(t);
  const before = await readFile(path.join(f.root, 'AGENTS.md'));
  const result = await scanKnowledge(f);
  assert.equal(result.summary.files, 4);
  assert.equal(result.summary.linkErrors, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.summary.recognizedAcceptanceRows, 1);
  assert.equal(result.files.find(x => x.file === 'docs/guide.md').inbound.length, 1);
  assert.equal(result.files.find(x => x.file === 'docs/page.html').contentInspected, false);
  assert.equal(result.files.find(x => x.file === 'CHANGELOG.md').changelog.groups, 1);
  assert.equal(result.files.find(x => x.file === 'CHANGELOG.md').longParagraphs.length, 1);
  // Keep the caller's original spelling: Windows TEMP can contain an 8.3 alias,
  // while scanKnowledge returns a canonical root. Neither spelling may write in it.
  await assert.rejects(writeReport(result, path.join(f.root, 'report', 'nested')), /outside/);
  await assert.rejects(readFile(path.join(f.root, 'report', 'nested', 'knowledge.json')), { code: 'ENOENT' });
  await assert.rejects(writeReport(result, path.join(result.root, 'report')), /outside/);
  await writeReport(result, path.join(f.base, 'report'));
  assert.deepEqual(await readFile(path.join(f.root, 'AGENTS.md')), before);
  assert.ok((await readFile(path.join(f.base, 'report/knowledge.html'), 'utf8')).includes('STATIC SNAPSHOT'));
});

test('baseline distinguishes content changes, removals, and incompatible rule versions', async t => {
  const f = await fixture(t);
  const first = await scanKnowledge(f);
  const baseline = path.join(f.base, 'before.json');
  await writeFile(baseline, JSON.stringify(first));
  await writeFile(path.join(f.root, 'AGENTS.md'), '# 新版规则');
  await rm(path.join(f.root, 'docs/page.html'));
  await writeFile(path.join(f.root, 'docs/new.md'), '# 新增');
  const second = await scanKnowledge({ ...f, baseline });
  assert.deepEqual(second.baseline.changed, ['AGENTS.md']);
  assert.deepEqual(second.baseline.added, ['docs/new.md']);
  assert.deepEqual(second.baseline.removed, ['docs/page.html']);
  await writeFile(f.profile, JSON.stringify({ ...f.config, version: '2' }));
  assert.equal((await scanKnowledge({ ...f, baseline })).baseline.comparable, false);
});

test('resolves directory aliases, allows outside reports, and rejects aliases into sources', async t => {
  const f = await fixture(t);
  const alias = path.join(f.base, 'alias');
  await symlink(path.resolve(f.base), alias, process.platform === 'win32' ? 'junction' : 'dir');
  const result = await scanKnowledge({ root: path.join(alias, 'repo'), profile: f.profile });
  await writeReport(result, path.join(alias, 'external', 'nested'));
  assert.equal(JSON.parse(await readFile(path.join(f.base, 'external/nested/knowledge.json'), 'utf8')).root, result.root);
  await assert.rejects(writeReport(result, path.join(alias, 'repo', 'report', 'nested')), /outside/);
  await assert.rejects(readFile(path.join(f.root, 'report/nested/knowledge.json')), { code: 'ENOENT' });
});

test('refuses report files hard-linked to sources before writing either output', async t => {
  const f = await fixture(t);
  const result = await scanKnowledge(f);
  const source = path.join(f.root, 'AGENTS.md');
  const before = await readFile(source);
  const out = path.join(f.base, 'hard-link-report');
  await mkdir(out);
  await link(source, path.join(out, 'knowledge.html'));
  await assert.rejects(writeReport(result, out), /Unsafe report destination/);
  assert.deepEqual(await readFile(source), before);
  await assert.rejects(readFile(path.join(out, 'knowledge.json')), { code: 'ENOENT' });
});

test('refuses outside-root includes and does not follow directory links', async t => {
  const f = await fixture(t);
  await writeFile(f.profile, JSON.stringify({ ...f.config, include: ['../'] }));
  await assert.rejects(scanKnowledge(f), /outside root/);
  await writeFile(f.profile, JSON.stringify(f.config));
  const external = path.join(f.base, 'external');
  await mkdir(external);
  await writeFile(path.join(external, 'private.md'), '# Outside');
  await symlink(external, path.join(f.root, 'alias'), 'junction');
  const result = await scanKnowledge(f);
  assert.ok(!result.files.some(x => x.file.includes('alias')));
  assert.ok(result.skipped.some(x => x.file === 'alias' && x.reason === 'symbolic-link'));
  await symlink(f.root, path.join(f.base, 'out-alias'), 'junction');
  await assert.rejects(writeReport(result, path.join(f.base, 'out-alias/report')), /outside/);
});

test('fenced examples are excluded and embedded hostile source cannot break script data', () => {
  const shape = markdownShape('# Title\n\n```md\n## fake\n| A | B |\n```\n\nReal paragraph');
  assert.equal(shape.headings.length, 1);
  assert.equal(shape.paragraphs.length, 1);
  const html = renderReport('<script>const data=/*__KNOWLEDGE_DATA__*/null;</script>', { text: '</script><script>globalThis.pwned=1</script>&\u2028' });
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(html.includes('\\u2028'));
});

test('--check writes reviewable report and fails on mechanical errors; normal scan succeeds', async t => {
  const f = await fixture(t);
  const cli = fileURLToPath(new URL('./scan-knowledge.mjs', import.meta.url));
  const args = [cli, '--root', f.root, '--profile', f.profile, '--out', path.join(f.base, 'cli-report')];
  const normal = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.equal(normal.status, 0, normal.stderr);
  const gate = spawnSync(process.execPath, [...args, '--check'], { encoding: 'utf8' });
  assert.equal(gate.status, 1, gate.stderr);
  assert.equal(JSON.parse(await readFile(path.join(f.base, 'cli-report/knowledge.json'), 'utf8')).summary.linkErrors, 1);
});
