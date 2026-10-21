#!/usr/bin/env node
// docs/04-design-system/tokens.json → tokens.css, and a drift check against Orca's main.css.
//   node config/scripts/design-system-tokens.mjs           check (CI)
//   node config/scripts/design-system-tokens.mjs --write   regenerate tokens.css
// Every colour token whose name main.css also declares must carry main.css's value in both
// themes; Tailwind palette references are resolved through tailwindcss/theme.css.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const ROOT = path.resolve(import.meta.dirname, '../..')
const DS = path.join(ROOT, 'docs/04-design-system')
const TOKENS = path.join(DS, 'tokens.json')
const CSS_OUT = path.join(DS, 'tokens.css')
const MAIN_CSS = path.join(ROOT, 'src/renderer/src/assets/main.css')
const FONT = '../../src/renderer/src/assets/fonts/Geist-Variable.woff2'

const tokens = JSON.parse(fs.readFileSync(TOKENS, 'utf8'))
const [first, ...rest] = tokens.color.themes.map((t) => t.id)

const prop = (name) => `--${name.replace(/\./g, '\\.')}`
const themed = (value, theme) =>
  typeof value === 'string' ? value : (value[theme] ?? value[first])
const cssValue = (v) => v.replace(/^\{(.+)\}$/, (_, ref) => `var(${prop(ref)})`)

function renderCss() {
  const block = (sel, decls) => `${sel} {\n${decls.map((d) => `  ${d}`).join('\n')}\n}\n`
  const themedFamilies = [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])]
  const out = [
    `/* ${tokens.name} — generated from tokens.json by config/scripts/design-system-tokens.mjs. Do not edit. */\n`,
    `@font-face {\n  font-family: 'Geist';\n  src: url('${FONT}') format('woff2');\n  font-weight: 100 900;\n  font-style: normal;\n  font-display: swap;\n}\n`,
    block(
      `:root,\n[data-theme='${first}']`,
      themedFamilies.map((t) => `${prop(t.name)}: ${cssValue(themed(t.value, first))};`)
    )
  ]
  for (const theme of rest) {
    const decls = themedFamilies
      // Aliases are re-declared so a theme scoped to a subtree re-resolves them there.
      .filter((t) => {
        const v = themed(t.value, theme)
        return v !== themed(t.value, first) || /^\{.+\}$/.test(v)
      })
      .map((t) => `${prop(t.name)}: ${cssValue(themed(t.value, theme))};`)
    // Orca toggles dark mode with a .dark class on <html>; docs pages use data-theme.
    out.push(block(`[data-theme='${theme}']${theme === 'dark' ? ',\n.dark' : ''}`, decls))
  }
  const flat = [...tokens.spacing.tokens, ...tokens.radius.tokens].map(
    (t) => `${prop(t.name)}: ${t.value};`
  )
  const fonts = Object.entries(tokens.type.families).map(([k, v]) => `--font-${k}: ${v};`)
  out.push(block(':root', [...flat, ...fonts]))
  return out.join('\n')
}

// ── main.css drift check ──────────────────────────────────────────────
function declarations(css, selector) {
  const m = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(
    css
  )
  if (!m) {
    throw new Error(`main.css: no ${selector} block`)
  }
  const map = new Map()
  for (const d of m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const i = d.indexOf(':')
    if (i > 0) {
      map.set(
        d.slice(0, i).trim().replace(/^--/, ''),
        d
          .slice(i + 1)
          .trim()
          .replace(/\s+/g, ' ')
      )
    }
  }
  return map
}

