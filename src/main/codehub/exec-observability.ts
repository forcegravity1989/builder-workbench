import { withSpan, type ActiveSpan } from '../observability/tracer'

export type CodeHubSpanArgs = {
  readonly args: readonly string[]
  readonly cwd?: string
}

/** codehub-cli 子命令词：跳过 -H 及其操作数后，开头连续的非 flag、非数字词
 *  （mr list / mr create / project view / repo file raw；纯数字是 MR iid，不进基数）。 */
function codehubSubcommandFromArgs(args: readonly string[]): string {
  const words: string[] = []
  for (let index = 0; index < args.length && words.length < 3; index++) {
    const arg = args[index]
    if (arg === '-H') {
      index += 1
      continue
    }
    if (arg.startsWith('-') || /^\d+$/.test(arg)) {
      break
    }
    words.push(arg)
  }
  return words.join(' ') || '<none>'
}

/** Wrap a codehub-cli execution in a `codehub.exec` span. 与 git.exec 同口径：只记
 *  子命令与参数个数，不复制参数值（项目名/标题/正文）；失败经 span.fail 落
 *  stderr——否则 MR 开不出来时只剩 UI 文案，trace 里无据可查。 */
export async function withCodeHubSpan<T>(
  meta: CodeHubSpanArgs,
  fn: (span: ActiveSpan) => Promise<T>
): Promise<T> {
  return withSpan(
    'codehub.exec',
    async (span) => {
      span.setAttribute('codehub.subcommand', codehubSubcommandFromArgs(meta.args))
      span.setAttribute('codehub.arg_count', meta.args.length)
      if (meta.cwd) {
        span.setAttribute('cwd', meta.cwd)
      }
      return await fn(span)
    },
    { attributes: { kind: 'codehub' } }
  )
}
