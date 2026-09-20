import { memo } from 'react'
import Markdown from 'react-markdown'
import type { Components, Options as ReactMarkdownOptions } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import remarkBreaks from 'remark-breaks'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { remarkMarkdownDocLinks } from './markdown-doc-links'
import { markdownPreviewUrlTransform } from './markdown-preview-url-transform'

const markdownPreviewSanitizeSchema = {
  ...defaultSchema,
  // Why: GitHub READMEs use centered headings, <picture>/<source>, and table cell sizing.
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'details',
    'summary',
    'kbd',
    'sub',
    'sup',
    'ins',
    'picture',
    'source'
  ],
  protocols: {
    ...defaultSchema.protocols,
    // Why: keep file:// through sanitize so the click handler can authorize and open the target.
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
    src: [...(defaultSchema.protocols?.src ?? []), 'file']
  },
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id'],
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'title'],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ['className', /^language-[\w-]+$/, 'math-inline', 'math-display']
    ],
    div: [...(defaultSchema.attributes?.div ?? []), ['className', /^language-[\w-]+$/], 'align'],
    details: [
      ...(defaultSchema.attributes?.details ?? []),
      'open',
      ['className', 'orca-details'],
      ['dataOrcaToggle', 'heading-1', 'heading-2', 'heading-3', 'heading-4', 'heading-5']
    ],
    h1: [...(defaultSchema.attributes?.h1 ?? []), 'id', 'align'],
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id', 'align'],
    h3: [...(defaultSchema.attributes?.h3 ?? []), 'id', 'align'],
    h4: [...(defaultSchema.attributes?.h4 ?? []), 'id', 'align'],
    h5: [...(defaultSchema.attributes?.h5 ?? []), 'id', 'align'],
    h6: [...(defaultSchema.attributes?.h6 ?? []), 'id', 'align'],
    p: [...(defaultSchema.attributes?.p ?? []), 'align'],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      'src',
      'alt',
      'title',
      'width',
      'height',
      'align',
      'valign'
    ],
    input: [...(defaultSchema.attributes?.input ?? []), 'type', 'checked', 'disabled'],
    pre: [...(defaultSchema.attributes?.pre ?? []), ['className', /^language-[\w-]+$/]],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', /^hljs(?:-[\w-]+)?$/]],
    table: [...(defaultSchema.attributes?.table ?? []), 'width', 'align'],
    td: [...(defaultSchema.attributes?.td ?? []), 'align', 'width', 'valign', 'colspan', 'rowspan'],
    th: [...(defaultSchema.attributes?.th ?? []), 'align', 'width', 'valign', 'colspan', 'rowspan'],
    source: [...(defaultSchema.attributes?.source ?? []), 'src', 'srcset', 'type', 'media']
  }
}

type MarkdownPluginList = NonNullable<ReactMarkdownOptions['remarkPlugins']>
const MARKDOWN_REMARK_PLUGINS: MarkdownPluginList = [
  remarkGfm,
  remarkBreaks,
  remarkFrontmatter,
  remarkMath,
  remarkMarkdownDocLinks
]
// Why: sanitize raw HTML before KaTeX/highlight expand it.
const MARKDOWN_REHYPE_PLUGINS: MarkdownPluginList = [
  rehypeRaw,
  [rehypeSanitize, markdownPreviewSanitizeSchema],
  rehypeSlug,
  rehypeHighlight,
  rehypeKatex
]

// Why: find-state renders must not rebuild the full remark/rehype pipeline.
export const MarkdownPreviewBody = memo(function MarkdownPreviewBody({
  content,
  components
}: {
  content: string
  components: Components
}) {
  return (
    <Markdown
      components={components}
      urlTransform={markdownPreviewUrlTransform}
      remarkPlugins={MARKDOWN_REMARK_PLUGINS}
      rehypePlugins={MARKDOWN_REHYPE_PLUGINS}
    >
      {content}
    </Markdown>
  )
})
