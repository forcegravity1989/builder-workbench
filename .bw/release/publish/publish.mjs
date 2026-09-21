// 正式发布入口（ADR 0005 发布节）：人明确授权后运行。
// 绑定链四记录核对（出包记录 + 门禁验证 run + 验包 run + tag 指向）→ 生成 tag →
// GitHub Release（正本存储）→ 下载资产复算 SHA-256 独立读回 → 收据落盘。
// 缺任一绑定即拒发：非零退出、人话原因、零远端写入。不提供第二条发布路径；
// 授权动作本身不由脚本代替——--authorized-by 只是把人的授权写入记录。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA = /^[0-9a-f]{64}$/;

// 纯函数：绑定校验，返回拒发原因列表；空数组 = 绑定齐备。看护见 publish.test.mjs。
export function validateBindings({ version, packResult, artifactSha256, packRun, installerRun, installerSetupIdentity, allowDirty }) {
  const refuse = [];
  const expectedArtifact = `BuildersWorkbench-${version}-Setup.exe`;
  if (!packResult || packResult.v !== 1 || packResult.ok !== true) {
    refuse.push('出包记录（pack-result.json）缺失或 ok≠true');
  } else {
    if (packResult.artifact !== expectedArtifact) refuse.push(`出包记录产物名 ${packResult.artifact} ≠ ${expectedArtifact}（产物名必须由版本串派生，不接受改名件）`);
    if (!COMMIT.test(packResult.revision ?? '')) refuse.push('出包记录缺 40 位构建修订（缺省即 unknown，不当干净）');
    if (packResult.source_unchanged !== true) refuse.push('出包记录 source_unchanged≠true：出包期间源码变过，产物身份不可信');
    if (packResult.dirty !== false && !allowDirty) refuse.push('出包时构建树是脏的；确要发布须 --allow-dirty 显式放行并写入收据');
    if (!SHA.test(packResult.sha256 ?? '')) refuse.push('出包记录缺 sha256');
    else if (artifactSha256 !== packResult.sha256) refuse.push(`候选包现场复算 SHA-256 与出包记录不一致：记录 ${packResult.sha256}，现场 ${artifactSha256}`);
  }
  if (!packRun || packRun.v !== 1 || packRun.profile !== 'pack' || packRun.status !== 'passed') {
    refuse.push('门禁验证记录缺失，或不是 profile=pack 且 status=passed 的完整通过运行');
  } else {
    if (packRun.sourceUnchanged !== true) refuse.push('门禁验证 run 源码有变化，结果已失效');
    if (packRun.source?.dirty && !allowDirty) refuse.push('门禁验证跑在脏树上；确要发布须 --allow-dirty 显式放行并写入收据');
  }
  if (!installerRun || installerRun.v !== 1 || installerRun.profile !== 'installer' || installerRun.status !== 'passed') {
    refuse.push('验包记录缺失，或不是 profile=installer 且 status=passed 的完整通过运行');
  } else if (installerRun.sourceUnchanged !== true) {
    refuse.push('验包 run 源码有变化，结果已失效');
  }
  // 三记录同源：门禁验证、验包与出包必须在同一构建修订上；source 缺省=unknown，同样拒。
  const revision = packResult?.revision;
  if (COMMIT.test(revision ?? '')) {
    if (packRun && packRun.source?.commit !== revision) refuse.push(`门禁验证源码 ${packRun.source?.commit ?? '缺省'} ≠ 构建修订 ${revision}`);
    if (installerRun && installerRun.source?.commit !== revision) refuse.push(`验包源码 ${installerRun.source?.commit ?? '缺省'} ≠ 构建修订 ${revision}`);
  }
  if (!installerSetupIdentity || installerSetupIdentity.sha256 !== packResult?.sha256) {
    refuse.push('验包所测安装包 SHA-256 与出包记录不一致或缺失（验的不是这个包）');
  }
  return refuse;
}

