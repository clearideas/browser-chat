import DOMPurify from 'dompurify'
// Use core highlight.js instead of full build to reduce bundle size
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
// Register only commonly used languages to keep bundle small
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
import MarkdownIt from 'markdown-it'

// Register languages
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', html)
hljs.registerLanguage('xml', html)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)

// Initialize markdown renderer
const md = MarkdownIt({
  html: true,
  linkify: false,
  typographer: true,
  highlight: function (str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre class="hljs"><code>${
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
        }</code></pre>`
      } catch {}
    }
    // Fallback: escape HTML if language not supported
    return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`
  },
})

// Note: We don't use markdown-it-attrs anymore - we handle attributes in post-processing
// This is more reliable since markdown-it-attrs was spotty with link attributes

/**
 * Extracts all data-* attributes from an HTML attributes string
 */
function extractDataAttributes(attrsString: string): Record<string, string> {
  const result: Record<string, string> = {}
  const dataAttrRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']*)["']/g
  let match

  while ((match = dataAttrRegex.exec(attrsString)) !== null) {
    const attrName = 'data-' + match[1]
    const attrValue = match[2]
    result[attrName] = attrValue
  }

  return result
}

/**
 * Transforms file links to clickable chat-source spans with data attributes
 */
function transformSources(html: string): string {
  // First, transform file links matching the pattern
  const linkRegex = new RegExp(
    `<a\\s+([^>]*?)href=["']([^"']*\/)?site\/([^/?#"']+)\/file\/([^?#"']+)(?:[?#][^"']*)?["']([^>]*?)>(.*?)</a>`,
    'g',
  )

  let transformed = html.replace(
    linkRegex,
    (match, attrsBefore, urlPrefix, siteId, fileIdWithQuery, attrsAfter, innerHTML) => {
      return transformLinkToSource(attrsBefore, siteId, fileIdWithQuery, attrsAfter, innerHTML)
    },
  )

  // Also handle links with data-original-url or data-url that might not match the file pattern
  // Add chat-source class to any <a> tag that has data-original-url
  // Add web-source class to any <a> tag that has data-url (WebSource links)
  // Updated regex to handle optional whitespace and ensure we capture all attributes
  const dataUrlRegex = /<a(\s+[^>]*?)>/g
  transformed = transformed.replace(dataUrlRegex, (match, attrs) => {
    // Trim leading whitespace from attrs for easier processing
    const attrsTrimmed = attrs.trim()

    // Check if this link has data-url attribute (WebSource links)
    if (attrsTrimmed.includes('data-url=') && !attrsTrimmed.includes('data-original-url=')) {
      // Extract existing class if any (handle both quote types and various spacing)
      const classMatch = attrsTrimmed.match(/class\s*=\s*["']([^"']*)["']/)

      let newAttrs = attrs
      let updatedClass = false

      if (classMatch) {
        // Check if web-source is already in the class list
        const existingClasses = classMatch[1].trim()
        if (!existingClasses.includes('web-source')) {
          // Add web-source to existing classes, preserving the original quote style
          const quote = classMatch[0].includes("'") ? "'" : '"'
          newAttrs = newAttrs.replace(
            /class\s*=\s*["']([^"']*)["']/,
            `class=${quote}${existingClasses} web-source${quote}`,
          )
          updatedClass = true
        }
      } else {
        // No class attribute exists, add one with web-source
        newAttrs = `${newAttrs} class="web-source"`
        updatedClass = true
      }

      // Ensure target and rel are set for external links
      if (!attrsTrimmed.includes('target=')) {
        newAttrs = `${newAttrs} target="_blank"`
      }
      if (!attrsTrimmed.includes('rel=')) {
        newAttrs = `${newAttrs} rel="noopener noreferrer"`
      }

      return updatedClass || newAttrs !== attrs ? `<a${newAttrs}>` : match
    }

    // Check if this link has data-original-url attribute
    if (attrsTrimmed.includes('data-original-url')) {
      // Extract existing class if any (handle both quote types and various spacing)
      const classMatch = attrsTrimmed.match(/class\s*=\s*["']([^"']*)["']/)

      if (classMatch) {
        // Check if chat-source is already in the class list
        const existingClasses = classMatch[1].trim()
        if (!existingClasses.includes('chat-source')) {
          // Add chat-source to existing classes, preserving the original quote style
          const quote = classMatch[0].includes("'") ? "'" : '"'
          return match.replace(
            /class\s*=\s*["']([^"']*)["']/,
            `class=${quote}${existingClasses} chat-source${quote}`,
          )
        }
        // If chat-source already exists, return unchanged
      } else {
        // No class attribute exists, add one with chat-source
        return `<a${attrs} class="chat-source">`
      }
    }
    return match
  })

  return transformed
}

