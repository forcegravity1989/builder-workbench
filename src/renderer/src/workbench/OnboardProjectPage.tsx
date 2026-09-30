import React, { useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { getDefaultCloneParent } from '@/components/sidebar/clone-defaults'
import { normalizeGitRemoteUrl } from '../../../shared/git-remote-identity'
import { closeProjectPage, openProjectWall, type ProjectOnboardOptions } from './project-page-state'
import { authorizeWorkbenchLocalPath } from './authorize-workbench-local-path'
import { probeRemoteCharter } from './charter-port'
import {
  joinFsPath,
  normalizeCloneUrl,
  repoNameFromRemote,
  type ProjectCharter
} from './project-charter'
import { probeLocalCharter, submitProjectOnboard, type OnboardLogLine } from './run-project-onboard'
import { OnboardCharterStep } from './OnboardCharterStep'
import './workbench-onboard.css'

type Step = 1 | 2

export function OnboardProjectPage({
  options
}: {
  options: ProjectOnboardOptions
}): React.JSX.Element {
  const workspaceDir = useAppStore((s) => s.settings?.workspaceDir ?? '')
  const attaching = Boolean(options.attachToGroupId)

  const [step, setStep] = useState<Step>(1)
  const [localRepo, setLocalRepo] = useState(true)
  const [workspace, setWorkspace] = useState('')
  const [remote, setRemote] = useState('')
  const [cloneParent, setCloneParent] = useState(
    () => getDefaultCloneParent(workspaceDir || '') || ''
  )
  const [name, setName] = useState(options.seedName ?? '')
  const [brief, setBrief] = useState('')
  const [benchmark, setBenchmark] = useState('')
  const [opportunity, setOpportunity] = useState('')
  const [probeNote, setProbeNote] = useState<string | null>(null)
  const [stepError, setStepError] = useState<string | null>(null)
  const [log, setLog] = useState<OnboardLogLine[]>([])
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)

  const targetPath = useMemo(() => {
    if (localRepo) {
      return workspace.trim()
    }
    const parent = cloneParent.trim()
    const repo = repoNameFromRemote(normalizeCloneUrl(remote) || remote)
    if (!parent || !repo) {
      return ''
    }
    return joinFsPath(parent, repo)
  }, [localRepo, workspace, cloneParent, remote])

  const canNext = localRepo
    ? workspace.trim().length > 0
    : remote.trim().length > 0 && cloneParent.trim().length > 0

  // 探测回执竞态防护（spec 规则 3）：读的过程中用户换了地址，过期回执不应用。
  const probeSeq = useRef(0)
  const runRemoteProbe = async (requested: string, repoName: string): Promise<void> => {
    const seq = ++probeSeq.current
    const stale = () => probeSeq.current !== seq
    const applyNote = (note: string) => {
      if (!stale()) {
        setProbeNote(note)
      }
    }
    try {
      const result = await probeRemoteCharter(requested)
      if (stale()) {
        return
      }
      if (result.kind === 'adopted') {
        // 人打过的格子以人为准，探测值只填空。
        setName((prev) => prev.trim() || result.charter.name || repoName)
        setBrief((prev) => prev.trim() || result.charter.brief)
        setBenchmark((prev) => prev.trim() || result.charter.benchmark)
        setOpportunity((prev) => prev.trim() || result.charter.opportunity)
        setProbeNote('远端已发现名片，已带入；你填过的格子以你为准，确认后只补空字段。')
      } else if (result.kind === 'absent') {
        setProbeNote('远端还没有名片，确认后经 PR 新建。')
      } else if (result.kind === 'no-repo') {
        setProbeNote(`读不到该仓：${result.error}（仓不存在或没有权限）。仍可继续，克隆时会再验证。`)
      } else {
        applyNote(
          `远端名片没查成：${result.error} —— 不代表仓里没有名片；克隆后以已有名片为准，只补空字段。`
        )
      }
    } catch (e) {
      applyNote(
        `远端名片没查成：${e instanceof Error ? e.message : String(e)} —— 不代表仓里没有名片；克隆后以已有名片为准，只补空字段。`
      )
    }
  }

  const goStep2 = async () => {
    if (!canNext || checking) {
      return
    }
    setStepError(null)
    setChecking(true)
    try {
      if (localRepo) {
        const path = workspace.trim()
        // Why: typed paths are outside fs allow-list until authorized; OS picker also authorizes in main.
        await authorizeWorkbenchLocalPath(path)
        const exists = await window.api.fs.pathExists({ filePath: path })
        if (!exists) {
          setStepError(`路径不存在：${path}。请点「浏览文件夹」选真实 Git 仓。`)
          return
        }
        const probed = await probeLocalCharter(path)
        setName(probed.prefill.name || path.split(/[\\/]/).findLast(Boolean) || '')
        setBrief(probed.prefill.brief)
        setBenchmark(probed.prefill.benchmark)
        setOpportunity(probed.prefill.opportunity)
        setProbeNote(probed.note)
      } else {
        const parent = cloneParent.trim()
        await authorizeWorkbenchLocalPath(parent)
        const parentExists = await window.api.fs.pathExists({ filePath: parent })
        if (!parentExists) {
          setStepError(`父文件夹不存在：${parent}`)
          return
        }
        const normalized = normalizeCloneUrl(remote)
        const repo = repoNameFromRemote(normalized || remote)
        // 同远端去重（spec 规则 4）：归一化身份已注册就引导复用，不克隆第二份。
        // canonicalKey 与 normalizeGitRemoteUrl 同一产生器,等值比较即既有先例口径。
        const key = normalizeGitRemoteUrl(normalized) ?? normalized
        const duplicate = useAppStore
          .getState()
          .repos.find((r) => r.gitRemoteIdentity?.canonicalKey === key)
        if (duplicate) {
          setStepError(
            `这个远端已经作为「${duplicate.displayName || duplicate.path}」接入过（${duplicate.path}）。要用它请直接打开该项目；换个文件夹再克隆只会得到重复项目。`
          )
          return
        }
        setName(repo)
        setBrief('')
        setBenchmark('')
        setOpportunity('')
        setProbeNote('正在读远端名片…')
        void runRemoteProbe(remote.trim(), repo)
      }
      setStep(2)
    } catch (e) {
      setStepError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  const submit = async () => {
    if (busy) {
      return
    }
    const intent: ProjectCharter = {
      name: name.trim(),
      kind: '',
      brief: brief.trim(),
      benchmark: benchmark.trim(),
      opportunity: opportunity.trim()
    }
    if (!intent.name) {
      setLog([{ kind: 'fail', text: '项目名称不能为空' }])
      return
    }
    setBusy(true)
    setLog([])
    try {
      await submitProjectOnboard({
        localRepo,
        workspace,
        remote,
        cloneParent,
        intent,
        attachToGroupId: options.attachToGroupId,
        onLog: (line) => setLog((prev) => [...prev, line])
      })
    } catch (e) {
      setLog((prev) => [
        ...prev,
        { kind: 'fail', text: e instanceof Error ? e.message : String(e) }
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="wb-onboard-page"
      aria-label={attaching ? '增加代码仓' : '接入项目'}
      data-screen="onboard"
    >
      <div className="wb-onboard">
        <header className="page-head">
          <div>
            <h1>{attaching ? '增加代码仓' : '接入项目'}</h1>
            <p className="page-desc">
              {attaching
                ? `为「${options.attachLabel || options.seedName || '当前项目'}」增加一个代码槽。`
                : '选择仓库，再确认项目基础信息。'}
            </p>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="wb-btn wb-btn-secondary"
              onClick={() => {
                openProjectWall()
              }}
            >
              ← 项目墙
            </button>
            <button type="button" className="wb-btn wb-btn-ghost" onClick={closeProjectPage}>
              关闭
            </button>
          </div>
        </header>

        <div className="ob-steps">
          <span className={`ob-step${step === 1 ? ' active' : ' done'}`}>① 项目地址</span>
          <span className="ob-step-line" />
          <span className={`ob-step${step === 2 ? ' active' : ''}`}>② 基础信息</span>
        </div>

        <div className="ob-cards">
          {step === 1 ? (
            <>
              <div className="ob-card">
                <h3>项目地址</h3>
                <div className="seg" role="radiogroup" aria-label="接入方式">
                  <label className="seg-opt">
                    <input
                      type="radio"
                      name="ob-repo-kind"
                      checked={localRepo}
                      onChange={() => {
                        setLocalRepo(true)
                        setRemote('')
                        setStepError(null)
                      }}
                    />
                    打开本地仓
                  </label>
                  <label className="seg-opt">
                    <input
                      type="radio"
                      name="ob-repo-kind"
                      checked={!localRepo}
                      onChange={() => {
                        setLocalRepo(false)
                        setWorkspace('')
                        setStepError(null)
                      }}
                    />
                    克隆远端仓
                  </label>
                </div>

                {localRepo ? (
                  <div className="field">
                    <label>本地 Git 仓</label>
                    <div className="ob-path-row">
                      <input
                        className="wb-ob-input mono"
                        value={workspace}
                        placeholder="/Users/you/projects/workbench"
                        onChange={(e) => {
                          setWorkspace(e.target.value)
                          setStepError(null)
                        }}
                      />
                      <button
                        type="button"
                        className="wb-btn wb-btn-secondary"
                        onClick={async () => {
                          const path = await window.api.repos.pickFolder()
                          if (path) {
                            await authorizeWorkbenchLocalPath(path)
                            setWorkspace(path)
                            setStepError(null)
                          }
                        }}
                      >
                        浏览文件夹
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="field">
                      <label>远端仓</label>
                      <input
                        className="wb-ob-input mono"
                        value={remote}
                        placeholder="owner/repo 或 https://github.com/owner/repo.git"
                        onChange={(e) => {
                          setRemote(e.target.value)
                          setStepError(null)
                        }}
                      />
                    </div>
                    <div className="field">
                      <label>父文件夹</label>
                      <div className="ob-path-row">
                        <input
                          className="wb-ob-input mono"
                          value={cloneParent}
                          placeholder="/Users/you/projects"
                          onChange={(e) => {
                            setCloneParent(e.target.value)
                            setStepError(null)
                          }}
                        />
                        <button
                          type="button"
                          className="wb-btn wb-btn-secondary"
                          onClick={async () => {
                            const dir = await window.api.repos.pickDirectory()
                            if (dir) {
                              await authorizeWorkbenchLocalPath(dir)
                              setCloneParent(dir)
                              setStepError(null)
                            }
                          }}
                        >
                          浏览文件夹
                        </button>
                      </div>
                    </div>
                  </>
                )}
                {stepError ? <div className="ob-note is-fail">{stepError}</div> : null}
              </div>
              <div className="ob-actions">
                <button
                  type="button"
                  className="wb-btn wb-btn-primary"
                  disabled={!canNext || checking}
                  onClick={() => {
                    void goStep2()
                  }}
                >
                  {checking ? '检查路径…' : '下一步：基础信息 →'}
                </button>
              </div>
            </>
          ) : (
            <OnboardCharterStep
              targetPath={targetPath}
              probeNote={probeNote}
              name={name}
              brief={brief}
              benchmark={benchmark}
              opportunity={opportunity}
              log={log}
              busy={busy}
              onName={setName}
              onBrief={setBrief}
              onBenchmark={setBenchmark}
              onOpportunity={setOpportunity}
              onBack={() => {
                setStep(1)
                setLog([])
              }}
              onSubmit={() => {
                void submit()
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
