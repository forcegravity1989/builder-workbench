import { createServer } from 'node:https'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { WebSocketServer } from 'ws'
import { _electron as electron, type Page } from '@stablyai/playwright-test'
import { test as base, expect } from '../../tests/e2e/helpers/workbench-app'
import { getE2ECompletedOnboardingProfile } from '../../tests/e2e/helpers/e2e-completed-onboarding-profile'
import { getWorkbenchElectronLaunchArgs } from '../../tests/e2e/helpers/workbench-launch-args'
import { closeElectronAppForE2E, cleanupE2EDaemons } from '../../tests/e2e/helpers/electron-process-shutdown'
import { createElectronHomeIsolation } from '../../tests/e2e/helpers/electron-home-isolation'

// This temporary restart check owns its app lifecycle so the base fixture does not close it twice.
const test=base.extend({electronApp:async({launchEnv,workbenchAppExtraEnv,workbenchAppExtraArgs},use)=>{
 const userDataDir=mkdtempSync(path.join(os.tmpdir(),'bw370-e2e-'))
 writeFileSync(path.join(userDataDir,'orca-data.json'),JSON.stringify(getE2ECompletedOnboardingProfile()))
 const {ELECTRON_RUN_AS_NODE:unused,...inheritedEnv}=process.env
 const isolation=createElectronHomeIsolation({inheritedEnv,launchEnv,extraEnv:workbenchAppExtraEnv,userDataDir})
 const app=await electron.launch({args:[...workbenchAppExtraArgs,...getWorkbenchElectronLaunchArgs(path.join(process.cwd(),'out/main/index.js'),false)],env:{...isolation.env,NODE_ENV:'development',ORCA_E2E_HEADLESS:'1',ORCA_BACKGROUND_LAUNCH:'1'}})
 const child=app.process()
 try{await use(app)}finally{
  if(child.exitCode===null&&child.signalCode===null)await closeElectronAppForE2E(app)
  await cleanupE2EDaemons(userDataDir)
 }
}})

const evidence = path.join(process.cwd(), 'test-results/issue370')
const extraArgs = ['--host-resolver-rules=MAP intranet.example 127.0.0.1', '--no-proxy-server']
test.use({ workbenchAppExtraArgs: extraArgs, workbenchAppExtraEnv: { WORKBENCH_SHELL: '1', VITE_WORKBENCH_SHELL: '1', ORCA_PRODUCT_NAME: 'Workbench' } })