function transformLinkToSource(
  attrsBefore: string,
  siteId: string,
  fileIdWithQuery: string,
  attrsAfter: string,
  innerHTML: string,
): string {
  const fileId = fileIdWithQuery.split('?')[0].split('#')[0]
  const linkText = innerHTML.trim()
  const navigateParam = JSON.stringify({
    id: fileId,
    site: siteId,
    kind: 'file',
  })

  const allAttrs = attrsBefore + ' ' + attrsAfter
  const originalDataAttrs = extractDataAttributes(allAttrs)
  const originalUrl = originalDataAttrs['data-original-url'] || ''
  let tooltipText = linkText

  if (originalUrl) {
    try {
      const urlObj = new URL(originalUrl)
      tooltipText = urlObj.hostname.replace(/^www\./, '')
    } catch {
      tooltipText = linkText
    }
  }

  const icon = 'fa-file'
  const finalDataAttrs: Record<string, string> = {
    'data-navigate-param': navigateParam,
    'data-tippy-content': `<div class="source-chip"><div class="svg-icon"><svg><use xlink:href="/assets/sprites/sharp-light.svg#${icon}"></use></svg></div><div>${tooltipText}</div></div>`,
  }

  // Preserve data-original-url if it exists (for external links)
  if (originalUrl) {
    finalDataAttrs['data-original-url'] = originalUrl
  }

  const dataAttrsString = Object.entries(finalDataAttrs)
    .map(([key, value]) => `${key}='${value}'`)
    .join(' ')

  return `<span class="chat-source" ${dataAttrsString}>${linkText}</span>`
}

/**
 * Post-processes rendered HTML to extract and attach attributes that appear after links
 * Markdown-it will convert [text](url){data-original-url="..."} to <a>text</a>{data-original-url="..."}
 * This function finds all <a> tags and checks if there are {attribute} blocks immediately after them,
 * then extracts and injects those attributes into the <a> tag.
 *
 * Pattern: <a>content</a>{data-original-url="..."} -> <a data-original-url="...">content</a>
 * Also handles multiple attributes: <a>content</a>{data-original-url="..." data-other="value"}
 */
function postprocessLinkAttributes(html: string): string {
  // Pattern to match: <a>content</a>{attributes...}
  // Matches any <a> tag followed by optional whitespace and then { followed by attributes
  // The attributes block can contain multiple attributes like {data-original-url="..." data-other="value"}
  // Uses [\s\S]*? to match any content including newlines (non-greedy)
  // (\s*) captures any whitespace between </a> and {, which we'll remove along with the {attributes} block
  const pattern = /(<a\s+[^>]*>)([\s\S]*?)(<\/a>)(\s*)\{([^}]+)\}/g

  const result = html.replace(
    pattern,
    (match, openTag, linkContent, closeTag, whitespace, attributesBlock) => {
      // Decode HTML entities in the attributes block (e.g., &quot; -> ")
      // This is necessary because markdown-it may escape quotes in the attributes block
      const decodedBlock = attributesBlock
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#x22;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')

      // Parse the attributes block: data-original-url="..." data-other="value"
      // Extract all attribute=value pairs
      // IMPORTANT: Handle both straight quotes ("') and curly quotes ("")
      // Curly quotes: " (U+201C=8220) and " (U+201D=8221), ' (U+2018=8216) and ' (U+2019=8217)
      // Pattern matches: attrName="value" or attrName='value' or attrName="value" etc.
      // We capture the value between any quote type (straight or curly)
      const attrPattern =
        /(\w+(?:-\w+)*)=(["'\u201C\u201D\u2018\u2019])([^"'\u201C\u201D\u2018\u2019]+)(["'\u201C\u201D\u2018\u2019])/g
      const attributes: Array<{ name: string; value: string }> = []
      let attrMatch

      // Reset regex lastIndex to ensure we start from the beginning
      attrPattern.lastIndex = 0

      while ((attrMatch = attrPattern.exec(decodedBlock)) !== null) {
        const attrName = attrMatch[1]
        const attrValue = attrMatch[3]

        // Skip if the link already has this attribute
        if (!openTag.includes(`${attrName}=`)) {
          attributes.push({ name: attrName, value: attrValue })
        }
      }

      // Inject all attributes into the opening tag
      let newOpenTag = openTag
      for (const attr of attributes) {
        newOpenTag = newOpenTag.replace(/>$/, ` ${attr.name}="${attr.value}">`)
      }

      // Always return the cleaned link tag (with or without new attributes)
      // This removes the trailing {attributes} block and whitespace, even if all attributes already existed
      return newOpenTag + linkContent + closeTag
    },
  )

  return result
}

