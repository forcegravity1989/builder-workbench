import fs from 'node:fs';
import path from 'node:path';

const text = value => String(value ?? '');
const html = value => text(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const md = value => text(value).replace(/[\r\n]+/g, ' ').replace(/[|<>`\[\]*_]/g, c => `\\${c}`);
const labels = { passed: '通过', failed: '失败', not_run: '未跑', not_applicable: '不适用' };
const layer = { gate: '工程检查', desktop: '真实桌面', browser: '浏览器', remote: '真实远端', local: '本地文件 / 进程' };
const url = value => value.split('/').map(encodeURIComponent).join('/');

// 结果按人能理解的四块呈现：基础检查、单元测试、知识库检查、E2E 用例（按旅程）。
// E2E 是带用例的步骤；其余按 plan.json 的稳定步骤 id 归类（test/test-headless 是单元测试，
// knowledge-tests 是知识库检查），plan.json 改步骤 id 时须同步这里。
const blockOf = step => {
  if (step.layer !== 'gate') return 'e2e';
  if (step.id === 'knowledge-tests') return 'knowledge';
  if (step.id === 'test' || step.id === 'test-headless') return 'unit';
  return 'basic';
};
const blockTitles = { basic: '基础检查', unit: '单元测试', knowledge: '知识库检查', e2e: 'E2E 用例（按旅程）' };
const count = steps => {
  const all = steps.flatMap(x => x.cases);
  return { steps: steps.length, stepPassed: steps.filter(x => x.status === 'passed').length, cases: all.length, casePassed: all.filter(x => x.status === 'passed').length };
};

export function writeReports(out, report) {
  const blocks = { basic: [], unit: [], knowledge: [], e2e: [] };
  for (const step of report.steps) blocks[blockOf(step)].push(step);
  const cases = report.steps.flatMap(step => step.cases.map(item => ({ ...item, stepId: step.id, layer: step.layer })));
  const summary = `检查 ${report.steps.filter(x => x.status === 'passed').length}/${report.steps.length} 通过 · 用例 ${cases.filter(x => x.status === 'passed').length}/${cases.length} 通过 · ${report.seconds} 秒`;
  const source = `${report.source.commit} · ${report.source.dirty ? '含未提交改动，不能冒充该 commit 的验证' : '干净检出'} · ${report.sourceUnchanged ? '验证期间源码未变' : '验证期间源码改变，结果无效'}`;
  const range = `${report.profile} · ${report.profile === 'headless' ? 'Linux 内核与底座检查（未跑桌面 E2E）' : 'Windows 门禁 + 本 profile 已注册 E2E'}`;

  // 摘要里的四个块：全绿只给块行；有失败才在对应块下逐条列。
  const renderGateBlock = key => {
    const steps = blocks[key];
    const stat = count(steps);
    const lines = [`### ${blockTitles[key]} · 检查 ${stat.stepPassed}/${stat.steps} 通过`, ''];
    if (!steps.length) lines.push('本执行范围没有此项。', '');
    else if (stat.stepPassed === stat.steps) lines.push(`全部通过：${steps.map(x => md(x.title)).join('；')}`, '');
    else lines.push('| 检查 | 结果 | 秒 | 说明 |', '|---|---|---:|---|',
      ...steps.map(x => `| ${md(x.title)} | ${labels[x.status]} | ${x.seconds ?? '—'} | ${md(x.message)} |`), '');
    return lines;
  };
  const renderE2eBlock = () => {
    const stat = count(blocks.e2e);
    const lines = [`### ${blockTitles.e2e} · 用例 ${stat.casePassed}/${stat.cases} 通过`, ''];
    if (!blocks.e2e.length) {
      lines.push('本执行范围没有运行 E2E。', '');
      return lines;
    }
    for (const step of blocks.e2e) {
      const ok = step.cases.filter(x => x.status === 'passed').length;
      lines.push(`- ${md(step.title)} · ${ok}/${step.cases.length} 通过`);
      for (const c of step.cases.filter(x => x.status !== 'passed')) lines.push(`  - ${md(c.title)}（${c.id}）：${labels[c.status]} — ${md(c.message)}`);
      if (step.status !== 'passed' && step.message && !step.cases.some(x => x.message === step.message)) lines.push(`  - 步骤说明：${md(step.message)}`);
    }
    return [...lines, ''];
  };
  const markdown = [
    `## 交付验证：${labels[report.status]}`, '', summary, '',
    `- 源码：${md(source)}`,
    `- 执行范围：${md(range)}`,
    `- 环境：${md(report.environment.platform)} / ${md(report.environment.arch)} / Node ${md(report.environment.node)}`,
    `- 本次执行：${report.runId}`, '',
    ...renderGateBlock('basic'),
    ...renderGateBlock('unit'),
    ...renderGateBlock('knowledge'),
    ...renderE2eBlock(),
    '证据包中的 report.html 可离线打开，每条用例含执行路径、期望结果与截图；result.json 是机器结果，manifest.json 列出文件 SHA-256。', '',
    '### 人审查什么', '',
    '- 此报告的源码是否就是 PR 最新提交；是否仍有未通过或未跑项。',
    '- 修复或新增行为是否有对应专项用例；用例判据与证据是否证明了需求。',
    '- 代码 Review 是否完成；未验范围是否可接受。此报告不代替合入决定。', '',
    ...report.limits.map(x => `- ${x}`), '',
    'GitHub CI 将此摘要写入任务 Summary，完整文件放在本次 Actions Artifact。工作会话发布独立验证 Review 时，按 AGENTS.md 把本次改动涉及旅程的真壳截图推到 shots 分支并内嵌；不要把本地图片相对路径直接粘到 PR。', '',
  ].join('\n');
  fs.writeFileSync(path.join(out, 'review.md'), markdown);

  const badge = status => `<span class="badge ${status}">${labels[status]}</span>`;
  const stepTable = steps => `<div class="card scroll"><table><thead><tr><th>检查</th><th>结果</th><th>秒</th><th>说明 / 日志</th></tr></thead><tbody>${steps.map(x => `<tr><td>${html(x.title)}</td><td>${badge(x.status)}</td><td>${x.seconds ?? '—'}</td><td>${html(x.message)}${x.log ? `<br><a href="${html(url(x.log))}">执行日志</a>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  const caseCards = step => step.cases.map(item => {
    const evidence = item.evidence.map(name => {
      const relative = `${item.stepId ?? step.id}/${name}`;
      if (/\.png$/i.test(name)) {
        const data = fs.readFileSync(path.join(out, relative)).toString('base64');
        return `<figure><img src="data:image/png;base64,${data}" alt="${html(item.title)}"><figcaption>${html(relative)}</figcaption></figure>`;
      }
      return `<p><a href="${html(url(relative))}">${html(name)}</a></p>`;
    }).join('');
    const meta = [
      item.path ? `<p><b>执行路径</b> ${html(item.path)}</p>` : '',
      item.expect ? `<p><b>期望结果</b> ${html(item.expect)}</p>` : '',
      `<p>${html(item.message || '')}</p>`,
    ].join('');
    return `<details><summary>${badge(item.status)} ${html(item.title)} <small>${html(layer[item.layer ?? step.layer])} · ${html(item.id)}</small></summary>${meta}${evidence || '<p>没有可核验的证据。</p>'}</details>`;
  }).join('');
  const gateSection = key => blocks[key].length
    ? `<h2>${blockTitles[key]}</h2>${stepTable(blocks[key])}`
    : `<h2>${blockTitles[key]}</h2><div class="card">本执行范围没有此项。</div>`;
  const e2eSection = blocks.e2e.length
    ? `<h2>${blockTitles.e2e}</h2><p>按旅程分组，展开查看执行路径、期望结果、真实截图与独立读回；“未跑”不会算作通过。</p>${blocks.e2e.map(step => `<h3>${html(step.title)} · ${step.cases.filter(x => x.status === 'passed').length}/${step.cases.length} 通过</h3>${caseCards(step)}`).join('')}`
    : `<h2>${blockTitles.e2e}</h2><div class="card">该执行范围没有运行 E2E。</div>`;
  fs.writeFileSync(path.join(out, 'report.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>交付验证 · ${html(report.runId)}</title>
<style>
:root{font-family:Segoe UI,Microsoft YaHei,sans-serif;color:#252b38;background:#f4f5f7;font-size:15px;line-height:1.65}*{box-sizing:border-box}body{margin:0}main{max-width:1080px;margin:auto;padding:32px 20px 64px}h1{font-size:30px;margin:10px 0}h2{font-size:20px;margin:26px 0 12px}h3{font-size:17px;margin:18px 0 8px}p{margin:10px 0}.card,details{background:#fff;border:1px solid #dde2e9;border-radius:12px;padding:18px 22px;margin:14px 0}.eyebrow,small{color:#657080}small{font-size:12px}.big{font-size:20px}code,.source{font-family:Consolas,monospace;font-size:12px;overflow-wrap:anywhere}.badge{display:inline-block;padding:2px 10px;margin-right:8px;border-radius:20px;font-size:13px;background:#e9ecf1;white-space:nowrap}.passed{background:#dcf4e8;color:#0c633d}.failed{background:#ffdedb;color:#9d2117}.not_run{background:#eee;color:#666}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #e5e8ee;padding:10px 6px;vertical-align:top;overflow-wrap:anywhere}td:last-child{max-width:440px}a{color:#245eac;overflow-wrap:anywhere}summary{cursor:pointer;overflow-wrap:anywhere}summary small{display:block;margin:6px 0 0}figure{margin:16px 0}img{width:100%;height:auto;border:1px solid #ddd}figcaption{font-size:12px;overflow-wrap:anywhere;color:#657080}.links{display:flex;gap:20px;flex-wrap:wrap}.notice{border-left:4px solid #e3b958;padding-left:12px}.scroll{overflow:auto}@media(max-width:600px){main{padding:20px 12px}h1{font-size:25px}.card,details{padding:14px}td,th{padding:8px 4px;font-size:13px}}@media print{details{break-inside:avoid}details::details-content{content-visibility:visible}main{max-width:none;padding:0}a{color:inherit}body{background:white}}
</style><main>
<div class="eyebrow">BUILDERS' WORKBENCH · 实际执行结果</div>
<h1>交付验证 ${badge(report.status)}</h1><p class="big">${html(summary)}</p>
<div class="card"><b>${html(range)}</b><p class="source">${html(source)}</p><p>环境 ${html(report.environment.platform)} / ${html(report.environment.arch)} · Node ${html(report.environment.node)}</p><p class="source">${html(report.startedAt)} → ${html(report.finishedAt)}<br>执行编号 ${html(report.runId)}</p><div class="links"><a href="result.json">机器结果</a><a href="manifest.json">文件清单与校验值</a><a href="review.md">PR 验证摘要</a></div></div>
<div class="notice"><b>通过的是这些检查，不等于 PR 已获准合入。</b><p>人查看：最新提交是否一致 → 专项用例是否覆盖本次改动 → 代码 Review 与未验范围。</p></div>
${gateSection('basic')}
${gateSection('unit')}
${gateSection('knowledge')}
${e2eSection}
<h2>尚未证明的范围</h2><div class="card">${report.limits.map(x => `<p>${html(x)}</p>`).join('')}</div>
</main></html>`);
}
