(() => {
'use strict';
const $=id=>document.getElementById(id),screen=$('screen-plan');
const serviceMode=document.documentElement.hasAttribute('data-planning-service')&&/^https?:$/.test(location.protocol);
const files=new PlanningFiles(serviceMode);
const snapshot=document.documentElement.hasAttribute('data-snapshot');
let readonly=snapshot||!serviceMode;
let data=JSON.parse($('plan-data').textContent);
let records=JSON.parse($('plan-versions').textContent);
if(!records.length)records=[{version:data.version,data:structuredClone(data)}];
const requested=new URLSearchParams(location.search).get('version');
if(requested&&records.some(record=>record.version===requested))data=structuredClone(records.find(record=>record.version===requested).data);
files.version=data.version;
let dirty=false,saving=null,revision=0,timer,switching=false,removedGoal=null;
const get=(o,p)=>p.split('.').reduce((v,k)=>v?.[k],o);
const set=(o,p,v)=>{const k=p.split('.'),last=k.pop();k.reduce((v,k)=>v[k],o)[last]=v;};
const clone=v=>JSON.parse(JSON.stringify(v));
const labels={label:'目标编号',title:'内容',metric:'衡量指标',target:'目标值',baseline:'基线',reading:'实际读数',deadline:'截止时间',owner:'负责人',detail:'说明',note:'批注',number:'Issue 编号',progress_note:'实际进展',acceptance:'交付与验收要求',goal:'所属目标',at:'时间',speaker:'发言人',text:'记录内容','status.label':'状态','summary.overview':'评审主题','summary.risks':'需要上报的风险','summary.progress':'上周版本进展摘要'};
const names={'results.goals':'上周目标','results.tasks':'上周任务','results.sessions':'会话记录','results.deliverables':'版本交付件','plan.goals':'当前版本目标','plan.tasks':'版本任务'};
function storageControls(){
 const retry=$('save-status').classList.contains('is-error');
 $('save-now').hidden=readonly||!retry||!dirty;$('save-now').disabled=!!saving;
 $('save-now').textContent='重试保存';
 $('local-tools').hidden=readonly;
 $('save-path').textContent='.bw/planning/'+data.version+'/data.json';
 $('save-path').title=files.planningDir?files.planningDir+'/'+data.version+'/data.json':$('save-path').textContent;
 $('snapshot-note').hidden=!readonly;
 $('snapshot-note').textContent=snapshot?'会议评审快照 · 只读':'离线只读 · 编辑请由会话启动规划服务';
 document.querySelector('.local-toolbar').hidden=false;
}
const message=(text,error=false)=>{$('save-status').textContent=text;$('save-status').classList.toggle('is-error',error);storageControls();};
const editing=()=>document.activeElement?.matches('[contenteditable=true],input,textarea,select');
function change(path,value){
 set(data,path,value);dirty=true;revision++;data.updated_at=new Date().toISOString();
 if(/^(results|plan)\.goals\.\d+\.(metric|target|baseline|reading)$/.test(path))get(data,path.split('.').slice(0,3).join('.')).progress=null;
 if(path.startsWith('results.')){data.confirmation.results=null;data.confirmation.review_ready=null;}
 if(path.startsWith('summary.'))data.confirmation.review_ready=null;
 if(path.startsWith('review.')&&!path.startsWith('review.minutes.'))data.review.minutes.state=data.review.minutes.markdown?'stale':'missing';
 if(path==='review.minutes.markdown')data.review.minutes.state=value?'manual':'missing';
 if(!path.startsWith('confirmation.'))data.confirmation.plan=null;
 if($('save-status').classList.contains('is-error'))storageControls();else message('');
 clearTimeout(timer);timer=setTimeout(()=>flush(),800);
}
async function flush(){
 if(readonly||!data||!dirty)return true;
 if(saving){const ok=await saving;return ok&&dirty?flush():ok;}
 const savedRevision=revision,value=clone(data);
 saving=(async()=>{try{
   const persisted=await files.save(value);records.find(record=>record.version===value.version).data=clone(persisted);if(revision===savedRevision){data=persisted;dirty=false;}
   $('download-data').hidden=true;message('');return true;
 }catch(error){$('download-data').hidden=false;message('未保存：'+error.message,true);return false;}})();
 const ok=await saving;saving=null;storageControls();return ok&&dirty?flush():ok;
}
function editable(el,path){
 el.dataset.path=path;
 el.setAttribute('aria-label',labels[path]||labels[path.split('.').slice(-2).join('.')]||labels[path.split('.').pop()]||'说明');
 if(readonly){el.removeAttribute('contenteditable');if('readOnly'in el)el.readOnly=true;return;}
 if(!el.matches('input,textarea,select')){el.contentEditable='true';el.spellcheck=false;el.dataset.placeholder=el.dataset.placeholder||el.getAttribute('aria-label')+'…';}
 el.oninput=()=>{
   change(path,el.matches('input,textarea,select')?el.value:el.innerText);
   if(/^(results|plan)\.goals\.\d+\.(metric|target|baseline|reading)$/.test(path)){
     const goal=get(data,path.split('.').slice(0,3).join('.'));
     el.closest('.goal')?.querySelectorAll('[data-progress]').forEach(bar=>fillProgress(bar,goal));
   }
 };
 if(el.hasAttribute('contenteditable'))el.onpaste=e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));};
}
function fillProgress(bar,object){
 const n=get(object,bar.dataset.progress),known=typeof n==='number'&&n>=0&&n<=100&&object.metric?.trim()&&object.target?.trim()&&object.reading?.trim();
 bar.hidden=!known&&!bar.hasAttribute('data-show-unknown');bar.querySelector('i').style.width=(known?n:0)+'%';
 bar.setAttribute('aria-valuetext',known?n+'%':'—');
 if(known)bar.setAttribute('aria-valuenow',String(n));else bar.removeAttribute('aria-valuenow');
}
function fill(root,object,prefix=''){
 root.querySelectorAll('[data-bind]').forEach(el=>{
   const key=el.dataset.bind;el.textContent=get(object,key)??'';
   if(el.hasAttribute('data-hide-empty'))el.hidden=!el.textContent.trim();
   if(el.hasAttribute('contenteditable'))editable(el,prefix?prefix+'.'+key:key);
 });
 root.querySelectorAll('[data-status]').forEach(el=>{const s=get(object,el.dataset.status)||{};el.className='tag tag-'+(['success','warning','danger','neutral'].includes(s.tone)?s.tone:'outline');});
 root.querySelectorAll('[data-progress]').forEach(bar=>fillProgress(bar,object));
 root.querySelectorAll('[data-field]').forEach(el=>{const path=prefix+'.'+el.dataset.field;el.value=get(object,el.dataset.field)||'unknown';el.disabled=readonly;el.onchange=()=>change(path,el.value);});
 root.querySelectorAll('[data-goal-status]').forEach(el=>{
   const tones={'达成':'success','未达':'danger','遗留':'warning','无值':'neutral'};
   el.value=Object.hasOwn(tones,object.status?.label)?object.status.label:'无值';
   const paint=()=>{el.className='tag tag-'+tones[el.value]+' goal-result';};paint();el.disabled=readonly;
   el.onchange=()=>{change(prefix+'.status',{label:el.value,tone:tones[el.value]});paint();};
 });
 root.querySelectorAll('[data-note]').forEach(el=>{el.hidden=!get(object,el.dataset.note);});
 root.querySelectorAll('[data-note-button]').forEach(button=>{const note=root.querySelector('[data-note]');button.hidden=readonly||!note?.hidden;button.onclick=()=>{note.hidden=false;button.hidden=true;note.querySelector('[contenteditable]').focus();};});
}
function attachmentHref(value){
 if(/^https?:\/\//i.test(value))return value;
 if(value&&!/^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(value)){
   if(serviceMode)return '/api/attachment?version='+encodeURIComponent(data.version)+'&path='+encodeURIComponent(value)+'&token='+encodeURIComponent(files.token);
   return new URL(value.replaceAll('\\','/'),new URL('../../../',location.href)).href;
 }
 return '';
}
function rowTools(row,key,index,item){
 if(key.endsWith('.tasks')){
   const link=row.querySelector('[data-issue-link]');link.textContent=item.number?'#'+String(item.number).replace(/^#/, ''):'';
   if(/^https?:\/\//i.test(item.url||'')){link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';}
   row.querySelector('[data-task-kind]').textContent=item.kind==='bug'?'Bug':'Feature';
 }
 if(key==='results.deliverables'){
   const link=row.querySelector('[data-delivery-link]'),input=row.querySelector('[data-delivery-url]');
   const updateLink=()=>{const href=attachmentHref(input.value);link.textContent=input.value;if(href)link.href=href;else link.removeAttribute('href');};
   input.value=item.url||'';input.hidden=readonly;updateLink();
   input.oninput=()=>{change(key+'.'+index+'.url',input.value);updateLink();};
 }
 if(key==='results.tasks'||key==='results.sessions')return;
 if(readonly)return;
 const box=document.createElement('div');box.className='row-tools';
 const remove=document.createElement('button');remove.className='btn btn-ghost btn-sm';remove.type='button';remove.textContent='删除';remove.setAttribute('aria-label','删除'+names[key]);
 if(key.endsWith('.goals')){remove.textContent='×';remove.title='删除目标';}
 remove.onclick=()=>{
   if(!key.endsWith('.goals')&&!confirm('删除这条'+names[key]+'？'))return;
   const list=clone(get(data,key)),[removed]=list.splice(index,1);
   if(key.endsWith('.goals'))removedGoal={version:data.version,key,index,item:removed};
   change(key,list);render();
 };box.append(remove);row.append(box);
}
function render(){
 screen.hidden=false;
 document.title=data.project+' · '+data.version+' 版本计划';
 screen.querySelectorAll('[data-list]').forEach(el=>el.replaceChildren());fill(screen,data);
 $('head-issue').textContent=data.project;$('draft-tag').textContent=data.version;
 screen.querySelectorAll('[data-list]').forEach(list=>{
   const key=list.dataset.list,items=(get(data,key)||[]).filter(item=>key==='results.tasks'?!!item.number:key==='results.sessions'?Object.hasOwn(item,'title'):true);
   if(!items.length){const p=document.createElement('p');p.className='empty-list';p.textContent=key==='results.tasks'?'尚未采集到任务 Issue':key==='results.sessions'?'尚未取得会话记录':readonly?'尚未填写':'还没有'+names[key]+'，点击下方添加。';list.append(p);}
   items.forEach((item,i)=>{const row=$('item-'+key.replaceAll('.','-')).content.firstElementChild.cloneNode(true);const index=(get(data,key)||[]).indexOf(item);fill(row,item,key+'.'+index);rowTools(row,key,index,item);list.append(row);});
 });
 for(const [id,path] of Object.entries({'live-notes':'review.live_notes','meeting-url':'review.meeting_url','minutes-body':'review.minutes.markdown','transcript-body':'review.transcript.text'})){
   $(id).value=get(data,path)||'';editable($(id),path);
 }
 $('review-status').textContent=data.review.minutes.state==='stale'?'材料已更新 · 请核对纪要':data.review.minutes.markdown?'已有纪要 · 可继续修改':'待填写';
 $('publication-state').textContent=data.confirmation.plan?'计划已确认；可在会话中发起 PR。':'填写完成后确认；PR 由会话发起。';
 $('commit').textContent=data.confirmation.plan?'计划已确认':'确认计划';
 $('provenance').textContent=data.provenance?.notice||'';
 $('source-list').querySelectorAll('p').forEach(el=>el.remove());
 (data.sources||[]).forEach(source=>{const p=document.createElement('p'),a=document.createElement('a');a.textContent=source.id;a.target='_blank';a.rel='noopener';if(/^https?:\/\//.test(source.url||''))a.href=source.url;p.append(a,document.createTextNode(' · '+(source.authored_date||'')));$('source-list').append(p);});
 screen.querySelectorAll('[data-add]').forEach(b=>b.hidden=readonly);
 screen.querySelectorAll('[data-confirm-results],[data-export-review],#commit').forEach(b=>b.disabled=readonly);
 screen.querySelectorAll('[data-undo-goal]').forEach(b=>b.hidden=readonly||!removedGoal||removedGoal.version!==data.version||removedGoal.key!==b.dataset.undoGoal);
 storageControls();$('version-select').disabled=snapshot;
}
function go(n){
 render();
 screen.dataset.step=String(n);
 screen.querySelectorAll('.plan-tabs [data-goto]').forEach(b=>{const on=Number(b.dataset.goto)===n;b.classList.toggle('is-on',on);b.setAttribute('aria-selected',String(on));});
 screen.querySelector('.right-scroll').scrollTop=0;
}
function newItem(key){
 const id='item-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
 if(key.endsWith('.goals')){const used=new Set(get(data,key).map(x=>x.label));let n=1;while(used.has('G'+n))n++;return{id,label:'G'+n,title:'',metric:'',target:'',baseline:'',reading:'',deadline:'',owner:'',progress:null,status:{label:'待填写',tone:'neutral'},note:'',sources:[]};}
 if(key.endsWith('.tasks'))return{id,number:'',title:'',kind:'feature',progress_note:'',acceptance:'',deliverables:[],goal:'',status:{label:'待填写',tone:'neutral'},note:'',included:true,sources:[]};
 if(key==='results.deliverables')return{id,label:'',goal:'',url:''};
 throw new Error('未知内容类型：'+key);
}
async function selectVersion(record){
 if(!await flush())return false;
 data=await files.open(record);dirty=false;revision=0;removedGoal=null;
 $('version-select').value=record.version;
 if(serviceMode)history.replaceState(null,'','?version='+encodeURIComponent(data.version)+location.hash);
 render();
 go(data.plan.goals.length&&!data.results.goals.length&&!data.previous_version?3:1);
 message('');return true;
}
async function saveToFile(){if(await flush())storageControls();}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function confirmStage(stage){
 if(readonly||!await flush())return false;
 const before=revision;
 try{const confirmed=await files.confirm(stage);if(revision===before)data=confirmed;return true;}
 catch(error){message(error.message,true);return false;}
}
$('save-now').onclick=saveToFile;
screen.querySelectorAll('[data-undo-goal]').forEach(b=>b.onclick=()=>{
 if(!removedGoal||removedGoal.version!==data.version||removedGoal.key!==b.dataset.undoGoal)return;
 const key=removedGoal.key,list=clone(get(data,key));list.splice(Math.min(removedGoal.index,list.length),0,removedGoal.item);
 removedGoal=null;change(key,list);render();
});
$('download-data').onclick=()=>download(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),data.version+'-未合并内容.json');
$('version-select').onchange=async()=>{if(switching)return;switching=true;try{await selectVersion(records.find(r=>r.version===$('version-select').value));}catch(error){message(error.message,true);}finally{$('version-select').value=files.version;switching=false;}};
screen.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const key=b.dataset.add;change(key,[...(get(data,key)||[]),newItem(key)]);render();screen.querySelector('[data-list="'+key+'"] > :last-child [contenteditable=true]')?.focus();});
screen.querySelectorAll('[data-goto]').forEach(b=>b.onclick=async()=>{if(b.hasAttribute('data-confirm-results')&&!await confirmStage('results'))return;go(Number(b.dataset.goto));});
$('go-week').onclick=()=>go(3);
screen.querySelector('[data-export-review]').onclick=async()=>{
 if(!await confirmStage('review_ready'))return;
 const root=document.documentElement.cloneNode(true);root.setAttribute('data-snapshot','true');
 root.querySelector('#plan-data').textContent=JSON.stringify(data).replace(/</g,'\\u003c');
 root.querySelector('#plan-versions').textContent='[]';
 download(new Blob(['<!doctype html>\n'+root.outerHTML],{type:'text/html'}),data.version+'-会议评审.html');
 message('已保存，并导出会议评审材料');
};
$('commit').onclick=async()=>{
 if(!data.plan.goals.some(g=>g.title.trim())||!data.plan.tasks.some(t=>t.title.trim())){message('请先填写版本目标和任务，再确认计划。',true);return;}
 if(confirm('确认当前版本计划？这会保存确认记录；发起 PR 请回到会话提出。')&&await confirmStage('plan'))render();
};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveToFile();}});
async function boot(){
 if(serviceMode&&!snapshot){
   try{
     records=await files.list();
     const wanted=requested||files.defaultVersion;
     const record=records.find(r=>r.version===wanted);
     if(!record)throw new Error('版本不存在，请由会话核对后重新打开。');
     data=await files.open(record);record.data=clone(data);
   }catch(error){readonly=true;render();message(error.message,true);return;}
 }
 $('version-select').replaceChildren(...records.map(record=>{const option=document.createElement('option');option.value=record.version;option.textContent=record.version;return option;}));
 $('version-select').value=data.version;
 render();go(snapshot?2:(data.plan.goals.length&&!data.results.goals.length&&!data.previous_version?3:1));
 message('');
 if(!readonly){setInterval(async()=>{
   if(!data||dirty||saving||switching||editing())return;
   try{
     const latest=await files.changed();
     if(dirty||saving||switching||editing())return;
     if(latest){data=files.adopt(latest);records.find(r=>r.version===files.version).data=clone(data);render();}
     message('');
   }catch(error){message(error.message,true);}
 },2000);}
}
boot();
})();
