// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarkdownPreviewBody } from '@/components/editor/MarkdownPreviewBody'

describe('MarkdownPreviewBody HTML sanitize', () => {
  it('keeps GitHub README centering and picture markup', () => {
    render(
      <MarkdownPreviewBody
        content={`<h1 align="center">Orca</h1>
<p align="center"><strong>Builders</strong></p>
<table><tr><td width="50%" valign="middle">Left</td><td width="50%">
<picture><source srcset="a.gif" type="image/gif"><img src="a.jpg" alt="shot" width="100%" /></picture>
</td></tr></table>`}
        components={{}}
      />
    )

    const heading = screen.getByRole('heading', { level: 1, name: 'Orca' })
    expect(heading.getAttribute('align')).toBe('center')

    const centered = document.querySelector('p[align="center"]')
    expect(centered).not.toBeNull()
    expect(centered?.textContent).toContain('Builders')

    expect(document.querySelector('picture')).not.toBeNull()
    expect(document.querySelector('source')?.getAttribute('srcset')).toBe('a.gif')
    expect(document.querySelector('td[width="50%"][valign="middle"]')).not.toBeNull()
    expect(screen.getByAltText('shot')).toBeTruthy()
  })
})
