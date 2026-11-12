// Markdown parser for chat messages. Produces a small syntax tree of plain objects; the widget
// renders it with Vue render functions (components/MarkdownContent.ts), so message content is
// never parsed as HTML.
//
// Supported (a practical subset of CommonMark and GitHub Flavored Markdown):
//   blocks:  paragraphs, ATX and setext headings, fenced code, blockquotes, ordered and unordered
//            lists (nested, tight or loose), tables, thematic breaks
//   inline:  emphasis and strong emphasis, strikethrough, code spans, links, images (rendered as
//            links, never loaded), autolinks, backslash escapes, entities, hard line breaks
// Protocol extensions (docs/protocol/README.md §7):
//   [label](url){data-original-url="..."}   source citation
//   <WebSource data-url="...">Title</WebSource>   web search citation
//   <chunkId>...</chunkId>   removed
//   <br>   line break (common in model-written tables)
// Not supported: raw HTML (shown as text), indented code blocks, reference-style links,
// footnotes, task list checkboxes, bare-URL autolinking, typographic replacements.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong' | 'em' | 'del'; children: Inline[] }
  | { type: 'link'; destination: string; attributes: Record<string, string>; children: Inline[] }
  | { type: 'image'; destination: string; alt: string }
  | { type: 'break' }
  | { type: 'softbreak' }

export type Align = 'left' | 'center' | 'right' | null

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: 'code'; language: string; text: string }
  | { type: 'blockquote'; children: Block[] }
  | { type: 'list'; ordered: boolean; start: number; tight: boolean; items: Block[][] }
  | { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { type: 'hr' }

const MAX_DEPTH = 20
/** Bounds on scanning, so unmatched `[`, backticks or `*` cannot make parsing quadratic. */
const MAX_LINK_LABEL = 2000
const MAX_CODE_SPAN = 4000
const MAX_OPENER_SEARCH = 200

export function parseMarkdown(source: string | null | undefined): Block[] {
  if (!source) return []
  const text = preprocess(source)
  const lines = text.split('\n').map(expandLeadingTabs)
  return parseBlocks(lines, 0)
}

// ---------------------------------------------------------------------------------------------
// Preprocessing
// ---------------------------------------------------------------------------------------------

function preprocess(source: string): string {
  return (
    source
      .replace(/\r\n?/g, '\n')
      // Internal retrieval markers and their contents are never shown.
      .replace(/<chunkid[^>]*>[\s\S]*?<\/chunkid>/gi, '')
      .replace(/<chunkid[^>]*\/\s*>/gi, '')
      // Some servers send WebSource tags HTML-escaped; restore them so the inline parser sees them.
      .replace(
        /&lt;(\/?websource\b[\s\S]*?)&gt;/gi,
        (_match, inner: string) =>
          `<${inner.replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")}>`,
      )
  )
}

function expandLeadingTabs(line: string): string {
  const match = /^[ \t]+/.exec(line)
  if (!match || !match[0].includes('\t')) return line
  let width = 0
  for (const char of match[0]) width = char === '\t' ? width + 4 - (width % 4) : width + 1
  return ' '.repeat(width) + line.slice(match[0].length)
}

// ---------------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------------

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/
const BLOCKQUOTE = /^ {0,3}> ?/
const LIST_ITEM = /^( {0,3})([-*+]|(\d{1,9})([.)]))(?:( {1,4})(.*)|[ \t]*)$/
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

const isBlank = (line: string) => line.trim() === ''

interface ListMarker {
  indent: number
  bullet: string | null // '-', '*' or '+' for bullet lists
  delimiter: string | null // '.' or ')' for ordered lists
  start: number
  contentIndent: number
  content: string
}

function matchListItem(line: string): ListMarker | null {
  const match = LIST_ITEM.exec(line)
  if (!match) return null
  const indent = match[1].length
  const marker = match[2]
  const ordered = match[3] !== undefined
  let content: string
  let contentIndent: number
  if (match[5] !== undefined) {
    content = match[6]
    contentIndent = indent + marker.length + match[5].length
  } else {
    content = ''
    contentIndent = indent + marker.length + 1
  }
  return {
    indent,
    bullet: ordered ? null : marker,
    delimiter: ordered ? match[4] : null,
    start: ordered ? Number(match[3]) : 1,
    contentIndent,
    content,
  }
}

