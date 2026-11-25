import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShareService } from './self-hosted-share-service'
import { inlineLocalHtmlAssets } from './share-html-inline'

const SERVER_URL = 'http://share.example.com'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const created = {
  id: 'share-a',
  url: `${SERVER_URL}/s/share-a`,
  editToken: 'edit-a',
  expiresAt: '2026-12-16T00:00:00.000Z'
}

describe('inlineLocalHtmlAssets', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'bw-share-inline-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  async function put(rel: string, data: string | Buffer): Promise<string> {
    const path = join(root, rel)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
    return path
  }

  it('inlines the stylesheet chain, fonts and images while leaving comments, scripts and external references untouched', async () => {
    const fontBytes = Buffer.from('geist-variable-font-bytes')
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await put('fonts/Geist.woff2', fontBytes)
    await put('img/dot.png', pngBytes)
    await put(
      'ds/tokens.css',
      `@font-face { font-family: Geist; src: url('../fonts/Geist.woff2') format('woff2'); }\n:root { --bw-border: #d0d7de; }`
    )
    await put('ds/print.css', '.card { color: red; }')
    await put(
      'ds/styles.css',
      `@import url('tokens.css');\n@import "print.css" print;\n.card { border: 1px solid var(--bw-border); }\n/* url(../img/fake.png) */\n.quote::after { content: "url(../img/fake.png)"; }`
    )
    const page = await put(
      'proto/page.html',
      [
        '<!doctype html>',
        '<html><head>',
        '<!-- <link rel="stylesheet" href="../ds/styles.css"> -->',
        `<script>const markup = '<link rel="stylesheet" href="../ds/styles.css">';</script>`,
        '<link rel="stylesheet" media="screen" href="../ds/styles.css">',
        '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
        '<link rel="icon" href="../img/dot.png">',
        '<style>',
        '.dot { background: url(../img/dot.png); }',
        '.ext { background: url("https://cdn.example.com/y.png"); }',
        '</style>',
        '</head><body><div class="card">hi</div></body></html>'
      ].join('\n')
    )

    const out = await inlineLocalHtmlAssets(await readFileText(page), page)

    // The local stylesheet link became a <style> carrying the whole @import chain.
    expect(out).toContain('<style media="screen">')
    expect(out).toContain('--bw-border: #d0d7de')
    expect(out).toContain('.card { border: 1px solid var(--bw-border); }')
    expect(out).toContain('@media print {')
    expect(out).toContain('.card { color: red; }')
    expect(out).not.toContain('@import')
    // Only the one local stylesheet link was replaced; comment, script, https and icon links stay.
    expect((out.match(/<link/g) ?? []).length).toBe(4)
    expect(out).toContain(`data:font/woff2;base64,${fontBytes.toString('base64')}`)
    expect(out).toContain(`data:image/png;base64,${pngBytes.toString('base64')}`)
    expect(out).toContain('<!-- <link rel="stylesheet" href="../ds/styles.css"> -->')
    expect(out).toContain(`const markup = '<link rel="stylesheet" href="../ds/styles.css">';`)
    expect(out).toContain('<link rel="stylesheet" href="https://cdn.example.com/x.css">')
    expect(out).toContain('<link rel="icon" href="../img/dot.png">')
    // CSS comments and string literals are not asset references.
    expect(out).toContain('/* url(../img/fake.png) */')
    expect(out).toContain('content: "url(../img/fake.png)"')
    expect(out).toContain('url("https://cdn.example.com/y.png")')
    expect(out).toContain('<div class="card">hi</div>')
  })

  it('degrades per resource and skips remote keys, cycles, non-whitelisted and absolute references', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const link = '<link rel="stylesheet" href="gone.css">'
      // Remote source keys name files this process cannot reach: content passes through untouched.
      for (const key of [
        JSON.stringify(['ssh', 'target-1', '/remote/page.html']),
        JSON.stringify(['editor', 'env', 'host', '/remote/page.html']),
        'relative/page.html'
      ]) {
        expect(await inlineLocalHtmlAssets(link, key)).toBe(link)
      }
      expect(errors).not.toHaveBeenCalled()

      // Missing stylesheet: keep the original tag, log the reason, never fail the share.
      const missing = await put('missing/page.html', link)
      expect(await inlineLocalHtmlAssets(link, missing)).toBe(link)
      expect(errors).toHaveBeenCalledTimes(1)

      // Oversized asset (> 2 MiB): kept as-is with a log.
      errors.mockClear()
      await put('big/huge.png', Buffer.alloc(2 * 1024 * 1024 + 1, 0x61))
      const bigHtml = '<style>.x{background:url(huge.png)}</style>'
      const big = await put('big/page.html', bigHtml)
      expect(await inlineLocalHtmlAssets(bigHtml, big)).toBe(bigHtml)
      expect(errors).toHaveBeenCalledTimes(1)

      // Existing file outside the asset whitelist is an intentional skip, not a failure.
      errors.mockClear()
      await put('wl/secret.txt', 'not an asset')
      const wlHtml = '<style>.x{background:url(secret.txt)}</style>'
      const wl = await put('wl/page.html', wlHtml)
      expect(await inlineLocalHtmlAssets(wlHtml, wl)).toBe(wlHtml)
      expect(errors).not.toHaveBeenCalled()

      // Import cycle terminates: the back-edge stays an @import instead of recursing forever.
      await put('cyc/a.css', '@import "b.css";\n.a{color:blue}')
      await put('cyc/b.css', '@import "a.css";\n.b{color:red}')
      const cycHtml = '<link rel="stylesheet" href="a.css">'
      const cyc = await put('cyc/page.html', cycHtml)
      const cycOut = await inlineLocalHtmlAssets(cycHtml, cyc)
      expect(cycOut).toContain('.a{color:blue}')
      expect(cycOut).toContain('.b{color:red}')
      expect((cycOut.match(/@import/g) ?? []).length).toBe(1)

      // Absolute paths, drive letters, fragments and data URIs are never read from disk.
      for (const href of ['/etc/x.css', 'C:\\x\\y.css', '#frag', '//cdn.example.com/x.css']) {
        const html = `<link rel="stylesheet" href="${href}">`
        const page = await put('abs/page.html', html)
        expect(await inlineLocalHtmlAssets(html, page)).toBe(html)
      }
      const dataHtml = '<style>.x{background:url(data:image/png;base64,AAAA)}</style>'
      const dataPage = await put('abs/data.html', dataHtml)
      expect(await inlineLocalHtmlAssets(dataHtml, dataPage)).toBe(dataHtml)
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  it('publishes inlined bytes on create and rejects post-inline oversize before any network call', async () => {
    const { calls, impl } = shareFetch()
    const service = () =>
      createShareService({
        dataDir: () => root,
        serverUrl: SERVER_URL,
        enrollKey: 'enroll-key',
        fetchImpl: impl as unknown as typeof fetch
      })

    // Six stylesheets under the per-resource cap still push the inlined document past 10 MiB:
    // the limit is checked on what actually gets uploaded, not on the pre-inline source.
    const links: string[] = []
    for (let i = 0; i < 6; i += 1) {
      await put(`big/b${i}.css`, Buffer.alloc(1_900_000, 0x61))
      links.push(`<link rel="stylesheet" href="b${i}.css">`)
    }
    const bigPage = await put(
      'big/page.html',
      `<html><head>${links.join('')}</head><body>x</body></html>`
    )
    const tooLarge = await service().publish({
      sourceKey: bigPage,
      content: await readFileText(bigPage),
      fileName: 'page.html'
    })
    expect(tooLarge).toMatchObject({ ok: false, error: { code: 'too-large' } })
    expect(impl).not.toHaveBeenCalled()

    await put('ok/s.css', '.x{border:1px solid red}')
    const okPage = await put(
      'ok/page.html',
      '<html><head><link rel="stylesheet" href="s.css"></head><body><div class="x">hi</div></body></html>'
    )
    const result = await service().publish({
      sourceKey: okPage,
      content: await readFileText(okPage),
      fileName: 'page.html'
    })
    expect(result).toMatchObject({ ok: true, value: { change: 'created', id: created.id } })
    const post = calls.find((call) => call.method === 'POST' && call.url.endsWith('/api/shares'))
    const content = (post?.body as { content?: string } | undefined)?.content ?? ''
    expect(content).toContain('<style>')
    expect(content).toContain('.x{border:1px solid red}')
    expect(content).not.toContain('<link')
  })

  it('inlines on the update path so re-sharing a changed file keeps the link self-contained', async () => {
    const { calls, impl } = shareFetch()
    const service = createShareService({
      dataDir: () => root,
      serverUrl: SERVER_URL,
      enrollKey: 'enroll-key',
      fetchImpl: impl as unknown as typeof fetch
    })
    await put('upd/s.css', '.y{color:blue}')
    const page = await put('upd/page.html', '<h1>old</h1>')

    await service.publish({ sourceKey: page, content: '<h1>old</h1>', fileName: 'page.html' })
    const result = await service.publish({
      sourceKey: page,
      content: '<html><head><link rel="stylesheet" href="s.css"></head><body>new</body></html>',
      fileName: 'page.html'
    })

    expect(result).toMatchObject({ ok: true, value: { change: 'updated' } })
    const putCall = calls.find((call) => call.method === 'PUT')
    expect(putCall?.url).toBe(`${SERVER_URL}/api/shares/${created.id}`)
    const content = (putCall?.body as { content?: string } | undefined)?.content ?? ''
    expect(content).toContain('<style>')
    expect(content).toContain('.y{color:blue}')
    expect(content).not.toContain('<link')
  })
})

async function readFileText(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

function shareFetch(): {
  calls: { method: string; url: string; body: unknown }[]
  impl: ReturnType<typeof vi.fn>
} {
  const calls: { method: string; url: string; body: unknown }[] = []
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as string, init)
    const body = init?.body ? JSON.parse(init.body as string) : null
    calls.push({ method: request.method, url: request.url, body })
    if (request.url.endsWith('/api/client-tokens')) {
      return jsonResponse(201, { token: 'enrolled-token-1' })
    }
    if (request.method === 'POST') {
      return jsonResponse(201, created)
    }
    if (request.method === 'PUT') {
      return jsonResponse(200, {
        id: created.id,
        url: created.url,
        expiresAt: created.expiresAt,
        updatedAt: '2026-11-16T12:00:00.000Z'
      })
    }
    return new Response(null, { status: 204 })
  })
  return { calls, impl }
}
