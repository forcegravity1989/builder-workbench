// 用例六件事：
// 1. 保护规则：设置属于[设置]特性——修改配置后杀掉进程重启，界面与磁盘读回必须一致；
//    顺带看护真壳能启动渲染。测试只操作本次运行拥有的进程与隔离目录。
// 2. 环境与数据：Windows 真壳（desktop.ps1 以隔离 BW_DB/BW_WORKSPACES/WebView2 目录启动）、
//    Playwright 通过 CDP 附着真实 WebView2、独立 Windows 桌面。
// 3. 真实动作：initial 相——启动真壳进设置屏，改工作区根目录并点保存；
//    desktop.ps1 杀掉自己的壳；restart 相——重启真壳。
// 4. 独立读回：settings.toml 磁盘内容与重启后界面输入框分别读回，与保存值一致。
// 5. 证据：两相截图、壳日志、被测二进制 SHA-256、保存前后 settings.toml 副本，全部写入本步骤输出目录。
// 6. 清理：进程与临时目录由 desktop.ps1 按拥有 PID 与 run-id 归属标记清理；本脚本不额外清理。
// 结果协议：整条旅程只报一个用例 settings-restart-roundtrip。initial 相成功时不报用例
// （证据留给 restart 相汇总）；任何一相失败即报 failed 并附已有证据。
import { chromium, expect } from 'playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = name => {
  const i = args.indexOf(`--${name}`);
  if (i < 0 || !args[i + 1]) throw new Error(`Missing --${name}`);
  return args[i + 1];
};
const out = arg('out');
const data = arg('data');
const workspace = arg('workspace');
const phase = arg('phase');
if (!['initial', 'restart'].includes(phase)) throw new Error('Unknown phase');

const CASE_ID = 'settings-restart-roundtrip';
const CASE = {
  id: CASE_ID,
  title: '修改设置杀进程重启后，界面与磁盘读回一致',
  path: '启动真壳进设置屏 → 修改工作区根目录并保存 → 杀壳进程 → 重启真壳 → 分别读回界面与 settings.toml',
  expect: '重启后设置界面显示保存的目录；settings.toml 磁盘读回一致；重启前后证据齐全',
  status: 'not_run',
  evidence: [],
};
// restart 相汇总两相的固定证据；readCases 要求逐项为非空真实文件。
const FULL_EVIDENCE = [
  'subject.json',
  'initial-shell.log', 'initial-webview.json', 'settings-initial.png', 'settings-readback.toml',
  'restart-shell.log', 'restart-webview.json', 'settings-restart.png', 'restart-readback.toml',
];

let browser;
let page;
const cases = [];
const settings = path.join(data, 'assets', 'settings.toml');
const row = () => page.locator('.set-row').filter({ hasText: '工作区根目录' });
// Read the single path value written by Rust's TOML serializer (basic or literal string).
const savedWorkspace = () => {
  try {
    const value = fs.readFileSync(settings, 'utf8').match(/^workspaces_root\s*=\s*(.+)$/m)?.[1].trim();
    if (value?.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    return value ? JSON.parse(value) : undefined;
  } catch (error) {
    // Polling must keep waiting while the first async write has not created/completed the file.
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined;
    throw error;
  }
};
const finish = (status, message, evidence) => {
  cases.push({ ...CASE, status, message, evidence: [...new Set(evidence)] });
};

try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('port')}`, { timeout: 30000 });
  fs.writeFileSync(path.join(out, `${phase}-webview.json`), JSON.stringify({ browserVersion: browser.version(), nodeVersion: process.version }, null, 2));
  const context = browser.contexts()[0];
  if (!context) throw new Error('No real WebView2 context');
  page = context.pages()[0] || await context.waitForEvent('page', { timeout: 30000 });
  page.setDefaultTimeout(30000);
  if (phase === 'initial') {
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
    await expect.poll(() => fs.readFileSync(path.join(out, 'initial-shell.log'), 'utf8'), { timeout: 30000 }).toContain('[BW_VIEW] settings');
    await expect.poll(() => fs.readFileSync(path.join(out, 'initial-shell.log'), 'utf8'), { timeout: 30000 }).toContain('[BW_BOOT]');
    await page.screenshot({ path: path.join(out, 'settings-initial.png'), fullPage: true });
    await row().getByRole('textbox').fill(workspace);
    await row().getByRole('button', { name: '保存', exact: true }).click();
    await expect.poll(savedWorkspace, { timeout: 45000 }).toBe(workspace);
    await expect.poll(() => fs.existsSync(workspace)).toBe(true);
    fs.copyFileSync(settings, path.join(out, 'settings-readback.toml'));
    // 成功不报用例：本相只是旅程前半段，结论由 restart 相统一给出。
  } else {
    await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
    await expect(row().getByRole('textbox')).toHaveValue(workspace);
    await expect.poll(savedWorkspace).toBe(workspace);
    fs.copyFileSync(settings, path.join(out, 'restart-readback.toml'));
    await page.screenshot({ path: path.join(out, 'settings-restart.png'), fullPage: true });
    finish('passed', undefined, FULL_EVIDENCE);
  }
} catch (error) {
  const evidence = ['subject.json', `${phase}-shell.log`];
  for (const name of [`${phase}-webview.json`, phase === 'initial' ? 'settings-initial.png' : 'settings-restart.png']) {
    if (fs.existsSync(path.join(out, name))) evidence.push(name);
  }
  try {
    if (page) {
      const shot = `${CASE_ID}-failed-${phase}.png`;
      await page.screenshot({ path: path.join(out, shot), fullPage: true });
      evidence.push(shot);
    }
  } catch { /* A shell launch failure may have no page to capture. */ }
  finish('failed', error instanceof Error ? error.message : String(error), evidence);
} finally {
  if (browser) await browser.close();
  fs.writeFileSync(path.join(out, `${phase}.json`), JSON.stringify({ v: 1, cases }, null, 2));
}
process.exitCode = cases.some(x => x.status !== 'passed') ? 1 : 0;
