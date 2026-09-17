import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from 'playwright/test';
const out=path.resolve(process.argv[process.argv.indexOf('--out')+1]);
fs.mkdirSync(out,{recursive:true});
const root=process.cwd(), py=process.env.BW_PLANNING_PYTHON||'python';
const run=(exe,args)=>execFileSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
const cases=[],ids=['planning-assets','planning-autosave','planning-model-readback','planning-version-isolation','planning-conflict','planning-bad-history'];
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'bw-planning-e2e-'));
let browser,pack,workspace;
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const record=(id,title,evidence)=>cases.push({id,title,status:'passed',evidence});
try{
  run('cargo',['run','--locked','-p','bw','--example','planning_smoke','--',fixture]);
  fs.copyFileSync(path.join(fixture,'deployment.json'),path.join(out,'deployment.json'));
  const deployment=json(path.join(out,'deployment.json'));pack=path.join(deployment.skills,'week-planning');workspace=path.join(fixture,'browser-project');
  const cli=(version,...args)=>JSON.parse(run(py,['-B','-X','utf8',path.join(pack,'scripts/planning.py'),'--workspace',workspace,'--version',version,...args]));
  cli('v0.4','init');cli('v0.5','init');
  const file=version=>path.join(workspace,'.bw/planning',version,'data.json');
  const data=json(file('v0.4'));data.project='专项验证项目';data.previous_version={version:'v0.3'};
  data.results.goals=[{id:'G1',label:'G1',title:'原始目标',metric:'验证项',target:'3',reading:'2',progress:null,status:{label:'未达',tone:'warning'}}];
  fs.writeFileSync(file('v0.4'),JSON.stringify(data,null,2));
  record(ids[0],'BW 分发完整 Skill，JSON 消费者读取真实文件和已登记工作树',['deployment.json']);
  const service=cli('v0.4','start');
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(service.url);
  const goal=page.locator('.pane-1 [data-list="results.goals"] [data-bind="title"]');
  await expect(goal).toHaveText('原始目标');await goal.fill('浏览器修改后的目标');await page.locator('.pane-1 h2').first().click();
  await expect.poll(()=>json(file('v0.4')).results.goals[0].title).toBe('浏览器修改后的目标');
  await page.getByRole('button',{name:'＋ 添加交付件',exact:true}).click();
  await page.locator('[data-list="results.deliverables"] [data-bind="label"]').fill('版本发布报告');
  await page.locator('[data-list="results.deliverables"] [data-bind="goal"]').fill('v0.3/G1');
  await page.locator('[data-delivery-url]').fill('https://example.invalid/release');await page.locator('.pane-1 h2').first().click();
  await expect.poll(()=>json(file('v0.4')).results.deliverables?.[0]?.url).toBe('https://example.invalid/release');
  await page.reload();await expect(goal).toHaveText('浏览器修改后的目标');
  await page.screenshot({path:path.join(out,'autosave.png'),fullPage:true});fs.copyFileSync(file('v0.4'),path.join(out,'autosave.json'));
  record(ids[1],'真实浏览器输入自动写 JSON，版本报告保存且刷新可读回',['autosave.png','autosave.json']);
  const edit=cli('v0.4','read');edit.data.results.goals[0].title='模型写回后的目标';const candidate=path.join(out,'model-candidate.json');fs.writeFileSync(candidate,JSON.stringify(edit.data));
  cli('v0.4','update','--file',candidate,'--if-match',edit.etag);
  await expect(goal).toHaveText('模型写回后的目标',{timeout:10000});await page.screenshot({path:path.join(out,'model-readback.png')});
  record(ids[2],'会话写同一 JSON，页面自动读回',['model-readback.png','model-candidate.json']);
  await page.locator('#version-select').selectOption('v0.5');await expect(page.locator('.pane-1 [data-list="results.goals"] .goal')).toHaveCount(0);
  await page.locator('#version-select').selectOption('v0.4');await expect(goal).toHaveText('模型写回后的目标');
  fs.writeFileSync(path.join(out,'versions.json'),JSON.stringify({v04:json(file('v0.4')),v05:json(file('v0.5'))},null,2));
  await page.screenshot({path:path.join(out,'versions.png')});record(ids[3],'切换版本只读对应 JSON，不串版',['versions.json','versions.png']);
  // An unrelated corrupt archive must not turn a committed save into an apparent failure.
  const broken=path.join(workspace,'.bw/planning/v0.1/data.json');fs.mkdirSync(path.dirname(broken),{recursive:true});fs.writeFileSync(broken,'{broken');
  await page.reload();await expect(goal).toHaveText('模型写回后的目标');
  await expect(page.locator('#version-select option[value="v0.1"]')).toHaveJSProperty('disabled',true);
  for(const title of ['坏历史存在时首次保存','坏历史存在时再次保存']){
    await goal.fill(title);await page.locator('.pane-1 h2').first().click();
    await expect.poll(()=>json(file('v0.4')).results.goals[0].title).toBe(title);
    await expect(page.locator('#save-status')).not.toContainText('未保存');
  }
  await page.screenshot({path:path.join(out,'bad-history.png')});fs.copyFileSync(file('v0.4'),path.join(out,'bad-history.json'));
  record(ids[5],'坏历史版本明确标记，当前版本连续保存与修订号仍正常',['bad-history.png','bad-history.json']);
  // Focus prevents background reload; another writer changes the same revision.
  await goal.focus();const latest=cli('v0.4','read');latest.data.results.goals[0].title='另一写入方的新内容';fs.writeFileSync(candidate,JSON.stringify(latest.data));cli('v0.4','update','--file',candidate,'--if-match',latest.etag);
  await goal.fill('过期页面的未保存修改');await expect(page.locator('#save-status')).toContainText('未保存',{timeout:10000});
  expect(json(file('v0.4')).results.goals[0].title).toBe('另一写入方的新内容');await expect(goal).toHaveText('过期页面的未保存修改');
  await page.screenshot({path:path.join(out,'conflict.png')});fs.copyFileSync(file('v0.4'),path.join(out,'conflict.json'));record(ids[4],'并发冲突拒绝覆盖，保留页面输入与磁盘新内容',['conflict.png','conflict.json']);
  expect(errors).toEqual([]);
}catch(error){fs.writeFileSync(path.join(out,'failure.txt'),String(error.stack||error));for(const id of ids)if(!cases.some(x=>x.id===id))cases.push({id,title:id,status:'failed',evidence:['failure.txt']});process.exitCode=1;}
finally{
 if(browser)await browser.close();
 if(pack&&workspace)try{run(py,['-B','-X','utf8',path.join(pack,'scripts/planning.py'),'--workspace',workspace,'stop']);}catch(error){fs.writeFileSync(path.join(out,'cleanup-error.txt'),String(error));process.exitCode=1;}
 try{
   const resolved=fs.realpathSync(fixture),temp=fs.realpathSync(os.tmpdir());
   if(path.dirname(resolved)!==temp||!path.basename(resolved).startsWith('bw-planning-e2e-'))throw new Error('Unexpected fixture cleanup path');
   fs.rmSync(resolved,{recursive:true,force:true,maxRetries:3,retryDelay:100});
   fs.writeFileSync(path.join(out,'cleanup.json'),JSON.stringify({fixtureRemoved:!fs.existsSync(fixture)}));
 }catch(error){fs.writeFileSync(path.join(out,'cleanup-error.txt'),String(error));process.exitCode=1;}
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({v:1,cases},null,2));
}
