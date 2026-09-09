import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const port = args[args.indexOf('--port') + 1];
const shotDir = args[args.indexOf('--shot-dir') + 1];
const which = args[args.indexOf('--case') + 1];

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const ctx = browser.contexts()[0];
if (!ctx) throw new Error('CDP 连上了但没有 browser context');
const page = ctx.pages()[0] ?? (await ctx.waitForEvent('page'));

async function shot(name) {
  fs.mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true });
}

try {
  if (which === 'cu_settings') {
    await page.getByRole('heading', { name: '设置' }).waitFor({ timeout: 15000 });
    await page.getByText('工作区根目录', { exact: true }).waitFor();
    await page
      .locator('.set-row')
      .filter({ hasText: '工作区根目录' })
      .getByRole('button', { name: '保存' })
      .click();
  } else if (which === 'cu_onboard') {
    await page.getByRole('button', { name: '← 项目墙' }).click();
    await page.getByRole('heading', { name: '项目墙' }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: '+ 接入项目' }).click();
    await page.getByRole('heading', { name: '接入项目' }).waitFor({ timeout: 15000 });
  } else {
    throw new Error(`unknown case ${which}`);
  }
  await browser.close();
  process.exit(0);
} catch (e) {
  try {
    await shot(which);
  } catch {
    /* ignore */
  }
  console.error(String(e && e.message ? e.message : e));
  try {
    await browser.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
