;(() => {
  'use strict'

  // Static output from the same Lucide components as the current renderer.
  const icons = {
    CircleHelp:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-question-mark" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>',
    RefreshCw:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-cw" aria-hidden="true" focusable="false"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg>',
    UsersRound:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-users-round" aria-hidden="true" focusable="false"><path d="M18 21a8 8 0 0 0-16 0"></path><circle cx="10" cy="8" r="5"></circle><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"></path></svg>',
    UserRound:
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user-round" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="5"></circle><path d="M20 21a8 8 0 0 0-16 0"></path></svg>',
    Link2:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-2" aria-hidden="true" focusable="false"><path d="M9 17H7A5 5 0 0 1 7 7h2"></path><path d="M15 7h2a5 5 0 0 1 0 10h-2"></path><line x1="8" x2="16" y1="12" y2="12"></line></svg>',
    Plus: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus" aria-hidden="true" focusable="false"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>',
    X: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x" aria-hidden="true" focusable="false"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>',
    LayoutGrid:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid" aria-hidden="true" focusable="false"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>',
    PackageCheck:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package-check" aria-hidden="true" focusable="false"><path d="M12 22V12"></path><path d="m16 17 2 2 4-4"></path><path d="M21 11.127V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l1.32-.753"></path><path d="M3.29 7 12 12l8.71-5"></path><path d="m7.5 4.27 8.997 5.148"></path></svg>',
    LayoutDashboard:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-dashboard" aria-hidden="true" focusable="false"><rect width="7" height="9" x="3" y="3" rx="1"></rect><rect width="7" height="5" x="14" y="3" rx="1"></rect><rect width="7" height="9" x="14" y="12" rx="1"></rect><rect width="7" height="5" x="3" y="16" rx="1"></rect></svg>',
    ListTodo:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-todo" aria-hidden="true" focusable="false"><path d="M13 5h8"></path><path d="M13 12h8"></path><path d="M13 19h8"></path><path d="m3 17 2 2 4-4"></path><rect x="3" y="4" width="6" height="6" rx="1"></rect></svg>',
    CalendarClock:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-calendar-clock" aria-hidden="true" focusable="false"><path d="M16 14v2.2l1.6 1"></path><path d="M16 2v4"></path><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"></path><path d="M3 10h5"></path><path d="M8 2v4"></path><circle cx="16" cy="16" r="6"></circle></svg>',
    BookOpen:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open" aria-hidden="true" focusable="false"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>',
    Settings:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings" aria-hidden="true" focusable="false"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    ExternalLink:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link" aria-hidden="true" focusable="false"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>',
    SlidersHorizontal:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sliders-horizontal" aria-hidden="true" focusable="false"><path d="M10 5H3"></path><path d="M12 19H3"></path><path d="M14 3v4"></path><path d="M16 17v4"></path><path d="M21 12h-9"></path><path d="M21 19h-5"></path><path d="M21 5h-7"></path><path d="M8 10v4"></path><path d="M8 12H3"></path></svg>',
    Download:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download" aria-hidden="true" focusable="false"><path d="M12 15V3"></path><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5"></path></svg>',
    FilePenLine:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-pen-line" aria-hidden="true" focusable="false"><path d="M14.364 13.634a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506l4.013-4.009a1 1 0 0 0-3.004-3.004z"></path><path d="M14.487 7.858A1 1 0 0 1 14 7V2"></path><path d="M20 19.645V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l2.516 2.516"></path><path d="M8 18h1"></path></svg>',
    Ellipsis:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
    GitPullRequest:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-git-pull-request" aria-hidden="true" focusable="false"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" x2="6" y1="9" y2="21"></line></svg>',
    PanelLeft:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-left" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M9 3v18"></path></svg>',
    PanelRight:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-panel-right" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2"></rect><path d="M15 3v18"></path></svg>',
    Minus:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus" aria-hidden="true" focusable="false"><path d="M5 12h14"></path></svg>',
    Square:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square" aria-hidden="true" focusable="false"><rect width="18" height="18" x="3" y="3" rx="2"></rect></svg>',
    FolderGit2:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-git2 lucide-folder-git-2" aria-hidden="true" focusable="false"><path d="M18 19a5 5 0 0 1-5-5v8"></path><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"></path><circle cx="13" cy="12" r="2"></circle><circle cx="20" cy="19" r="2"></circle></svg>',
    ArrowRightLeft:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 4 4-4 4M20 7H4m4 14-4-4 4-4M4 17h16"></path></svg>',
    ArrowLeft:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left" aria-hidden="true" focusable="false"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>',
    Check:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"></path></svg>',
    ChevronsUpDown:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevrons-up-down" aria-hidden="true" focusable="false"><path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path></svg>',
    LoaderCircle:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-circle" aria-hidden="true" focusable="false"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>',
    Terminal:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-terminal" aria-hidden="true" focusable="false"><path d="M12 19h8"></path><path d="m4 17 6-6-6-6"></path></svg>',
    Network:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-network" aria-hidden="true" focusable="false"><rect x="16" y="16" width="6" height="6" rx="1"></rect><rect x="2" y="16" width="6" height="6" rx="1"></rect><rect x="9" y="2" width="6" height="6" rx="1"></rect><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"></path><path d="M12 12V8"></path></svg>',
    MonitorSmartphone:
      '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-monitor-smartphone" aria-hidden="true" focusable="false"><rect width="14" height="10" x="2" y="3" rx="2"></rect><path d="M7 21h4"></path><path d="M9 17v4"></path><rect width="5" height="9" x="17" y="12" rx="1"></rect><path d="M19 14h1"></path></svg>',
    Lock: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock" aria-hidden="true" focusable="false"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>',
    Search:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-search" aria-hidden="true" focusable="false"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>',
    Copy: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy" aria-hidden="true" focusable="false"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>',
    Trash2:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2 lucide-trash-2" aria-hidden="true" focusable="false"><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    Pencil:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pencil" aria-hidden="true" focusable="false"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"></path><path d="m15 5 4 4"></path></svg>',
    Server:
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-server" aria-hidden="true" focusable="false"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"></rect><rect width="20" height="8" x="2" y="14" rx="2" ry="2"></rect><line x1="6" x2="6.01" y1="6" y2="6"></line><line x1="6" x2="6.01" y1="18" y2="18"></line></svg>',
    Pin: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin" aria-hidden="true" focusable="false"><path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path></svg>',
    Send: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-send" aria-hidden="true" focusable="false"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"></path><path d="m21.854 2.147-10.94 10.939"></path></svg>'
  }

  const names = { lead: '韩岚', lin: '林安', chen: '陈远' }
  const hosts = {
    lead: { id: 'host-hanlan', tree: 'issue-201-review', task: '评审与发布' },
    lin: { id: 'host-linan', tree: 'issue-184-export', task: '发布清单导出' },
    chen: { id: 'host-chenyuan', tree: 'issue-192-import', task: '导入错误定位' }
  }
  const project = '星图服务'
  const teamName = '神盾局'
  const demoGroup = '938583054774198541'
  const demoSpaceId = '20065474'
  const alternateGroup = '938583054774198542'
  const alternateSpaceId = '20065475'
  const bindingKey = (group, space) => `${group}|${space}`
  // 演示数据：OneBox teamSpaceList 的原始条目形态。emeeting-* 是自动建的会议
  // 空间，没有 WeLink 群；groupId 为空代表空间还在但群已解散，选中后报无关联群。
  const demoRawSpaces = [
    { spaceId: demoSpaceId, groupId: demoGroup, name: '神盾局项目群', curNumbers: 12, ownedByUserName: '韩岚' },
    // 排在「交付看板协作群」之前，用来演示搜索时前缀命中会插到包含命中前面。
    { spaceId: '24170355', groupId: '1030194633998627511', name: '星图交付保障群', curNumbers: 6, ownedByUserName: '陈远' },
    { spaceId: alternateSpaceId, groupId: alternateGroup, name: '交付看板协作群', curNumbers: 5, ownedByUserName: '林安' },
    { spaceId: '24160277', groupId: '1030194633998627497', name: '星图服务发布群', curNumbers: 8, ownedByUserName: '陈远' },
    { spaceId: '24190113', groupId: '', name: '临时对齐（群已解散）', curNumbers: 4, ownedByUserName: '林安' },
    { spaceId: '24188001', groupId: '', name: 'emeeting-20261127-1402', curNumbers: 3, ownedByUserName: '韩岚' },
    { spaceId: '24188002', groupId: '', name: 'emeeting-20261126-0930', curNumbers: 2, ownedByUserName: '陈远' }
  ]
  // 与主进程 isMeetingSpaceName 同一条规则：会议空间不进可绑定列表。
  const demoBindableSpaces = demoRawSpaces.filter(
    (space) => !space.name.toLowerCase().startsWith('emeeting-')
  )
  const demoProjectGroup = '300000000000000001'
  const employees = { lead: 'A0010001', lin: 'A0010002', chen: 'A0010003' }
  const addresses = {
    lead: 'ws://192.0.2.9:6767',
    lin: 'ws://192.0.2.10:6768',
    chen: 'ws://192.0.2.11:6771'
  }
  const dayMs = 86_400_000
  const auditRetentionDays = 14
  const auditLogDirectory = 'userData/logs/orca-shared-host/'

  function hostLabel(person) {
    return names[person] ?? '成员'
  }

  const avatarAssets = {
    lead: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2232%22 fill=%22%23536dfe%22/%3E%3Ccircle cx=%2232%22 cy=%2224%22 r=%2211%22 fill=%22white%22/%3E%3Cpath d=%22M14 57c2-13 10-20 18-20s16 7 18 20%22 fill=%22white%22/%3E%3C/svg%3E',
    lin: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2232%22 fill=%22%230f9d79%22/%3E%3Ccircle cx=%2232%22 cy=%2224%22 r=%2211%22 fill=%22white%22/%3E%3Cpath d=%22M14 57c2-13 10-20 18-20s16 7 18 20%22 fill=%22white%22/%3E%3C/svg%3E',
    chen: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2232%22 fill=%22%23d97706%22/%3E%3Ccircle cx=%2232%22 cy=%2224%22 r=%2211%22 fill=%22white%22/%3E%3Cpath d=%22M14 57c2-13 10-20 18-20s16 7 18 20%22 fill=%22white%22/%3E%3C/svg%3E'
  }

  function weLinkMember(person) {
    return {
      member_id: employees[person],
      name: names[person],
      avatar: `welink://avatar/${employees[person]}`,
      host_id: hosts[person]?.id ?? `${person}-host`,
      identity_source: 'welink-cli'
    }
  }

  function findDemoSpace(spaceId) {
    return demoBindableSpaces.find((space) => space.spaceId === spaceId) ?? null
  }

  // 与 team-group-search.ts 同一套排序：前缀命中排在包含命中前，同档保持服务端顺序。
  function searchDemoSpaces(query) {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return [...demoBindableSpaces]
    }
    const prefix = []
    const contains = []
    for (const space of demoBindableSpaces) {
      const name = space.name.toLowerCase()
      if (name.startsWith(needle)) {
        prefix.push(space)
      } else if (name.includes(needle)) {
        contains.push(space)
      }
    }
    return [...prefix, ...contains]
  }

  function demoSpaceDetail(space) {
    return `${space.curNumbers} 人 · 群主 ${space.ownedByUserName}`
  }

  // 与 TeamGroupSpaceCombobox 的 failureCopy 同一套文案：OneBox 的原始报错带
  // cookie 与 CSRF 令牌，一律不上屏，只显示主进程判定的原因。
  const groupFailureCopy = {
    'w3-unconfigured': { message: '还没配置 W3 账户，读不到群列表。', needsAccount: true },
    'w3-not-signed-in': { message: 'W3 账户未登录，读不到群列表。', needsAccount: true },
    'onebox-unauthorized': {
      message: 'W3 免密登录没有通过 OneBox 校验，读不到群列表。',
      needsAccount: true
    },
    'rate-limit': { message: 'OneBox 接口限流，稍后重试。', needsAccount: false },
    unreachable: { message: '连不上 OneBox 群空间服务。', needsAccount: false },
    'parse-failed': { message: 'OneBox 返回的群列表无法解析。', needsAccount: false },
    'not-a-group-space': {
      message: '这个空间没有关联 WeLink 群，换一个群试试。',
      needsAccount: false
    }
  }

  function groupFailure(reason) {
    const copy = groupFailureCopy[reason] ?? groupFailureCopy.unreachable
    return `<div class="group-picker-failure" role="alert"><p>${esc(copy.message)}</p>${
      copy.needsAccount
        ? button('打开 W3 账户设置', 'open-w3-account-settings', { kind: 'secondary' })
        : ''
    }</div>`
  }

  function blankGroupPicker() {
    return {
      open: false,
      query: '',
      phase: 'idle',
      listFailure: '',
      truncated: false,
      selection: null,
      resolving: false,
      resolveFailure: ''
    }
  }

  // 绑定表单每次打开都重新挂载：清掉上一次的选择与面板状态，已读到的群列表按
  // useTeamGroupPicker 的缓存保留；失败过的列表退回 idle，下次打开重试。
  function reopenGroupPicker(picker) {
    return {
      ...blankGroupPicker(),
      phase: picker.phase === 'failed' ? 'idle' : picker.phase,
      truncated: picker.truncated
    }
  }

  // 读取结果由评审工具区的「群列表」注入，模拟 OneBox 的各种返回。
  function loadGroupList() {
    const picker = current().groupPicker
    // 已就绪的列表直接复用（对应 useTeamGroupPicker 的 TTL 缓存），读取中的不
    // 重复触发分页；失败过的留在 failed，由下一次打开重试。
    if (picker.phase === 'loading' || picker.phase === 'ready') {
      return
    }
    const mode = document.querySelector('#group-list-result')?.value ?? 'ready'
    const person = actor.value
    const desktop = current()
    picker.phase = 'loading'
    picker.listFailure = ''
    setTimeout(() => {
      if (desktops[person] !== desktop) {
        return
      }
      if (mode === 'ready' || mode === 'truncated') {
        picker.phase = 'ready'
        picker.truncated = mode === 'truncated'
      } else {
        picker.phase = 'failed'
        picker.truncated = false
        picker.listFailure = mode
      }
      if (actor.value === person) {
        render()
      }
    }, 450)
  }

  // 绑定表单可见就开始读取，和 useTeamGroupPicker 挂载即 loadList 一致。
  // 幂等：phase 同步置为 loading，重复 render 不会重复触发分页。
  function startGroupListIfNeeded() {
    const desktop = current()
    const bindingVisible =
      desktop.panel === 'team' && (!desktop.directoryDraft || desktop.switchingTeam)
    if (!bindingVisible || desktop.groupPicker.phase !== 'idle') {
      return
    }
    loadGroupList()
  }

  // Catalog identity only. Which desktop currently has the repo is wallRepos.
  const catalogRepos = {
    star: {
      repoId: 'star',
      name: project,
      repository: 'https://codehub.example.invalid/team/star',
      group: demoProjectGroup,
      task: '发布清单导出'
    },
    board: {
      repoId: 'board',
      name: '交付看板',
      repository: 'https://codehub.example.invalid/team/delivery-board',
      group: '',
      task: '整理项目看板'
    }
  }
  // The project wall is the local source of truth for what a desktop can publish.
  // A team directory records only the canonical project identity and host members
  // who have actively published that project as a source.
  const wallRepos = { lead: [], lin: ['star'], chen: ['star', 'board'] }
  const samplePairing = 'orca://pair?code=demo-antai'
  const charterOwner = '林安'
  const key = 'bw-team-collaboration-342-bind-v4'
  const auditActionTaxonomy = [
    '连接共享主机',
    '查看工作树',
    '读取项目文件',
    '查看已有会话',
    '查看终端输出',
    '订阅资源更新',
    '结束资源订阅',
    '新建工作树',
    '新建会话',
    '发送会话输入',
    '执行终端命令',
    '授予完全访问',
    '恢复只读',
    '撤销共享连接',
    '未归类动作'
  ]
  const actor = document.querySelector('#actor')
  const surface = document.querySelector('#surface')
  const dialog = document.querySelector('#dialog')
  const status = document.querySelector('#status')
  let confirmForm
  let desktops = resetDesktops()
  let state = load()

  function resetDesktops() {
    return Object.fromEntries(
      Object.keys(names).map((person) => [
        person,
        {
          screen: 'wall',
          directoryDraft: null,
          switchingTeam: false,
          bindingPending: false,
          groupPicker: blankGroupPicker(),
          bindingError: '',
          directoryBase: 'null',
          source: person === 'lead' ? 'lin' : person,
          panel: '',
          prior: 'wall',
          server: false,
          workflow: 'connect',
          repoId: 'star',
          addingServer: false,
          remotePopover: false,
          notifications: false,
          tab: 'session',
          auditFilters: defaultAuditFilters()
        }
      ])
    )
  }

  function fixture(ready = false) {
    return {
      directories: { [bindingKey(demoGroup, demoSpaceId)]: ready ? seedDirectory() : null },
      bindings: Object.fromEntries(
        Object.keys(names).map((person) => [person, bindingKey(demoGroup, demoSpaceId)])
      ),
      bound: ready
        ? { lead: true, lin: true, chen: true }
        : { lead: false, lin: false, chen: false },
      // Orca can already expose a host endpoint, but team membership never connects it automatically.
      teamEndpoints: ready ? { ...addresses } : {},
      teamConnections: { lead: {}, lin: {}, chen: {} },
      // WeLink group-space permissions decide who can edit the shared file.
      // The prototype keeps every bound member editable so the UI does not
      // invent a second permission system.
      directoryEditable: { lead: true, lin: true, chen: true },
      generatedLinks: ready ? { lin: samplePairing } : {},
      offered: ready,
      accessModes: { lead: {}, lin: {}, chen: {} },
      full: false,
      review: null,
      prunedExpired: 0,
      logs: {
        lin: ready
          ? [
              [
                Date.now(),
                '韩岚 · 韩岚桌面',
                '星图服务 · issue-184-export',
                '发送会话输入',
                '已拒绝 · 团队只读'
              ],
              [
                Date.now() - dayMs,
                '陈远 · 陈远桌面',
                '星图服务',
                '未归类动作',
                '已拒绝 · 未知动作'
              ],
              [Date.now() - 2 * dayMs, '韩岚 · 韩岚桌面', '星图服务', '连接共享主机', '已放行']
            ]
          : [],
        chen: []
      }
    }
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(key))
      if (!raw) {
        return fixture(false)
      }
      raw.bound ??= { lead: false, lin: false, chen: false }
      for (const id of Object.keys(raw.directories)) {
        raw.directories[id] = normalizeDirectory(raw.directories[id])
      }
      raw.directoryEditable = { lead: true, lin: true, chen: true, ...raw.directoryEditable }
      raw.generatedLinks ??= raw.offered ? { lin: samplePairing } : {}
      raw.accessModes ??= { lead: {}, lin: {}, chen: {} }
      raw.teamConnections ??= { lead: {}, lin: {}, chen: {} }
      raw.teamEndpoints ??= {}
      raw.accessModes = { lead: {}, lin: {}, chen: {}, ...raw.accessModes }
      return raw
    } catch {
      return fixture(false)
    }
  }

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // The local fixture remains available in this browser session.
    }
  }

  function current() {
    return desktops[actor.value]
  }

  function esc(value) {
    return String(value).replace(
      /[&<>"']/g,
      (char) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[char]
    )
  }

  function icon(name) {
    return icons[name]
  }

  function iconButton(
    name,
    label,
    action,
    { value = '', selected = false, added = false, disabled = false, hint = '' } = {}
  ) {
    if (!action) {
      return `<span class="icon-button quiet-icon" title="${label}">${icon(name)}</span>`
    }
    return `<button type="button" class="icon-button${selected ? ' selected' : ''}${added ? ' proposed' : ''}" aria-label="${label}" title="${hint || label}"${hint ? ' data-permission-hint' : ''}${action ? ` data-action="${action}" data-value="${value}"` : ''}${disabled ? ' disabled' : ''}>${icon(name)}</button>`
  }

  function button(label, action, { value = '', kind = 'secondary', disabled = false } = {}) {
    return `<button type="button" class="btn btn-${kind}" data-action="${action}" data-value="${value}"${disabled ? ' disabled' : ''}>${label}</button>`
  }

  function notify(text) {
    status.textContent = text
  }

  function show(screen) {
    const desktop = current()
    if (screen === 'settings') {
      desktop.prior = desktop.screen
    }
    desktop.screen = screen
    desktop.panel = ''
    desktop.notifications = false
    render()
  }

  function confirm(title, body, label, handler) {
    confirmForm = handler
    dialog.innerHTML = `<form class="dialog-form"><header><h2 id="dialog-title">${title}</h2></header>${body}<footer class="dialog-actions">${button('取消', 'close-dialog', { kind: 'ghost' })}<button type="submit" class="btn btn-primary">${label}</button></footer></form>`
    dialog.showModal()
  }

  function directoryMembers() {
    return Object.keys(names).map((person) => ({
      ...weLinkMember(person),
      id: `${person}-host`
    }))
  }

  function blankDirectory(groupId = demoGroup, spaceId = '') {
    return {
      schema_version: 1,
      team_group_id: groupId,
      team_space_id: spaceId,
      identity_source: 'welink-cli',
      hosts: directoryMembers(),
      projects: []
    }
  }

  function mergeProjectSources(projects = []) {
    return projects
      .map((entry) => {
        const repoId = repoIdForEntry(entry)
        return { ...entry, repo_id: repoId }
      })
      .filter((entry) => entry.repo_id)
  }

  function syncDirectory(directory) {
    const next = normalizeDirectory(directory ?? blankDirectory())
    next.hosts = directoryMembers().map((member) => ({
      ...member,
      ...(next.hosts ?? []).find((host) => host.member_id === member.member_id)
    }))
    next.projects = mergeProjectSources(next.projects)
    return next
  }

  function seedDirectory() {
    const directory = blankDirectory(demoGroup, demoSpaceId)
    directory.projects = [
      {
        repo_id: catalogRepos.star.repoId,
        name: catalogRepos.star.name,
        repository: catalogRepos.star.repository
      }
    ]
    return syncDirectory(directory)
  }

  function repoIdForEntry(entry) {
    if (!entry) {
      return ''
    }
    if (entry.repo_id && catalogRepos[entry.repo_id]) {
      return entry.repo_id
    }
    return (
      Object.keys(catalogRepos).find((id) => catalogRepos[id].repository === entry.repository) ?? ''
    )
  }

  function normalizeDirectory(directory) {
    if (!directory) {
      return directory
    }
    directory.identity_source ??= 'welink-cli'
    const previousHosts = new Map((directory.hosts ?? []).map((host) => [host.member_id, host]))
    directory.hosts = directoryMembers().map((member) => {
      const previous = { ...previousHosts.get(member.member_id) }
      if (!previous.orca_endpoint && previous.address) {
        previous.orca_endpoint = previous.address
      }
      delete previous.address
      delete previous.host_status
      return {
        ...member,
        ...previous,
        name: member.name,
        avatar: member.avatar,
        host_id: member.host_id,
        identity_source: 'welink-cli'
      }
    })
    directory.projects = (directory.projects ?? []).map((entry) => {
      const repoId = repoIdForEntry(entry)
      const normalized = {
        ...entry,
        repo_id: repoId,
        name: entry.name ?? catalogRepos[repoId]?.name ?? '未命名项目',
        repository: entry.repository ?? catalogRepos[repoId]?.repository ?? ''
      }
      delete normalized.sources
      return normalized
    })
    return directory
  }

  function localRepos(person = actor.value) {
    return (wallRepos[person] ?? []).map((id) => [id, catalogRepos[id]]).filter(([, repo]) => repo)
  }

  function activeDirectory(person = actor.value) {
    return state.directories[state.bindings[person]] ?? null
  }

  function setActiveDirectory(directory, person = actor.value) {
    state.directories[state.bindings[person]] = directory
  }

  function currentTeamName() {
    return activeDirectory()?.team_group_id === alternateGroup ? '行星计划组' : teamName
  }

  function knownDirectory() {
    return state.bound?.[actor.value] ? activeDirectory() : null
  }

  function directoryHostRecord(person, directory = knownDirectory()) {
    return directory?.hosts?.find((host) => host.member_id === employees[person])
  }

  function endpointFor(person, directory = knownDirectory()) {
    const record = directoryHostRecord(person, directory)
    if (record && Object.hasOwn(record, 'orca_endpoint')) {
      return record.orca_endpoint ?? ''
    }
    return state.teamEndpoints?.[person] ?? ''
  }

  function hydrateEndpoints(directory = activeDirectory()) {
    Object.keys(names).forEach((person) => {
      const endpoint = directoryHostRecord(person, directory)?.orca_endpoint
      if (endpoint) {
        state.teamEndpoints[person] = endpoint
      }
    })
  }

  function teamProjects(directory = knownDirectory()) {
    return directory?.projects ?? []
  }

  function teamProject(repoId = 'star', directory = knownDirectory()) {
    return teamProjects(directory).find((entry) => repoIdForEntry(entry) === repoId)
  }

  function directoryHost(person, directory = knownDirectory()) {
    return directory?.hosts.find((entry) => entry.member_id === employees[person])
  }

  function sourceOwners(repoId = 'star', directory = knownDirectory()) {
    if (!teamProject(repoId, directory)) {
      return []
    }
    return Object.keys(wallRepos).filter(
      (person) => (wallRepos[person] ?? []).includes(repoId) && hosts[person]
    )
  }

  function accessLevel(owner, visitor = actor.value) {
    if (owner === visitor) {
      return 'owner'
    }
    return (
      state.accessModes?.[visitor]?.[owner] ??
      (state.full && owner === 'lin' && visitor === 'chen' ? 'full' : 'readonly')
    )
  }

  function registered(person, repoId = 'star', directory = knownDirectory()) {
    return Boolean(
      teamProject(repoId, directory) &&
      directoryHost(person, directory) &&
      sourceOwners(repoId, directory).includes(person)
    )
  }

  function canReadTeamSource(owner, visitor = actor.value, repoId = 'star') {
    const endpoint = endpointFor(owner)
    return (
      registered(owner, repoId) &&
      Boolean(endpoint) &&
      state.teamConnections?.[visitor]?.[owner] === endpoint
    )
  }

  function sourceAvailable(owner, repoId = 'star') {
    return (
      owner === actor.value ||
      accessLevel(owner) === 'full' ||
      canReadTeamSource(owner, actor.value, repoId)
    )
  }

  function sourceValue(value) {
    const [owner, repoId = 'star'] = String(value || '').split('|')
    return { owner, repoId }
  }

  function enterSource(value) {
    const { owner, repoId } = sourceValue(value)
    if (!hosts[owner]) {
      return
    }
    if (sourceAvailable(owner, repoId)) {
      openWorkspace(owner, repoId)
      return
    }
    if (!registered(owner, repoId)) {
      notify('这个项目还没有登记为团队项目，请在团队设置登记。')
      return
    }
    if (!endpointFor(owner)) {
      confirm(
        '无法连接 Orca 共享主机',
        '<p>请让主机持有人先在 Orca 共享主机设置中打开共享，并核对当前团队主机状态。</p>',
        '返回项目墙',
        () => show('wall')
      )
      return
    }
    confirm(
      '连接共享主机',
      `<p>连接 <strong>${esc(hostLabel(owner))}</strong>。连接地址由 Orca 共享配置提供，团队成员默认只读。</p>`,
      '连接',
      () => {
        state.teamConnections[actor.value][owner] = endpointFor(owner)
        state.accessModes[actor.value] ??= {}
        state.accessModes[actor.value][owner] = 'readonly'
        audit(owner, '连接共享主机', '已放行', hostLabel(owner))
        openWorkspace(owner, repoId)
      }
    )
  }

  function saveDirectory() {
    const draft = current().directoryDraft
    if (!draft?.team_space_id) {
      notify('重新绑定团队后再保存。')
      return
    }
    if (current().directoryBase !== JSON.stringify(activeDirectory())) {
      notify('群空间目录已更新。保留了你的草稿，请先核对最新目录。')
      return
    }
    setActiveDirectory(syncDirectory(structuredClone(draft)))
    hydrateEndpoints()
    state.bound[actor.value] = true
    current().directoryBase = JSON.stringify(activeDirectory())
    notify('已刷新群成员、主机地址和团队项目')
    render()
  }

  function availableTeamProjects(draft = current().directoryDraft) {
    const registered = new Set((draft?.projects ?? []).map((entry) => repoIdForEntry(entry)))
    return localRepos().filter(([repoId]) => !registered.has(repoId))
  }

  function registerProjectDialog(draft = null) {
    const available = availableTeamProjects(draft ?? knownDirectory())
    if (!available.length) {
      notify('本机项目墙没有可登记的新项目。')
      return
    }
    const options = available
      .map(([repoId, repo]) => `<option value="${repoId}">${esc(repo.name)}</option>`)
      .join('')
    confirm(
      '登记团队项目',
      `<label class="field">项目墙来源<select class="input" name="repo" required>${options}</select></label>`,
      '登记项目',
      (data) => {
        const repoId = String(data.get('repo') || '')
        const repo = catalogRepos[repoId]
        if (!repo) {
          return
        }
        const target = draft ?? activeDirectory()
        target.projects ??= []
        if (target.projects.some((entry) => repoIdForEntry(entry) === repoId)) {
          notify('这个项目已经登记在群空间。')
          return
        }
        target.projects.push({
          repo_id: repo.repoId,
          name: repo.name,
          repository: repo.repository
        })
        if (draft) {
          render()
          return
        }
        setActiveDirectory(syncDirectory(target))
        current().directoryDraft = structuredClone(activeDirectory())
        current().directoryBase = JSON.stringify(activeDirectory())
        notify(`已登记${repo.name}，项目墙将显示为团队项目`)
        render()
      }
    )
  }

  // 群名称联想输入：替代原先的两个手填 ID 输入框。列表来自 W3 账户可见的
  // OneBox 群空间，本地按名称收窄，所以不输入也能翻遍全部群名。
  function groupPickerField() {
    const picker = current().groupPicker
    const pending = current().bindingPending
    const label = picker.resolving
      ? '正在获取群 ID…'
      : picker.selection
        ? picker.selection.name
        : '选择 WeLink 群'
    return `<div class="field group-picker"><span>WeLink 群名称</span>
      <div class="group-picker-control">
        <button type="button" class="btn btn-secondary group-picker-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="${picker.open}" aria-controls="group-picker-panel" aria-label="WeLink 群名称" data-action="toggle-group-picker"${pending ? ' disabled' : ''}>
          <span class="group-picker-value${picker.selection || picker.resolving ? '' : ' is-placeholder'}">${esc(label)}</span>${icon('ChevronsUpDown')}
        </button>
        ${picker.open ? groupPickerPanel() : ''}
      </div>
    </div>`
  }

  function groupPickerPanel() {
    const picker = current().groupPicker
    return `<div class="group-picker-panel" id="group-picker-panel">
      <input class="input group-picker-search" type="search" placeholder="搜索群名称" aria-label="搜索群名称" autocomplete="off" data-group-search value="${esc(picker.query)}"${current().bindingPending ? ' disabled' : ''}>
      ${groupPickerBody()}
    </div>`
  }

  function groupPickerBody() {
    const picker = current().groupPicker
    if (picker.phase === 'idle' || picker.phase === 'loading') {
      return `<p class="group-picker-busy"><span class="spin">${icon('LoaderCircle')}</span>正在读取 W3 账户可见的群…</p>`
    }
    if (picker.phase === 'failed') {
      return groupFailure(picker.listFailure)
    }
    return `<div class="group-picker-list" role="listbox" aria-label="WeLink 群列表">${groupOptionRows()}</div>${
      picker.resolveFailure ? groupFailure(picker.resolveFailure) : ''
    }${
      picker.truncated
        ? '<p class="group-picker-foot">群数量超过上限，只列出了最近的一部分。输入群名称缩小范围。</p>'
        : ''
    }`
  }

  function groupOptionRows() {
    const picker = current().groupPicker
    const options = searchDemoSpaces(picker.query)
    if (!options.length) {
      return '<p class="group-picker-empty">没有匹配的群。</p>'
    }
    return options
      .map((space) => {
        const selected = picker.selection?.spaceId === space.spaceId
        return `<button type="button" role="option" aria-selected="${selected}" class="group-picker-option${selected ? ' is-selected' : ''}" data-action="choose-group-space" data-value="${space.spaceId}"${current().bindingPending ? ' disabled' : ''}>
          <span class="group-picker-check">${selected ? icon('Check') : ''}</span>
          <span class="group-picker-text"><strong>${esc(space.name)}</strong><small>${esc(demoSpaceDetail(space))}</small></span>
        </button>`
      })
      .join('')
  }

  // 选中后两个 ID 只读展示：都由群名称推导，人不再手填任何一个。
  function groupPickerDerived() {
    const selection = current().groupPicker.selection
    if (!selection) {
      return ''
    }
    return `<p class="field-note binding-derived">群 ID <code>${esc(selection.groupId)}</code> · 群空间 ID <code>${esc(selection.spaceId)}</code></p>`
  }

  // 搜索时只替换选项区：整屏重渲染会让搜索框失焦。
  function renderGroupOptions() {
    const list = surface.querySelector('.group-picker-list')
    if (list) {
      list.innerHTML = groupOptionRows()
    }
  }

  function teamDirectory() {
    const close = iconButton('X', '关闭团队设置', 'panel')
    const draft = current().directoryDraft
    if (!draft || current().switchingTeam) {
      const switching = Boolean(draft)
      const dirty = switching && JSON.stringify(draft) !== current().directoryBase
      const pending = current().bindingPending
      const picker = current().groupPicker
      // 与 TeamBindingForm 的 canSubmit 一致：没有选出群、或群 ID 还在解析时不能提交。
      const canSubmit = picker.selection !== null && !pending && !picker.resolving
      return `<div class="overlay"><section class="surface-dialog team-bind-dialog" role="dialog" aria-label="${switching ? '切换团队' : '连接团队'}">
        <header class="row between"><h2>${switching ? '切换团队' : '连接团队'}</h2>${iconButton('X', switching ? '取消切换团队' : '关闭团队设置', switching ? 'cancel-team-switch' : 'panel', { disabled: pending })}</header>
        <form id="team-lookup"><p class="sr-only">${switching ? '按名称选择新的 WeLink 群。' : '按名称选择 WeLink 群绑定团队，群 ID 与群空间 ID 自动获取。'}</p>
        ${groupPickerField()}${groupPickerDerived()}
        ${switching ? `<p class="binding-note">已保存的远程主机会保留，可在「管理远程主机」移除。</p>${dirty ? '<p class="binding-note binding-warning">切换后将丢弃未保存的修改。</p>' : ''}` : ''}
        <p id="binding-error" class="binding-error" role="alert">${esc(current().bindingError)}</p>
        <footer class="dialog-actions">${switching ? button('取消', 'cancel-team-switch', { kind: 'ghost', disabled: pending }) : ''}<button type="submit" class="btn btn-primary" ${canSubmit ? '' : 'disabled'}>${pending || picker.resolving ? `<span class="spin">${icon('LoaderCircle')}</span>` : ''}${pending ? '正在读取团队…' : switching ? '读取并切换' : '绑定团队'}</button></footer></form>
      </section></div>`
    }
    const writable = state.directoryEditable[actor.value]
    const people = ['lead', 'lin', 'chen']
      .map((id) => {
        const member = weLinkMember(id)
        const endpoint = endpointFor(id, draft)
        const fill =
          id === actor.value && writable
            ? iconButton('Link2', endpoint ? '一键填入' : '一键生成并填入', 'fill-own-share')
            : ''
        return `<tr><td><span class="row member-person"><img class="avatar team-avatar" src="${avatarAssets[id]}" alt="${member.name}头像"><span title="${member.member_id}"><strong>${member.name}</strong><small class="member-role">${id === 'lead' ? '群主' : '成员'}</small></span></span></td><td><div class="host-cell"><div class="row wrap"><input class="input member-address" aria-label="${hostLabel(id)} Orca 共享地址" data-address="${id}" value="${esc(endpoint)}" placeholder="Orca 共享地址"${id === actor.value && writable ? '' : ' readonly'}><span class="host-actions">${fill}</span></div></div></td></tr>`
      })
      .join('')

    const projects = draft.projects
      .map((entry) => {
        return `<tr><td><strong>${esc(entry.name)}</strong><small class="member-number">${esc(entry.repository)}</small></td></tr>`
      })
      .join('')
    const projectTable = projects
      ? `<div class="table-scroll"><table class="table directory-projects" aria-label="团队项目目录"><thead><tr><th>团队项目</th></tr></thead><tbody>${projects}</tbody></table></div>`
      : '<p class="field-note">群空间还没有登记团队项目。</p>'
    return `<div class="overlay"><section class="surface-dialog team-directory" role="dialog" aria-label="团队设置">
      <header class="row between"><h2>团队设置</h2>${close}</header>
      <div class="directory-links">
        <dl class="directory-identifiers">
          <div><dt>团队群 ID</dt><dd>${esc(draft.team_group_id)}</dd></div>
          <div><dt>群空间 ID</dt><dd>${esc(draft.team_space_id)}</dd></div>
        </dl>
        ${button(`${icon('ArrowRightLeft')} 切换团队`, 'switch-team', { kind: 'ghost' })}
      </div>
      <div class="row between"><h3>成员与主机</h3><div class="row"><span class="prototype-tooltip">${iconButton('RefreshCw', '刷新当前团队目录', 'refresh-directory').replace(' title="刷新当前团队目录"', ' aria-describedby="refresh-team-tip"')}<span role="tooltip" id="refresh-team-tip">刷新当前团队目录</span></span></div></div>
      <div class="directory-scroll"><div class="table-scroll"><table class="table members-table" aria-label="成员与主机"><thead><tr><th>成员</th><th>主机与 Orca 地址</th></tr></thead><tbody>${people}</tbody></table></div>
      <div class="row between directory-project-head"><h3>团队项目</h3><div class="row">${writable ? button(`${icon('Plus')} 登记项目`, 'register-project', { kind: 'ghost' }) : ''}</div></div>
      ${projectTable}
      </div><footer class="row between directory-footer">${button('查看群空间文件', 'preview-directory', { kind: 'ghost' })}${writable ? button('保存到群空间', 'save-directory', { kind: 'primary' }) : '<span class="field-note">你有查看权限，编辑权限由 WeLink 群空间管理。</span>'}</footer>
    </section></div>`
  }
  function projectSettings() {
    const repo = catalogRepos[current().repoId] ?? catalogRepos.star
    const entry = teamProject(repo.repoId)
    return `<aside class="project-settings" aria-label="项目设置"><header class="row between"><div><small>项目设置</small><h2>${esc(repo.name)}</h2></div>${iconButton('X', '关闭项目设置', 'panel')}</header>
      <section class="settings-type"><div class="row between"><strong>项目类型</strong><span class="source-access">${entry ? '团队项目' : '个人项目'}</span></div></section><section class="muted-frame"><header class="row between"><h3>项目信息</h3>${iconButton('FilePenLine', '编辑项目信息')}</header><dl><dt>项目名称</dt><dd>${esc(repo.name)}</dd><dt>想做什么</dt><dd>${esc(repo.task)}</dd><dt>项目群</dt><dd>星图服务项目群 · ${esc(demoProjectGroup)}</dd><dt>项目负责人</dt><dd>${charterOwner}</dd></dl></section>
    </aside>`
  }

  function projectCard(repoId, teamEntry = teamProject(repoId)) {
    const repo = catalogRepos[repoId]
    if (!repo) {
      return ''
    }
    const local = localRepos().some(([id]) => id === repoId)
    const owners = teamEntry ? sourceOwners(repoId) : local ? [actor.value] : []
    if (!teamEntry && !local && !owners.length) {
      return ''
    }
    const hostTags = owners
      .map((owner) => {
        const localSource = owner === actor.value
        const connected = sourceAvailable(owner, repoId)
        const access = localSource
          ? '本机'
          : connected
            ? accessLevel(owner) === 'full'
              ? '完全访问'
              : '只读'
            : '未连接'
        const stateClass = connected ? ' is-online' : ' is-offline'
        return `<button type="button" class="pcard-host" data-action="open-workspace" data-value="${owner}|${repoId}"${connected || localSource ? '' : ' disabled'}><span class="pcard-source"><span class="pcard-source-dot${stateClass}"></span>${esc(hostLabel(owner))} · ${access}</span></button>`
      })
      .join('')
    const defaultSource = local
      ? actor.value
      : (owners.find((owner) => sourceAvailable(owner, repoId)) ?? owners[0] ?? '')
    const identity = teamEntry
      ? `<span class="pcard-owner">项目负责人 <strong>${charterOwner}</strong></span>${hostTags || '<span class="pcard-muted">尚未读取主机来源</span>'}`
      : `<span class="pcard-owner">项目负责人 <strong>${charterOwner}</strong></span><span class="pcard-muted">本机来源</span>`
    return `<article class="pcard" data-project-name="${esc(repo.name)}">
      <header class="row between pcard-top">
        <button type="button" class="pcard-name" data-action="open-workspace" data-value="${defaultSource}|${repoId}"${defaultSource ? '' : ' disabled'}>${esc(repo.name)}</button>
        <div class="pcard-actions">${iconButton('ExternalLink', '打开代码仓')}${iconButton('SlidersHorizontal', '仓库设置')}${iconButton('Download', '克隆到本机')}${iconButton('LayoutDashboard', '项目总览')}${iconButton('FilePenLine', '项目设置与项目信息', 'panel', { value: 'project', selected: current().panel === 'project' })}${iconButton('Ellipsis', '项目操作')}</div>
      </header>
      <div class="pcard-identity">${identity}</div>
      <div class="pcard-delivery"><div class="pcard-version"><span>版本目标</span><span>v1.1</span></div><ul><li>发布清单支持导出</li><li>在任务入口反馈导入结果</li></ul></div>
      <footer class="pcard-stages"><span>计划 <b>已归档</b></span><span>交付 <b>进行中</b></span><span>验收 <b>未开始</b></span></footer>
    </article>`
  }
  function wallPage() {
    const desktop = current()
    const directory = knownDirectory()
    const teamEntries = teamProjects(directory)
      .map((entry) => [repoIdForEntry(entry), entry])
      .filter(([repoId]) => repoId)
    const teamIds = new Set(teamEntries.map(([repoId]) => repoId))
    const teamCards = teamEntries.map(([repoId, entry]) => projectCard(repoId, entry)).join('')
    const personalCards = localRepos()
      .filter(([repoId]) => !teamIds.has(repoId))
      .map(([repoId]) => projectCard(repoId, null))
      .join('')
    const teamCount = teamEntries.length
    const personalCount = localRepos().filter(([repoId]) => !teamIds.has(repoId)).length
    const count = teamCount + personalCount
    const team = directory
      ? `<p class="team-wall-label">${icon('UsersRound')} ${currentTeamName()} <small>${actor.value === 'lead' ? '群主' : '成员'}</small></p>`
      : ''
    const heading = `<header class="row between wall-heading"><div><h1>项目墙 <small>${count} 个项目</small></h1>${team}</div><div class="wall-actions" aria-label="项目墙操作">
      ${iconButton('CircleHelp', '项目墙帮助', 'help')}${iconButton('RefreshCw', '刷新项目目录和墙卡信息', 'refresh')}${iconButton('UsersRound', '团队设置', 'panel', { value: 'team', added: true })}${iconButton('Plus', '添加项目', 'legacy-add')}${iconButton('X', '关闭项目墙', 'open-workspace', { value: `${desktop.source}|${desktop.repoId}` })}
    </div></header>`
    const filters = `<div class="row wall-filters"><input class="input" aria-label="搜索项目" placeholder="搜索项目" data-filter><div class="row options"><span>全部</span><span>本机</span><span>远程</span></div><div class="row options"><span>全部类型</span><span>团队</span><span>个人</span></div></div>`
    const groups = count
      ? `${filters}<div id="wall-projects">${teamCount ? `<section><h2>团队项目 <small>${teamCount}</small></h2><div class="wall-grid">${teamCards}</div></section>` : ''}${personalCount ? `<section><h2>本机项目 <small>${personalCount}</small></h2><div class="wall-grid">${personalCards}</div></section>` : ''}</div>`
      : `<div class="empty-wall"><h2>从一个项目开始</h2><div class="row wrap">${button('团队设置', 'panel', { value: 'team', kind: 'primary' })}${button('添加项目', 'legacy-add', { kind: 'ghost' })}</div></div>`
    const wall = `<div class="wall-layout"><main class="wall">${heading}${groups}</main>${desktop.panel === 'project' ? projectSettings() : ''}</div>`
    return windowFrame(wall, { overlay: desktop.panel === 'team' ? teamDirectory() : '' })
  }

  function ownsFullAccess(owner) {
    return accessLevel(owner) === 'full'
  }

  function audit(
    owner,
    action,
    result,
    resource = `${catalogRepos[current().repoId]?.name ?? project} · ${hosts[owner]?.tree ?? '共享主机'}`
  ) {
    const user = names[actor.value]
    state.logs[owner] ??= []
    state.logs[owner].unshift([Date.now(), `${user} · ${user}桌面`, resource, action, result])
  }

  function authorizeRemoteAction(owner, action, repoId = current().repoId) {
    const readActions = new Set([
      '连接共享主机',
      '查看工作树',
      '读取项目文件',
      '查看已有会话',
      '查看终端输出',
      '订阅资源更新',
      '结束资源订阅'
    ])
    const allowed = accessLevel(owner) === 'full' || readActions.has(action)
    const result = allowed
      ? '已放行'
      : action === '未归类动作'
        ? '已拒绝 · 未知动作'
        : '已拒绝 · 团队只读'
    if (!allowed || !readActions.has(action) || action === '连接共享主机') {
      audit(
        owner,
        action,
        result,
        `${catalogRepos[repoId]?.name ?? project} · ${hosts[owner]?.tree ?? '共享主机'}`
      )
    }
    return allowed
  }

  function openWorkspace(owner, repoId = 'star') {
    const desktop = current()
    desktop.source = owner
    desktop.repoId = repoId
    desktop.tab = 'session'
    if (owner !== actor.value) {
      authorizeRemoteAction(owner, '查看已有会话', repoId)
    }
    show('workspace')
  }

  function windowControls() {
    return `<div class="row window-controls">${iconButton('Minus', '最小化')}${iconButton('Square', '最大化')}${iconButton('X', '关闭窗口')}</div>`
  }

  function titlebar(withControls = true) {
    return `<div class="titlebar"><div class="row"><img src="../../../resources/icon.png" class="title-logo" alt="">${iconButton('Ellipsis', '应用菜单')}${iconButton('PanelLeft', '切换侧栏')}</div>${withControls ? windowControls() : ''} </div>`
  }

  function remoteHostPopover() {
    const connections = Object.keys(names).filter(
      (owner) => owner !== actor.value && state.teamConnections?.[actor.value]?.[owner]
    )
    const available = Object.keys(names).filter(
      (owner) =>
        owner !== actor.value &&
        endpointFor(owner) &&
        !state.teamConnections?.[actor.value]?.[owner]
    )
    const row = (owner, connected) =>
      `<div class="remote-host-row"><div class="remote-host-main"><span class="remote-host-dot${connected ? ' is-connected' : ''}"></span><span><strong>${hostLabel(owner)}</strong><small>${connected ? '已连接 · 只读' : '已登记 · 未连接'}</small></span></div>${button(connected ? '断开' : '连接', connected ? 'disconnect-host' : 'quick-connect-host', { value: owner, kind: 'ghost' })}</div>`
    return `<div class="remote-host-popover" role="dialog" aria-label="远程主机"><header class="row between"><strong>远程主机</strong>${iconButton('RefreshCw', '刷新远程主机', 'refresh-remote-hosts')}</header>${
      connections
        .concat(available)
        .map((owner) => row(owner, connections.includes(owner)))
        .join('') || '<p class="field-note">团队主机登记后会显示在这里。</p>'
    }<footer>${button('管理远程主机…', 'open-remote-settings', { kind: 'ghost' })}</footer></div>`
  }

  function rail(screen) {
    return `<aside class="rail" aria-label="Workbench 导航">
      ${iconButton('LayoutGrid', '项目墙', 'show', { value: 'wall', selected: screen === 'wall' })}
      <div class="rail-group">
        ${iconButton('PackageCheck', '版本工作区', 'open-workspace', { value: `${current().source}|${current().repoId}`, selected: screen === 'workspace' })}
        ${iconButton('LayoutDashboard', '项目总览')}
        ${iconButton('ListTodo', '任务')}
        ${iconButton('CalendarClock', '自动化')}
        ${iconButton('BookOpen', '知识库')}
      </div>
      <div class="rail-bottom">${iconButton('MonitorSmartphone', '管理远程主机', 'manage-remote')}${iconButton('Settings', '设置', 'show', { value: 'settings' })}${iconButton('CircleHelp', '帮助', 'help')}</div>
      ${current().remotePopover ? remoteHostPopover() : ''}
    </aside>`
  }

  function windowFrame(body, { mode = current().screen, overlay = '' } = {}) {
    if (mode === 'settings') {
      return `<div class="window" data-screen="settings">${titlebar()}<div class="desktop">${body}</div>${overlay}</div>`
    }
    const working = mode === 'workspace'
    return `<div class="window" data-screen="${mode}">${working ? '' : titlebar()}<div class="desktop${working ? ' working' : ''}">${working ? `<div class="left-workspace">${titlebar(false)}<div class="left-body">${rail(mode)}${worktreeSidebar()}</div></div>` : rail(mode)}<div class="main-pane">${body}</div></div>${notifications()}${overlay}</div>`
  }

  function table(label, headings, rows) {
    return `<div class="table-scroll"><table class="table" aria-label="${label}"><thead><tr>${headings.map((name) => `<th scope="col">${name}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((value) => `<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
  }

  function readOnly() {
    const owner = current().source
    return owner !== actor.value && !ownsFullAccess(owner)
  }

  function worktreeSidebar() {
    const desktop = current()
    const owner = desktop.source
    const repo = catalogRepos[desktop.repoId] ?? catalogRepos.star
    if (!sourceAvailable(owner, desktop.repoId)) {
      return `<aside class="worktree-sidebar"><header class="project-header"><span class="project-avatar">${repo.name[0]}</span><div><strong>${esc(repo.name)}</strong><small>项目来源未连接</small></div></header></aside>`
    }
    const showMenu = desktop.panel === 'worktree-menu'
    return `<aside class="worktree-sidebar"><header class="project-header"><span class="project-avatar">${repo.name[0]}</span><div><strong>${esc(repo.name)}</strong><small>当前项目</small></div></header>
      <div class="sidebar-heading">${icon('Pin')} 已固定</div>
      <div class="sidebar-heading">${icon('FolderGit2')} 版本</div><div class="quiet-tree">v1.1</div>
      <div class="row between"><div class="sidebar-heading">${icon('FolderGit2')} 其他工作区</div>${iconButton('Plus', '新建工作树', 'new-worktree')}</div>
      <div class="workspace-row" data-worktree>
        <div class="row"><span class="tree-dot"></span><strong>${hosts[owner].tree}</strong>${iconButton('Ellipsis', '工作树操作', 'panel', { value: showMenu ? '' : 'worktree-menu' })}</div>
        <small>${hostLabel(owner)}${readOnly() ? ' · 只读' : ''}</small>
        ${showMenu ? `<div class="menu" role="menu" aria-label="工作树菜单"><small>工作区</small><span>${icon('Pencil')} 更新</span><span>${icon('Check')} 更改状态</span><span>${icon('PackageCheck')} 绑定版本</span>${button(`${icon('Send')} 发送评审…`, 'panel', { value: 'send', kind: 'ghost', disabled: readOnly() || owner !== 'lin' || !registered('lin', desktop.repoId) })}<hr><span>${icon('Copy')} 复制路径</span></div>` : ''}
      </div></aside>`
  }

  function workspacePage() {
    const desktop = current()
    const owner = desktop.source
    const repo = catalogRepos[desktop.repoId] ?? catalogRepos.star
    const isReadonly = readOnly()
    const available = sourceAvailable(owner, desktop.repoId)
    const caption =
      isReadonly && available
        ? `<span class="readonly" title="可以查看已有内容。创建会话和发送输入需要主机完全访问。">${icon('Lock')}团队项目只读</span>`
        : owner === actor.value || !available
          ? ''
          : '<span class="readonly">主机完全访问</span>'
    const tabs = `<div class="workspace-tabs"><div class="row">${button(`${icon('Terminal')} 会话`, 'tab', { value: 'session', kind: desktop.tab === 'session' ? 'secondary' : 'ghost' })}${button(`${icon('Terminal')} 终端`, 'tab', { value: 'terminal', kind: desktop.tab === 'terminal' ? 'secondary' : 'ghost' })}${caption}${iconButton('Plus', '新建会话', 'new-session', { disabled: !available, hint: isReadonly && available ? '新建会话 · 当前来源只读' : '' })}</div><div class="row">${iconButton('PanelRight', '文件与变更')}${windowControls()}</div></div>`
    const content =
      available && desktop.tab === 'new' && !isReadonly
        ? '<div class="session-preview"><h2>新会话</h2><p class="field-note">已在当前来源创建会话。</p></div>'
        : available
          ? `<div class="session-preview"><p class="field-note">${hostLabel(owner)} · ${hosts[owner].tree}</p><h2>${esc(repo.task)}</h2>${desktop.tab === 'terminal' ? '<pre>&gt; git status --short\n M docs/usage.md</pre>' : '<p>已定位对应入口，下一步核对边界情况并补充评审说明。</p>'}<div class="quiet-lines" aria-hidden="true"><i></i><i></i><i></i></div></div>`
          : `<div class="empty-wall"><h2>${registered(owner, desktop.repoId) ? '共享主机尚未连接' : '项目来源暂不可用'}</h2><p>${registered(owner, desktop.repoId) ? '连接后默认可只读查看。新建会话请使用本机工作区。' : '返回项目墙选择可用来源。'}</p>${registered(owner, desktop.repoId) ? button('连接共享主机', 'open-workspace', { value: `${owner}|${desktop.repoId}` }) : button('返回项目墙', 'show', { value: 'wall' })}</div>`
    return windowFrame(tabs + content, { overlay: desktop.panel === 'send' ? sendReview() : '' })
  }

  function sendReview() {
    return `<div class="overlay"><section class="surface-dialog compact" role="dialog" aria-label="发送评审">
      <header class="row between"><h2>发送评审</h2>${iconButton('X', '关闭发送评审', 'panel')}</header><p class="field-note">星图服务 #187 · 发布清单导出</p>
      <form id="review-form"><p id="picked">收件人 · 已选 0 人</p><div class="recipient-list"><input type="search" class="input" placeholder="搜索团队成员…" aria-label="搜索团队成员" data-people-search><label><input type="checkbox" value="lead" name="recipient"> 韩岚 <small>${teamName}</small></label></div>
      <footer class="dialog-actions">${button('取消', 'panel', { kind: 'ghost' })}<button type="submit" class="btn btn-primary" disabled>发送至 0 人</button></footer></form></section></div>`
  }

  function notifications() {
    const request = state.review
    const incoming = request && actor.value === 'lead'
    const outgoing = request && actor.value === 'lin'
    const alert = incoming && !request.approved ? '<span class="count">1</span>' : ''
    const item =
      incoming || outgoing
        ? `<button class="notice-item" data-action="show" data-value="pr"><span class="row">${icon('GitPullRequest')} PR #187 ${icon('ExternalLink')}</span><strong>发布清单导出</strong><small>${incoming ? '林安请求你评审' : '已送达韩岚'}${request.approved ? ' · 已批准' : ''}</small></button>`
        : '<p class="field-note">暂无评审请求</p>'
    const popover = current().notifications
      ? `<aside class="review-popover" aria-label="评审通知"><header class="row between"><strong>评审通知</strong><div class="row">${iconButton('RefreshCw', '刷新评审动态', 'refresh')}${iconButton('X', '关闭评审通知', 'toggle-notifications')}</div></header><h3>${incoming ? '我收到的评审' : '我发出的评审'}</h3>${item}</aside>`
      : ''
    return `${popover}<div class="review-trigger">${iconButton('GitPullRequest', '评审通知', 'toggle-notifications')}${alert}</div>`
  }

  function prPage() {
    const reviewed = state.review?.approved
    const action =
      actor.value === 'lead' && !reviewed ? button('提交评审', 'approve', { kind: 'primary' }) : ''
    const body = `<div class="task-layout"><aside class="task-list"><h2>任务</h2><div class="quiet-tree">星图服务</div><div class="workspace-row selected">PR #187 · 发布清单导出</div></aside><article class="task-detail"><header class="row between"><div><small>星图服务 · PR #187</small><h2>发布清单导出</h2></div>${action}</header><div class="row options"><span>概览</span><span>文件改动</span><span>Checks</span></div><section class="muted-frame"><p>${reviewed ? `已批准 · ${esc(state.review.comment)}` : '等待韩岚评审'}</p><div class="quiet-lines" aria-hidden="true"><i></i><i></i><i></i></div></section></article></div>`
    return windowFrame(body)
  }

  function settingsPage() {
    const desktop = current()
    const nav = `<aside class="settings-nav">${button(`${icon('ArrowLeft')} 返回`, 'settings-back', { kind: 'ghost' })}<div class="settings-search">${icon('Search')} 搜索设置</div><div class="sidebar-heading">设置分类</div><div class="quiet-tree">通用</div><div class="quiet-tree">集成</div>${button(`${icon('Server')} 远程 Orca 服务器`, 'server', { kind: desktop.server ? 'secondary' : 'ghost' })}<div class="quiet-tree">SSH</div><div class="quiet-tree">隐私</div></aside>`
    if (!desktop.server) {
      return windowFrame(
        `${nav}<main class="settings-main"><h1>设置</h1><section class="muted-frame"><h2>通用</h2><div class="quiet-lines" aria-hidden="true"><i></i><i></i><i></i></div></section></main>`
      )
    }
    const modes = [
      ['connect', '连接到主机'],
      ['share', '共享此主机'],
      ['cloud', '云 VM']
    ]
    const workflows = `<div class="server-workflows">${modes.map(([value, label]) => button(label, 'server-workflow', { value, kind: desktop.workflow === value ? 'secondary' : 'ghost' })).join('')}</div>`
    const content =
      desktop.workflow === 'share'
        ? sharingServer()
        : desktop.workflow === 'connect'
          ? connectingServer()
          : '<p class="field-note">云 VM</p>'
    return windowFrame(
      `${nav}<main class="settings-main"><h1>远程 Orca 服务器</h1>${workflows}${content}</main>`
    )
  }

  function defaultAuditFilters() {
    return { action: '', result: '', period: '14', search: '' }
  }

  function pruneAudit() {
    const cutoff = Date.now() - auditRetentionDays * dayMs
    let removed = 0
    for (const owner of Object.keys(state.logs)) {
      const before = state.logs[owner].length
      state.logs[owner] = state.logs[owner].filter(([time]) => time >= cutoff)
      removed += before - state.logs[owner].length
    }
    if (removed) {
      state.prunedExpired = (state.prunedExpired ?? 0) + removed
    }
  }

  function auditResults() {
    const filters = current().auditFilters
    const cutoff = Date.now() - Number(filters.period) * dayMs
    const query = filters.search.trim().toLocaleLowerCase()
    const date = new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
    const rows = (state.logs[actor.value] ?? [])
      .filter(
        ([time, visitor, resource, action, result]) =>
          time >= cutoff &&
          (!filters.action || action === filters.action) &&
          result.startsWith(filters.result) &&
          `${visitor} ${resource}`.toLocaleLowerCase().includes(query)
      )
      .map(([time, ...record]) => [date.format(time), ...record])
    const body = rows.length
      ? table('本机访问日志', ['时间', '访问者与设备', '项目与资源', '动作', '结果'], rows)
      : '<p class="field-note">当前条件下暂无访问记录。</p>'
    return `<p class="field-note" role="status">共 ${rows.length} 条</p>${body}`
  }

  function auditFilter(label, name, choices) {
    const active = current().auditFilters[name]
    return `<label class="field">${label}<select class="input" data-audit-filter="${name}">${choices.map(([value, title]) => `<option value="${value}"${active === value ? ' selected' : ''}>${title}</option>`).join('')}</select></label>`
  }

  function auditPane() {
    const pruned = state.prunedExpired
      ? `<p class="field-note" role="status">已清理 ${state.prunedExpired} 条超过 ${auditRetentionDays} 天的记录。</p>`
      : ''
    return `<section class="muted-frame audit-pane"><header class="row between"><div><h3>本机访问日志</h3><p class="field-note">最近 ${auditRetentionDays} 天，到期自动清理。</p></div>${iconButton('Trash2', '清理日志', 'clear-audit')}</header><p class="field-note">日志目录 · ${auditLogDirectory}</p>${pruned}
      <div class="audit-filters">
        ${auditFilter('动作', 'action', [['', '全部动作'], ...auditActionTaxonomy.map((action) => [action, action])])}
        ${auditFilter('结果', 'result', [
          ['', '全部结果'],
          ['已放行', '已放行'],
          ['已拒绝', '已拒绝'],
          ['已生效', '已生效']
        ])}
        ${auditFilter('时间', 'period', [
          ['1', '最近 24 小时'],
          ['7', '最近 7 天'],
          ['14', '最近 14 天']
        ])}
        <label class="field audit-search">搜索<input type="search" class="input" data-audit-filter="search" value="${esc(current().auditFilters.search)}" placeholder="成员、设备、项目或资源"></label>
        ${button('重置', 'reset-audit', { kind: 'ghost' })}
      </div><div id="audit-results">${auditResults()}</div></section>`
  }

  function updateAuditFilter(input) {
    current().auditFilters[input.dataset.auditFilter] = input.value
    surface.querySelector('#audit-results').innerHTML = auditResults()
  }

  function nativeGrantRows(owner) {
    const endpoint = endpointFor(owner)
    const visitors = Object.keys(names).filter(
      (visitor) =>
        visitor !== owner && endpoint && state.teamConnections?.[visitor]?.[owner] === endpoint
    )
    if (!visitors.length) {
      return '<p class="field-note">尚无共享服务器访问权限。其他团队主机连接后会出现在这里。</p>'
    }
    return visitors
      .map((visitor) => {
        const elevated = accessLevel(owner, visitor) === 'full'
        const detail = elevated ? '同一连接 · 可创建工作树与会话' : '同一连接 · 只能查看已有内容'
        const target = `${owner}|${visitor}`
        const toggle = `<span class="row">${button('只读', 'demote-access', { value: target, kind: elevated ? 'ghost' : 'primary', disabled: !elevated })}${button('完全访问', 'grant-access', { value: target, kind: elevated ? 'primary' : 'ghost', disabled: elevated })}</span>`
        const controls = `${toggle}${iconButton('Trash2', `撤销${names[visitor]}桌面的共享连接`, 'revoke', { value: target })}`
        return `<div class="grant-row row between"><div><strong>${hostLabel(visitor)}</strong><small>${detail}</small></div><div class="row">${controls}</div></div>`
      })
      .join('')
  }
  function sharingServer() {
    const owner = actor.value
    const canShare = Boolean(hosts[owner])
    const generated = state.generatedLinks?.[owner]
      ? `<label class="field demo-link">访问链接 <input class="input" value="${esc(state.generatedLinks[owner])}" readonly data-select-all></label><p class="field-note">链接只建立 Orca 共享连接。连接建立后，访问级别仍在这台主机的共享列表中单独判断。</p>`
      : ''
    const form = canShare
      ? `<fieldset class="share-intent"><legend>链接在哪里打开？</legend><div class="server-workflows"><label><input type="radio" name="share-intent" checked> 其他设备<small>LAN、Tailscale 或其他可达地址</small></label><label><input type="radio" name="share-intent"> 仅此计算机<small>只在本机使用</small></label><label><input type="radio" name="share-intent"> 自定义地址<small>主机名或 ws(s):// 地址</small></label></div></fieldset>
        <div class="row share-address-row"><label class="field"><span>连接地址</span><select class="input"><option>${esc(addresses[owner] ?? '自动选择')}</option></select></label>${iconButton('RefreshCw', '刷新连接地址', 'refresh')}</div>
        <div class="row">${button('生成访问链接', 'generate-link', { kind: 'primary' })}</div>
        ${generated}`
      : '<p class="field-note">当前模拟桌面没有可共享的主机。</p>'
    return `<section class="muted-frame"><h2>共享此 Orca 主机</h2>
      <p class="permission-hint">${icon('Lock')}团队主机连上后默认只读。</p>
      ${form}</section>
      <section class="muted-frame"><header class="row between"><h3>我分享出去的链接</h3>${iconButton('RefreshCw', '刷新共享访问', 'refresh')}</header>${nativeGrantRows(owner)}</section>
      ${auditPane()}`
  }

  function connectingServer() {
    const desktop = current()
    const targets = Object.keys(names).filter(
      (owner) => owner !== actor.value && (endpointFor(owner) || state.generatedLinks?.[owner])
    )
    const target = desktop.connectionTarget ?? targets[0] ?? ''
    const targetEndpoint = target ? endpointFor(target) : ''
    const targetAccess = targetEndpoint
      ? `<p class="field-note">群空间已带入 ${esc(hostLabel(target))} 的 Orca 地址，连接建立后默认只读。</p>`
      : `<label class="field">访问链接 <input name="link" class="input" placeholder="粘贴 ${target ? hostLabel(target) : '主机持有人'} 提供的 Orca 访问链接" required></label>`
    const form = desktop.addingServer
      ? `<form id="pair-form" class="pair-form"><label class="field">目标主机<select class="input" name="owner" required>${targets.map((owner) => `<option value="${owner}"${owner === target ? ' selected' : ''}>${hostLabel(owner)}</option>`).join('')}</select></label>${targetAccess}<footer class="dialog-actions">${button('取消', 'add-server', { kind: 'ghost' })}<button class="btn btn-primary" type="submit"${targets.length ? '' : ' disabled'}>连接</button></footer></form>`
      : ''
    const connected = Object.keys(names)
      .filter(
        (owner) => owner !== actor.value && canReadTeamSource(owner, actor.value, desktop.repoId)
      )
      .map(
        (owner) =>
          `<p>${hostLabel(owner)} · 已连接 · ${accessLevel(owner) === 'full' ? '完全访问' : '只读'} · 同一 Orca 共享连接</p>`
      )
      .join('')
    return `<section class="muted-frame"><header class="row between"><h2>连接到远程服务器</h2>${button(`${icon('Plus')} 添加服务器`, 'add-server')}</header>${connected || '<p class="field-note">团队主机会出现在项目墙，但默认不会自动建立连接。</p>'}${form}</section>`
  }
  function render() {
    pruneAudit()
    startGroupListIfNeeded()
    surface.innerHTML = {
      wall: wallPage,
      workspace: workspacePage,
      settings: settingsPage,
      pr: prPage
    }[current().screen]()
    save()
  }

  const actions = {
    show,
    panel: (value) => {
      const desktop = current()
      desktop.switchingTeam = false
      if (value === 'team') {
        desktop.groupPicker = reopenGroupPicker(desktop.groupPicker)
        if (!state.bound[actor.value]) {
          desktop.directoryDraft = null
          desktop.directoryBase = 'null'
        } else {
          desktop.directoryDraft = structuredClone(activeDirectory() ?? blankDirectory())
          desktop.directoryBase = JSON.stringify(activeDirectory())
        }
      }
      if (
        !value &&
        desktop.panel === 'team' &&
        desktop.directoryDraft &&
        JSON.stringify(desktop.directoryDraft) !== desktop.directoryBase
      ) {
        confirm('放弃未保存的团队目录？', '<p>当前修改还没保存到群空间。</p>', '放弃修改', () => {
          desktop.panel = ''
          desktop.directoryDraft = null
          render()
        })
        return
      }
      desktop.panel = value
      render()
    },
    reopen: () => {
      const reset = resetDesktops()
      desktops[actor.value] = reset[actor.value]
      notify('')
      render()
    },
    'toggle-group-picker': () => {
      const picker = current().groupPicker
      if (current().bindingPending) {
        return
      }
      picker.open = !picker.open
      if (picker.open) {
        // 重开面板：已就绪的列表复用，失败过的重试。
        loadGroupList()
      } else {
        picker.query = ''
      }
      render()
      surface
        .querySelector(picker.open ? '[data-group-search]' : '[data-action="toggle-group-picker"]')
        ?.focus()
    },
    'choose-group-space': (spaceId) => {
      const desktop = current()
      const picker = desktop.groupPicker
      const space = findDemoSpace(spaceId)
      if (!space || desktop.bindingPending || picker.resolving) {
        return
      }
      picker.open = false
      picker.query = ''
      picker.resolveFailure = ''
      // 与 useTeamGroupPicker.choose 同一步骤：解析期间先清空选择，
      // 提交键不能继续提供上一个群。
      picker.selection = null
      picker.resolving = true
      render()
      const person = actor.value
      setTimeout(() => {
        if (desktops[person] !== desktop) {
          return
        }
        picker.resolving = false
        if (space.groupId) {
          picker.selection = { spaceId: space.spaceId, groupId: space.groupId, name: space.name }
        } else {
          // 空间还在但群已解散：重开面板，把原因显示在列表下方。
          picker.resolveFailure = 'not-a-group-space'
          picker.open = true
        }
        if (actor.value === person) {
          render()
          surface.querySelector('[data-action="toggle-group-picker"]')?.focus()
        }
      }, 500)
    },
    'open-w3-account-settings': () => {
      // W3 账户设置页本体属 w3-account 特性，这里导航到它的当前原型入口，
      // 不在本原型复制第二份设置页。
      current().panel = ''
      current().switchingTeam = false
      notify('已打开设置的 W3 账户页')
      render()
      window.open('../w3-account/prototype.html', '_blank', 'noopener')
    },
    'switch-team': () => {
      current().switchingTeam = true
      current().groupPicker = reopenGroupPicker(current().groupPicker)
      current().bindingError = ''
      notify('')
      render()
      surface.querySelector('[data-action="toggle-group-picker"]')?.focus()
    },
    'cancel-team-switch': () => {
      if (current().bindingPending) {
        return
      }
      current().switchingTeam = false
      notify('')
      render()
      surface.querySelector('[data-action="switch-team"]')?.focus()
    },
    'open-workspace': enterSource,
    reset: () => {
      state = fixture()
      desktops = resetDesktops()
      actor.value = 'lead'
      notify('')
      render()
    },
    'review-791': () => {
      state = fixture(true)
      desktops = resetDesktops()
      actor.value = 'lin'
      notify('')
      actions.panel('team')
    },
    sample: () => {
      state = fixture(true)
      desktops = resetDesktops()
      actor.value = 'lead'
      notify('')
      render()
    },
    theme: () => {
      document.documentElement.dataset.theme =
        document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    },
    help: () => confirm('项目墙帮助', '<p>用团队设置绑定 WeLink 团队群。</p>', '关闭', () => {}),
    refresh: () => notify('已刷新'),
    'refresh-directory': () => {
      const desktop = current()
      if (JSON.stringify(desktop.directoryDraft) !== desktop.directoryBase) {
        notify('请先保存当前目录修改。')
        return
      }
      setActiveDirectory(syncDirectory(activeDirectory()))
      hydrateEndpoints()
      desktop.directoryDraft = structuredClone(activeDirectory())
      desktop.directoryBase = JSON.stringify(activeDirectory())
      notify('已刷新当前团队的成员、主机和项目')
      render()
    },
    'register-project': () => registerProjectDialog(current().directoryDraft),
    'open-space': (value) => {
      if (value) {
        window.open(value, '_blank', 'noopener')
      }
      notify(`已打开 WeLink 群空间${value ? ` · ${value}` : ''}`)
    },
    'fill-own-share': () => {
      const draft = current().directoryDraft
      const endpoint =
        state.teamEndpoints?.[actor.value] ??
        addresses[actor.value] ??
        `ws://192.0.2.${12 + Object.keys(names).indexOf(actor.value)}:${6770 + Object.keys(names).indexOf(actor.value)}`
      const host = draft?.hosts?.find((entry) => entry.member_id === employees[actor.value])
      if (!draft || !host || !endpoint) {
        notify('当前主机暂时无法生成 Orca 共享地址。')
        return
      }
      host.orca_endpoint = endpoint
      state.teamEndpoints[actor.value] = endpoint
      state.generatedLinks[actor.value] ??= `orca://pair?code=demo-${actor.value}`
      setActiveDirectory(syncDirectory(structuredClone(draft)))
      hydrateEndpoints()
      current().directoryDraft = structuredClone(activeDirectory())
      current().directoryBase = JSON.stringify(activeDirectory())
      notify(
        `已${addresses[actor.value] ? '带入' : '生成并填入'}${hostLabel(actor.value)}的 Orca 共享地址`
      )
      render()
    },
    'legacy-add': () => {
      if (state.bound?.[actor.value] && availableTeamProjects(knownDirectory()).length) {
        registerProjectDialog()
        return
      }
      confirm('添加项目', '<p>打开已有文件夹、克隆代码仓，或新建项目。</p>', '关闭', () => {})
    },
    'save-directory': saveDirectory,
    'preview-directory': () =>
      confirm(
        'BW/team.json',
        `<pre class="catalog-json">${esc(JSON.stringify(current().directoryDraft, null, 2))}</pre>`,
        '关闭',
        () => {}
      ),
    tab: (value) => {
      const desktop = current()
      desktop.tab = value
      if (desktop.source !== actor.value) {
        authorizeRemoteAction(
          desktop.source,
          value === 'terminal' ? '查看终端输出' : '查看已有会话',
          desktop.repoId
        )
      }
      render()
    },
    'toggle-notifications': () => {
      current().notifications = !current().notifications
      render()
    },
    approve: () =>
      confirm(
        '提交评审',
        '<label class="field">评审意见 <textarea name="comment" rows="3" class="input" required></textarea></label><label class="check-row"><input type="radio" checked> 批准</label>',
        '提交评审',
        (data) => {
          state.review = { approved: true, comment: data.get('comment') }
          render()
        }
      ),
    'settings-back': () => {
      show(current().prior)
    },
    'manage-remote': () => {
      current().remotePopover = !current().remotePopover
      render()
    },
    'refresh-remote-hosts': () => {
      hydrateEndpoints()
      notify('已刷新团队远程主机，连接状态保持不变')
      render()
    },
    'open-remote-settings': () => {
      const desktop = current()
      desktop.remotePopover = false
      desktop.server = true
      desktop.workflow = 'connect'
      show('settings')
    },
    'quick-connect-host': (ownerValue) => {
      const owner = String(ownerValue || '')
      const endpoint = endpointFor(owner)
      if (!owner || owner === actor.value || !endpoint) {
        notify('当前团队主机还没有可用的 Orca 地址。')
        return
      }
      state.teamConnections[actor.value] ??= {}
      state.teamConnections[actor.value][owner] = endpoint
      state.accessModes[actor.value] ??= {}
      state.accessModes[actor.value][owner] = 'readonly'
      audit(owner, '连接共享主机', '已放行', hostLabel(owner))
      notify(`已连接${hostLabel(owner)} · 默认只读`)
      render()
    },
    'disconnect-host': (ownerValue) => {
      const owner = String(ownerValue || '')
      if (!owner) {
        return
      }
      delete state.teamConnections[actor.value]?.[owner]
      delete state.accessModes[actor.value]?.[owner]
      audit(owner, '撤销共享连接', '已生效', `${hostLabel(owner)} · ${hostLabel(actor.value)}`)
      notify(`已断开${hostLabel(owner)}，团队目录仍保留该主机`)
      render()
    },
    server: () => {
      current().server = true
      render()
    },
    'server-workflow': (value) => {
      current().workflow = value
      render()
    },
    'generate-link': () => {
      const owner = actor.value
      if (!addresses[owner]) {
        notify('当前桌面还没有可供其他主机连接的 Orca 共享配置。')
        return
      }
      state.generatedLinks ??= {}
      state.generatedLinks[owner] =
        owner === 'lin' ? samplePairing : `orca://pair?code=demo-${owner}`
      state.offered = true
      state.teamEndpoints[owner] = addresses[owner]
      notify(`已生成${hostLabel(owner)}的 Orca 访问链接。连接建立后默认只读。`)
      render()
    },
    'add-server': () => {
      current().addingServer = !current().addingServer
      render()
    },
    'grant-access': (value) => {
      const [owner, visitor] = String(value || '').split('|')
      if (!owner || !visitor) {
        return
      }
      state.accessModes ??= { lead: {}, lin: {}, chen: {} }
      state.accessModes[visitor] ??= {}
      state.accessModes[visitor][owner] = 'full'
      audit(owner, '授予完全访问', '已生效', `${hostLabel(owner)} · ${hostLabel(visitor)}`)
      notify(`已给${hostLabel(visitor)}授予完全访问，已打开的终端立即生效`)
      render()
    },
    'demote-access': (value) => {
      const [owner, visitor] = String(value || '').split('|')
      if (!owner || !visitor) {
        return
      }
      state.accessModes[visitor] ??= {}
      state.accessModes[visitor][owner] = 'readonly'
      audit(owner, '恢复只读', '已生效', `${hostLabel(owner)} · ${hostLabel(visitor)}`)
      notify(`已恢复${hostLabel(visitor)}的只读权限，连接仍在`)
      render()
    },
    revoke: (value) => {
      const [owner, visitor] = String(value || '').split('|')
      if (!owner || !visitor) {
        return
      }
      delete state.teamConnections[visitor]?.[owner]
      delete state.accessModes[visitor]?.[owner]
      audit(owner, '撤销共享连接', '已生效', `${hostLabel(owner)} · ${hostLabel(visitor)}`)
      notify(`已撤销${hostLabel(visitor)}对${hostLabel(owner)}的共享连接`)
      render()
    },
    'new-worktree': () => {
      const desktop = current()
      const owner = desktop.source
      const repoId = desktop.repoId
      if (readOnly()) {
        authorizeRemoteAction(owner, '新建工作树', repoId)
        confirm(
          '当前来源为只读',
          `<p>你可以查看${esc(hostLabel(owner))}上的已有内容，但不能在这台主机创建工作树。请先让主机持有人在 Orca 共享设置中授予完全访问。</p>`,
          '关闭',
          () => {}
        )
        return
      }
      confirm(
        '新建工作树',
        `<label class="field">创建位置<select class="input" name="location"><option value="local">${hostLabel(actor.value)} · 本机</option><option value="remote">${hostLabel(owner)} · 当前来源</option></select></label><p class="field-note">选择远程主机时，工作树和后续会话都落在当前 Orca 来源主机。</p>`,
        '创建工作树',
        (data) => {
          const location = data.get('location')
          const target = location === 'remote' ? owner : actor.value
          authorizeRemoteAction(owner, '新建工作树', repoId)
          notify(`已在${hostLabel(target)}创建${catalogRepos[repoId]?.name ?? project}工作树`)
          render()
        }
      )
    },
    'new-session': () => {
      if (readOnly()) {
        const owner = current().source
        const repoId = current().repoId
        authorizeRemoteAction(owner, '新建会话', repoId)
        confirm(
          '当前来源为只读',
          `<p>你可以查看 ${esc(hostLabel(owner))} 上的已有会话和终端输出，但不能在只读主机上新建会话。请先让主机持有人在 Orca 共享设置中授予完全访问。</p>`,
          '关闭',
          () => {}
        )
        return
      }
      current().tab = 'new'
      render()
    },
    'reset-audit': () => {
      current().auditFilters = defaultAuditFilters()
      render()
    },
    'clear-audit': () => {
      state.logs[actor.value] = []
      current().auditFilters = defaultAuditFilters()
      notify('已清理当前主机的共享访问日志')
      render()
    },
    'close-dialog': () => {
      dialog.close()
      render()
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button[data-action]')
    if (target) {
      actions[target.dataset.action]?.(target.dataset.value)
    }
  })

  surface.addEventListener('contextmenu', (event) => {
    if (!event.target.closest('[data-worktree]')) {
      return
    }
    event.preventDefault()
    actions.panel('worktree-menu')
  })

  surface.addEventListener('input', (event) => {
    if (event.target.hasAttribute('data-group-search')) {
      current().groupPicker.query = event.target.value
      renderGroupOptions()
    }
    if (event.target.dataset.auditFilter === 'search') {
      updateAuditFilter(event.target)
    }
    if (event.target.matches('input[data-address]')) {
      const person = event.target.dataset.address
      const host = current().directoryDraft?.hosts?.find(
        (entry) => entry.member_id === employees[person]
      )
      if (host) {
        host.orca_endpoint = event.target.value.trim()
      }
    }
    if (event.target.hasAttribute('data-filter')) {
      const query = event.target.value.trim()
      for (const card of document.querySelectorAll('[data-project-name]')) {
        card.hidden = !card.dataset.projectName.includes(query)
      }
    }
    if (event.target.hasAttribute('data-people-search')) {
      event.target.nextElementSibling.hidden = !`韩岚 ${teamName}`.includes(
        event.target.value.trim()
      )
    }
  })

  document.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.target)
    if (dialog.contains(event.target)) {
      dialog.close()
      confirmForm(data)
    } else if (event.target.id === 'team-lookup') {
      const person = actor.value
      const submittedState = state
      const desktop = current()
      if (desktop.bindingPending) {
        return
      }
      const selection = desktop.groupPicker.selection
      // 提交键在没有选出群时就是 disabled，这里只挡直接回车提交。
      if (!selection || desktop.groupPicker.resolving) {
        return
      }
      const fail = document.querySelector('#switch-result').value === 'failure'
      desktop.bindingPending = true
      desktop.bindingError = ''
      const form = event.target
      for (const control of form.elements) {
        control.disabled = true
      }
      form.querySelector('button[type="submit"]').textContent = '正在读取团队…'
      form.querySelector('#binding-error').textContent = ''
      const closeButton = surface.querySelector('[aria-label="取消切换团队"]')
      if (closeButton) {
        closeButton.disabled = true
      }
      setTimeout(() => {
        if (state !== submittedState || desktops[person] !== desktop) {
          return
        }
        desktop.bindingPending = false
        if (fail) {
          // 切换失败是弹窗内的内联错误；首次绑定失败在产品里走通知。
          if (desktop.switchingTeam) {
            desktop.bindingError = '未能读取新团队，当前团队保持不变。重新选择群后重试。'
          } else if (actor.value === person) {
            notify('未能读取团队目录。重新选择 WeLink 群后重试。')
          }
          if (actor.value === person) {
            render()
          }
          return
        }
        state.bindings[person] = bindingKey(selection.groupId, selection.spaceId)
        if (!activeDirectory(person)) {
          const directory = blankDirectory(selection.groupId, selection.spaceId)
          if (selection.spaceId === alternateSpaceId) {
            directory.projects = [
              {
                repo_id: 'board',
                name: catalogRepos.board.name,
                repository: catalogRepos.board.repository
              }
            ]
          }
          setActiveDirectory(syncDirectory(directory), person)
        }
        state.bound[person] = true
        hydrateEndpoints(activeDirectory(person))
        desktop.directoryDraft = structuredClone(activeDirectory(person))
        desktop.directoryBase = JSON.stringify(activeDirectory(person))
        desktop.switchingTeam = false
        if (actor.value === person) {
          notify('已读取并切换团队')
        }
        render()
      }, 650)
    } else if (event.target.id === 'review-form' && data.get('recipient') === 'lead') {
      state.review = { approved: false, comment: '' }
      current().panel = ''
      notify('评审请求已送达韩岚')
      render()
    } else if (event.target.id === 'pair-form') {
      const owner = String(data.get('owner') || '')
      const link = String(data.get('link') || '')
      const endpoint = endpointFor(owner)
      if (
        !owner ||
        owner === actor.value ||
        (!endpoint && (!state.generatedLinks?.[owner] || link !== state.generatedLinks[owner]))
      ) {
        notify('群空间还没有这个主机的 Orca 地址，请让主机持有人先登记共享地址。')
        return
      }
      state.teamEndpoints[owner] = endpoint || addresses[owner]
      state.teamConnections[actor.value] ??= {}
      state.teamConnections[actor.value][owner] = endpoint || addresses[owner]
      state.accessModes[actor.value] ??= {}
      state.accessModes[actor.value][owner] = 'readonly'
      current().addingServer = false
      audit(owner, '连接共享主机', '已放行', hostLabel(owner))
      notify(`已连接${hostLabel(owner)} · 默认只读。主机持有人可在共享列表的成员行切换为完全访问。`)
      render()
    }
  })

  surface.addEventListener('change', (event) => {
    if (event.target.matches('select[data-audit-filter]')) {
      updateAuditFilter(event.target)
    }
    if (event.target.name === 'recipient') {
      const send = document.querySelector('#review-form button[type=submit]')
      const count = event.target.checked ? 1 : 0
      document.querySelector('#picked').textContent = `收件人 · 已选 ${count} 人`
      send.textContent = `发送至 ${count} 人`
      send.disabled = count === 0
    }
  })

  surface.addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-select-all')) {
      event.target.select()
    }
  })

  actor.addEventListener('change', () => {
    notify('')
    render()
  })
  // 评审工具区换注入结果：清掉已缓存的群列表，下一次打开面板按新结果重读。
  document.querySelector('#group-list-result').addEventListener('change', () => {
    for (const person of Object.keys(desktops)) {
      const picker = desktops[person].groupPicker
      if (picker.phase === 'ready' || picker.phase === 'failed') {
        picker.phase = 'idle'
        picker.listFailure = ''
        picker.truncated = false
      }
    }
    render()
  })
  dialog.addEventListener('cancel', render)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || dialog.open) {
      return
    }
    if (current().switchingTeam) {
      actions['cancel-team-switch']()
      return
    }
    current().panel = ''
    current().notifications = false
    render()
  })
  const params = new URLSearchParams(location.search)
  if (params.get('review') === '791') {
    state = fixture(true)
    actor.value = 'lin'
    actions.panel('team')
  } else {
    render()
  }
})()