function startsBlock(line: string, interruptsParagraph: boolean): boolean {
  if (FENCE.test(line) || ATX_HEADING.test(line) || THEMATIC_BREAK.test(line)) return true
  if (BLOCKQUOTE.test(line)) return true
  const item = matchListItem(line)
  if (!item) return false
  // An ordered list may interrupt a paragraph only when it starts at 1, and an empty item never
  // does (CommonMark), which keeps "2019. A year" style lines inside paragraphs.
  if (interruptsParagraph && (!item.content.trim() || (item.bullet === null && item.start !== 1))) {
    return false
  }
  return true
}

function splitTableRow(line: string): string[] {
  let row = line.trim()
  if (row.startsWith('|')) row = row.slice(1)
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1)
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (char === '\\' && row[index + 1] === '|') {
      current += '|'
      index += 1
    } else if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function parseAlign(cell: string): Align {
  const left = cell.startsWith(':')
  const right = cell.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line)) {
      index += 1
      continue
    }

    // Fenced code
    const fence = FENCE.exec(line)
    if (fence && !(fence[1][0] === '`' && fence[2].includes('`'))) {
      const marker = fence[1]
      const fenceIndent = line.length - line.trimStart().length
      const closing = new RegExp(
        `^ {0,3}${marker[0] === '`' ? '`' : '~'}{${marker.length},}[ \\t]*$`,
      )
      const body: string[] = []
      index += 1
      while (index < lines.length && !closing.test(lines[index])) {
        body.push(lines[index].replace(new RegExp(`^ {0,${fenceIndent}}`), ''))
        index += 1
      }
      index += 1 // closing fence (or end of input)
      blocks.push({
        type: 'code',
        language: fence[2].trim().split(/\s+/)[0] ?? '',
        text: body.join('\n'),
      })
      continue
    }

    const heading = ATX_HEADING.exec(line)
    if (heading) {
      blocks.push({
        type: 'heading',
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2] ?? ''),
      })
      index += 1
      continue
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (BLOCKQUOTE.test(line)) {
      const inner: string[] = []
      while (index < lines.length && !isBlank(lines[index])) {
        const current = lines[index]
        if (BLOCKQUOTE.test(current)) inner.push(current.replace(BLOCKQUOTE, ''))
        else if (inner.length > 0 && !startsBlock(current, true))
          inner.push(current) // lazy line
        else break
        index += 1
      }
      blocks.push({
        type: 'blockquote',
        children: depth < MAX_DEPTH ? parseBlocks(inner, depth + 1) : [textParagraph(inner)],
      })
      continue
    }

    const item = matchListItem(line)
    if (item) {
      const result = parseList(lines, index, item, depth)
      blocks.push(result.block)
      index = result.next
      continue
    }

    // Table: a header row followed by a delimiter row with the same number of cells.
    if (line.includes('|') && index + 1 < lines.length && TABLE_DELIMITER.test(lines[index + 1])) {
      const header = splitTableRow(line)
      const delimiters = splitTableRow(lines[index + 1])
      if (header.length === delimiters.length) {
        index += 2
        const rows: Inline[][][] = []
        while (index < lines.length && !isBlank(lines[index]) && lines[index].includes('|')) {
          const cells = splitTableRow(lines[index])
          rows.push(header.map((_cell, column) => parseInline(cells[column] ?? '')))
          index += 1
        }
        blocks.push({
          type: 'table',
          align: delimiters.map(parseAlign),
          header: header.map(cell => parseInline(cell)),
          rows,
        })
        continue
      }
    }

    // Paragraph, possibly turned into a setext heading by an underline.
    const paragraph: string[] = [line.trimStart()]
    index += 1
    let setextLevel: 1 | 2 | null = null
    while (index < lines.length && !isBlank(lines[index])) {
      const current = lines[index]
      const underline = SETEXT_UNDERLINE.exec(current)
      if (underline) {
        setextLevel = underline[1][0] === '=' ? 1 : 2
        index += 1
        break
      }
      if (startsBlock(current, true)) break
      paragraph.push(current.trimStart())
      index += 1
    }
    const children = parseInline(paragraph.join('\n').trimEnd())
    blocks.push(
      setextLevel
        ? { type: 'heading', level: setextLevel, children }
        : { type: 'paragraph', children },
    )
  }

  return blocks
}

