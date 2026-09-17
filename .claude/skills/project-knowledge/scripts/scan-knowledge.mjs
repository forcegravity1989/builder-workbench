#!/usr/bin/env node
// Read-only source scan. Only explicit outside-repository report outputs are written.
import { readFile, readdir, lstat, realpath, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { checkFiles } from './check-links.mjs';

const normalized = value => value.split(path.sep).join('/');
const hash = value => createHash('sha256').update(value).digest('hex');
const within = (root, target) => {
  const rel = path.relative(root, target);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
};
const blocked = new Set(['.git', 'node_modules', 'target', 'worktrees', '.worktrees']);

// Includes cannot use a symbolic-link ancestor to escape the declared root.
async function safeSource(root, relative) {
  const absolute = path.resolve(root, relative);
  if (!within(root, absolute)) throw new Error(`Profile includes path outside root: ${relative}`);
  let current = root;
  for (const segment of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let info;
    try { info = await lstat(current); }
    catch (error) { if (error.code === 'ENOENT') return { missing: true }; throw error; }
    if (info.isSymbolicLink()) return { symlink: true };
  }
  return { absolute };
}

export function markdownShape(text) {
  let fence;
  const lines = text.split(/\r?\n/).map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  });
  const headings = [], paragraphs = [];
  let buffer = [], start = 0;
  function flush() {
    if (!buffer.length) return;
    const content = buffer.join(' ').replace(/\s+/g, ' ').trim();
    paragraphs.push({ line: start, chars: [...content].length, text: content });
    buffer = [];
  }
  let listItems = 0;
  lines.forEach((line, index) => {
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    const list = /^\s*(?:[-*+] |\d+[.)] )/.test(line);
    if (heading) headings.push({ level: heading[1].length, title: heading[2], line: index + 1 });
    if (list) listItems++;
    if (!line.trim() || heading || list || /^\s*(?:\||>|---+$|===+$)/.test(line)) flush();
    else { if (!buffer.length) start = index + 1; buffer.push(line.trim()); }
  });
  flush();
  return { lines, headings, paragraphs, listItems };
}

function acceptanceRows(lines, wanted) {
  if (!wanted?.length) return [];
  const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(s => s.trim());
  const rows = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].trim().startsWith('|') || !/^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) continue;
    const header = cells(lines[i]);
    if (!wanted.every(label => header.includes(label))) continue;
    for (let j = i + 2; j < lines.length && lines[j].trim().startsWith('|'); j++) {
      const values = cells(lines[j]);
      rows.push({ line: j + 1, values: Object.fromEntries(wanted.map(label => [label, values[header.indexOf(label)] ?? ''])) });
    }
  }
  return rows;
}

