import { journeySteps } from './journey.js'
import { React, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { initial } from './shared.jsx'
import { original, remote } from './snapshot.js'
import { buildMinutes, buildReport } from './summaries.js'
import { PrototypeTaskList, PrototypeVersionTasks } from './tasks.jsx'
import { PrototypeLayout } from './layout.jsx'

function App() {
  useEffect(() => {
    const onHash = () => {
      const id = location.hash.slice(1)
      if (['monday', 'friday', 'overview', 'tasks', 'metricsetup'].includes(id)) {
        setView(id)
        if (id === 'monday') {
          setSessionFlow('计划')
        }
        if (id === 'friday') {
          setSessionFlow('验收')
        }
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const [view, setView] = useState(
    ['monday', 'friday', 'overview', 'tasks', 'metricsetup'].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : document.body.dataset.screen
  )
  const [version, setVersion] = useState('v0.5'),
    [goals, setGoals] = useState(initial),
    [historical, setHistorical] = useState(
      original.results.goals.map((g) => ({
        ...g,
        decision: '待核对',
        reason: '',
        next: ''
      }))
    )
  const [risk, setRisk] = useState(original.summary.risks),
    [progress, setProgress] = useState(original.summary.progress),
    [modal, setModal] = useState(null),
    [active, setActive] = useState(0)
  const [sessions, setSessions] = useState({
      计划: 'W39',
      验收: 'W39'
    }),
    [sessionFlow, setSessionFlow] = useState(
      (location.hash || `#${document.body.dataset.screen}`) === '#friday' ? '验收' : '计划'
    ),
    [drafts, setDrafts] = useState({}),
    [configId, setConfigId] = useState(1),
    [notice, setNotice] = useState('')
  const [issues, setIssues] = useState(remote.issues),
    [expanded, setExpanded] = useState(false),
    [taskFilter, setTaskFilter] = useState(''),
    [selectedIssue, setSelectedIssue] = useState(null),
    [issueDraft, setIssueDraft] = useState(''),
    [editingIssue, setEditingIssue] = useState(false),
    [returnTo, setReturnTo] = useState('tasks'),
    [reviewOpened, setReviewOpened] = useState(false),
    [copied, setCopied] = useState(false)
  const [overviewSelection, setOverviewSelection] = useState({
      version: 'v0.5',
      week: 'W39'
    }),
    [overviewUI, setOverviewUI] = useState({
      feature: '',
      grain: 'week',
      repoGrain: 'week',
      hidden: []
    })
  const taskSection = useRef(null),
    composer = useRef(null),
    savedScroll = useRef(0)
  const weekly = view === 'monday' || view === 'friday',
    chatVisible = weekly,
    branch = sessionFlow === '验收' ? 'bw/week-acceptance' : 'bw/week-plan',
    session = sessions[sessionFlow],
    setSession = (v) =>
      setSessions((x) => ({
        ...x,
        [sessionFlow]: v
      })),
    draftKey = view === 'metricsetup' ? `配置-${configId}` : `${sessionFlow}-${session}`,
    draft = drafts[draftKey] || '',
    setDraft = (v) =>
      setDrafts((x) => ({
        ...x,
        [draftKey]: v
      })),
    current = version === 'v0.5' ? goals : historical
  const taskRows = (v) =>
    (v === 'v0.5' ? original.plan.tasks : original.results.tasks).map((t) => ({
      ...t,
      ...issues.find((x) => x.number === t.number),
      goal: t.goal.split('/').at(-1)
    }))
  const tasks = taskRows(version),
    goalIssues = (g) => tasks.filter((t) => t.goal === g.label),
    shownTasks = taskFilter ? tasks.filter((t) => t.goal === taskFilter) : tasks
  const issue = issues.find((t) => t.number === selectedIssue),
    hasGap = (g) => g.decision === '未达'
  const update = (id, key, value) =>
    setGoals((gs) =>
      gs.map((g) =>
        g.id === id
          ? {
              ...g,
              [key]: value
            }
          : g
      )
    )
  const updateResult = (id, key, value) =>
    version === 'v0.5'
      ? update(id, key, value)
      : setHistorical((gs) =>
          gs.map((g) =>
            g.id === id
              ? {
                  ...g,
                  [key]: value
                }
              : g
          )
        )
  function go(v) {
    setView(v)
    setActive(0)
    setNotice('')
    setModal(null)
    if (v === 'monday') {
      setVersion('v0.5')
      setSessionFlow('计划')
    }
    if (v === 'friday') {
      setSessionFlow('验收')
    }
    history.replaceState(null, '', `#${v}`)
  }
  function promptConversation(text) {
    setDraft(text)
    setNotice('已放入会话输入框，尚未发送')
    setModal(null)
    requestAnimationFrame(() => composer.current?.querySelector('textarea')?.focus())
  }
  function minutes() {
    return buildMinutes({
      goals
    })
  }
  function report(forVersion = version) {
    return buildReport(
      {
        goals,
        hasGap,
        historical,
        taskRows
      },
      forVersion
    )
  }
  function review() {
    setCopied(false)
    setReviewOpened(true)
    setModal({
      type: 'text',
      title: view === 'monday' ? '三段式评审纪要' : '版本验收报告',
      text: view === 'monday' ? minutes() : report()
    })
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(modal.text)
      setCopied(modal.text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = modal.text
      document.body.append(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      setCopied(ok ? modal.text : false)
      if (!ok) {
        setNotice('复制未成功，可在预览中选中文本复制')
      }
    }
  }
  function metricPrep(m) {
    setDrafts((x) => ({
      ...x,
      [`配置-${configId}`]:
        x[`配置-${configId}`] ||
        `请读取项目约定、通用 SYSTEM 和 metrics-refresh Skill。先展示定义口径 → 查真实来源 → 实现脚本 → 试采验证 → 评审采用的流程，与我核对场外要求。配置指标：${
          m?.name || '项目指标'
        }。优先可查历史的脚本，只能查当前则明确限制；不手填实际值，不新增每日采集或记账分支。复用已有定义与脚本，按项目约定在独立原生任务内修改资产，采用后返回总览。不启动版本计划流程。`
    }))
    go('metricsetup')
  }
  function openIssues(g = null) {
    setTaskFilter(g?.label || '')
    setExpanded(true)
    requestAnimationFrame(() =>
      taskSection.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    )
  }
  function openIssue(t) {
    savedScroll.current = document.querySelector('.content-scroll')?.scrollTop || 0
    setReturnTo(view)
    setSelectedIssue(t.number)
    setIssueDraft(t.body || '')
    setEditingIssue(false)
    go('tasks')
  }
  function backFromIssue() {
    const target = returnTo
    setSelectedIssue(null)
    go(target)
    requestAnimationFrame(() => {
      const el = document.querySelector('.content-scroll')
      if (el) {
        el.scrollTop = savedScroll.current
      }
    })
  }
  function refreshMetrics() {
    setNotice('原型未接入采集；未修改读数。正式界面刷新同一指标来源。')
  }
  function prepareDelivery() {
    promptConversation(
      `请在 bw/week-acceptance 的 ${version} · ${
        session
      } 本次验收中准备交付。先固定正式计划修订及源码候选提交，核对项目已有出包/验证入口与授权，从候选源码执行，不从验收树旧 HEAD 打包。整理包、验证报告和 showcase 材料，记录候选与来源，刷新指标并核对 Issue。缺工具或候选请与我确认，不假报成功，不自动发布。`
    )
  }
  function archive() {
    promptConversation(
      `请在当前固定分支的本次会话中，根据右侧当前 ${version} ${view === 'monday' ? '版本计划' : '版本验收结论'}核对并保存归档材料，列出待确认项；内容确认后发起 PR，并回显链接、检查和合入状态。不要替人合入 PR${view === 'friday' ? '，也不要自动把 Issue 标为完成' : ''}。`
    )
  }
  const archiveState = 'unknown'
  const steps = journeySteps({
    goals,
    current,
    hasGap,
    version,
    view,
    progress,
    reviewOpened,
    tasks,
    goalIssues
  })

  function stageGo(i) {
    setActive(i)
    if (view === 'friday' && i === 0) {
      document.querySelector('.preparation-strip')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
      return
    }
    if (i === steps.length - 1) {
      archive()
      return
    }
    if (view === 'monday' && i === 2) {
      review()
      return
    }
    if (view === 'monday' && i === 3) {
      openIssues()
      return
    }
    document
      .querySelector(
        view === 'monday' ? (i === 0 ? '.briefs' : '.goal-sheet') : '.acceptance-sheet'
      )
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      })
    if (view === 'friday' && i === 1) {
      document.querySelector('.decision select')?.focus()
    }
  }
  function taskList(items) {
    return (
      <PrototypeTaskList
        {...{
          items,
          openIssue
        }}
      />
    )
  }
  function versionTasks() {
    return (
      <PrototypeVersionTasks
        {...{
          expanded,
          promptConversation,
          setExpanded,
          setNotice,
          setTaskFilter,
          shownTasks,
          taskFilter,
          taskList,
          taskSection,
          tasks,
          version,
          view
        }}
      />
    )
  }
  return (
    <PrototypeLayout
      {...{
        active,
        archiveState,
        backFromIssue,
        branch,
        chatVisible,
        composer,
        configId,
        copied,
        copyText,
        current,
        draft,
        editingIssue,
        go,
        goalIssues,
        goals,
        hasGap,
        historical,
        issue,
        issueDraft,
        metricPrep,
        minutes,
        modal,
        notice,
        openIssues,
        overviewSelection,
        overviewUI,
        prepareDelivery,
        progress,
        promptConversation,
        refreshMetrics,
        report,
        returnTo,
        review,
        risk,
        session,
        sessionFlow,
        setConfigId,
        setDraft,
        setDrafts,
        setEditingIssue,
        setExpanded,
        setIssueDraft,
        setIssues,
        setModal,
        setNotice,
        setOverviewSelection,
        setOverviewUI,
        setProgress,
        setRisk,
        setSelectedIssue,
        setSession,
        setSessionFlow,
        setSessions,
        setTaskFilter,
        setVersion,
        stageGo,
        steps,
        taskList,
        taskRows,
        tasks,
        update,
        updateResult,
        version,
        versionTasks,
        view,
        weekly
      }}
    />
  )
}
createRoot(document.getElementById('root')).render(<App />)