function textParagraph(lines: string[]): Block {
  return { type: 'paragraph', children: [{ type: 'text', text: lines.join('\n') }] }
}

function parseList(
  lines: string[],
  startIndex: number,
  first: ListMarker,
  depth: number,
): { block: Block; next: number } {
  const ordered = first.bullet === null
  const items: Block[][] = []
  let tight = true
  let index = startIndex
  let marker: ListMarker | null = first

  while (marker) {
    const itemLines: string[] = [marker.content]
    const contentIndent = marker.contentIndent
    index += 1
    let endsWithBlank = false

    while (index < lines.length) {
      const line = lines[index]
      if (isBlank(line)) {
        endsWithBlank = true
        itemLines.push('')
        index += 1
        continue
      }
      const indent = line.length - line.trimStart().length
      if (indent >= contentIndent) {
        itemLines.push(line.slice(contentIndent))
        endsWithBlank = false
        index += 1
        continue
      }
      if (endsWithBlank) break // a blank line followed by a less-indented line ends the item
      // Lazy continuation of a paragraph inside the item.
      const previous = itemLines[itemLines.length - 1]
      if (previous.trim() && !startsBlock(line, true) && !matchListItem(line)) {
        itemLines.push(line.trim())
        index += 1
        continue
      }
      break
    }

    // Trailing blank lines belong between items; a blank line inside an item makes the list loose.
    while (itemLines.length > 1 && !itemLines[itemLines.length - 1].trim()) itemLines.pop()
    if (itemLines.some(entry => !entry.trim())) tight = false

    items.push(depth < MAX_DEPTH ? parseBlocks(itemLines, depth + 1) : [textParagraph(itemLines)])

    // Continue with a sibling item of the same kind?
    const next: ListMarker | null = index < lines.length ? matchListItem(lines[index]) : null
    const sameKind =
      next !== null &&
      next.indent < contentIndent &&
      (ordered ? next.delimiter === first.delimiter : next.bullet === first.bullet)
    if (!sameKind || THEMATIC_BREAK.test(lines[index])) break
    if (endsWithBlank) tight = false
    marker = next
  }

  return { block: { type: 'list', ordered, start: first.start, tight, items }, next: index }
}

// ---------------------------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------------------------

interface Delimiter {
  type: 'delimiter'
  char: '*' | '_' | '~'
  count: number
  canOpen: boolean
  canClose: boolean
}

type Token = Inline | Delimiter

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/
const isWhitespace = (char: string | undefined) => char === undefined || /\s/u.test(char)
const isPunctuation = (char: string | undefined) =>
  char !== undefined && (ASCII_PUNCTUATION.test(char) || /\p{P}/u.test(char))

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd'
    }
    return ENTITIES[body.toLowerCase()] ?? match
  })
}