function tailwindPalette() {
  const require = createRequire(path.join(ROOT, 'package.json'))
  const theme = fs.readFileSync(require.resolve('tailwindcss/theme.css'), 'utf8')
  return new Map(
    [...theme.matchAll(/--(color-[a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  )
}

const hexRgb = (h) => {
  const x = h.length === 4 ? h.slice(1).replace(/./g, (c) => c + c) : h.slice(1)
  return [0, 2, 4].map((i) => Number.parseInt(x.slice(i, i + 2), 16))
}
const hex = (rgb) => `#${rgb.map((n) => n.toString(16).padStart(2, '0')).join('')}`

function normalize(v) {
  v = v.toLowerCase().replace(/\s+/g, ' ').trim()
  if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/.test(v)) {
    return hex(hexRgb(v))
  }
  const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)\s*(?:[,/]\s*([\d.]+))?\s*\)$/.exec(v)
  if (rgb) {
    const [r, g, b] = rgb.slice(1, 4).map(Number)
    const a = rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4])
    return a === 1 ? hex([r, g, b]) : `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return v.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
}

function resolver(vars, palette) {
  const resolve = (v, depth = 0) => {
    if (depth > 16) {
      throw new Error(`main.css: alias chain too deep at ${v}`)
    }
    const ref = /^var\(--([a-z0-9-]+)\)$/.exec(v)
    if (ref) {
      if (palette.has(ref[1])) {
        return normalize(palette.get(ref[1]))
      }
      if (vars.has(ref[1])) {
        return resolve(vars.get(ref[1]), depth + 1)
      }
      return null
    }
    if (v.startsWith('var(')) {
      return null
    }
    const mix = /^color-mix\(in srgb, (.+) (\d+(?:\.\d+)?)%, transparent\)$/.exec(v)
    if (mix) {
      const base = resolve(mix[1], depth + 1)
      if (!base?.startsWith('#')) {
        return null
      }
      return `rgba(${hexRgb(base).join(', ')}, ${Number.parseFloat(mix[2]) / 100})`
    }
    return normalize(v)
  }
  return resolve
}

function driftErrors() {
  const css = fs.readFileSync(MAIN_CSS, 'utf8')
  const light = declarations(css, ':root')
  const darkOwn = declarations(css, '.dark')
  const dark = new Map([...light, ...darkOwn])
  const inMain = (name) => light.has(name) || darkOwn.has(name)
  const palette = tailwindPalette()
  const byTheme = { [first]: resolver(light, palette), dark: resolver(dark, palette) }
  const errors = []
  const listed = new Set(tokens.color.tokens.map((t) => t.name))
  for (const t of tokens.color.tokens) {
    if (!inMain(t.name)) {
      // Not an Orca token: must say so, so a token Orca renames does not silently drop out.
      if (!/^(Addition|Overlay role)\b/.test(t.usage ?? '')) {
        errors.push(
          `${t.name}: not in main.css and usage does not start with "Addition" or "Overlay role"`
        )
      }
      continue
    }
    for (const theme of [first, ...rest]) {
      const source = theme === first ? light.get(t.name) : dark.get(t.name)
      if (source === undefined) {
        // Declared only under .dark: main.css gives no light value to compare.
        continue
      }
      const expected = byTheme[theme]?.(source)
      const actual = normalize(themed(t.value, theme))
      if (expected === null) {
        errors.push(`${t.name} (${theme}): cannot resolve main.css value ${source}`)
      } else if (expected !== actual) {
        errors.push(`${t.name} (${theme}): tokens.json ${actual} ≠ main.css ${expected}`)
      }
    }
  }
  for (const [theme, vars] of [
    [first, light],
    ['dark', darkOwn]
  ]) {
    for (const [name, source] of vars) {
      const value = byTheme[theme](source)
      if (!listed.has(name) && value && /^(#|rgba?\(|oklch\(|hsla?\()/.test(value)) {
        errors.push(`${name} (${theme}): colour in main.css but missing from tokens.json`)
      }
    }
  }
  const stack = (v) => v.replace(/\s+/g, ' ').trim()
  for (const [key, cssName] of [
    ['sans', 'app-font-family'],
    ['mono', 'font-mono']
  ]) {
    if (stack(tokens.type.families[key] ?? '') !== stack(light.get(cssName) ?? '')) {
      errors.push(`type.families.${key} ≠ main.css --${cssName}`)
    }
  }
  const radius = /--radius:\s*([\d.]+)rem/.exec(css)
  const base = tokens.radius.tokens.find((t) => t.name === 'radius')
  if (radius && base && `${Number.parseFloat(radius[1]) * 16}px` !== base.value) {
    errors.push(
      `radius: tokens.json ${base.value} ≠ main.css ${Number.parseFloat(radius[1]) * 16}px`
    )
  }
  return errors
}

const css = renderCss()
if (process.argv.includes('--write')) {
  fs.writeFileSync(CSS_OUT, css)
  console.log(`wrote ${path.relative(ROOT, CSS_OUT)}`)
}
const errors = driftErrors()
// Whitespace-insensitive: the commit hook reflows tokens.css with oxfmt.
const squash = (text) => text.replace(/\s+/g, ' ').trim()
if (
  !process.argv.includes('--write') &&
  (!fs.existsSync(CSS_OUT) || squash(fs.readFileSync(CSS_OUT, 'utf8')) !== squash(css))
) {
  errors.push('docs/04-design-system/tokens.css is stale — run with --write')
}
if (errors.length) {
  console.error(`design-system tokens out of sync with main.css:\n  ${errors.join('\n  ')}`)
  process.exit(1)
}
console.log('design-system tokens match main.css')
