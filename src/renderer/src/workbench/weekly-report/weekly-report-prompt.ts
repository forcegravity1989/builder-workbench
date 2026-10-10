import { weeklyReportTemplate } from '../../../../shared/workbench/weekly-report'
import systemTemplate from '../../../../../standard/system-prompt/SYSTEM.md.tmpl?raw'

export function buildWeeklyReportPrompt(args: {
  projectName: string
  repository: string
  periodStart: string
  periodEndExclusive: string
  timezone: string
  reportPath: string
}): string {
  const instructions = `请为当前项目 ${args.projectName}（${args.repository}）更新项目周报。周期 ${args.periodStart} 至 ${args.periodEndExclusive}（结束日期不含），时区 ${args.timezone}。先读当前仓 AGENTS 与实际项目资料，执行真实取数和提炼，最终写入 ${args.reportPath}。

使用当前项目已配置的 GitHub/CodeHub CLI，完整分页读取 Issue、期间事件、关闭原因和 PR/MR 合入记录；读取 .bw/project.toml、.bw/planning 下的实际计划、验收、可靠指标与已有周五材料。固定计划/验收树中的未合入材料与远端已合入材料区别呈现，不改写源记录。目标关联采用 data.json.tasks，不按标签猜目标；关闭原因 not_planned 是不再计划，不能称完成；PR 合入不等于关联 Issue 关闭，Issue 关闭不等于目标验收。只凭人的验收材料给达成结论。负责人未分配就写未分配，不把 PR 作者当任务负责人。当前快照不能冒充历史期末量；没有完整事件证据的数字为未知，风险等级、计划日期、下一周安排无依据也为未知。问题栏目只统计依项目标题/协议确认的问题，不把全部 Issue 当缺陷。

读取 .bw/weekly-reports/${args.periodStart} 下全部已发布 JSON（只读 UUID.json，忽略 .pending），以 generatedAt、文件路径排序取最新内容。再按同样顺序找到最近 origin=manual 的记录；若存在，它的 manual（包括显式空对象）才是当前生效的人工内容，覆盖后续 conversation 文件遗漏或旧的 manual；若没有人工版本，沿用最新文件的 manual。本次必须逐字保留这份生效的人工内容。同一事实有明确人工修正时不要在其他栏目重复旧结论。本次只在当前周报工作树新增一个不可变文件，不覆盖旧文件，不另建数据库或自动化，不提交、推送或创建 PR/MR，不关闭 Issue、合入 PR/MR、签署目标验收、发布或发送周报。读取或生成失败保留旧报告，说明失败原因。

内容提炼到固定七栏，不铺取数步骤、来源说明或操作注释；主要进展按方向提炼，详细任务只保留对理解项目有价值的条目。输出严格 JSON，所有表格值是纯文本，不用 HTML/Markdown。字段如下：
{"schemaVersion":1,"origin":"conversation","project":{"name":${JSON.stringify(args.projectName)},"repository":${JSON.stringify(args.repository)}},"period":{"start":${JSON.stringify(args.periodStart)},"endExclusive":${JSON.stringify(args.periodEndExclusive)},"timezone":${JSON.stringify(args.timezone)}},"version":"实际关联版本；未明确时null","generatedAt":"实际生成时间ISO8601","sections":{${weeklyReportTemplate.map((section) => `"${section.key}":[[${section.columns.map((column) => JSON.stringify(column)).join(',')}]]`).join(',')}},"problemSummary":"有证据的问题新增、完成关闭、不再计划和未关闭统计；无证据写未知","sources":[{"url":"真实来源URL或仓内路径","summary":"支持的事实及精确统计窗口"}],"manual":{}}
sections 的示例行代表固定列，替换为真实内容；无里程碑等没有已定义内容时该栏为 []，风险不明确则填写未知，不写无风险。sources 仅供内部核对，不渲染为正文附录。写入前核对 JSON 格式、每栏列数与来源；使用临时文件原子移动到新文件名，写后独立读回。当前周期尚未结束时仅统计截至实际取数时刻的数据，不称期末；在sources保留实际窗口。最终写入之前再次扫描同周期全部已发布文件，按上述规则重新计算生效的 manual；如果变化则重新合并并核对相关摘要与明细，不丢人工输入，不在其他栏目重新引入被人工纠正的旧事实。完成后简短报告文件位置及尚缺信息。`
  const values: Record<string, string> = {
    title: '更新项目周报',
    workflow: 'weekly-report',
    number: '',
    category: '',
    references:
      '只读来源：当前项目 AGENTS、实际 .bw/project.toml、计划与验收材料、GitHub gh / CodeHub codehub-cli 的真实工作记录。命令与字段先查本机 --help，不猜权限或缺失数据。',
    skill: instructions,
    version_context: `宿主给定的报告范围：\n${JSON.stringify(args, null, 2)}\n周报版本由真实材料读取；本次不写计划或验收材料。`
  }
  return systemTemplate.replace(/\{\{([a-z_]+)\}\}/g, (_match, key: string) => {
    if (!(key in values)) {
      throw new Error(`未解析的周报提示字段：${key}`)
    }
    return values[key]
  })
}
