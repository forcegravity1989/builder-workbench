import { describe, expect, it } from 'vitest'
import { shouldReadRemoteCliStdin } from './remote-cli-stdin'

describe('shouldReadRemoteCliStdin', () => {
  it('reads stdin only for body-file stdin requests', () => {
    expect(shouldReadRemoteCliStdin(['linear', 'comment', 'add', '--body-file', '-'])).toBe(true)
    expect(shouldReadRemoteCliStdin(['linear', 'create', '--body-file=-'])).toBe(true)
    expect(shouldReadRemoteCliStdin(['status'])).toBe(false)
    expect(shouldReadRemoteCliStdin(['linear', 'comment', 'add', '--body', 'done'])).toBe(false)
    expect(shouldReadRemoteCliStdin(['linear', 'issue', '--body-file', '-'])).toBe(false)
    expect(
      shouldReadRemoteCliStdin(['linear', 'comment', 'add', '--help', '--body-file', '-'])
    ).toBe(false)
    expect(shouldReadRemoteCliStdin(['linear', 'comment', 'add', '--body-file', 'body.md'])).toBe(
      false
    )
  })

  it('reads stdin for *-stdin payload flags bridged to the full host CLI', () => {
    expect(shouldReadRemoteCliStdin(['bw', 'materials', 'save', '--input-stdin'])).toBe(true)
    expect(shouldReadRemoteCliStdin(['bw', 'materials', 'save', '--input', 'doc.json'])).toBe(false)
    expect(shouldReadRemoteCliStdin(['bw', 'materials', 'save', '--input-stdin', '--help'])).toBe(
      false
    )
  })
})