export async function scanKnowledge({ root: rootArg, profile: profilePath, baseline: baselinePath }) {
  const root = await realpath(path.resolve(rootArg));
  if (!(await lstat(root)).isDirectory()) throw new Error('Root must be a directory.');
  const profileBytes = await readFile(profilePath);
  const profile = JSON.parse(profileBytes.toString('utf8'));
  if (!Array.isArray(profile.include) || !Array.isArray(profile.extensions) || !Array.isArray(profile.rules)) throw new Error('Profile requires include, extensions and rules arrays.');
  if (!profile.include.length) throw new Error('Empty scan scope is not allowed.');
  const rules = profile.rules.map(rule => ({ ...rule, matcher: new RegExp(rule.pattern, 'i'), fields: (rule.fields ?? []).map(field => ({ ...field, matcher: new RegExp(field.pattern, 'i') })) }));
  const files = [], skipped = [], errors = [], seen = new Set();
  const excludes = (profile.exclude ?? []).map(x => x.replace(/\\/g, '/').replace(/\/$/, ''));
  async function walk(absolute) {
    const relative = normalized(path.relative(root, absolute));
    if (seen.has(relative)) return;
    seen.add(relative);
    if (relative.split('/').some(segment => blocked.has(segment)) || excludes.some(x => relative === x || relative.startsWith(`${x}/`))) {
      skipped.push({ file: relative, reason: 'excluded' }); return;
    }
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) { skipped.push({ file: relative, reason: 'symbolic-link' }); return; }
    if (info.isDirectory()) {
      for (const entry of (await readdir(absolute)).sort()) await walk(path.join(absolute, entry));
      return;
    }
    const extension = path.extname(relative).toLowerCase();
    if (!info.isFile() || !profile.extensions.includes(extension)) return;
    const bytes = await readFile(absolute);
    const content = bytes.toString('utf8');
    const rule = rules.find(item => item.matcher.test(relative));
    const shape = extension === '.md' ? markdownShape(content) : null;
    const missingFields = shape ? (rule?.fields ?? []).filter(field => !field.matcher.test(shape.lines.join('\n'))).map(field => field.label) : [];
    const file = {
      file: relative, url: pathToFileURL(absolute).href, type: rule?.type ?? '未分类',
      scope: relative.startsWith('.claude/skills/') ? '开发方法' : '项目知识',
      extension, bytes: bytes.length, lines: content.split(/\r?\n/).length, sha256: hash(bytes),
      title: shape?.headings[0]?.title ?? path.basename(relative),
      headings: shape?.headings ?? [], paragraphs: shape?.paragraphs ?? [],
      listItems: shape?.listItems ?? null, missingFields,
      longParagraphs: shape?.paragraphs.filter(item => item.chars > (profile.longParagraphChars ?? 300)) ?? [],
      acceptanceRows: shape ? acceptanceRows(shape.lines, profile.acceptanceTableHeaders) : [],
      links: [], inbound: [], contentInspected: Boolean(shape)
    };
    if (shape && file.type === '变更记录') file.changelog = { groups: shape.headings.filter(h => h.level === 2).length, listItems: shape.listItems, paragraphs: shape.paragraphs.length, longestParagraph: Math.max(0, ...shape.paragraphs.map(p => p.chars)) };
    files.push(file);
  }
  for (const relative of profile.include) {
    const source = await safeSource(root, relative);
    if (source.missing || source.symlink) { skipped.push({ file: relative, reason: source.missing ? 'selected-path-missing' : 'symbolic-link' }); continue; }
    try { await walk(source.absolute); }
    catch (error) { errors.push({ file: relative, message: error.message }); }
  }
  files.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  const byPath = new Map(files.map(file => [file.file, file]));
  for (const file of files.filter(file => file.extension === '.md')) {
    try {
      const checked = await checkFiles(root, [file.file]);
      if (checked.files[0].sha256 !== file.sha256) errors.push({ file: file.file, message: 'File changed during scan; rerun for a consistent snapshot.' });
      file.links = checked.files[0].links;
      for (const link of file.links) if (link.status === 'exists' && byPath.has(link.resolved)) byPath.get(link.resolved).inbound.push({ file: file.file, line: link.line });
    } catch (error) { errors.push({ file: file.file, message: error.message }); }
  }
  const paragraphIndex = new Map();
  for (const file of files) for (const paragraph of file.paragraphs) {
    if (paragraph.chars < (profile.duplicateParagraphChars ?? 80)) continue;
    const key = hash(paragraph.text);
    const occurrences = paragraphIndex.get(key) ?? { text: paragraph.text, chars: paragraph.chars, occurrences: [] };
    occurrences.occurrences.push({ file: file.file, line: paragraph.line });
    paragraphIndex.set(key, occurrences);
  }
  const featureGroups = {};
  if (profile.featureDirectory) for (const file of files) {
    const prefix = `${profile.featureDirectory}/`;
    if (!file.file.startsWith(prefix)) continue;
    const tail = file.file.slice(prefix.length).split('/');
    if (tail.length < 2) continue;
    (featureGroups[tail[0]] ??= []).push(file.file);
  }
  const links = files.flatMap(file => file.links.map(link => ({ file: file.file, ...link })));
  const result = {
    schemaVersion: 1, scannerVersion: '0.2.0-pilot', root, generatedAt: new Date().toISOString(),
    profile: { id: profile.id, version: profile.version, status: profile.status, sha256: hash(profileBytes), contractSource: profile.contractSource, scopeNote: profile.scopeNote, suggestedSessions: profile.suggestedSessions ?? [], include: profile.include, exclude: profile.exclude ?? [] },
    thresholds: { longParagraphChars: profile.longParagraphChars ?? 300, duplicateParagraphChars: profile.duplicateParagraphChars ?? 80 },
    summary: { files: files.length, markdown: files.filter(file => file.extension === '.md').length, references: links.length, linkErrors: links.filter(link => link.status === 'error').length, uncheckedReferences: links.filter(link => link.status === 'unchecked' || link.uncheckedPart).length, longParagraphs: files.reduce((sum, file) => sum + file.longParagraphs.length, 0), recognizedAcceptanceRows: files.reduce((sum, file) => sum + file.acceptanceRows.length, 0) },
    files, errors, skipped, featureGroups,
    duplicates: [...paragraphIndex.values()].filter(group => group.occurrences.length > 1),
    baseline: null,
    limits: ['文件/链接存在不证明语义正确、实际加载或运行通过。', '验收表行数只统计指定表头；不能推算全部验收覆盖率。', '无入链仅指扫描范围的 Markdown 链接，不证明未使用。', '未提供治理验收、合入或反哺记录；无法判断整改完成。', ...(profile.limits ?? [])]
  };
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    if (baseline.schemaVersion !== result.schemaVersion || baseline.scannerVersion !== result.scannerVersion || baseline.root !== root || baseline.profile?.sha256 !== result.profile.sha256) result.baseline = { comparable: false, reason: '仓根、扫描器版本或映射不同，不能直接比较。' };
    else {
      const previous = new Map(baseline.files.map(file => [file.file, file.sha256]));
      result.baseline = { comparable: true, generatedAt: baseline.generatedAt,
        added: files.filter(file => !previous.has(file.file)).map(file => file.file),
        changed: files.filter(file => previous.has(file.file) && previous.get(file.file) !== file.sha256).map(file => file.file),
        removed: baseline.files.filter(file => !byPath.has(file.file)).map(file => file.file) };
    }
  }
  return result;
}

