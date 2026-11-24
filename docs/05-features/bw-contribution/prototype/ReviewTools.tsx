import { Button } from '@/components/ui/button'
import evidence from './evidence.json'

export type ScenarioId = 'A' | 'B' | 'C'

type ReviewToolsProps = {
  which: ScenarioId
  scenarioNames: Record<ScenarioId, string>
  projectName: string
  workerLabel?: string
  workspaceOpen: boolean
  feedbackOpen: boolean
  errorNext: boolean
  grabStatus: string
  grabResult: string
  onScenarioChange: (scenario: ScenarioId) => void
  onExternalIntake: () => void
  onAdvance: () => void
  onFailureChange: (enabled: boolean) => void
  onToggleTheme: () => void
  onReset: () => void
}

export function ReviewTools({
  which,
  scenarioNames,
  projectName,
  workerLabel,
  workspaceOpen,
  feedbackOpen,
  errorNext,
  grabStatus,
  grabResult,
  onScenarioChange,
  onExternalIntake,
  onAdvance,
  onFailureChange,
  onToggleTheme,
  onReset
}: ReviewToolsProps): React.JSX.Element {
  return (
    <header
      className="review-tools border-b border-border bg-card px-3 py-1.5 text-xs"
      aria-label="原型评审工具"
    >
      <style>{`.review-tools{font-size:12px;line-height:1.4}.review-tools button{height:26px;padding:0 8px;font-size:12px}.review-tools .text-sm{font-size:12px}.review-tools summary{cursor:pointer}.review-tools details p{margin:6px 0}`}</style>
      <div className="flex flex-wrap items-center gap-3">
        <strong>改进 BW</strong>
        <span>工作区 → 反馈会话 → BW Issue</span>
        <span className="text-muted-foreground">研发保障 · 待评审局部交互 · 演示数据</span>
        <a className="underline text-sm" href="../intent.md">
          意图
        </a>
        <a className="underline text-sm" href="../spec.md">
          规格
        </a>
        <a className="underline text-sm" href="../STATUS.md">
          状态
        </a>
      </div>
      <div className="my-1 flex flex-wrap items-center gap-1">
        {(['A', 'B', 'C'] as const).map((id) => (
          <Button
            key={id}
            variant={id === which ? 'secondary' : 'ghost'}
            onClick={() => onScenarioChange(id)}
            data-testid={`scenario-${id}`}
          >
            {id} · {scenarioNames[id]}
          </Button>
        ))}
        {which === 'C' && (
          <Button variant="outline" data-testid="external-intake" onClick={onExternalIntake}>
            模拟维护者从 WeLink 接报
          </Button>
        )}
        {grabStatus && (
          <span className="text-sm text-muted-foreground" role="status">
            {grabStatus}
          </span>
        )}
        <Button variant="outline" onClick={onAdvance} data-testid="advance">
          推进演示后台
        </Button>
        <label className="text-sm">
          <input
            type="checkbox"
            checked={errorNext}
            onChange={(e) => onFailureChange(e.target.checked)}
          />{' '}
          下次发送失败
        </label>
        <Button variant="ghost" onClick={onToggleTheme}>
          切换主题
        </Button>
        <Button variant="ghost" onClick={onReset}>
          重置场景
        </Button>
      </div>
      <details className="text-xs">
        <summary>旅程、运行位置、复用与新增、提示词和证据</summary>
        <dl className="my-2 grid gap-2 text-sm sm:grid-cols-3" aria-label="当前场景运行位置">
          <div>
            <dt className="font-semibold">来源</dt>
            <dd>
              {which === 'C' ? 'WeLink 群空间 → 维护者接续' : `${projectName} · 原工作区与草稿`}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">收集会话</dt>
            <dd>{which === 'C' ? '维护者本机' : '报告者本机'} · 演示非 Git 目录</dd>
          </div>
          <div>
            <dt className="font-semibold">修复 Worker</dt>
            <dd>
              BW 仓 ·{' '}
              {workerLabel || (which === 'A' ? '已配置的本机' : '处理时选本机或已配对团队宿主')}
            </dd>
          </div>
        </dl>
        <p className="mb-2 text-sm">
          <strong>本屏真实复用：</strong>
          {workspaceOpen
            ? 'BW 新建工作区完整组件及项目/宿主选择'
            : feedbackOpen
              ? 'BW 原生反馈表单'
              : 'BW 导航、原生会话消息和输入框'}
          。<strong>拟补：</strong>会话标签行反馈入口、现场转交、专用收集目录与 Skill、Issue 到
          Worker 的自动衔接。
        </p>
        {grabResult && (
          <details className="text-sm">
            <summary>本次 React Grab 元素上下文</summary>
            <pre className="whitespace-pre-wrap break-all">{grabResult}</pre>
          </details>
        )}

        <p>
          原型演示止于阅读 Worker
          返回的交付记录。所见会话、Issue、工作区与证据均为演示数据。打开开发实例进行同路径复验是规格中的待验证目标。React
          Grab 已在浏览器完成元素选择、带回和草稿保留；正式版与 Electron
          真壳仍待验证。此页局部挂载真实组件，不代表完整 Electron 外壳验收。
          <a className="underline" href="dist/component-manifest.json">
            组件来源与哈希
          </a>
        </p>
        <p>
          实际导入
          WorkbenchRail、RightSidebarToggle、WindowControls、TerminalTabLeadingIcon、SidebarFeedbackDialog、NewWorkspaceComposerCard（内含
          ProjectCombobox、RunTargetCombobox）、NativeChatMessageRow 和
          NativeChatComposerField。原工作与收集均使用原生聊天行和输入框。上方场景与后台推进仅供评审。标题栏下的回看动作是拟补的会话切换。Rail
          的其他页面导航不在本次演示范围；标签框架、加号与快捷命令为按现有结构的禁用定位参照，右侧栏和窗控仅展示位置，不操作系统窗口；工作区承载框架、数据、API
          与验收均为隔离演示。
        </p>
        <p>
          现有反馈发往 WeLink。拟补工作区会话标签行「反馈 BW」与提交后异步分流、本机自动登记非 Git
          收集目录、收集会话 Skill。A 在已有配置和授权时由模型组织原生 Issue
          关联开工，再按精确工作区 ID 派工，这段自动衔接仍为目标；B/C
          在配置缺失时由处理者确认工作区。结构化会话不在 Floating 面板运行。远端 Worker
          用终端，本原型展示派工回执。表单里的选取动作实际加载 React
          Grab，仅定位本原型的真实元素，有源码时一并复制。正式版无 React
          Grab，原生附件可继续使用，正式版元素采集是待评审目标。工作区会话标签行操作区的「反馈
          BW」是本稿拟新增的位置，复用现有反馈表单；元素采集衔接与改投收集会话为拟新增。原型构建只向原表单插入采集槽位，不改产品源码。已有帮助入口仍显示
          WeLink。
        </p>
        <h2 className="mt-3 font-semibold">当前场景的运行位置</h2>
        {Object.entries(evidence.scenarios?.[which] || {})
          .filter(([, v]) => typeof v === 'string')
          .map(([key, value]) => (
            <p key={key}>{value}</p>
          ))}
        <h2 className="mt-3 font-semibold">职责与证据边界</h2>
        {Object.values(evidence.boundaries || {}).map((value, i) => (
          <p key={i}>
            <strong>{value.label}</strong> {value.text}
          </p>
        ))}
        {Object.values(evidence.prompts || {}).map((prompt) => (
          <details className="my-2" key={prompt.label}>
            <summary>{prompt.label}</summary>
            <pre className="whitespace-pre-wrap rounded bg-muted p-3">{prompt.text}</pre>
          </details>
        ))}
        <h2 className="mt-3 font-semibold">源码依据</h2>
        {evidence?.sources?.map((source) => (
          <p key={source.id}>
            <a className="underline" href={source.url}>
              {source.label}
            </a>{' '}
            · {source.finding}
          </p>
        ))}
      </details>
    </header>
  )
}
