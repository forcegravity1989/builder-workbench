import React,{useRef,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {Toaster} from 'sonner'
import {i18n,setRendererUiLanguage} from '@/i18n/i18n'
import {WorkbenchRail} from '@/workbench/WorkbenchRail'
import {TitlebarMainStrip} from '@/app-shell/TitlebarMainStrip'
import type {AppChromeLayout} from '@/app-shell/use-app-chrome-layout'
import {SidebarFeedbackDialog} from '@/components/sidebar/SidebarFeedbackDialog'
import {Button} from '@/components/ui/button'
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from '@/components/ui/tooltip'
import NewWorkspaceComposerCard from '@/components/NewWorkspaceComposerCard'
import evidence from './evidence.json'
import {toRuntimeExecutionHostId} from '@/../../shared/execution-host'
import {MessageRow} from '@/components/native-chat/NativeChatMessageRow'
import {NativeChatComposerField} from '@/components/native-chat/NativeChatComposerField'
import {useImeEnterGestureOwnership} from '@/lib/ime-composition-keyboard-event'

const projects=[{kind:'project-group',id:'project-group:bw',projectGroupId:'bw',displayName:'Builders Workbench',badgeColor:'var(--muted-foreground)',detail:'builder-workbench',parentPath:'C:/workspaces',connectionId:null}]
const hosts=[
 {kind:'ready',id:'setup-local',projectId:'project-group:bw',hostId:'local',repoId:'bw-local',label:'处理者本机',detail:'已登记 BW 仓',path:'C:/workspaces/builder-workbench'},
 {kind:'ready',id:'setup-team',projectId:'project-group:bw',hostId:toRuntimeExecutionHostId('bw-demo-dev-w02'),repoId:'bw-team',label:'团队开发机 Dev-W02',detail:'已配对 BW 执行宿主 · 已授权 · 已登记 BW 仓',path:'/srv/workspaces/builder-workbench'},
 {kind:'needs-setup',id:'setup-offline',projectId:'project-group:bw',hostId:toRuntimeExecutionHostId('bw-demo-dev-w08'),label:'团队开发机 Dev-W08',detail:'离线',isAvailable:false,attention:false,canSetLocation:false}
]
const scenarios={
 A:{name:'BW 自用',project:'Builders Workbench',title:'任务页 · 验收笔记',draft:'核对任务筛选，补充验收记录。'},
 B:{name:'其他项目',project:'订单服务',title:'订单查询 · 实现草稿',draft:'补充订单查询失败路径的处理说明。'},
 C:{name:'外部渠道',project:'维护侧',title:'维护工作 · 待分诊',draft:'整理本轮产品反馈。'}
}
const noop=()=>{}
const emptyAutocomplete={mode:'none'}
const titlebarLayout={
 activeView:'terminal',
 effectiveActiveTabId:null,
 creationLayoutActive:false,
 workspaceChromeActive:true,
 showTitlebarExpandButton:false,
 activeTabCanExpand:false,
 showRightSidebarControls:false,
 rightSidebarOpen:false
} as AppChromeLayout
const feedbackCopy={
 'auto.components.sidebar.SidebarFeedbackDialog.workbenchDescription':'说一句问题或期望，可附已有图片。反馈送到本机改进会话，你可以继续原工作。',
 'auto.components.sidebar.SidebarFeedbackDialog.7a46c228b8':'已交给本机改进会话。'
}
const originalCopy=new Map()
function adaptFeedbackCopy(isCollector){
 for(const [key,value] of Object.entries(feedbackCopy)){
  if(!originalCopy.has(key))originalCopy.set(key,i18n.getResource('zh','translation',key))
  i18n.addResource('zh','translation',key,isCollector?value:originalCopy.get(key))
 }
}
const apiBridge={}
window.api={
 gh:{viewer:async()=>null},
 platform:{get:()=>({platform:'win32',osRelease:'演示 Windows',arch:'x64'})},
 updater:{getVersion:async()=> '演示版本',check:async()=>{}},
 feedback:{submit:async args=>apiBridge.submit(args)},
 shell:{openUrl:async()=>{}},
 app:{restart:async()=>{},openCrashReport:async()=>{},showAbout:async()=>{}}
}

function ChatComposer({value,onChange,onSend,scope="review-collector"}){
 const ref=useRef(null)
 const ime=useImeEnterGestureOwnership()
 return <NativeChatComposerField composerScopeKey={scope} textareaRef={ref}
   draft={value} disabled={false} hasPty={false} canSend={!!value.trim()} autocomplete={emptyAutocomplete}
   activeSuggestion={-1} notice={null} imageAttachments={[]} sendButtonDisabled={!value.trim()}
   isWorking={false} attachDisabled dictationDisabled isDictating={false} isDictationHoldMode={false}
   imeEnterGesture={ime} onDraftChange={onChange} onTextareaSelect={noop}
   onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();onSend()}}}
   onImeSettled={noop} onPaste={noop} pickerListboxId="feedback-review-picker" onChoosePickerItem={noop}
   onRetrySkills={noop} onAcceptMention={noop} onRemoveImageAttachment={noop} onAttach={noop}
   onDictationToggle={noop} onDictationHoldStart={noop} onDictationHoldEnd={noop} onSend={onSend}
   sessionOptionsSurface={null} sessionOptionsSnapshot={[]}/>
}
function ChatRow({text,role='assistant',id}){
 return <MessageRow message={{id,role,blocks:[{type:'text',text}],timestamp:1,source:'transcript'}} expandSignal={false} onScrollMessageToTop={noop}/>
}
function ChatTranscript({children}){
 return <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-[5px]">{children}</div>
}
function App(){
 const [which,setWhich]=useState('A')
 const [pane,setPane]=useState('work')
 const [drafts,setDrafts]=useState(Object.fromEntries(Object.entries(scenarios).map(([key,value])=>[key,value.draft])))
 const [reports,setReports]=useState({})
 const [errorNext,setErrorNext]=useState(false)
 const [feedbackOpen,setFeedbackOpen]=useState(false)
 const [reply,setReply]=useState('')
 const [host,setHost]=useState(null)
 const [project,setProject]=useState('project-group:bw')
 const [workspaceName,setWorkspaceName]=useState('issue-d01')
 const [quickAgent,setQuickAgent]=useState(null)
 const [advanced,setAdvanced]=useState(false)
 const [workerNote,setWorkerNote]=useState('')
 const [parentWorktree,setParentWorktree]=useState(null)
 const [workMessages,setWorkMessages]=useState({})
 const [dark,setDark]=useState(false)
 const [grabResult,setGrabResult]=useState('')
 const [grabStatus,setGrabStatus]=useState('')
 const grabApi=useRef(null)
 const activateGrab=async()=>{
  try{
   if(!grabApi.current){
    const {getGlobalApi,init}=await import('react-grab')
    const api=getGlobalApi()??init({freezeReactUpdates:false})
    api.setOptions({freezeReactUpdates:false})
    api.registerPlugin({name:'bw-review-evidence',hooks:{
     onElementSelect:async element=>{const context=await api.getStackContext(element);if(context){setGrabResult(context);setGrabStatus("已读取元素上下文。可复制后粘贴进反馈。")}},
     onCopySuccess:(_elements,content)=>{setGrabResult(content);setGrabStatus('已复制元素上下文，可粘贴进反馈。')},
     onCopyError:()=>setGrabStatus('未能复制。可重试，也可直接填写反馈。')
    }})
    grabApi.current=api
   }
   grabApi.current.activate()

   setGrabStatus('悬停实际组件，按 Ctrl+C 启动复制，或使用 React Grab 自己的选取。Esc 退出。')
  }catch{setGrabStatus('当前浏览器无法启用开发采集，可直接打开反馈。')}
 }
 const openFeedback=()=>{
  adaptFeedbackCopy(true)
  setFeedbackOpen(true)
 }
 const report=reports[which]
 const scene=scenarios[which]
 const transition=patch=>setReports(current=>({...current,[which]:{...current[which],...patch}}))
 const note=(text,attachments=0)=>transition({text,attachments,stage:'collected',additional:[]})
 apiBridge.submit=async args=>{
  if(errorNext){setErrorNext(false);return {ok:false,error:'演示发送失败，内容仍在表单中。'}}
  if(feedbackOpen) note(args.feedback,args.images?.length??0)
  return {ok:true,imagesDelivered:true}
 }
 const ask=()=>{
  if(report?.stage==='collected')transition({stage:'waiting'})
  else if(report?.stage==='working')transition({stage:'review'})
 }
 const replySend=()=>{
  if(!reply.trim()||!report)return
  const next={additional:[...report.additional,reply.trim()],stage:report.stage==='waiting'?'issue':report.stage}
  if(report.stage==='waiting'&&which==='A')Object.assign(next,{stage:'working',worker:makeWorker(hosts[0])})
  transition(next)
  setReply('')
 }
 const switchScenario=id=>{setWhich(id);setPane('work');setReply('');setHost(null)}
 const locations=hosts.find(option=>option.id===host)
 const makeWorker=location=>({...location,agent:quickAgent,workspaceId:location.hostId+':bw:issue-d01',branch:'codex/'+workspaceName,workspacePath:location.hostId==='local'?'C:/workspaces/.orca/worktrees/builder-workbench/'+workspaceName:'/srv/workspaces/.orca/worktrees/builder-workbench/'+workspaceName})
 const receiveWorkspace=()=>{if(locations?.kind!=='ready')return;transition({stage:'working',worker:makeWorker(locations)});setPane('chat')}
 return <TooltipProvider><div className="min-h-screen bg-background text-foreground">
   <header className="border-b border-border bg-card px-5 py-3" aria-label="原型评审工具">
     <div className="flex flex-wrap items-center gap-3"><strong>改进 BW</strong><span>工作区 → 反馈会话 → BW Issue</span><span className="text-muted-foreground">研发保障 · 待评审局部交互 · 演示数据</span>
     <a className="underline text-sm" href="../intent.md">意图</a><a className="underline text-sm" href="../spec.md">规格</a><a className="underline text-sm" href="../STATUS.md">状态</a></div>
     <div className="my-2 flex flex-wrap items-center gap-2">
       {Object.entries(scenarios).map(([id,entry])=><Button key={id} variant={id===which?'secondary':'ghost'} onClick={()=>switchScenario(id)} data-testid={'scenario-'+id}>{id} · {entry.name}</Button>)}
       {which==='C'&&<Button variant="outline" data-testid="external-intake" onClick={()=>{note('群空间反馈已人工转入：清除 BW 任务筛选后仍然只有两条。');setPane('chat')}}>模拟维护者从 WeLink 接报</Button>}
       {which!=='C'&&<Button variant="outline" onClick={activateGrab} data-testid="dev-react-grab">开发模式：原生元素采集</Button>}
       {grabStatus&&<span className="text-sm text-muted-foreground" role="status">{grabStatus}</span>}
       <Button variant="outline" onClick={ask} data-testid="advance">推进演示后台</Button>
       <label className="text-sm"><input type="checkbox" checked={errorNext} onChange={e=>setErrorNext(e.target.checked)}/> 下次发送失败</label>
       <Button variant="ghost" onClick={()=>{document.documentElement.classList.toggle('dark',!dark);setDark(!dark)}}>切换主题</Button>
       <Button variant="ghost" onClick={()=>{setReports(old=>({...old,[which]:undefined}));setDrafts(old=>({...old,[which]:scene.draft}));switchScenario(which)}}>重置场景</Button>
     </div>
     <dl className="mb-3 grid gap-2 text-sm sm:grid-cols-3" aria-label="当前场景运行位置">
       <div><dt className="font-semibold">来源</dt><dd>{which==='C'?'WeLink 群空间 → 维护者接续':scene.project+' · 原工作区与草稿'}</dd></div>
       <div><dt className="font-semibold">收集会话</dt><dd>{which==='C'?'维护者本机':'报告者本机'} · 演示非 Git 目录</dd></div>
       <div><dt className="font-semibold">修复 Worker</dt><dd>BW 仓 · {report?.worker?.label||(which==='A'?'已配置的本机':'处理时选本机或已配对团队宿主')}</dd></div>
     </dl>
     <p className="mb-2 text-sm"><strong>本屏真实复用：</strong>{pane==='workspace'?'BW 新建工作区完整组件及项目/宿主选择':feedbackOpen?'BW 原生反馈表单':'BW 导航、原生会话消息和输入框'}。<strong>拟补：</strong>标题栏反馈入口、现场转交、专用收集目录与 Skill、Issue 到 Worker 的自动衔接。</p>
     {grabResult&&<details className="text-sm"><summary>本次 React Grab 元素上下文</summary><pre className="whitespace-pre-wrap break-all">{grabResult}</pre></details>}
     <details className="text-sm"><summary>旅程、运行位置、提示词与证据边界</summary>
       <p>原型演示止于阅读 Worker 返回的交付记录。所见会话、Issue、工作区与证据均为演示数据。打开开发实例进行同路径复验是规格中的待验证目标。React Grab 已确认原库激活，复制结果尚未通过自动检查，仍待人工/真壳验证。此页局部挂载真实组件，不代表完整 Electron 外壳验收。<a className="underline" href="dist/component-manifest.json">组件来源与哈希</a></p>
       <p>实际导入 WorkbenchRail、TitlebarMainStrip、SidebarFeedbackDialog、NewWorkspaceComposerCard（内含 ProjectCombobox、RunTargetCombobox）、NativeChatMessageRow 和 NativeChatComposerField。原工作与收集均使用原生聊天行和输入框。上方场景与后台推进仅供评审。标题栏下的回看动作是拟补的会话切换。Rail 的其他页面导航不在本次演示范围；工作区承载框架、数据、API 与验收均为隔离演示。</p>
       <p>现有反馈发往 WeLink。拟补工作区标题栏「反馈 BW」与提交后异步分流、本机自动登记非 Git 收集目录、收集会话 Skill。A 在已有配置和授权时由模型组织原生 Issue 关联开工，再按精确工作区 ID 派工，这段自动衔接仍为目标；B/C 在配置缺失时由处理者确认工作区。结构化会话不在 Floating 面板运行。远端 Worker 用终端，本原型展示派工回执。开发模式评审按钮实际加载 React Grab，仅定位本原型的真实元素，有源码时一并复制。正式版无 React Grab，原生附件可继续使用，正式版元素采集是待评审目标。工作区标题栏操作区的「反馈 BW」是本稿拟新增的位置，直接打开现有反馈表单并适配投递文案。已有帮助入口仍显示 WeLink。</p>
       <h2 className="mt-3 font-semibold">当前场景的运行位置</h2>
       {Object.entries(evidence.scenarios?.[which]||{}).filter(([,v])=>typeof v==='string').map(([key,value])=><p key={key}>{value}</p>)}
       <h2 className="mt-3 font-semibold">职责与证据边界</h2>
       {Object.values(evidence.boundaries||{}).map((value,i)=><p key={i}><strong>{value.label}</strong> {value.text}</p>)}
       {Object.values(evidence.prompts||{}).map(prompt=><details className="my-2" key={prompt.label}><summary>{prompt.label}</summary><pre className="whitespace-pre-wrap rounded bg-muted p-3">{prompt.text}</pre></details>)}
       <h2 className="mt-3 font-semibold">源码依据</h2>
       {evidence?.sources?.map(source=><p key={source.id}><a className="underline" href={source.url}>{source.label}</a> · {source.finding}</p>)}
     </details>
   </header>
   
   <div className="flex min-h-[80vh]">
     <WorkbenchRail/>
     <main className="min-w-0 flex-1">
       {which!=='C'&&<div className="titlebar flex items-center border-b border-border px-4 py-2"><TitlebarMainStrip layout={titlebarLayout}/>
        <Tooltip><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={openFeedback} data-testid="canvas-feedback">反馈 BW</Button></TooltipTrigger><TooltipContent>反馈当前 BW 使用问题</TooltipContent></Tooltip>
       </div>}
       <nav className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2" aria-label="工作区回看">
         <Button variant={pane==='work'?'secondary':'ghost'} size="sm" aria-current={pane==='work'?'page':undefined} data-testid="back-work" onClick={()=>setPane('work')}>原工作</Button>
         {report&&<Button variant={pane==='chat'?'secondary':'ghost'} size="sm" aria-current={pane==='chat'?'page':undefined} data-testid="open-collector" onClick={()=>setPane('chat')}>改进会话{['waiting','review'].includes(report.stage)?' · 待回应':''}</Button>}
         {['issue','working','review','confirmed'].includes(report?.stage)&&<Button variant={pane==='issue'?'secondary':'ghost'} size="sm" aria-current={pane==='issue'?'page':undefined} data-testid="open-issue" onClick={()=>setPane('issue')}>查看 Issue</Button>}
       </nav>
       <div className="mx-auto max-w-4xl px-4 py-6">
         {pane==='work'&&<section>
           <h1 className="mb-2 text-xl font-semibold">{scene.title}</h1><p className="mb-4 text-muted-foreground">{scene.project} · 原工作区</p>
           <ChatTranscript><ChatRow id="original-status" text="当前会话保留了原项目的上下文，你可以继续处理本次工作。"/>
           {(workMessages[which]||[]).map((text,index)=><ChatRow key={index} id={'work-'+index} role="user" text={text}/>)}
           </ChatTranscript><div className="mt-5" data-testid="original-draft"><ChatComposer scope={'original-'+which} value={drafts[which]} onChange={value=>setDrafts(old=>({...old,[which]:value}))} onSend={()=>{if(!drafts[which].trim())return;setWorkMessages(old=>({...old,[which]:[...(old[which]||[]),drafts[which]]}));setDrafts(old=>({...old,[which]:''}))}}/></div>
         </section>}
         {pane==='chat'&&report&&<section data-testid="collector">
           <h1 className="text-xl font-semibold">改进会话</h1><p className="mb-5 text-muted-foreground">{which==='C'?'维护者本机':'报告者本机'} · C:/workspaces/bw-feedback（演示非 Git 目录） · 独立原生会话</p>
           <ChatTranscript><ChatRow id="original" role="user" text={report.text}/>
           <ChatRow id="received" text={'收到来自 '+scene.project+' 的反馈。我会核对既有问题和行为；你可以继续原工作。'+(report.attachments?' 演示收到图片附件 '+report.attachments+' 张。':'')}/>
           {report.stage==='waiting'&&<ChatRow id="question" text="我查到清除筛选后应恢复完整列表。这个问题发生在任务屏，还是在另一个列表？"/>}
           {report.additional.map((text,index)=><ChatRow key={index} id={'answer-'+index} role="user" text={text}/>)}
           {report.worker&&<ChatRow id="receipt" text={'派工回执 · '+report.worker.label+' · '+report.worker.workspacePath+' · '+report.worker.branch+' · '+report.worker.workspaceId+'。'+(report.worker.hostId==='local'?'按本机智能体配置启动。':'远端使用终端会话。')}/>}
           {report.stage==='review'&&<ChatRow id="ready" text="Worker 返回同路径的基线与修复记录。"/>}
           {report.stage==='confirmed'&&<ChatRow id="confirmed" text="已记录你读过演示证据。真实验收、Issue 与 PR 后续仍沿原生授权处理。"/>}
           </ChatTranscript>{report.stage==='review'&&<div className="mt-5"><Button data-testid="open-check" onClick={()=>setPane('check')}>查看交付证据</Button></div>}
           <div className="mt-5"><ChatComposer value={reply} onChange={setReply} onSend={replySend}/></div>
         </section>}
         {pane==='issue'&&report&&<section data-testid="issue">
           <h1 className="text-xl font-semibold">Issue #D01 · 清除筛选后恢复完整列表</h1><p className="mb-5 text-muted-foreground">Builders Workbench · 演示 Issue</p>
           <ChatTranscript><ChatRow id="issue-description" text={report.text}/></ChatTranscript><div className="mt-5 flex flex-wrap gap-2">
           {!report.worker&&<Button data-testid="open-workspace" onClick={()=>{setHost('setup-local');setPane('workspace')}}>为 Issue 开始工作区</Button>}
           {report.worker&&<Button data-testid="open-receipt" onClick={()=>setPane('chat')}>查看派工回执</Button>}</div>
         </section>}
         {pane==='workspace'&&<section data-testid="workspace">
           <h1 className="text-xl font-semibold">新建工作区</h1><p className="mb-5 text-muted-foreground">关联 BW Issue #D01。反馈来源与执行宿主分别选择；不会共享发起人的机器。</p>
           <NewWorkspaceComposerCard
            quickAgent={quickAgent} onQuickAgentChange={setQuickAgent} eligibleRepos={[]} repoId={locations?.repoId||'bw-local'}
            projectOptions={projects} selectedProjectId={project} selectedRepoIsGit onRepoChange={noop} onProjectChange={setProject}
            primaryActionLabel="创建关联工作区并派工" name={workspaceName} onNameValueChange={setWorkspaceName}
            onSmartGitHubItemSelect={noop} onSmartGitLabItemSelect={noop} onSmartBranchSelect={noop} onSmartLinearIssueSelect={noop}
            smartNameSelection={null} onClearSmartNameSelection={noop} canReuseSelectedBranch={false} reuseSelectedBranch={false}
            onReuseSelectedBranchChange={noop} forkPushWarning={null} detectedAgentIds={null} onOpenAgentSettings={noop}
            advancedOpen={advanced} onToggleAdvanced={()=>setAdvanced(!advanced)} parentWorktreeId={parentWorktree} onParentWorktreeIdChange={setParentWorktree}
            createDisabled={!locations||locations.kind!=='ready'||!workspaceName.trim()} projectError={null} creating={false} onCreate={receiveWorkspace}
            note={workerNote} onNoteChange={setWorkerNote} setupConfig={null} requiresExplicitSetupChoice={false} setupDecision={null} onSetupDecisionChange={noop}
            setupAgentStartupPolicy="start-immediately" onSetupAgentStartupPolicyChange={noop} shouldWaitForSetupCheck={false} resolvedSetupDecision={null}
            createError={null} selectedRepoConnectionId={null} selectedRepoSshStatus={null} selectedRepoRequiresConnection={false}
            selectedRepoConnectInProgress={false} onConnectSelectedRepo={async()=>{}} canUseSparseCheckout={false} sparsePresets={[]}
            sparseSelectedPresetId={null} onSparseSelectPreset={noop} branchNameOverride={undefined} onBranchNameOverrideChange={noop}
            branchesEnabled={false} setupControlsEnabled={false} sparseControlsEnabled={false} projectHostSetupOptions={hosts}
            selectedProjectHostSetupId={host} onProjectHostSetupChange={setHost} showAddProjectButton={false}/>
           <Button variant="ghost" onClick={()=>setPane('issue')}>取消</Button>
         </section>}
         {pane==='check'&&report&&<section data-testid="check">
           <h1 className="mb-2 text-xl font-semibold">交付证据</h1>
           <ChatTranscript><ChatRow id="baseline" text="**基线证据（演示）**：选中待处理筛选，列表为 2 条。清除筛选后仍为 2 条。"/>
           <ChatRow id="fixed" text="**修复证据（演示）**：选中后为 2 条。清除后恢复全部 6 条。"/></ChatTranscript>
           <div className="mt-5 flex flex-wrap gap-2"><Button data-testid="confirm" onClick={()=>{transition({stage:'confirmed'});setPane('chat')}}>确认已看懂记录</Button><Button variant="outline" data-testid="rework" onClick={()=>{transition({stage:'working'});setPane('chat')}}>退回修复</Button></div>
         </section>}
       </div>
     </main>
   </div>
   <SidebarFeedbackDialog open={feedbackOpen} onOpenChange={open=>{setFeedbackOpen(open);if(!open)adaptFeedbackCopy(false)}}/>
   <Toaster/>
 </div></TooltipProvider>
}
void setRendererUiLanguage('zh').finally(()=>createRoot(document.getElementById('root')).render(<App/>))















