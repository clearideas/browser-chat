import { describe, expect, it } from 'vitest'

import { formatMessage } from '@/utils/markdown'

import { mockMarkdownContent } from '../../fixtures/mock-data'

describe('formatMessage', () => {
  it('formats simple text', () => {
    const result = formatMessage(mockMarkdownContent.simple)
    expect(result).toContain('This is simple text')
  })

  it('formats markdown links with data-original-url', () => {
    const result = formatMessage(mockMarkdownContent.withLinks)
    expect(result).toContain('data-original-url')
    expect(result).toContain('chat-source')
    expect(result).toContain('example.com')
  })

  it('formats inline code', () => {
    const result = formatMessage(mockMarkdownContent.withCode)
    expect(result).toContain('<code>')
  })

  it('formats code blocks', () => {
    const result = formatMessage(mockMarkdownContent.withCodeBlock)
    expect(result).toContain('<pre')
    expect(result).toContain('<code>')
  })

  it('formats lists', () => {
    const result = formatMessage(mockMarkdownContent.withLists)
    expect(result).toContain('<ul>')
    expect(result).toContain('<li>')
  })

  it('formats tables', () => {
    const result = formatMessage(mockMarkdownContent.withTable)
    expect(result).toContain('<table>')
    expect(result).toContain('<th>')
  })

  it('handles multiple source links', () => {
    const result = formatMessage(mockMarkdownContent.withSourceLinks)
    const sourceCount = (result.match(/data-original-url/g) || []).length
    expect(sourceCount).toBe(2)
    expect(result).toContain('example.com')
    expect(result).toContain('another.com')
  })

  it('sanitizes HTML to prevent XSS', () => {
    const malicious = '<script>alert("xss")</script>Hello'
    const result = formatMessage(malicious)
    expect(result).not.toContain('<script>')
  })

  it('strips chunkId tags', () => {
    const content = 'Hello <chunkId>12345</chunkId> World'
    const result = formatMessage(content)
    expect(result).not.toContain('chunkId')
    expect(result).not.toContain('12345')
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })

  it('handles empty string', () => {
    expect(formatMessage('')).toBe('')
  })

  it('handles null/undefined gracefully', () => {
    expect(formatMessage(null as any)).toBe('')
    expect(formatMessage(undefined as any)).toBe('')
  })

  it('preserves chat-source class on links with data-original-url', () => {
    const content = '[example.com](https://example.com){data-original-url="https://example.com"}'
    const result = formatMessage(content)
    expect(result).toContain('chat-source')
    expect(result).toContain('data-original-url')
  })
})