/**
 * Decodes HTML entities in a string (e.g., &quot; -> ", &amp; -> &)
 * Uses a temporary DOM element to decode entities safely
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

/**
 * Escapes a string for safe use in HTML attribute values
 * Escapes: &, ", <, >
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Extracts the domain from a URL
 * @param url The URL to extract the domain from
 * @returns The domain (e.g., "example.com") or "source" if extraction fails
 */
function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname.replace(/^www\./, '') // Remove www. prefix if present
  } catch {
    // If URL parsing fails, try to extract domain manually
    const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)
    return match ? match[1] : 'source'
  }
}

/**
 * Escapes a URL for safe use in markdown link targets.
 * URLs with parentheses, spaces, or other special characters need to be encoded
 * or wrapped in angle brackets to prevent markdown parsing errors.
 *
 * @param url The URL to escape
 * @returns Escaped URL safe for markdown link target
 */
function escapeMarkdownUrl(url: string): string {
  // Encode the URL to handle special characters like parentheses, spaces, etc.
  // This ensures markdown parsers can correctly parse the link
  try {
    return encodeURI(url)
  } catch {
    // If encoding fails, return as-is (fallback)
    return url
  }
}

/**
 * Normalizes WebSource tags in text by converting them to markdown links with data-url attributes.
 * WebSource links use data-url (not data-original-url) to distinguish them from other source citations.
 * Handles both correct format (<WebSource data-url="url">Title</WebSource>) and HTML-escaped versions
 * (&lt;WebSource data-url=&quot;url&quot;&gt;Title&lt;/WebSource&gt;).
 *
 * @param text The text containing WebSource tags (may be HTML-escaped)
 * @returns Text with WebSource tags converted to markdown links
 */
