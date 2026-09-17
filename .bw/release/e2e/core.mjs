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
const cases = [];
let browser;
let page;
let blocked = false;
const settings = path.join(data, 'assets', 'settings.toml');
const row = () => page.locator('.set-row').filter({ hasText: '工作区根目录' });
const readSettings = () => fs.readFileSync(settings, 'utf8');
// Read the single path value written by Rust's TOML serializer (basic or literal string).
const savedWorkspace = () => {
  try {
    const value = readSettings().match(/^workspaces_root\s*=\s*(.+)$/m)?.[1].trim();
    if (value?.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    return value ? JSON.parse(value) : undefined;
  } catch (error) {
    // Polling must keep waiting while the first async write has not created/completed the file.
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined;
    throw error;
  }
};

// 形参不能叫 path/expect：会遮蔽 node:path 模块与 playwright 断言，函数体内的 path.join 会崩。
async function run(id, title, pathText, expectText, action) {
  const item = { id, title, path: pathText, expect: expectText, status: 'not_run', evidence: [] };
  cases.push(item);
  if (blocked) { item.message = '前一用例失败'; return; }
  try {
    await action(item);
    const shot = `${id}.png`;
    await page.screenshot({ path: path.join(out, shot), fullPage: true });
    item.evidence.push(shot);
    item.status = 'passed';
  } catch (error) {
    item.status = 'failed';
    item.message = error.message;
    blocked = true;
    try {
      const shot = `${id}-failed.png`;
      await page.screenshot({ path: path.join(out, shot), fullPage: true });
      item.evidence.push(shot);
    } catch { /* A shell launch failure may have no page to capture. */ }
  }
}

try {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${arg('port')}`, { timeout: 30000 });
  fs.writeFileSync(path.join(out, `${phase}-webview.json`), JSON.stringify({ browserVersion: browser.version(), nodeVersion: process.version }, null, 2));
  const context = browser.contexts()[0];
  if (!context) throw new Error('No real WebView2 context');
  page = context.pages()[0] || await context.waitForEvent('page', { timeout: 30000 });
  page.setDefaultTimeout(30000);
  if (phase === 'initial') {
    await run('shell-launches', '真实桌面壳启动并渲染设置屏', '以 BW_VIEW=settings 启动真壳', '设置屏可见，日志含 [BW_VIEW] settings 与 [BW_BOOT]', async item => {
      await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
      await expect.poll(() => fs.readFileSync(path.join(out, 'initial-shell.log'), 'utf8'), { timeout: 30000 }).toContain('[BW_VIEW] settings');
      await expect.poll(() => fs.readFileSync(path.join(out, 'initial-shell.log'), 'utf8'), { timeout: 30000 }).toContain('[BW_BOOT]');
      item.evidence.push('initial-shell.log', 'subject.json', 'initial-webview.json');
    });
    await run('settings-persist', '点击保存工作区目录，并从 settings.toml 读回', '设置 → 工作区根目录 → 保存', 'settings.toml 与磁盘目录读回一致', async item => {
      await row().getByRole('textbox').fill(workspace);
      await row().getByRole('button', { name: '保存', exact: true }).click();
      await expect.poll(savedWorkspace, { timeout: 45000 }).toBe(workspace);
      await expect.poll(() => fs.existsSync(workspace)).toBe(true);
      fs.copyFileSync(settings, path.join(out, 'settings-readback.toml'));
      item.evidence.push('settings-readback.toml');
    });
    await run('onboard-navigation', '通过真实按钮从设置进入项目墙和接入页', '设置 → ← 项目墙 → + 接入项目', '项目墙与接入页标题先后可见', async () => {
      await page.getByRole('button', { name: '← 项目墙', exact: true }).click();
      await expect(page.getByRole('heading', { name: '项目墙', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '+ 接入项目', exact: true }).click();
      await expect(page.getByRole('heading', { name: '接入项目', exact: true })).toBeVisible();
    });
  } else {
    await run('restart-persists', '杀进程重启后，界面与磁盘上的目录一致', '杀壳进程 → 重启真壳', '设置界面与 settings.toml 均保留原目录', async item => {
      await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
      await expect(row().getByRole('textbox')).toHaveValue(workspace);
      await expect.poll(savedWorkspace).toBe(workspace);
      fs.copyFileSync(settings, path.join(out, 'restart-readback.toml'));
      item.evidence.push('restart-readback.toml', 'restart-shell.log');
    });
  }
} catch (error) {
  blocked = true;
  console.error(error.stack);
} finally {
  if (browser) await browser.close();
  fs.writeFileSync(path.join(out, `${phase}.json`), JSON.stringify({ v: 1, cases }, null, 2));
}
process.exitCode = blocked ? 1 : 0;