export function parseInline(source: string, depth = 0): Inline[] {
  const tokens: Token[] = []
  let brackets: Map<number, number> | null = null // computed on first use
  let text = ''
  const flush = () => {
    if (text) tokens.push({ type: 'text', text: decodeEntities(text) })
    text = ''
  }

  let index = 0
  while (index < source.length) {
    const char = source[index]

    // Backslash escape or hard break.
    if (char === '\\') {
      const next = source[index + 1]
      if (next === '\n') {
        flush()
        tokens.push({ type: 'break' })
        index += 2
        continue
      }
      if (next !== undefined && ASCII_PUNCTUATION.test(next)) {
        text += next
        index += 2
        continue
      }
    }

    // Line endings: two trailing spaces make a hard break.
    if (char === '\n') {
      const hard = / {2,}$/.test(text)
      text = text.replace(/ +$/, '')
      flush()
      tokens.push({ type: hard ? 'break' : 'softbreak' })
      index += 1
      while (source[index] === ' ') index += 1
      continue
    }

    // Code span.
    if (char === '`') {
      const runSize = runLength(source, index, '`')
      const closeAt = findClosingBackticks(source, index + runSize, runSize)
      if (closeAt >= 0) {
        flush()
        let code = source.slice(index + runSize, closeAt).replace(/\n/g, ' ')
        if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) {
          code = code.slice(1, -1)
        }
        tokens.push({ type: 'code', text: code })
        index = closeAt + runSize
        continue
      }
      text += '`'.repeat(runSize)
      index += runSize
      continue
    }

    if (char === '<') {
      const rest = source.slice(index)
      const autolink = /^<((?:https?:\/\/|mailto:)[^\s<>]*)>/i.exec(rest)
      if (autolink) {
        flush()
        tokens.push({
          type: 'link',
          destination: autolink[1],
          attributes: {},
          children: [{ type: 'text', text: autolink[1].replace(/^mailto:/i, '') }],
        })
        index += autolink[0].length
        continue
      }
      const lineBreak = /^<br\s*\/?>/i.exec(rest)
      if (lineBreak) {
        flush()
        tokens.push({ type: 'break' })
        index += lineBreak[0].length
        continue
      }
      const webSource = parseWebSource(rest, depth)
      if (webSource) {
        flush()
        if (webSource.node) tokens.push(webSource.node)
        index += webSource.length
        continue
      }
    }

    // Links and images.
    if (char === '[' || (char === '!' && source[index + 1] === '[')) {
      const isImage = char === '!'
      brackets ??= matchBrackets(source)
      const link = parseLink(source, isImage ? index + 1 : index, brackets)
      if (link) {
        flush()
        if (isImage) {
          tokens.push({ type: 'image', destination: link.destination, alt: plainText(link.label) })
        } else {
          const children =
            depth < MAX_DEPTH
              ? parseInline(link.label, depth + 1)
              : [{ type: 'text' as const, text: link.label }]
          tokens.push({
            type: 'link',
            destination: link.destination,
            attributes: link.attributes,
            children: unwrapLinks(children),
          })
        }
        index = link.end
        continue
      }
    }

    // Emphasis and strikethrough delimiter runs.
    if (char === '*' || char === '_' || char === '~') {
      const run = char.repeat(runLength(source, index, char))
      const before = index > 0 ? source[index - 1] : undefined
      const after = source[index + run.length]
      const leftFlanking =
        !isWhitespace(after) &&
        (!isPunctuation(after) || isWhitespace(before) || isPunctuation(before))
      const rightFlanking =
        !isWhitespace(before) &&
        (!isPunctuation(before) || isWhitespace(after) || isPunctuation(after))
      let canOpen = leftFlanking
      let canClose = rightFlanking
      if (char === '_') {
        canOpen = leftFlanking && (!rightFlanking || isPunctuation(before))
        canClose = rightFlanking && (!leftFlanking || isPunctuation(after))
      }
      if (char === '~' && run.length !== 2) {
        text += run
        index += run.length
        continue
      }
      flush()
      tokens.push({ type: 'delimiter', char, count: run.length, canOpen, canClose })
      index += run.length
      continue
    }

    text += char
    index += 1
  }
  flush()

  return mergeText(processEmphasis(tokens))
}

/** Length of the run of `char` starting at `index` (no string copies, so linear overall). */
function runLength(source: string, index: number, char: string): number {
  let end = index
  while (source[end] === char) end += 1
  return end - index
}

/**
 * Pairs every `[` with its `]` in one pass (skipping escapes and code spans), so looking up a
 * link label is constant time instead of a scan per bracket.
 */
function matchBrackets(source: string): Map<number, number> {
  const matches = new Map<number, number>()
  const open: number[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '`') {
      const length = runLength(source, index, '`')
      const close = findClosingBackticks(source, index + length, length)
      index = close >= 0 ? close + length : index + length
      continue
    }
    if (char === '[') open.push(index)
    else if (char === ']' && open.length > 0) matches.set(open.pop()!, index)
    index += 1
  }
  return matches
}

function findClosingBackticks(source: string, from: number, length: number): number {
  let index = from
  const limit = Math.min(source.length, from + MAX_CODE_SPAN)
  while (index < limit) {
    const next = source.indexOf('`', index)
    if (next < 0 || next >= limit) return -1
    const run = runLength(source, next, '`')
    if (run === length) return next
    index = next + run
  }
  return -1
}