async function tlsServer() {
  let documents=0, assets=0, sockets=0
  const server=createServer({ key:readFileSync(path.join(evidence,'key.pem')),cert:readFileSync(path.join(evidence,'cert.pem')) },(req,res)=>{
    res.setHeader('Cache-Control','no-store')
    if(req.url==='/asset.svg'){assets++;res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');return}
    if(req.url!=='/'){res.writeHead(404);res.end();return}
    documents++;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><body style="font:24px sans-serif;padding:40px"><h1>Issue 370: HTTPS page loaded after approval</h1><p id="asset">asset pending</p><p id="socket">socket pending</p><img id="image" src="/asset.svg"><script>document.getElementById('image').onload=()=>document.getElementById('asset').textContent='asset loaded';const ws=new WebSocket('wss://'+location.host+'/socket');ws.onmessage=()=>{document.getElementById('socket').textContent='websocket connected';ws.close()};</script></body></html>`)
  })
  const ws=new WebSocketServer({server});ws.on('connection',client=>{sockets++;client.send('ready')})
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r))
  return {url:`https://intranet.example:${(server.address() as any).port}/`,counts:()=>({documents,assets,sockets}),close:async()=>{for(const c of ws.clients)c.terminate();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()))}}
}
async function open(page:Page,url:string){
  const tab=await page.evaluate(targetUrl=>{const s=window.__store!.getState();s.setActiveView('terminal');const t=s.createBrowserTab(s.activeWorktreeId!,targetUrl,{title:'Issue 370 TLS',activate:true});s.setActiveBrowserTab(t.id);s.setActiveTabType('browser');return {id:t.id,pageId:t.activePageId}},url)
  return {tab,slot:page.locator(`[data-browser-overlay-tab-id="${tab.id}"]`)}
}
async function body(page:Page,pageId:string){return page.evaluate(async id=>{const w=document.querySelector(`[data-browser-overlay-tab-id="${id}"] webview`) as any;return w?await w.executeJavaScript('document.body.innerText').catch(()=>null):null},pageId)}
const proceedName=/Proceed Anyway|仍然继续|继续访问/

test('370: explicit certificate proceed, isolated tabs and port, same-profile restart',async({workbenchPage:page,electronApp},testInfo)=>{
 const first=await tlsServer(), second=await tlsServer();let restarted:any=null
 try{
  await expect(page.locator('[data-workbench-nav]')).toBeVisible()
  const a=await open(page,first.url)
  const proceed=a.slot.getByRole('button',{name:proceedName})
  await expect(proceed).toBeVisible();expect(first.counts().documents).toBe(0)
  await page.screenshot({path:path.join(evidence,'01-warning.png')})
  await proceed.click({force:true})
  await expect.poll(()=>body(page,a.tab.id!)).toContain('websocket connected')
  await expect.poll(()=>body(page,a.tab.id!)).toContain('asset loaded')
  expect(first.counts()).toEqual({documents:1,assets:1,sockets:1})
  const guestPng=await electronApp.evaluate(async ({webContents},url)=>{const guest=webContents.getAllWebContents().find(w=>w.getURL()===url);if(!guest)throw new Error('missing HTTPS guest');return (await guest.capturePage()).toPNG().toString('base64')},first.url)
  writeFileSync(path.join(evidence,'02-approved-guest.png'),Buffer.from(guestPng,'base64'))
  console.log('HTTPS document, image and WebSocket loaded after explicit click')
  await page.evaluate(id=>{(document.querySelector(`[data-browser-overlay-tab-id="${id}"] webview`) as any).reload()},a.tab.id)
  await expect.poll(()=>first.counts().documents).toBe(2)
  await expect.poll(()=>body(page,a.tab.id!)).toContain('websocket connected')
  const b=await open(page,first.url)
  await expect(b.slot.getByRole('button',{name:proceedName})).toBeVisible();expect(first.counts().documents).toBe(2)
  await page.screenshot({path:path.join(evidence,'03-sibling-warning.png')})
  const c=await open(page,second.url)
  await expect(c.slot.getByRole('button',{name:proceedName})).toBeVisible();expect(second.counts().documents).toBe(0)
  await page.screenshot({path:path.join(evidence,'04-port-warning.png')})
  await page.evaluate(id=>window.__store!.getState().closeBrowserTab(id),a.tab.id)
  const d=await open(page,first.url)
  await expect(d.slot.getByRole('button',{name:proceedName})).toBeVisible();expect(first.counts().documents).toBe(2)
  await page.screenshot({path:path.join(evidence,'05-reopened-warning.png')})
  await d.slot.getByRole('button',{name:proceedName}).click({force:true})
  await expect.poll(()=>body(page,d.tab.id!)).toContain('websocket connected')
  const userData=await electronApp.evaluate(()=>process.env.ORCA_E2E_USER_DATA_DIR!)
  console.log('Closing first Electron instance')
  await closeElectronAppForE2E(electronApp)
  await cleanupE2EDaemons(userData)
  console.log('Restarting same disposable profile')
  const {ELECTRON_RUN_AS_NODE:unused,...inheritedEnv}=process.env
  const isolation=createElectronHomeIsolation({inheritedEnv,launchEnv:{},extraEnv:{WORKBENCH_SHELL:'1',VITE_WORKBENCH_SHELL:'1',ORCA_PRODUCT_NAME:'Workbench',ORCA_BACKGROUND_LAUNCH:'1'},userDataDir:userData})
  restarted=await electron.launch({args:[...extraArgs,...getWorkbenchElectronLaunchArgs(path.join(process.cwd(),'out/main/index.js'),false)],env:{...isolation.env,NODE_ENV:'development',ORCA_E2E_HEADLESS:'1'}})
  restarted.process().stderr?.on('data',chunk=>console.log('restart stderr:',chunk.toString().slice(0,700)))
  const next=await restarted.firstWindow({timeout:120000})
  await next.waitForFunction(()=>window.__store?.getState().workspaceSessionReady,{timeout:60000})
  await expect(next.locator('[data-workbench-nav]')).toBeVisible()
  const e=await open(next,first.url)
  await expect(e.slot.getByRole('button',{name:proceedName})).toBeVisible();expect(first.counts().documents).toBe(3)
  await next.screenshot({path:path.join(evidence,'06-restart-warning.png')})
  writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,url:first.url,secondPort:second.url,firstCounts:first.counts(),secondCounts:second.counts(),checks:['warning before request','explicit click loads document asset websocket','reload retains scoped approval','sibling tab denied','different port denied','close and reopen denied','same-profile app restart denied']},null,2))
 }finally{if(restarted)await closeElectronAppForE2E(restarted);await first.close();await second.close()}
})
