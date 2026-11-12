export const workflowFields = [
  ['initial', '开工额外输入', 'Issue和自动上下文之外，人额外补充开工信息的任务数。'],
  ['ask', 'AskUser', '首次完成交付前的业务澄清任务数与轮次；一批问题计一轮，权限请求另列。'],
  [
    'hifi',
    '高保真前审',
    '首次完成交付前，由模型发起高保真评审的任务数与轮次；必要设计协作不等同缺陷。'
  ],
  ['validation', '人工验证指导', '首次完成交付前，人提醒或指导验证的任务数与批次。'],
  ['correction', '人工中途纠偏', '首次完成交付前，人纠正理解、范围或执行约束的任务数与批次。'],
  [
    'rework',
    'PR 交付返工',
    '首次正式交付后，人要求修改的任务数及已完成返工轮次；待审和合入不能当作零返工。'
  ]
] as const
export type WorkflowMetricKey = (typeof workflowFields)[number][0]
export type WorkflowMetric = {
  key: WorkflowMetricKey
  label: string
  hint: string
  value: string
  count: number | null
  occurred: boolean | null
  rejections?: number
}
export type WorkflowReport = {
  kind: 'ready'
  issueUrl: string
  method: string
  metrics: WorkflowMetric[]
  coverage: { initial: boolean; process: boolean; review: boolean }
}
export type WorkflowCommentRead = WorkflowReport | { kind: 'unknown'; reason: string }
export type WorkflowSourceComment = {
  id: string | number
  body: string
  url?: string
  createdAt?: string
}
export type WorkflowCommentsResult = { comments: WorkflowSourceComment[]; checkedAt: string }

/** Read the published protocol; semantic annotation and counting belong to workflow. */
export function readWorkflowComment(comment?: { body?: string }): WorkflowCommentRead {
  const body = comment?.body?.trimStart() ?? ''
  const marker = /^<!--\s*bw-workflow-feedback:(https?:\/\/[^\s>]+)\s*-->/.exec(body)
  if (!marker) {
    return { kind: 'unknown', reason: '未找到 workflow 指标评论标记' }
  }
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((line) => /^\|\s*指标\s*\|\s*本(?:次|任务)记录\s*\|/.test(line))
  if (start === -1) {
    return { kind: 'unknown', reason: '指标表格式未识别' }
  }
  const rows: string[][] = []
  for (const line of lines.slice(start + 1)) {
    if (!line.trim().startsWith('|')) {
      break
    }
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((value) => value.trim())
    if (cells.length === 2 && !/^[-:]+$/.test(cells[0]!)) {
      rows.push(cells)
    }
  }
  const coverage =
    /初始输入\s*\/\s*交付前过程\s*\/\s*人审覆盖[：:]\s*(完整|未知)\s*\/\s*(完整|未知)\s*\/\s*(已核对|未知)/.exec(
      body
    )
  return {
    kind: 'ready',
    issueUrl: marker[1]!,
    method: /方法[：:]\s*([^。\n]+)/.exec(body)?.[1]?.trim() ?? '未记录',
    coverage: {
      initial: coverage?.[1] === '完整',
      process: coverage?.[2] === '完整',
      review: coverage?.[3] === '已核对'
    },
    metrics: workflowFields.map(([key, label, hint]) => {
      const values = rows.filter(([name]) => name === label).map(([, value]) => value)
      const value = values.length === 1 && values[0] ? values[0] : '未知'
      let count: number | null = null,
        occurred: boolean | null = null,
        rejections: number | undefined
      if (key === 'initial') {
        if (/^有[，,]\s*本任务记\s*1$/.test(value)) {
          count = 1
          occurred = true
        }
        if (/^无[，,]\s*记\s*0$/.test(value)) {
          count = 0
          occurred = false
        }
      } else if (key === 'rework') {
        if (value.startsWith('首次人审通过')) {
          count = 0
          occurred = false
          rejections = 0
        }
        const rework = /(?:^已|后续)退回\s*(\d+)\s*批[；;]\s*完成返工\s*(\d+)\s*轮/.exec(value)
        if (rework) {
          rejections = Number(rework[1])
          count = Number(rework[2])
          occurred = value.startsWith('首次人审通过') ? false : rejections > 0
        }
      } else {
        const numeric = /^(\d+)\s*(?:轮|批)$/.exec(value)
        if (numeric) {
          count = Number(numeric[1])
          occurred = count > 0
        }
      }
      if (
        (count !== null && !Number.isSafeInteger(count)) ||
        (rejections !== undefined && !Number.isSafeInteger(rejections))
      ) {
        count = null
        occurred = null
      }
      return { key, label, hint, value, count, occurred, rejections }
    })
  }
}

export function sameWorkflowIssue(left: string, right: string): boolean {
  try {
    return new URL(left).href.replace(/\/$/, '') === new URL(right).href.replace(/\/$/, '')
  } catch {
    return false
  }
}