interface ListNode {
  token: Token
  prev: ListNode | null
  next: ListNode | null
}

/**
 * Resolves emphasis delimiters into strong/em/del nodes (CommonMark "process emphasis", simplified).
 * Tokens are kept in a linked list so wrapping a matched pair is constant time, and the backward
 * search for an opener is bounded, so adversarial input cannot make parsing quadratic.
 */
function processEmphasis(tokens: Token[]): Inline[] {
  let head: ListNode | null = null
  let tail: ListNode | null = null
  for (const token of tokens) {
    const node: ListNode = { token, prev: tail, next: null }
    if (tail) tail.next = node
    else head = node
    tail = node
  }

  let closerNode = head
  while (closerNode) {
    const closer = closerNode.token
    if (closer.type !== 'delimiter' || !closer.canClose) {
      closerNode = closerNode.next
      continue
    }

    // Find the nearest matching opener, looking back a bounded number of nodes.
    let found: ListNode | null = null
    let candidate = closerNode.prev
    for (let steps = 0; candidate && steps < MAX_OPENER_SEARCH; steps += 1) {
      const token = candidate.token
      if (
        token.type === 'delimiter' &&
        token.char === closer.char &&
        token.canOpen &&
        // CommonMark "rule of 3" for runs that can both open and close.
        !(
          closer.char !== '~' &&
          (token.canClose || closer.canOpen) &&
          (token.count + closer.count) % 3 === 0 &&
          !(token.count % 3 === 0 && closer.count % 3 === 0)
        )
      ) {
        found = candidate
        break
      }
      candidate = candidate.prev
    }
    if (!found) {
      closerNode = closerNode.next
      continue
    }
    const openerNode = found
    const opener = openerNode.token as Delimiter

    const use = closer.char === '~' || (opener.count >= 2 && closer.count >= 2) ? 2 : 1
    const children: Inline[] = []
    for (let inner = openerNode.next; inner && inner !== closerNode; inner = inner.next) {
      children.push(delimiterToText(inner.token))
    }
    const wrapped: ListNode = {
      token: {
        type: closer.char === '~' ? 'del' : use === 2 ? 'strong' : 'em',
        children: mergeText(children),
      },
      prev: null,
      next: null,
    }
    opener.count -= use
    closer.count -= use

    // Link: [opener if any left] wrapped [closer if any left]
    const left: ListNode | null = opener.count > 0 ? openerNode : openerNode.prev
    const right: ListNode | null = closer.count > 0 ? closerNode : closerNode.next
    wrapped.prev = left
    wrapped.next = right
    if (left) left.next = wrapped
    else head = wrapped
    if (right) right.prev = wrapped

    // Re-examine the closer if it has delimiters left; otherwise continue after the new node.
    closerNode = right
  }

  const result: Inline[] = []
  for (let node = head; node; node = node.next) result.push(delimiterToText(node.token))
  return result
}

function delimiterToText(token: Token): Inline {
  return token.type === 'delimiter' ? { type: 'text', text: token.char.repeat(token.count) } : token
}

function mergeText(nodes: Inline[]): Inline[] {
  const merged: Inline[] = []
  for (const node of nodes) {
    const last = merged[merged.length - 1]
    if (node.type === 'text' && last?.type === 'text') last.text += node.text
    else if (node.type !== 'text' || node.text)
      merged.push(node.type === 'text' ? { ...node } : node)
  }
  return merged
}

/** Links cannot contain links; keep the inner link's text. */
function unwrapLinks(nodes: Inline[]): Inline[] {
  return nodes.flatMap(node => {
    if (node.type === 'link') return unwrapLinks(node.children)
    if (node.type === 'strong' || node.type === 'em' || node.type === 'del') {
      return [{ ...node, children: unwrapLinks(node.children) }]
    }
    return [node]
  })
}

function plainText(markdown: string): string {
  const parts: string[] = []
  const walk = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.type === 'text' || node.type === 'code') parts.push(node.text)
      else if (node.type === 'image') parts.push(node.alt)
      else if (node.type === 'break' || node.type === 'softbreak') parts.push(' ')
      else if ('children' in node) walk(node.children)
    }
  }
  walk(parseInline(markdown, MAX_DEPTH))
  return parts.join('')
}

