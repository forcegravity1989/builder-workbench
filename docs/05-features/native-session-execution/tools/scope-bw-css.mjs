/*
 * 把设计系统正本 docs/04-design-system/styles.css 与壳样式 crates/app-shell/assets/shell.css
 * 整体收进 #bw-screen / #bw-top 两个作用域，生成 bw-scoped.css，供 V3 原型与 Orca 会话面同页共存。
 *
 * 为什么必须加这道前缀：V3 以 Orca 会话面（prototype.css，全局作用域）为底座，两套表裸放同页会打架——
 *   同名 class  .btn .btn-primary .dialog .dialog-title .field .kbd .status-dot .tab .toast
 *               .hidden .icon-btn .is-open .link .name .spacer .switch
 *   全局规则    prototype.css 的 * / html,body（font-size:12px、overflow:hidden）/ button 归零
 *               会漏进 Workbench 屏
 *   动画名      两边都有 @keyframes spin
 * 加了前缀后，Workbench 屏的规则永远赢，Orca 面一个字节都不用改。
 *
 * 为什么是两个作用域：项目墙与设置是顶层覆盖层，人在执行面（#bw-screen 整块 hidden）时也要能开，
 * 所以另有一个常驻的 #bw-top 当顶层弹窗根。两个都是 id 选择器，特异性一致，谁也不压谁。
 *
 * 正本改了就重跑（产物别手改）：
 *   node docs/05-features/native-session-execution/tools/scope-bw-css.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const featureDir = resolve(here, '..')
const repoRoot = resolve(featureDir, '../../..')
const SCOPES = ['#bw-screen', '#bw-top']
const ANIM_PREFIX = 'bw-'

const SOURCES = [
  { label: '设计系统', path: resolve(repoRoot, 'docs/04-design-system/styles.css') },
  { label: '壳样式', path: resolve(repoRoot, 'crates/app-shell/assets/shell.css') }
]

/* 根级选择器要变成作用域本体，不是它的后代：:root / html / body / [data-theme=…]
   都在描述「整份文档」，映射成作用域容器本体后，token 定义在容器上往下继承。
   styles.css 里 [data-theme="claude"] 排在 :root 之后，映射后同specificity、后者赢
   —— 于是 Workbench 屏恒为 claude 浅色主题（Q7 拍板）。 */
