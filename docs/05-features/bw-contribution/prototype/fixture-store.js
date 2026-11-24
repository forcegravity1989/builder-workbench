import {create} from 'zustand'
const noop=()=>{}
const asyncNoop=async()=>{}
export const useAppStore=create(set=>({
 activeView:'terminal', taskPageData:{}, projects:[],repos:[], settings:{notifications:{enabled:false,agentTaskComplete:false}},
 updateStatus:{state:'idle'},worktreesByRepo:{},featureInteractions:{},jiraStatus:{connected:false},jiraStatusChecked:true,checkJiraConnection:asyncNoop,
 preflightStatus:null,preflightStatusChecked:true,linearStatus:{connected:false},linearStatusChecked:true,
 sshConnectionStates:new Map(),sshTargetLabels:new Map(),runtimeEnvironments:[],runtimeStatusByEnvironmentId:{},
 remoteWorkspaceSyncStatusByTargetId:{},
 setActiveView:activeView=>set({activeView}),openActivityPage:()=>set({activeView:'activity'}),
 openTaskPage:()=>set({activeView:'tasks'}),openAutomationsPage:()=>set({activeView:'automations'}),
 openArtifactsPage:()=>set({activeView:'artifacts'}),openSettingsPage:()=>set({activeView:'settings'}),
 openSettingsTarget:()=>set({activeView:'settings'}),updateSettings:asyncNoop,
 setSidebarBody:noop,setSidebarOpen:noop,openModal:noop,
 refreshPreflightStatus:asyncNoop,checkLinearConnection:asyncNoop,prefetchWorkItems:asyncNoop,
 readRuntimeHostStatusSnapshots:asyncNoop,hydrateRuntimeEnvironmentStatuses:asyncNoop,
 recordFeatureInteraction:noop
}))
