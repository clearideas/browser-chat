import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { h } from 'vue'

import MarkdownContent from '@/components/MarkdownContent'
import { parseMarkdown } from '@/utils/markdown'

import { HOSTILE_CONTENT } from '../../../server/index.ts'
import { mockMarkdownContent } from '../../fixtures/mock-data'

/** Renders Markdown with the widget renderer and returns the container element. */
function render(source: string | null | undefined): HTMLElement {
  const wrapper = mount({ render: () => h('div', [h(MarkdownContent, { source })]) })
  return wrapper.element as HTMLElement
}

/** Rendered HTML without the direction attributes (checked on their own below). */
const html = (source: string | null | undefined) =>
  render(source).innerHTML.replace(/ dir="(auto|ltr)"/g, '')

// ---------------------------------------------------------------------------------------------
// Output allowlist: the renderer may only ever produce these elements and attributes.
// ---------------------------------------------------------------------------------------------

const ALLOWED_ELEMENTS = new Set([
  'DIV', // test container
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'PRE',
  'CODE',
  'BLOCKQUOTE',
  'UL',
  'OL',
  'LI',
  'HR',
  'TABLE',
  'THEAD',
  'TBODY',
  'TR',
  'TH',
  'TD',
  'STRONG',
  'EM',
  'DEL',
  'A',
  'BR',
])

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel', 'class', 'data-tooltip']),
  OL: new Set(['start', 'dir']),
  TH: new Set(['style']),
  TD: new Set(['style']),
  ...Object.fromEntries(
    ['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'TABLE', 'PRE'].map(tag => [
      tag,
      new Set(['dir']),
    ]),
  ),
}

function expectOnlyAllowedOutput(container: HTMLElement): void {
  for (const element of [container, ...container.querySelectorAll('*')]) {
    expect(ALLOWED_ELEMENTS.has(element.tagName), `element <${element.tagName}>`).toBe(true)
    for (const attribute of element.getAttributeNames()) {
      const allowed = ALLOWED_ATTRIBUTES[element.tagName]?.has(attribute) ?? false
      expect(allowed, `attribute ${attribute} on <${element.tagName}>`).toBe(true)
    }
    if (element.tagName === 'A') {
      expect(element.getAttribute('href')).toMatch(/^(https?:|mailto:)/)
      expect(element.getAttribute('target')).toBe('_blank')
      expect(element.getAttribute('rel')).toBe('noopener noreferrer')
      expect(['chat-source', 'web-source', 'ci-md-image-link', null]).toContain(
        element.getAttribute('class'),
      )
    }
    if (element.hasAttribute('dir')) {
      expect(element.getAttribute('dir')).toBe(element.tagName === 'PRE' ? 'ltr' : 'auto')
    }
    if (element.hasAttribute('style')) {
      expect(element.getAttribute('style')).toMatch(/^text-align: (left|center|right);$/)
    }
  }
}