function normalizeWebSourceTags(text: string): string {
  if (!text) return text

  // First, decode HTML entities to handle escaped WebSource tags
  // This converts &lt;WebSource&gt; back to <WebSource>
  const decodedText = decodeHtmlEntities(text)
  let processed = decodedText

  // Process correct format: <WebSource data-url="url">Name</WebSource>
  // Pattern matches: <WebSource data-url="...">text</WebSource> or <WebSource data-url='...'>text</WebSource>
  // Capture optional character before tag to check if we need to add space
  const webSourcePattern =
    /(.)?<WebSource\s+data-url=["']([^"']+)["'][^>]*>([\s\S]*?)<\/WebSource>/gi
  processed = processed.replace(webSourcePattern, (match, precedingChar, url, sourceName) => {
    // Extract URL and source name
    const cleanUrl = url.trim()
    const cleanName = sourceName.trim() || extractDomainFromUrl(cleanUrl)

    // Escape URL for markdown link target (handles special characters like parentheses, spaces, etc.)
    const escapedMarkdownUrl = escapeMarkdownUrl(cleanUrl)
    // Escape URL for safe use in HTML attribute value
    const escapedAttributeUrl = escapeHtmlAttribute(cleanUrl)

    // Ensure there's whitespace before the link to prevent markdown parsing issues
    // (e.g., ![...] would be parsed as image, but ! [...] is safe)
    // If precedingChar is undefined (start of string) or whitespace, no space needed
    const needsSpace = precedingChar && !/\s/.test(precedingChar)
    const spacePrefix = needsSpace ? ' ' : ''
    const charPrefix = precedingChar || ''

    // Create markdown link with data-url attribute (WebSource links use data-url, not data-original-url)
    return `${charPrefix}${spacePrefix}[${cleanName}](${escapedMarkdownUrl}){data-url="${escapedAttributeUrl}"}`
  })

  // Fallback: Handle incorrect formats like <websource>url</websource> or <WebSource>url</WebSource>
  // Try to extract URL and convert to proper format
  // Capture optional character before tag to check if we need to add space
  const incorrectWebSourcePattern = /(.)?<[Ww]eb[Ss]ource[^>]*>([\s\S]*?)<\/[Ww]eb[Ss]ource>/gi
  processed = processed.replace(incorrectWebSourcePattern, (match, precedingChar, content) => {
    // Skip if already processed by correct pattern (check if it has data-url attribute)
    if (match.includes('data-url=')) {
      return match // Already processed, skip
    }
    const trimmedContent = content.trim()
    // Check if content looks like a URL
    if (trimmedContent.match(/^https?:\/\//i)) {
      // It's a URL, use domain as title
      const domain = extractDomainFromUrl(trimmedContent)
      const escapedMarkdownUrl = escapeMarkdownUrl(trimmedContent)
      const escapedAttributeUrl = escapeHtmlAttribute(trimmedContent)
      const needsSpace = precedingChar && !/\s/.test(precedingChar)
      const spacePrefix = needsSpace ? ' ' : ''
      const charPrefix = precedingChar || ''
      return `${charPrefix}${spacePrefix}[${domain}](${escapedMarkdownUrl}){data-url="${escapedAttributeUrl}"}`
    }
    // If it doesn't look like a URL, try to find URL in attributes or skip
    // Look for data-url attribute even in malformed tags
    const urlMatch = match.match(/data-url=["']([^"']+)["']/i)
    if (urlMatch) {
      const url = urlMatch[1]
      const domain = extractDomainFromUrl(url)
      const escapedMarkdownUrl = escapeMarkdownUrl(url)
      const escapedAttributeUrl = escapeHtmlAttribute(url)
      const needsSpace = precedingChar && !/\s/.test(precedingChar)
      const spacePrefix = needsSpace ? ' ' : ''
      const charPrefix = precedingChar || ''
      return `${charPrefix}${spacePrefix}[${domain}](${escapedMarkdownUrl}){data-url="${escapedAttributeUrl}"}`
    }
    // If we can't extract a URL, remove the tag but preserve preceding character
    return precedingChar || ''
  })

  return processed
}

/**
 * Strip chunkId tags and their content from the text
 * This prevents chunkId markers from appearing in the rendered output
 */
function stripChunkIdTags(content: string): string {
  // Remove <chunkId>...</chunkId> tags (case-insensitive) and their content
  // Uses [\s\S] instead of . to match newlines across multiple lines
  // Also handles self-closing tags like <chunkId/>
  return content
    .replace(/<chunkid[^>]*>[\s\S]*?<\/chunkid>/gi, '')
    .replace(/<chunkid[^>]*\/\s*>/gi, '')
}

/**
 * Format message content as markdown
 */
export function formatMessage(content: string): string {
  if (!content) return ''
  try {
    // Strip chunkId tags before processing to prevent their content from appearing
    const cleanedContent = stripChunkIdTags(content)

    // Normalize WebSource tags (convert <WebSource> tags to markdown links)
    // This must happen before markdown-it processes the content
    const contentWithNormalizedWebSources = normalizeWebSourceTags(cleanedContent)

    // Render markdown - markdown-it will convert links but leave attributes as plain text after them
    // Example: [text](url){data-original-url="..."} becomes <a>text</a>{data-original-url="..."}
    const rendered = md.render(contentWithNormalizedWebSources)

    // Post-process to extract attributes from {attribute} blocks after links and inject them into <a> tags
    const postProcessed = postprocessLinkAttributes(rendered)

    // Transform file links to chat-source spans and add chat-source class to links with data-original-url
    const transformed = transformSources(postProcessed)

    // Sanitize HTML
    return DOMPurify.sanitize(transformed, {
      ADD_TAGS: ['span'],
      ADD_ATTR: [
        'class',
        'data-navigate-param',
        'data-tippy-content',
        'data-original-url',
        'data-url',
        'target',
        'rel',
      ],
    })
  } catch (error) {
    console.error('[formatMessage] Error processing markdown:', error)
    const cleanedContent = stripChunkIdTags(content)
    return DOMPurify.sanitize(cleanedContent.replace(/\n/g, '<br>'))
  }
}