// 纯函数：远端状态校验（拒发条件 4/5），由 main 流程用只读 git/gh 探测喂入。
export function validateRemoteState({ version, revision, isAncestorOfMain, remoteTagExists, localTagExists, releaseExists }) {
  const refuse = [];
  if (!isAncestorOfMain) refuse.push(`构建修订 ${revision} 不在 origin/main 上（未合入或已被改写），不能发布`);
  if (remoteTagExists) refuse.push(`远端已有 tag ${version}；同号不重发（人先删或开下一号）`);
  if (localTagExists) refuse.push(`本地已有 tag ${version}；同号不重发（人先 git tag -d）`);
  if (releaseExists) refuse.push(`Release ${version} 已存在；同号不重发`);
  return refuse;
}

function parseArgs(argv) {
  const opts = { allowDirty: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${key} 缺参数值`);
      return argv[++i];
    };
    if (key === '--version') { opts.version = next(); continue; }
    if (key === '--pack-run') { opts.packRunDir = next(); continue; }
    if (key === '--installer-run') { opts.installerRunDir = next(); continue; }
    if (key === '--notes-file') { opts.notesFile = next(); continue; }
    if (key === '--authorized-by') { opts.authorizedBy = next(); continue; }
    if (key === '--repo') { opts.repo = next(); continue; }
    if (key === '--allow-dirty') { opts.allowDirty = true; continue; }
    throw new Error(`不认识参数 ${key}`);
  }
  const usage = '用法：node .bw/release/publish/publish.mjs --version <tag串> --pack-run <pack验证run目录> --installer-run <验包run目录> --notes-file <版本说明.md> --authorized-by <授权记录> [--repo <owner/name>] [--allow-dirty]';
  if (!opts.version || !VERSION.test(opts.version)) throw new Error(`${usage}\n（版本串=tag 串：首字符须字母或数字，其余只用字母、数字和 . _ + -）`);
  for (const required of ['packRunDir', 'installerRunDir', 'notesFile', 'authorizedBy']) {
    if (!opts[required] || !String(opts[required]).trim()) throw new Error(usage);
  }
  return opts;
}

function publish() {
  const opts = parseArgs(process.argv.slice(2));
  const command = (exe, argv, options = {}) => execFileSync(exe, argv, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 300000, ...options }).trim();
  const git = (...argv) => command('git', argv);
  const gh = (...argv) => command('gh', argv);
  // 资产上传/下载是大文件，慢网下 300s 会误报读回失败（且此时 Release 已发出）：单独放宽。
  const ghLong = (...argv) => command('gh', argv, { timeout: 1800000 });
  const root = git('rev-parse', '--show-toplevel');

  const artifactDir = path.join(root, '.bw/release/out', opts.version);
  const artifactName = `BuildersWorkbench-${opts.version}-Setup.exe`;
  const artifactPath = path.join(artifactDir, artifactName);
  if (!fs.existsSync(artifactPath)) throw new Error(`候选包不在：${artifactPath}（先出包：.bw/release/pack/pack.cmd --version ${opts.version} --workdir ${root}）`);
  const artifactBytes = fs.readFileSync(artifactPath);
  const artifactSha256 = sha256(artifactBytes);

  const packResult = fs.existsSync(path.join(artifactDir, 'pack-result.json')) ? json(path.join(artifactDir, 'pack-result.json')) : null;
  const packRun = fs.existsSync(path.join(opts.packRunDir, 'result.json')) ? json(path.join(opts.packRunDir, 'result.json')) : null;
  const installerRun = fs.existsSync(path.join(opts.installerRunDir, 'result.json')) ? json(path.join(opts.installerRunDir, 'result.json')) : null;
  const identityFile = path.join(opts.installerRunDir, 'installer', 'setup-identity.json');
  const installerSetupIdentity = fs.existsSync(identityFile) ? json(identityFile) : null;

  const refuse = validateBindings({ version: opts.version, packResult, artifactSha256, packRun, installerRun, installerSetupIdentity, allowDirty: opts.allowDirty });
  const revision = packResult?.revision;
  const repo = opts.repo || git('remote', 'get-url', 'origin').match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1];
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new Error('无法识别 GitHub 仓库（--repo 可显式指定）');

  // 远端状态与 gh 活性全部是只读预检，任何失败都发生在第一次远端写入之前（零写入退出）。
  if (refuse.length === 0) {
    try { gh('api', 'user', '--silent'); } catch (error) { throw new Error(`gh 不可用或未登录（零远端写入）：${String(error.message).split('\n')[0]}`); }
    git('fetch', '--quiet', 'origin', 'main');
    const isAncestorOfMain = (() => { try { execFileSync('git', ['merge-base', '--is-ancestor', revision, 'origin/main'], { cwd: root, stdio: 'ignore' }); return true; } catch { return false; } })();
    const remoteTagExists = git('ls-remote', '--tags', 'origin', `refs/tags/${opts.version}`) !== '';
    const localTagExists = (() => { try { git('rev-parse', `refs/tags/${opts.version}`); return true; } catch { return false; } })();
    let releaseExists;
    try { gh('release', 'view', opts.version, '--repo', repo); releaseExists = true; } catch (error) {
      const detail = `${error.stderr ?? ''} ${error.message ?? ''}`;
      if (/not found/i.test(detail)) releaseExists = false;
      else throw new Error(`Release 存在性检查失败，不是「不存在」（零远端写入）：${detail.split('\n')[0]}`);
    }
    refuse.push(...validateRemoteState({ version: opts.version, revision, isAncestorOfMain, remoteTagExists, localTagExists, releaseExists }));
  }
  if (refuse.length) {
    console.error(`拒发 ${opts.version}：绑定不齐（${refuse.length} 条）`);
    for (const reason of refuse) console.error(`- ${reason}`);
    process.exitCode = 1;
    return;
  }

  const notes = fs.readFileSync(opts.notesFile, 'utf8');
  if (!notes.trim()) throw new Error('版本说明是空的；发布正文必须带版本说明（version-report 备稿）');

  const installerStep = installerRun.steps.find(step => step.id === 'installer');
  const caseCount = installerStep?.cases ?? [];
  const receiptDir = path.join(root, '.bw/release/out/publish', opts.version);
  fs.mkdirSync(receiptDir, { recursive: true });

  // tag message 从记录渲染，不手写（v0.4 教训：手写记录与实际产物对不上）。
  const tagMessage = `${opts.version} —— 正式发布（绑定记录由 publish.mjs 生成，勿手写）

产物: ${artifactName} (${artifactBytes.length} 字节)
SHA-256: ${artifactSha256}
构建修订: ${revision} (dirty=${packResult.dirty}, source_unchanged=${packResult.source_unchanged}, 出包 ${packResult.packed_at})
门禁验证: ${packRun.runId} (profile=pack, status=${packRun.status})
验包: ${installerRun.runId} (profile=installer, 用例 ${caseCount.filter(x => x.status === 'passed').length}/${caseCount.length})
授权: ${opts.authorizedBy}
发布存储: GitHub Releases (${repo})${opts.allowDirty && (packResult.dirty || packRun.source?.dirty) ? '\n注: 本次以 --allow-dirty 显式放行脏树记录' : ''}
`;
  git('tag', '-a', opts.version, revision, '-F', '-', { input: tagMessage });
  try {
    git('push', 'origin', `refs/tags/${opts.version}`);
  } catch (error) {
    throw new Error(`tag ${opts.version} 已在本地创建但推送失败：${String(error.message).split('\n')[0]}——远端没有写入；git tag -d ${opts.version} 后修复重跑`);
  }
  const tagReadback = git('ls-remote', 'origin', `refs/tags/${opts.version}^{}`);
  if (!tagReadback.startsWith(revision)) throw new Error(`tag 读回不指向构建修订：${tagReadback}（tag 已推到远端，人工核对后 git push origin :refs/tags/${opts.version} 删除或继续发布）`);

  const body = `${notes.trim()}

---
## 绑定记录（publish.mjs 机器生成，勿手改）
- tag：\`${opts.version}\` → 构建修订 \`${revision}\`
- 产物：\`${artifactName}\` · ${artifactBytes.length} 字节 · SHA-256 \`${artifactSha256}\`
- 出包记录：\`out/${opts.version}/pack-result.json\`（packed_at ${packResult.packed_at}，dirty=${packResult.dirty}，source_unchanged=${packResult.source_unchanged}）
- 门禁验证：verify run \`${packRun.runId}\`（profile=pack，status=passed）
- 验包：verify run \`${installerRun.runId}\`（profile=installer，用例 ${caseCount.filter(x => x.status === 'passed').length}/${caseCount.length}，所测包 SHA 与出包记录一致）
- 授权：${opts.authorizedBy}${opts.allowDirty && (packResult.dirty || packRun.source?.dirty) ? '（--allow-dirty 显式放行：含脏树记录）' : ''}
`;
  const bodyFile = path.join(receiptDir, 'release-body.md');
  fs.writeFileSync(bodyFile, body);
  try {
    ghLong('release', 'create', opts.version, artifactPath, '--repo', repo, '--title', opts.version, '--notes-file', bodyFile);
  } catch (error) {
    throw new Error(`tag ${opts.version} 已推到远端，Release 创建失败：${String(error.message).split('\n')[0]}——中途态：人工核对后删远端 tag（git push origin :refs/tags/${opts.version}）或修复后重发（同号存在性检查会拒重复 Release）`);
  }

  // 独立读回：Release 元数据 + 下载资产复算哈希。读回不一致是重大事故，如实炸，不回收 Release。
  const release = JSON.parse(gh('release', 'view', opts.version, '--repo', repo, '--json', 'tagName,url,assets'));
  if (release.tagName !== opts.version) throw new Error(`Release tag 读回不一致：${release.tagName}`);
  const asset = release.assets.find(item => item.name === artifactName);
  if (!asset) throw new Error(`Release 资产读回缺 ${artifactName}`);
  if (asset.size !== artifactBytes.length) throw new Error(`Release 资产大小读回不一致：${asset.size} ≠ ${artifactBytes.length}`);
  const downloadDir = path.join(receiptDir, 'asset-readback');
  fs.mkdirSync(downloadDir, { recursive: true });
  ghLong('release', 'download', opts.version, '--repo', repo, '--pattern', artifactName, '--dir', downloadDir, '--clobber');
  const downloadedSha = sha256(fs.readFileSync(path.join(downloadDir, artifactName)));
  if (downloadedSha !== artifactSha256) throw new Error(`已发布资产下载复算 SHA-256 不一致：${downloadedSha} ≠ ${artifactSha256}（重大事故，Release 保留待人工处置）`);

  const receipt = {
    v: 1, version: opts.version, repo, tag: opts.version, revision,
    artifact: { name: asset.name, bytes: asset.size, sha256: artifactSha256, url: asset.apiUrl },
    packResult: { packed_at: packResult.packed_at, dirty: packResult.dirty, source_unchanged: packResult.source_unchanged },
    packRun: { runId: packRun.runId, profile: packRun.profile, status: packRun.status, source: packRun.source },
    installerRun: { runId: installerRun.runId, profile: installerRun.profile, status: installerRun.status, cases: `${caseCount.filter(x => x.status === 'passed').length}/${caseCount.length}` },
    release: { url: release.url, assetReadbackSha256: downloadedSha, readbackMatch: true },
    authorization: { by: opts.authorizedBy, allowDirty: opts.allowDirty },
    publishedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(receiptDir, 'publish-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(`已发布 ${opts.version}：${release.url}`);
  console.log(`收据：${path.join(receiptDir, 'publish-receipt.json')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { publish(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
