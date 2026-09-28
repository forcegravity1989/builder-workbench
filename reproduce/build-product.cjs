const fs = require('node:fs')
const path = require('node:path')
const esbuild = require('esbuild')
const wd = process.cwd()
const dir = path.resolve('out/overview-review')
const fixtures = `
import { zoneChartRange } from '../../src/renderer/src/workbench/overview-zone-series'
import { addCalendarDays } from '../../src/shared/workbench/metric-windows'
export const scope={projectId:'demo',repoId:'demo',hostId:'local'}
const home={id:'home',repoId:'demo',path:'/demo',branch:'bw-orca',isMainWorktree:true}
export const store={repos:[{id:'demo',displayName:'Builders’ Workbench',path:'/demo',gitRemoteIdentity:{canonicalKey:'github.com/forcegravity1989/builder-workbench'}}],activeRepoId:'demo',worktreesByRepo:{demo:[home]}}
export const charter={name:'Builders’ Workbench',brief:'把计划、执行与验收连成可回看的工作循环',benchmark:'Orca / GitHub',opportunity:'用真实交付验证进展',kind:'product'}
const count=new URLSearchParams(location.search).has('many')?12:3
export const defs=Array.from({length:count},(_,i)=>({name:i===0?'每周有效交付数':i===1?'已验收目标数':i===2?'评审完成数':'长名称的引领指标 · 第'+i+'条',ref:{name:'metric-'+i,definitionHash:'hash-'+i,configurationCommit:'a'.repeat(40)},role:i===0?'lagging':'leading',feature:'',leads:i===0?undefined:'每周有效交付数',unit:'个',target:i===0?'8':'',def:'从远端任务与评审记录按同一时间窗口计算',collect:{kind:'script',run:['node','metric.js'],retro:true}}))
if(location.search.includes('current')) { defs.forEach((def,i)=>{def.role='lagging';delete def.leads;if(i<2)def.collect.retro=false}) }
export const north={...defs[0],name:'用户完成的工作循环',ref:{...defs[0].ref,name:'north',definitionHash:'north'},role:'north_star',target:'20'}
export const catalog={scope:{repoId:'demo',worktreeId:'home',hostId:'local'},timezone:'UTC',configurationCommit:'a'.repeat(40),configurationRef:'bw-orca',definitions:[north,...defs],problems:[]}
export function reading({ref,window}) { const range=window.kind==='range'?window:zoneChartRange('week','UTC');const points=[];let i=0;for(let day=range.since;day<range.until;day=addCalendarDays(day,range.granularity==='week'?7:1)){points.push({ref,value:i===2&&ref.definitionHash==='hash-2'?null:i+3+(Number(ref.definitionHash.slice(-1))||0),unit:'个',collectedAt:new Date().toISOString(),source:'fixture@a',collectorRevision:'fixture',observation:{kind:'window',start:day+'T00:00:00Z',end:addCalendarDays(day,range.granularity==='week'?7:1)+'T00:00:00Z',granularity:range.granularity,timezone:'UTC'}});i++}return {status:'ready',readings:points.filter(p=>p.value!==null),run:{}} }
const originalReading=reading
export function scenarioReading(args){const result=originalReading(args);if(args.window.kind==='current'){result.readings=[{...result.readings.at(-1),observation:{kind:'instant',observedAt:new Date().toISOString()}}]}if(location.search.includes('current')&&args.ref.definitionHash==='hash-2'){result.readings.forEach(point=>point.value='达标')}return result}
+export const revision='sha256:'+'a'.repeat(64)
+export function plan(version='v0.5',cycleId='C2') {return {schema_version:3,version,cycleId,summary:{progress:'',risks:''},tasks:[],goals:Array.from({length:4},(_,i)=>({goalId:'g'+i,title:'目标 '+(i+1)+'：'+(version==='v0.5'?'建立可回看、可核验的完整工作循环':'完成基础流程'),deliverable:'交付实际可运行的功能、相关材料与验证证据。'.repeat(4),acceptance:'用户可以从项目进入工作区并独立核对结果',metricTargets:[]}))}}
+export function accept(version='v0.5',cycleId='C2'){return {schema_version:3,version,cycleId,planRef:{kind:'draft',version,cycleId,revision,sourceWorktreeId:'plan',sourceHostId:'local'},preparedArtifacts:[],results:plan(version,cycleId).goals.map((goal,i)=>({goalId:goal.goalId,deliveries:[],readings:[],note:'核对交付功能、远端记录与原始数据。'.repeat(12),nextStep:'在下一轮继续核对用户反馈'}))}}
+export const history={records:['v0.5','v0.4'].flatMap(version=>['C1','C2'].flatMap(cycleId=>['plan','acceptance'].map(workflow=>({version,cycleId,workflow,sourceCommit:'b'.repeat(40),revision,committedAt:'2026-09-28T00:00:00Z'})))),problems:[]}
+`.replace(/^\+/gm,'')
fs.writeFileSync(path.join(dir,'fixtures.ts'),fixtures)
const f=path.join(dir,'fixtures.ts').replaceAll('\\','/')
const mocks={
 '@/store':`import {store} from '${f}';export const useAppStore=(select)=>select(store);useAppStore.getState=()=>store;`,
 './project-page-state':`export const openProjectOnboard=()=>{};`,
 './project-charter':`import {charter} from '${f}';export const readProjectCharter=async(path)=>path==='/second'?new Promise(resolve=>{window.resolveCharter=()=>resolve({charter:{...charter,name:'第二项目名片'}})}):({charter});`,
 './version-cycle/native-workspace':`export const nativeWorkspaceScope=tree=>({projectId:tree.repoId,repoId:tree.repoId,hostId:'local'});export const nativeWorkspaceScopeKey=s=>JSON.stringify(s);`,
 './version-cycle/native-cycle-workspace':`export const findCycleWorktree=s=>({id:s.workflow});`,
 './version-cycle/metrics-setup':`export const useMetricsSetup=()=>({busy:false,notice:null,prepareMetrics:async()=>{window.setupCount=(window.setupCount||0)+1}});`,
 './metrics-port':`import {catalog,scenarioReading} from '${f}';export const nativeMetricsPort=()=>({list:async()=>catalog,read:async(args)=>scenarioReading(args),refresh:async()=>({})});`,
 './version-material-port':`import {plan,accept,revision} from '${f}';export const nativeVersionMaterialPort=s=>({context:async()=>({version:location.search.includes('broken')?null:'v0.5'}),read:async(version)=>({document:s.workflow==='plan'?plan(version):accept(version),revision})});`,
 './version-history-port':`import {plan,accept,revision,history} from '${f}';export const nativeVersionHistoryPort=()=>({list:async()=>location.search.includes('broken')?{records:[],problems:[{version:'v0.3',workflow:'plan',sourceCommit:'c'.repeat(40),committedAt:'2026-09-01T00:00:00Z',code:'invalid',message:'材料无法解析'}]}:history,read:async r=>({document:r.workflow==='plan'?plan(r.version,r.cycleId):accept(r.version,r.cycleId),revision}),readPlan:async r=>({document:plan(r.planRef.version,r.planRef.cycleId),revision,source:{kind:'draft'}})});`,
 './use-overview-sdlc':`export const useOverviewSdlc=()=>({provider:'github',busy:false,refresh:async()=>{},commits:{kind:'ready',value:{items:[{timestamp:Date.now()-1000},{timestamp:Date.now()-8*86400000}],readAt:new Date().toISOString(),hasMore:false,source:'bw-orca · fixture'}},merges:{kind:'ready',value:{items:[{timestamp:Date.now()-1000}],readAt:new Date().toISOString(),hasMore:false,source:'github.com/demo/project'}},issues:{kind:'ready',value:{count:8,truncated:false,readAt:new Date().toISOString(),source:'github.com/demo/project'}}});`
}
esbuild.build({entryPoints:[path.join(dir,'product.tsx')],bundle:true,format:'iife',jsx:'automatic',outfile:path.join(dir,'product.js'),define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-ports',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'ts',resolveDir:wd}))}}]}).then(()=>{fs.writeFileSync(path.join(dir,'product.html'),'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="product.css"><style>*{box-sizing:border-box}body{margin:0;background:#faf9f5;font:13px system-ui,sans-serif}button,select{font:inherit}#root{height:100vh;margin-left:224px}aside{position:fixed;left:0;top:0;bottom:0;width:224px;background:#f0eee6;padding:24px;color:#75716a}</style></head><body><aside>浏览器组件验证<br>替身数据 · 非 Electron</aside><main id="root"></main><script src="product.js"></script></body></html>')}).catch(e=>{console.error(e);process.exitCode=1})