export function renderReport(template, data) {
  const marker = '/*__KNOWLEDGE_DATA__*/null';
  if (!template.includes(marker)) throw new Error('Report template marker missing.');
  return template.replace(marker, () => JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'));
}

export async function writeReport(result, outArg) {
  const out = path.resolve(outArg);
  if (within(result.root, out)) throw new Error('Report output must be outside the scanned root.');
  // Refuse symbolic-link output components and files, including an existing symlink.
  let current = path.parse(out).root;
  for (const segment of out.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symbolic-link output is not allowed: ${current}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const name of ['knowledge.json', 'knowledge.html']) {
    try { const info = await lstat(path.join(out, name)); if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Unsafe report destination: ${name}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const template = await readFile(new URL('../assets/knowledge-report.html', import.meta.url), 'utf8');
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'knowledge.json'), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(path.join(out, 'knowledge.html'), renderReport(template, result));
}

async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--check') { options.check = true; continue; }
    if (!['--root', '--profile', '--out', '--baseline'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Usage: scan-knowledge.mjs --root ROOT --profile JSON --out OUTSIDE_ROOT [--baseline JSON] [--check]');
    const key = args[i++].slice(2);
    if (options[key]) throw new Error(`Duplicate --${key}`);
    options[key] = args[i];
  }
  if (!options.root || !options.profile || !options.out) throw new Error('--root, --profile and --out are required.');
  const result = await scanKnowledge(options);
  await writeReport(result, options.out);
  console.log(JSON.stringify({ output: path.resolve(options.out), ...result.summary, readErrors: result.errors.length, skipped: result.skipped.length }, null, 2));
  if (options.check && (result.errors.length || result.summary.linkErrors)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
