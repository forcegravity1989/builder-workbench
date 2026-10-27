// This wrapper owns only demonstration controls; all product UI comes from source imports.
import React, { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer/'
import { Toaster } from 'sonner'
import { ProjectWallPage } from '../../../../../src/renderer/src/workbench/ProjectWallPage'
import { OnboardProjectPage } from '../../../../../src/renderer/src/workbench/OnboardProjectPage'
import { encodePairingOffer } from '../../../../../src/shared/pairing'
import {
  subscribe,
  getSnapshot,
  getView,
  reset,
  announce,
  download,
  fixtureRows,
  getMode,
  openProjectWall
} from './fixtures'
import { installApi } from './api'

;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer
installApi()
const paths = [
  [
    'first',
    '首次接入',
    '点真实「接入项目」→ 选择本地仓 → 基础信息 → 确认接入；再点文件导入图标，导入演示清单。'
  ],
  [
    'late',
    '重复入口归组',
    '模拟一处远端身份尚未读回。点真实刷新图标，观察现有分组函数读到共同身份后的结果。'
  ],
  [
    'offline',
    '来源离线',
    '模拟 A 离线、本机可读；墙卡保留且会话读数未知。恢复来源通过外部演示控制，不另画连接设置。'
  ],
  ['all-offline', '名片全部不可读', '模拟所有名片读取失败；严格纳入判据不保留墙卡。'],
  [
    'leader',
    'Leader 多项目',
    '样例已有订单项目。通过真实文件导入对话框导入 C，观察两张项目卡；Leader 不对应产品角色。'
  ]
]
function App() {
  useSyncExternalStore(subscribe, getSnapshot)
  const [notice, setNotice] = useState(
    '产品区域直接渲染仓库组件；配对、仓库及名片读回使用演示适配器。'
  )
  useEffect(() => {
    const receive = (event: Event) => setNotice((event as CustomEvent).detail)
    window.addEventListener('prototype:notice', receive)
    return () => window.removeEventListener('prototype:notice', receive)
  }, [])
  const current = paths.find((path) => path[0] === getMode())!
  const choose = (mode: string) => {
    reset(mode)
    setNotice('已切换演示数据；未改写任何产品组件、样式或真实项目。')
  }
  const saveHosts = () => {
    const name = getMode() === 'leader' ? 'Builder-C' : 'Builder-A'
    const address = encodePairingOffer({
      v: 2,
      scope: 'runtime',
      endpoint: 'wss://preview.invalid',
      publicKeyB64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      deviceToken: 'preview-only-not-a-real-token'
    })
    download('preview-builder-hosts.json', JSON.stringify({ hosts: [{ name, address }] }, null, 2))
    announce('已下载演示清单。点击真实导入对话框的「选择文件」使用它；地址不可用于实际连接。')
  }
  return (
    <div className="preview-host">
      <section className="preview-controls" aria-label="演示控制，产品界面之外">
        <div className="preview-row">
          {getView() === 'handoff' ? (
            <button className="wb-btn wb-btn-secondary" onClick={openProjectWall}>
              回到项目墙（演示）
            </button>
          ) : null}
          <strong>项目聚合 · 真实组件旅程预览</strong>
          <span className="preview-note">演示数据 / 非 Electron 验收</span>
        </div>
        <div className="preview-row">
          {paths.map((path) => (
            <button
              key={path[0]}
              className={`wb-btn ${getMode() === path[0] ? 'wb-btn-secondary' : 'wb-btn-ghost'}`}
              aria-pressed={getMode() === path[0]}
              onClick={() => choose(path[0])}
            >
              {path[1]}
            </button>
          ))}
        </div>
        <p>{current[2]}</p>
        <div className="preview-row">
          <button className="wb-btn wb-btn-secondary" onClick={saveHosts}>
            下载演示主机清单
          </button>
          {['offline', 'all-offline'].includes(getMode()) ? (
            <button className="wb-btn wb-btn-secondary" onClick={() => choose('late')}>
              模拟来源恢复
            </button>
          ) : null}
        </div>
        <details>
          <summary>演示数据与真实界面的边界</summary>
          <p>
            下方是原样导入的
            ProjectWallPage、ProjectSettingsRail、ImportBuilderHostsDialog、OnboardProjectPage，以及它们现有的
            CSS、Lucide 与 Radix 原语。配对与文件/Git
            写入均由演示端口隔离。这里只展示这些真实页面片段，未仿造原生侧栏、设置、总览或会话界面；点击此类入口只回显交接目标。
          </p>
          <ul>
            {fixtureRows().map((row) => (
              <li key={row.id}>
                {row.displayName} · {row.executionHostId} · {row.path}
              </li>
            ))}
          </ul>
        </details>
      </section>
      {getView() !== 'handoff' ? (
        <div className="preview-product" aria-label="BW 原始组件区域">
          {getView() === 'onboard' ? <OnboardProjectPage options={{}} /> : <ProjectWallPage />}
        </div>
      ) : null}
      <p className="preview-notice" role="status" aria-live="polite">
        {notice}
      </p>
      <Toaster />
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
