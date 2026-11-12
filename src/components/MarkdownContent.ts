// Renders chat message Markdown with Vue render functions.
//
// Elements are created through the DOM, never from an HTML string, so message content cannot inject
// markup or script. Links are the only attribute-bearing output: their URLs must be absolute
// http(s) or mailto URLs, and they open in a new tab without access to this page.

import { computed, defineComponent, h, type PropType, type VNodeChild } from 'vue'

import { useWidgetI18n } from '../i18n/runtime'
import { type Block, type Inline, parseMarkdown } from '../utils/markdown'
import { displayHost, safeLinkUrl, safeWebUrl } from '../utils/safe'

const LINK_ATTRIBUTES = { target: '_blank', rel: 'noopener noreferrer' }

// Each block takes its direction from its own text, so English and Arabic read correctly in a
// widget of either direction. Code is always left to right.
const AUTO_DIRECTION = { dir: 'auto' }

/** Localized words the renderer needs. */
interface Labels {
  image: string
}

function renderInline(nodes: Inline[], labels: Labels): VNodeChild[] {
  return nodes.map(node => {
    switch (node.type) {
      case 'text':
        return node.text
      case 'softbreak':
        return '\n'
      case 'break':
        return h('br')
      case 'code':
        return h('code', node.text)
      case 'strong':
      case 'em':
      case 'del':
        return h(node.type, renderInline(node.children, labels))
      case 'image':
        return renderImage(node.destination, node.alt, labels)
      case 'link':
        return renderLink(node.destination, node.attributes, renderInline(node.children, labels))
    }
  })
}

/**
 * Source citations carry `data-original-url`, web search results `data-url`. Either attribute's URL
 * takes precedence over the link destination. Links without a safe URL render as plain text.
 */
function renderLink(
  destination: string,
  attributes: Record<string, string>,
  children: VNodeChild[],
): VNodeChild {
  if ('data-original-url' in attributes) {
    const href = safeWebUrl(attributes['data-original-url']) ?? safeWebUrl(destination)
    if (!href) return children
    return h(
      'a',
      { ...LINK_ATTRIBUTES, href, class: 'chat-source', 'data-tooltip': displayHost(href) },
      children,
    )
  }
  if ('data-url' in attributes) {
    const href = safeWebUrl(attributes['data-url']) ?? safeWebUrl(destination)
    if (!href) return children
    return h('a', { ...LINK_ATTRIBUTES, href, class: 'web-source' }, children)
  }
  const href = safeLinkUrl(destination)
  return href ? h('a', { ...LINK_ATTRIBUTES, href }, children) : children
}

/** Images are never loaded (a rendered image can leak data to its server); they become links. */
function renderImage(destination: string, alt: string, labels: Labels): VNodeChild {
  const href = safeWebUrl(destination)
  const label = alt || (href ? displayHost(href) : '') || labels.image
  return href ? h('a', { ...LINK_ATTRIBUTES, href, class: 'ci-md-image-link' }, label) : label
}

function renderBlocks(blocks: Block[], labels: Labels, tight = false): VNodeChild[] {
  return blocks.map(block => {
    switch (block.type) {
      case 'paragraph':
        return tight
          ? renderInline(block.children, labels)
          : h('p', AUTO_DIRECTION, renderInline(block.children, labels))
      case 'heading':
        return h(`h${block.level}`, AUTO_DIRECTION, renderInline(block.children, labels))
      case 'code':
        return h('pre', { dir: 'ltr' }, [h('code', block.text)])
      case 'blockquote':
        return h('blockquote', AUTO_DIRECTION, renderBlocks(block.children, labels))
      case 'hr':
        return h('hr')
      case 'list':
        return h(
          block.ordered ? 'ol' : 'ul',
          block.ordered && block.start !== 1
            ? { ...AUTO_DIRECTION, start: block.start }
            : AUTO_DIRECTION,
          block.items.map(item => h('li', renderBlocks(item, labels, block.tight))),
        )
      case 'table':
        return h('table', AUTO_DIRECTION, [
          h('thead', [
            h(
              'tr',
              block.header.map((cell, column) =>
                h('th', alignStyle(block.align[column]), renderInline(cell, labels)),
              ),
            ),
          ]),
          h(
            'tbody',
            block.rows.map(row =>
              h(
                'tr',
                row.map((cell, column) =>
                  h('td', alignStyle(block.align[column]), renderInline(cell, labels)),
                ),
              ),
            ),
          ),
        ])
    }
  })
}

function alignStyle(align: 'left' | 'center' | 'right' | null | undefined) {
  return align ? { style: { textAlign: align } } : null
}

export default defineComponent({
  name: 'MarkdownContent',
  props: {
    source: { type: String as PropType<string | null | undefined>, default: '' },
  },
  setup(props) {
    const { t } = useWidgetI18n()
    const blocks = computed(() => parseMarkdown(props.source))
    return () => {
      return renderBlocks(blocks.value, { image: t('chat.image') })
    }
  },
})
