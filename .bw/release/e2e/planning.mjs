// 用例六件事：
// 1. 保护规则：周一屏（version-planning）的机制底线——BW 分发的 Skill 真实可用；页面与会话
//    写同一份 data.json 且互相读回；版本互不串改；没数据就是 Unknown 不是绿；确认只能由人给出，
//    模型不能伪造确认，改动结果立即重置确认。真实用户旅程（Orca 自动化/会话/常驻树保存）在
//    week-plan-journey 套件，本套件跟 PR 跑，只看护机制。
// 2. 环境与数据：Windows、cargo 构建的 planning_smoke 分发真实 Skill 资产到临时 fixture、
//    python 运行 planning.py 本地服务、Playwright 无头 msedge 打开真实页面。不触远端、不触模型。
// 3. 真实动作：init 两个版本 → 真实浏览器编辑 → 会话命令 update/confirm 写回 → 切版本 →
//    伪造坏历史与并发冲突 → 缺数与确认操作。
// 4. 独立读回：直接读磁盘 data.json 与页面 DOM 双向核对；确认读回 actor:user。
// 5. 证据：每条用例的截图与 JSON 副本，全部写入本步骤输出目录。
// 6. 清理：停止 planning.py 服务；只删除本次创建、路径带 bw-planning-e2e- 前缀的临时 fixture。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { chromium, expect } from 'playwright/test';
const out=path.resolve(process.argv[process.argv.indexOf('--out')+1]);
fs.mkdirSync(out,{recursive:true});
const root=process.cwd(), py=process.env.BW_PLANNING_PYTHON||'python';
const run=(exe,args)=>execFileSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:4*1024*1024});
const cases=[],ids=['planning-assets','planning-autosave','planning-model-readback','planning-version-isolation','planning-conflict','planning-bad-history','planning-unknown-honesty','planning-confirmation'];
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'bw-planning-e2e-'));
let browser,pack,workspace;
const json=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
const record=(id,title,pathText,expectText,evidence)=>cases.push({id,title,path:pathText,expect:expectText,status:'passed',evidence});
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
  record(ids[0],'BW 分发完整 Skill，JSON 消费者读取真实文件和已登记工作树','cargo 跑 planning_smoke 分发 → planning.py init 两个版本','deployment.json 指向真实分发的 week-planning Skill 与已登记工作树',['deployment.json']);
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
  record(ids[1],'真实浏览器输入自动写 JSON，版本报告保存且刷新可读回','浏览器编辑目标与交付件 → 失焦保存 → 刷新页面','JSON 落盘与页面输入一致，刷新后读回相同内容',['autosave.png','autosave.json']);
  const edit=cli('v0.4','read');edit.data.results.goals[0].title='模型写回后的目标';const candidate=path.join(out,'model-candidate.json');fs.writeFileSync(candidate,JSON.stringify(edit.data));
  cli('v0.4','update','--file',candidate,'--if-match',edit.etag);
  await expect(goal).toHaveText('模型写回后的目标',{timeout:10000});await page.screenshot({path:path.join(out,'model-readback.png')});
  record(ids[2],'会话写同一 JSON，页面自动读回','planning.py update 写回同一版本 JSON','页面不用刷新即显示模型写回后的目标',['model-readback.png','model-candidate.json']);
  await page.locator('#version-select').selectOption('v0.5');await expect(page.locator('.pane-1 [data-list="results.goals"] .goal')).toHaveCount(0);
  await page.locator('#version-select').selectOption('v0.4');await expect(goal).toHaveText('模型写回后的目标');
  fs.writeFileSync(path.join(out,'versions.json'),JSON.stringify({v04:json(file('v0.4')),v05:json(file('v0.5'))},null,2));
  await page.screenshot({path:path.join(out,'versions.png')});record(ids[3],'切换版本只读对应 JSON，不串版','版本下拉在 v0.5 与 v0.4 间切换','每屏只读对应版本的 JSON，互不串改',['versions.json','versions.png']);
  // 没数据就是 Unknown：progress 缺失时进度条如实显示 —；补数显示真数；抽掉 reading 立即回到 —。
  const bar=page.locator('.pane-1 [data-list="results.goals"] .goal [data-progress]').first();
  await expect(bar).toHaveAttribute('aria-valuetext','—');
  expect(await bar.getAttribute('aria-valuenow')).toBe(null);
  const knownRead=cli('v0.4','read');knownRead.data.results.goals[0].progress=66;fs.writeFileSync(candidate,JSON.stringify(knownRead.data));cli('v0.4','update','--file',candidate,'--if-match',knownRead.etag);
  await expect(bar).toHaveAttribute('aria-valuenow','66',{timeout:10000});
  const blankRead=cli('v0.4','read');blankRead.data.results.goals[0].reading='';blankRead.data.results.goals[0].progress=null;fs.writeFileSync(candidate,JSON.stringify(blankRead.data));cli('v0.4','update','--file',candidate,'--if-match',blankRead.etag);
  await expect.poll(()=>json(file('v0.4')).results.goals[0].reading,{timeout:10000}).toBe('');
  await expect(bar).toHaveAttribute('aria-valuetext','—',{timeout:10000});
  expect(await bar.getAttribute('aria-valuenow')).toBe(null);
  await expect(bar.locator('i')).toHaveAttribute('style',/width:\s*0%/);
  await page.screenshot({path:path.join(out,'unknown-honesty.png')});fs.copyFileSync(file('v0.4'),path.join(out,'unknown-honesty.json'));
  record(ids[6],'缺数如实显示 Unknown，不显示假进度','会话补 progress 后进度条显示真数；清空 reading 后页面自动读回','进度条回到 — 且无 aria-valuenow、宽度 0%；磁盘 JSON 同步变化',['unknown-honesty.png','unknown-honesty.json']);
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
  record(ids[5],'坏历史版本明确标记，当前版本连续保存与修订号仍正常','伪造 v0.1 坏 JSON → 重载 → 连续保存两次','坏版本在下拉中禁用；当前版本保存不失败、状态不显示未保存',['bad-history.png','bad-history.json']);
  // Focus prevents background reload; another writer changes the same revision.
  await goal.focus();const latest=cli('v0.4','read');latest.data.results.goals[0].title='另一写入方的新内容';fs.writeFileSync(candidate,JSON.stringify(latest.data));cli('v0.4','update','--file',candidate,'--if-match',latest.etag);
  await goal.fill('过期页面的未保存修改');await expect(page.locator('#save-status')).toContainText('未保存',{timeout:10000});
  expect(json(file('v0.4')).results.goals[0].title).toBe('另一写入方的新内容');await expect(goal).toHaveText('过期页面的未保存修改');
  await page.screenshot({path:path.join(out,'conflict.png')});fs.copyFileSync(file('v0.4'),path.join(out,'conflict.json'));record(ids[4],'并发冲突拒绝覆盖，保留页面输入与磁盘新内容','另一写入方更新同一修订 → 过期页面继续编辑并保存','保存被拒并提示未保存；磁盘保留另一写入方内容，页面输入不丢失',['conflict.png','conflict.json']);
  // 完成由人确认：UI 确认写 actor:user；模型改写不能伪造确认，改结果立即重置确认；计划确认走真实对话框。
  page.once('dialog',dialog=>dialog.accept()); // 冲突段留下的未保存修改会触发 beforeunload
  await page.reload();
  await expect(page.locator('#version-select option[value="v0.5"]')).toHaveCount(1,{timeout:15000});
  await page.locator('#version-select').selectOption('v0.5');
  const seedRead=cli('v0.5','read');
  seedRead.data.project='专项验证项目';
  seedRead.data.results.goals=[{id:'G1',label:'G1',title:'确认用例目标',metric:'验证项',target:'1',reading:'1',progress:100,status:{label:'达成',tone:'success'}}];
  seedRead.data.plan.goals=[{id:'G1',label:'G1',title:'待确认的下一版本目标'}];
  seedRead.data.plan.tasks=[{number:'#7',url:'https://example.invalid/7',title:'确认用例任务',goal:'G1'}];
  fs.writeFileSync(candidate,JSON.stringify(seedRead.data));
  cli('v0.5','update','--file',candidate,'--if-match',seedRead.etag);
  const v05goal=page.locator('.pane-1 [data-list="results.goals"] [data-bind="title"]');
  await expect(v05goal).toHaveText('确认用例目标',{timeout:10000});
  await page.locator('[data-confirm-results]').click();
  await expect.poll(()=>json(file('v0.5')).confirmation.results?.actor,{timeout:10000}).toBe('user');
  const forged=cli('v0.5','read');
  forged.data.results.goals[0].title='模型改写后的标题';
  forged.data.confirmation={results:{at:'forged',actor:'user'},review_ready:{at:'forged',actor:'user'},plan:{at:'forged',actor:'user'}};
  const forgedFile=path.join(out,'forged-candidate.json');fs.writeFileSync(forgedFile,JSON.stringify(forged.data));
  cli('v0.5','update','--file',forgedFile,'--if-match',forged.etag);
  const afterForge=json(file('v0.5'));
  expect(afterForge.results.goals[0].title).toBe('模型改写后的标题');
  expect(afterForge.confirmation.results).toBe(null);
  expect(afterForge.confirmation.review_ready).toBe(null);
  expect(afterForge.confirmation.plan).toBe(null);
  await expect(v05goal).toHaveText('模型改写后的标题',{timeout:10000});
  await page.locator('[data-goto="1"]').click();
  await page.locator('[data-confirm-results]').click();
  await expect.poll(()=>json(file('v0.5')).confirmation.results?.actor,{timeout:10000}).toBe('user');
  cli('v0.5','confirm','--stage','review_ready');
  expect(json(file('v0.5')).confirmation.review_ready.actor).toBe('user');
  // 会话侧 confirm 更新了修订号；重载让页面重新拉取最新 etag，否则计划确认会因旧修订号被拒。
  await page.reload();await expect(page.locator('#version-select')).toHaveValue('v0.5',{timeout:15000});
  await page.locator('[data-goto="3"]').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#commit').click();
  await expect.poll(()=>json(file('v0.5')).confirmation.plan?.actor,{timeout:10000}).toBe('user');
  expect(json(file('v0.5')).confirmation.results.actor).toBe('user');
  await page.screenshot({path:path.join(out,'confirmation.png'),fullPage:true});
  fs.copyFileSync(file('v0.5'),path.join(out,'confirmation.json'));
  record(ids[7],'确认只能由人给出，模型不能伪造','UI 确认结果 → 模型带伪造确认改写 → 人重新确认 → 会话命令确认评审 → 页面对话框确认计划','每次确认后磁盘 actor:user；模型伪造值不落盘且确认全部重置；计划确认后三阶段齐全',['confirmation.png','confirmation.json','forged-candidate.json']);
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