interface ParsedLink {
  label: string
  destination: string
  attributes: Record<string, string>
  end: number
}

/** Parses `[label](destination "title"){attributes}` starting at the `[`. */
function parseLink(
  source: string,
  start: number,
  brackets: Map<number, number>,
): ParsedLink | null {
  const labelEnd = brackets.get(start) ?? -1
  if (labelEnd - start > MAX_LINK_LABEL) return null
  if (labelEnd < 0 || source[labelEnd + 1] !== '(') return null

  // Destination: <...> or a run without spaces and with balanced parentheses.
  let index = labelEnd + 2
  while (source[index] === ' ' || source[index] === '\n') index += 1
  let destination = ''
  if (source[index] === '<') {
    const close = source.indexOf('>', index)
    if (close < 0 || source.slice(index, close).includes('\n')) return null
    destination = source.slice(index + 1, close)
    index = close + 1
  } else {
    let parens = 0
    const begin = index
    while (index < source.length) {
      const char = source[index]
      if (char === '\\' && ASCII_PUNCTUATION.test(source[index + 1] ?? '')) {
        index += 2
        continue
      }
      if (/\s/.test(char)) break
      if (char === '(') parens += 1
      if (char === ')') {
        if (parens === 0) break
        parens -= 1
      }
      index += 1
    }
    destination = source.slice(begin, index).replace(/\\([!-/:-@[-`{-~])/g, '$1')
  }

  // Optional title.
  while (source[index] === ' ' || source[index] === '\n') index += 1
  const titleOpen = source[index]
  if (titleOpen === '"' || titleOpen === "'" || titleOpen === '(') {
    const titleClose = titleOpen === '(' ? ')' : titleOpen
    const close = source.indexOf(titleClose, index + 1)
    if (close < 0) return null
    index = close + 1
    while (source[index] === ' ' || source[index] === '\n') index += 1
  }
  if (source[index] !== ')') return null
  index += 1

  // Optional attribute block, for example {data-original-url="https://..."}.
  let attributes: Record<string, string> = {}
  const attributeBlock = /^[ \t]*\{([^}\n]*)\}/.exec(source.slice(index))
  if (attributeBlock) {
    const parsed = parseAttributes(attributeBlock[1])
    if (parsed) {
      attributes = parsed
      index += attributeBlock[0].length
    }
  }

  return {
    label: source.slice(start + 1, labelEnd),
    destination: decodeEntities(destination),
    attributes,
    end: index,
  }
}

const QUOTES = `"'\u201c\u201d\u2018\u2019`

/** Parses `name="value" other='value'`. Returns null if the block is not attributes. */
function parseAttributes(block: string): Record<string, string> | null {
  const attributes: Record<string, string> = {}
  const pattern = new RegExp(
    `([a-z][a-z0-9-]*)\\s*=\\s*[${QUOTES}]([^${QUOTES}]*)[${QUOTES}]`,
    'gi',
  )
  let matched = false
  for (const match of block.replace(/&quot;/g, '"').matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2])
    matched = true
  }
  return matched ? attributes : null
}

/**
 * `<WebSource data-url="...">Title</WebSource>`, or the malformed `<WebSource>https://...</WebSource>`.
 * Returns a link, or no node when the tag carries no usable URL.
 */
function parseWebSource(
  rest: string,
  depth: number,
): { node: Inline | null; length: number } | null {
  const match = /^<websource\b([^>]*)>([\s\S]*?)<\/websource>/i.exec(rest)
  if (!match) return null
  const attributes = parseAttributes(match[1]) ?? {}
  const body = match[2].trim()
  const url = attributes['data-url'] ?? (/^https?:\/\//i.test(body) ? body : '')
  if (!url) return { node: null, length: match[0].length }
  const label = url === body || !body ? url : body
  return {
    node: {
      type: 'link',
      destination: url,
      attributes: { 'data-url': url },
      children:
        depth < MAX_DEPTH
          ? unwrapLinks(parseInline(label, depth + 1))
          : [{ type: 'text', text: label }],
    },
    length: match[0].length,
  }
}
