const PROCESS_EXTENSION_RE = /\.(?:exe|cmd|bat|ps1)$/i

const STATIC_INTERPRETER_PROCESS_NAMES = new Set([
  'node',
  'python',
  'python3',
  'bash',
  'zsh',
  'sh',
  'fish',
  'pwsh',
  'powershell'
])

const PYTHON_PROCESS_RE = /^python(?:\d+(?:\.\d+)*)?$/
const INTERPRETER_OPTIONS_WITH_VALUE = new Set([
  '-r',
  '--require',
  '--import',
  '--loader',
  '--experimental-loader'
])
const INTERPRETER_OPTIONS_WITH_INLINE_SOURCE = new Set(['-e', '--eval', '-p', '--print', '--check'])

function tokenLooksExecutable(token: string, index: number, firstNormalized: string): boolean {
  if (index === 0) {
    return true
  }
  if (!isInterpreterProcessName(firstNormalized)) {
    return false
  }
  // Why: only inspect interpreter script paths. Prompt text can mention other
  // agents ("compare opencode vs orca"), and treating every argv token as an
  // executable would reintroduce the substring-style false identity class that
  // foreground-process detection is meant to avoid.
  return token.includes('/') || token.includes('\\') || PROCESS_EXTENSION_RE.test(token)
}

function isInterpreterProcessName(normalized: string): boolean {
  return STATIC_INTERPRETER_PROCESS_NAMES.has(normalized) || PYTHON_PROCESS_RE.test(normalized)
}

export const isPythonProcessName = (normalized: string): boolean => PYTHON_PROCESS_RE.test(normalized)

const optionName = (token: string): string => token.split('=', 1)[0] ?? ''

export function findInterpreterEntrypointToken(tokens: string[], firstNormalized: string): string | null {
  if (!isInterpreterProcessName(firstNormalized)) {
    return null
  }
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--') {
      continue
    }
    if (isPythonProcessName(firstNormalized) && token === '-m') {
      return tokens[index + 1] ?? null
    }
    if (token.startsWith('-')) {
      const name = optionName(token)
      if (INTERPRETER_OPTIONS_WITH_INLINE_SOURCE.has(name)) {
        return null
      }
      if (INTERPRETER_OPTIONS_WITH_VALUE.has(name) && name === token) {
        index += 1
      }
      continue
    }
    if (tokenLooksExecutable(token, index, firstNormalized)) {
      return token
    }
  }
  return null
}