describe('markdown rendering', () => {
  it('renders nothing for empty, null and undefined input', () => {
    expect(html('')).toBe('')
    expect(html(null)).toBe('')
    expect(html(undefined)).toBe('')
  })

  it('lets each block take its direction from its text, and keeps code left to right', () => {
    const container = render('# Title\n\ntext\n\n> quote\n\n- item\n\n1. one\n\n```\ncode\n```')
    for (const selector of ['h1', 'p', 'blockquote', 'ul', 'ol']) {
      expect(container.querySelector(selector)?.getAttribute('dir'), selector).toBe('auto')
    }
    expect(container.querySelector('pre')?.getAttribute('dir')).toBe('ltr')
    expect(render('| a |\n| - |\n| b |').querySelector('table')?.getAttribute('dir')).toBe('auto')
  })

  it('renders paragraphs, soft breaks and hard breaks', () => {
    expect(html('one\ntwo\n\nthree')).toBe('<p>one\ntwo</p><p>three</p>')
    expect(html('hard  \nbreak')).toBe('<p>hard<br>break</p>')
    expect(html('back\\\nslash')).toBe('<p>back<br>slash</p>')
    expect(html('a<br>b<br/>c<br />d')).toBe('<p>a<br>b<br>c<br>d</p>')
  })

  it('renders ATX and setext headings', () => {
    expect(html('# One\n## Two ##\n###### Six')).toBe('<h1>One</h1><h2>Two</h2><h6>Six</h6>')
    expect(html('Title\n=====\n\nSub\n---')).toBe('<h1>Title</h1><h2>Sub</h2>')
    expect(html('#hashtag')).toBe('<p>#hashtag</p>')
  })

  it('renders emphasis, strong emphasis and strikethrough', () => {
    expect(html('*em* _em_ **strong** __strong__ ~~del~~')).toBe(
      '<p><em>em</em> <em>em</em> <strong>strong</strong> <strong>strong</strong> <del>del</del></p>',
    )
    expect(html('***both***')).toBe('<p><em><strong>both</strong></em></p>')
    expect(html('**bold with *nested* em**')).toBe(
      '<p><strong>bold with <em>nested</em> em</strong></p>',
    )
  })

  it('leaves emphasis characters alone where CommonMark does', () => {
    expect(html('snake_case_name')).toBe('<p>snake_case_name</p>')
    expect(html('2 * 3 * 4')).toBe('<p>2 * 3 * 4</p>')
    expect(html('**unclosed')).toBe('<p>**unclosed</p>')
    expect(html('~single tilde~')).toBe('<p>~single tilde~</p>')
  })

  it('renders code spans verbatim', () => {
    expect(html('use `a *b* [c](https://x.test)` here')).toBe(
      '<p>use <code>a *b* [c](https://x.test)</code> here</p>',
    )
    expect(html('``a ` b``')).toBe('<p><code>a ` b</code></p>')
    expect(html('`&amp;`')).toBe('<p><code>&amp;amp;</code></p>')
    expect(html('`unclosed')).toBe('<p>`unclosed</p>')
  })

  it('renders fenced code blocks verbatim, including while still streaming', () => {
    expect(html('```js\nconst x = "<b>";\n```')).toBe(
      '<pre><code>const x = "&lt;b&gt;";</code></pre>',
    )
    expect(html('~~~\n*not em*\n~~~')).toBe('<pre><code>*not em*</code></pre>')
    expect(html('```\nopen fence keeps going')).toBe(
      '<pre><code>open fence keeps going</code></pre>',
    )
  })

  it('renders blockquotes, nested and with lazy continuation', () => {
    expect(html('> quote\nlazy\n> > nested')).toBe(
      '<blockquote><p>quote\nlazy</p><blockquote><p>nested</p></blockquote></blockquote>',
    )
  })

  it('renders tight bullet and ordered lists', () => {
    expect(html('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>')
    expect(html('1. a\n2. b')).toBe('<ol><li>a</li><li>b</li></ol>')
    expect(html('3) a\n4) b')).toBe('<ol start="3"><li>a</li><li>b</li></ol>')
  })

  it('renders loose lists with paragraphs', () => {
    expect(html('- a\n\n- b')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>')
  })

  it('renders nested lists at common indentations', () => {
    const expected = '<ol><li>Item<ul><li>sub</li><li>sub2</li></ul></li><li>Next</li></ol>'
    expect(html('1. Item\n   - sub\n   - sub2\n2. Next')).toBe(expected)
    expect(html('1. Item\n    - sub\n    - sub2\n2. Next')).toBe(expected)
    expect(html('- a\n  - b\n    - c')).toBe(
      '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>',
    )
  })

  it('follows CommonMark list interruption rules', () => {
    expect(html('In\n2019. A year')).toBe('<p>In\n2019. A year</p>')
    expect(html('Intro\n- item')).toBe('<p>Intro</p><ul><li>item</li></ul>')
    expect(html('* * *')).toBe('<hr>')
  })

  it('renders tables with alignment, escaped pipes and inline formatting', () => {
    const table = html(
      '| Left | Center | Right |\n|:--|:-:|--:|\n| **a** | b \\| c | d<br>e |\n| short |',
    )
    expect(table).toBe(
      '<table><thead><tr>' +
        '<th style="text-align: left;">Left</th>' +
        '<th style="text-align: center;">Center</th>' +
        '<th style="text-align: right;">Right</th>' +
        '</tr></thead><tbody>' +
        '<tr><td style="text-align: left;"><strong>a</strong></td>' +
        '<td style="text-align: center;">b | c</td>' +
        '<td style="text-align: right;">d<br>e</td></tr>' +
        '<tr><td style="text-align: left;">short</td>' +
        '<td style="text-align: center;"></td>' +
        '<td style="text-align: right;"></td></tr>' +
        '</tbody></table>',
    )
  })

  it('decodes entities in text', () => {
    expect(render('&amp; &lt;b&gt; &#169; &#x1F600; &unknown;').textContent).toBe(
      '& <b> © 😀 &unknown;',
    )
  })
})

describe('markdown links', () => {
  const link = (href: string, text: string, extra = '') =>
    `<a target="_blank" rel="noopener noreferrer" href="${href}"${extra}>${text}</a>`

  it('renders links with titles, angle destinations and balanced parentheses', () => {
    expect(html('[a](https://x.test/ "title")')).toBe(`<p>${link('https://x.test/', 'a')}</p>`)
    expect(html('[a](<https://x.test/a b>)')).toBe(`<p>${link('https://x.test/a%20b', 'a')}</p>`)
    expect(html('[wiki](https://en.wikipedia.org/wiki/Foo_(bar))')).toBe(
      `<p>${link('https://en.wikipedia.org/wiki/Foo_(bar)', 'wiki')}</p>`,
    )
  })

  it('renders autolinks and mailto links', () => {
    expect(html('<https://x.test/>')).toBe(`<p>${link('https://x.test/', 'https://x.test/')}</p>`)
    expect(html('[mail](mailto:a@x.test)')).toBe(`<p>${link('mailto:a@x.test', 'mail')}</p>`)
    expect(html('<mailto:a@x.test>')).toBe(`<p>${link('mailto:a@x.test', 'a@x.test')}</p>`)
  })

  it('renders links without an absolute http(s) or mailto URL as plain text', () => {
    for (const destination of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html,<script>x</script>',
      'vbscript:x',
      '/relative/path',
      '#anchor',
      '//protocol-relative.test/',
    ]) {
      const container = render(`[label](${destination})`)
      expect(container.querySelector('a'), destination).toBeNull()
      expect(container.textContent).toContain('label')
    }
  })

  it('does not nest links', () => {
    expect(html('[outer [inner](https://in.test/)](https://out.test/)')).toBe(
      `<p>${link('https://out.test/', 'outer inner')}</p>`,
    )
  })

  it('renders images as links that are never loaded', () => {
    const container = render('![a chart](https://img.test/chart.png)')
    expect(container.querySelector('img')).toBeNull()
    expect(html('![a chart](https://img.test/chart.png)')).toBe(
      `<p>${link('https://img.test/chart.png', 'a chart', ' class="ci-md-image-link"')}</p>`,
    )
    expect(render('![](https://img.test/x.png)').textContent).toBe('img.test')
    expect(html('![alt](javascript:alert(1))')).toBe('<p>alt</p>')
    // No alt text and no usable URL: a localized word stands in.
    expect(html('![](javascript:alert(1))')).toBe('<p>Image</p>')
  })

  it('renders source citations as chips linking to the original URL', () => {
    expect(
      html(
        '[example.com](https://example.com/page){data-original-url="https://example.com/original"}',
      ),
    ).toBe(
      `<p>${link(
        'https://example.com/original',
        'example.com',
        ' class="chat-source" data-tooltip="example.com"',
      )}</p>`,
    )
    // Curly quotes and a space before the attribute block (seen in model output).
    expect(
      render('[s](https://a.test/) {data-original-url=\u201chttps://www.b.test/x\u201d}')
        .querySelector('a.chat-source')
        ?.getAttribute('href'),
    ).toBe('https://www.b.test/x')
    expect(
      render('[s](https://a.test/){data-original-url="https://www.b.test/x"}')
        .querySelector('a')
        ?.getAttribute('data-tooltip'),
    ).toBe('b.test')
  })

  it('falls back to the link destination, or text, when a citation URL is unsafe', () => {
    expect(
      render('[s](https://safe.test/){data-original-url="javascript:alert(1)"}')
        .querySelector('a')
        ?.getAttribute('href'),
    ).toBe('https://safe.test/')
    const container = render('[s](/site/abc/file/def){data-original-url="javascript:alert(1)"}')
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toBe('s')
  })

  it('renders Clear Ideas file citations that have a public URL', () => {
    const container = render(
      '[Pricing](/site/site-1/file/file-2){data-original-url="https://example.com/pricing"}',
    )
    expect(container.querySelector('a.chat-source')?.getAttribute('href')).toBe(
      'https://example.com/pricing',
    )
  })

  it('leaves brace text that is not an attribute block', () => {
    expect(render('[a](https://x.test/) {not attributes}').textContent).toBe('a {not attributes}')
  })

  it('renders WebSource citations, including escaped and malformed forms', () => {
    const webLink = (href: string, text: string) => link(href, text, ' class="web-source"')
    expect(html('See <WebSource data-url="https://w.test/a">Article</WebSource>.')).toBe(
      `<p>See ${webLink('https://w.test/a', 'Article')}.</p>`,
    )
    expect(
      html('&lt;WebSource data-url=&quot;https://w.test/a&quot;&gt;Esc&lt;/WebSource&gt;'),
    ).toBe(`<p>${webLink('https://w.test/a', 'Esc')}</p>`)
    expect(html('<websource>https://w.test/b</websource>')).toBe(
      `<p>${webLink('https://w.test/b', 'https://w.test/b')}</p>`,
    )
    expect(html('x<WebSource>no url</WebSource>y')).toBe('<p>xy</p>')
    expect(html('<WebSource data-url="javascript:alert(1)">Bad</WebSource>')).toBe('<p>Bad</p>')
  })

  it('removes chunkId markers and their contents', () => {
    expect(html('Hello <chunkId>12345</chunkId> World <ChunkId/>!')).toBe('<p>Hello  World !</p>')
    expect(html('a <chunkid>multi\nline</chunkid> b')).toBe('<p>a  b</p>')
  })
})

describe('markdown security', () => {
  it('shows raw HTML as text instead of interpreting it', () => {
    const container = render('<script>alert(1)</script><img src=x onerror="alert(2)">')
    expect(container.querySelector('script, img')).toBeNull()
    expect(container.textContent).toBe('<script>alert(1)</script><img src=x onerror="alert(2)">')
  })

  it.each(Object.entries(HOSTILE_CONTENT))('renders the %s fixture inertly', (_name, content) => {
    const container = render(content)
    expectOnlyAllowedOutput(container)
    expect(container.querySelector('img, script, iframe, form, input, svg, style')).toBeNull()
  })

  it('renders the old fixtures within the allowlist', () => {
    for (const content of Object.values(mockMarkdownContent)) {
      expectOnlyAllowedOutput(render(content))
    }
  })

  // 1,000 renders: slow on a busy machine, so it gets a generous timeout.
  it('keeps random Markdown-like input within the allowlist', { timeout: 30_000 }, () => {
    // Deterministic pseudo-random generator so failures are reproducible.
    let seed = 12345
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const pieces = [
      '*',
      '**',
      '_',
      '~~',
      '`',
      '```',
      '[',
      ']',
      '(',
      ')',
      '{',
      '}',
      '<',
      '>',
      '!',
      '#',
      '-',
      '|',
      '\\',
      '\n',
      '\n\n',
      '  ',
      '1. ',
      '- ',
      '> ',
      '&amp;',
      '&#x3c;',
      '"',
      "'",
      'text',
      'https://x.test/',
      'javascript:alert(1)',
      'data-original-url="',
      '<script>',
      '<img ',
      'onerror=',
      '<WebSource data-url="',
      '</WebSource>',
      '<chunkId>',
      '<br>',
      'é',
      '🎉',
    ]
    for (let sample = 0; sample < 1000; sample += 1) {
      let source = ''
      const length = Math.floor(random() * 40)
      for (let index = 0; index < length; index += 1) {
        source += pieces[Math.floor(random() * pieces.length)]
      }
      let container: HTMLElement
      try {
        container = render(source)
      } catch (error) {
        throw new Error(`render threw for ${JSON.stringify(source)}: ${(error as Error).message}`)
      }
      expectOnlyAllowedOutput(container)
    }
  })

  it('parses pathological input quickly', () => {
    const inputs = [
      '['.repeat(20000),
      '`'.repeat(5000) + 'a' + '``'.repeat(2000),
      '*a'.repeat(10000),
      '_a_'.repeat(5000) + '**'.repeat(5000),
      '>'.repeat(5000) + ' deep',
      Array.from({ length: 200 }, (_, depth) => `${' '.repeat(depth * 2)}- item`).join('\n'),
      '[a](' + '('.repeat(10000),
      '<'.repeat(10000),
      '| a '.repeat(2000) + '\n' + '|---'.repeat(2000),
    ]
    for (const input of inputs) {
      const start = performance.now()
      parseMarkdown(input)
      const elapsed = performance.now() - start
      expect(elapsed, `${JSON.stringify(input.slice(0, 20))}... took ${elapsed}ms`).toBeLessThan(
        1000,
      )
    }
  })
})