const ROOT_SELECTOR = /^(:root|html|body)\b|^\[data-theme/

/* V4 多一份产物：token 块（:root 与 [data-theme=…]）拆出去挂全局，组件规则照旧留作用域。
   理由是 V4 要让「整窗一套 token」——Orca 那半边也得读得到设计系统的变量，
   而 token 一旦被关进 #bw-screen，外面就取不到了。拆开后：
     · bw-tokens.css     只有 token，不带任何组件规则，跟 Orca 的 :root 井水不犯河水（变量名不撞）
     · bw-scoped-v4.css  只有组件规则，token 靠继承 —— 于是主题切换能一次管整窗
   V3 的 bw-scoped.css 保持原样(token+组件都在作用域里)，两版并存互不影响。 */
const TOKEN_SELECTOR = /^(:root\s*$|\[data-theme)/

/* 顶层规则逐条加作用域；@media/@supports/@layer 递归进去，@keyframes 只改名不加前缀。
   splitTokens 非空时（V4）：token 块原样抽进 splitTokens、不进作用域产物。 */
function scopeCss(css, scopes, splitTokens) {
  const out = []
  let i = 0
  while (i < css.length) {
    const braceAt = css.indexOf('{', i)
    if (braceAt < 0) {
      out.push(css.slice(i))
      break
    }
    const head = css.slice(i, braceAt)
    let depth = 0
    let j = braceAt
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    const body = css.slice(braceAt + 1, j)
    const trimmedHead = head.trim()
    if (/^@(media|supports|layer)/.test(trimmedHead)) {
      out.push(head + '{' + scopeCss(body, scopes, splitTokens) + '}')
    } else if (trimmedHead.startsWith('@')) {
      out.push(head + '{' + body + '}')
    } else if (splitTokens && TOKEN_SELECTOR.test(trimmedHead.replace(/^(?:\s*\/\*[\s\S]*?\*\/)*\s*/, ''))) {
      // V4：token 块原样搬到全局，作用域产物里一个字节都不留
      const lead = head.match(/^((?:\s*\/\*[\s\S]*?\*\/)*\s*)([\s\S]*)$/)
      splitTokens.push(lead[1].trim() + (lead[1].trim() ? '\n' : '') + lead[2].trim() + ' {' + body + '}')
    } else {
      // 前导注释留在选择器前面，别被拼进选择器里。一条规则前面可能连着好几个注释块，
      // 所以这里要吃掉全部，只吃一个会把第二个注释黏进第一个选择器。
      const commentMatch = head.match(/^((?:\s*\/\*[\s\S]*?\*\/)*\s*)([\s\S]*)$/)
      const lead = commentMatch[1] || ''
      const mapped = commentMatch[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .flatMap((s) => scopes.map((scope) => (ROOT_SELECTOR.test(s) ? scope : scope + ' ' + s)))
      // html 与 body 都映射到同一个作用域，合并后会重复，去掉
      const selectors = [...new Set(mapped)].join(', ')
      out.push(lead + selectors + ' {' + body + '}')
    }
    i = j + 1
  }
  return out.join('')
}

/* @keyframes 是全局命名空间，加不了作用域，只能改名。
   只动 @keyframes 头和 animation / animation-name 的值，别去碰同名的 class。 */
function prefixAnimations(css, prefix) {
  const names = [...css.matchAll(/@keyframes\s+([A-Za-z_][\w-]*)/g)].map((m) => m[1])
  if (!names.length) return { css, names }
  let out = css.replace(/@keyframes\s+([A-Za-z_][\w-]*)/g, (_, n) => '@keyframes ' + prefix + n)
  out = out.replace(/(animation(?:-name)?\s*:)([^;}]+)/g, (all, key, value) => {
    let next = value
    for (const n of names) next = next.replace(new RegExp('\\b' + n + '\\b', 'g'), prefix + n)
    return key + next
  })
  return { css: out, names }
}

// splitTokens 传数组 = V4 那一路（token 拆全局）；传 null = V3 那一路（token 留作用域）
function build(splitTokens) {
  const chunks = []
  const animNames = []
  for (const src of SOURCES) {
    const raw = readFileSync(src.path, 'utf8')
    const animed = prefixAnimations(raw, ANIM_PREFIX)
    animNames.push(...animed.names)
    chunks.push(
      '/* ── ' +
        src.label +
        ' · ' +
        src.path.slice(repoRoot.length + 1) +
        ' ── */\n' +
        scopeCss(animed.css, SCOPES, splitTokens)
          .replace(/\}\s*/g, '}\n')
          .trim() +
        '\n'
    )
  }
  return { body: chunks.join('\n'), animNames }
}

/* ── V3 产物：token + 组件都在作用域里 ── */
const v3 = build(null)
const v3Header =
  '/* 由 tools/scope-bw-css.mjs 生成，别手改。\n' +
  ' * 作用域 ' +
  SCOPES.join(' / ') +
  '（后者是顶层覆盖层的弹窗根，执行面下 #bw-screen 整块 hidden 时仍要能显）' +
  '；@keyframes 统一加 ' +
  ANIM_PREFIX +
  ' 前缀（' +
  v3.animNames.join(', ') +
  '）避开 prototype.css 同名动画。 */\n'
writeFileSync(resolve(featureDir, 'bw-scoped.css'), v3Header + v3.body)

/* ── V4 产物：token 挂全局 + 组件留作用域 ── */
const tokens = []
const v4 = build(tokens)
const tokensHeader =
  '/* 由 tools/scope-bw-css.mjs 生成，别手改。V4 专用。\n' +
  ' * 设计系统的 token 块（:root 与 [data-theme=…]）原样挂全局：V4 要让整窗共用一套 token，\n' +
  ' * Orca 那半边（prototype.css）也得读得到 --color-* / --space-* / --radius-*，\n' +
  ' * 关在 #bw-screen 里外面就取不到。这里只有变量、没有一条组件规则，\n' +
  ' * 跟 Orca 自己的 :root 变量名不撞（Orca 用 --background/--foreground/--border/--radius）。\n' +
  ' * [data-theme=claude] 保持条件式 —— 主题一切，整窗跟着变，这是 V4 的验收点。 */\n'
writeFileSync(resolve(featureDir, 'bw-tokens.css'), tokensHeader + tokens.join('\n\n') + '\n')

const v4Header =
  '/* 由 tools/scope-bw-css.mjs 生成，别手改。V4 专用。\n' +
  ' * 只有组件规则，作用域 ' +
  SCOPES.join(' / ') +
  '；token 一律靠继承（正本在同目录 bw-tokens.css，挂全局）。\n' +
  ' * @keyframes 统一加 ' +
  ANIM_PREFIX +
  ' 前缀（' +
  v4.animNames.join(', ') +
  '）避开 prototype.css 同名动画。 */\n'
writeFileSync(resolve(featureDir, 'bw-scoped-v4.css'), v4Header + v4.body)

console.log(
  '[scope-bw-css] V3: bw-scoped.css %d 字 · V4: bw-tokens.css %d 字 + bw-scoped-v4.css %d 字 · 改名动画 %d 个',
  v3Header.length + v3.body.length,
  tokensHeader.length + tokens.join('\n\n').length,
  v4Header.length + v4.body.length,
  v3.animNames.length
)
