// Minimal JSON Schema (2020-12 subset) validator, so conformance tests check server output
// against docs/protocol/stream-events.schema.json itself without adding a dependency.
//
// Supported keywords: $ref (local), type, const, enum, required, properties, items, oneOf, anyOf,
// allOf, minimum, minLength. Annotation keywords (description, title, contentEncoding, ...) are
// ignored. Unsupported validation keywords fail loudly so the subset cannot silently drift.

import { readFileSync } from 'node:fs'

type Schema = Record<string, any> | boolean

const ANNOTATIONS = new Set([
  '$schema',
  '$id',
  '$defs',
  'title',
  'description',
  'contentEncoding',
  'default',
  'examples',
  'deprecated',
])
const SUPPORTED = new Set([
  '$ref',
  'type',
  'const',
  'enum',
  'required',
  'properties',
  'items',
  'oneOf',
  'anyOf',
  'allOf',
  'minimum',
  'minLength',
])

export function loadProtocolSchema(fileName: string): Record<string, any> {
  const url = new URL(`../../../docs/protocol/${fileName}`, import.meta.url)
  return JSON.parse(readFileSync(url, 'utf8'))
}

function typeOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number'
  return typeof value
}

function matchesType(value: unknown, type: string): boolean {
  const actual = typeOf(value)
  return actual === type || (type === 'number' && actual === 'integer')
}

/** Returns a list of error messages; empty means valid. */
export function validate(root: Record<string, any>, value: unknown): string[] {
  const errors: string[] = []

  function resolveRef(ref: string): Schema {
    if (!ref.startsWith('#/')) throw new Error(`Only local $ref is supported: ${ref}`)
    return ref
      .slice(2)
      .split('/')
      .reduce((node: any, key) => {
        if (node === undefined || !(key in node)) throw new Error(`Unresolved $ref ${ref}`)
        return node[key]
      }, root)
  }

  function check(schema: Schema, data: unknown, path: string, out: string[]): void {
    if (schema === true) return
    if (schema === false) {
      out.push(`${path}: not allowed`)
      return
    }
    for (const keyword of Object.keys(schema)) {
      if (!SUPPORTED.has(keyword) && !ANNOTATIONS.has(keyword)) {
        throw new Error(`Schema keyword "${keyword}" is not supported by the test validator`)
      }
    }
    if (schema.$ref) check(resolveRef(schema.$ref), data, path, out)
    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type]
      if (!types.some((type: string) => matchesType(data, type))) {
        out.push(`${path}: expected ${types.join('|')}, got ${typeOf(data)}`)
        return
      }
    }
    if ('const' in schema && data !== schema.const) {
      out.push(`${path}: expected ${JSON.stringify(schema.const)}`)
    }
    if (schema.enum && !schema.enum.includes(data)) {
      out.push(`${path}: expected one of ${JSON.stringify(schema.enum)}`)
    }
    if (typeof data === 'number' && schema.minimum !== undefined && data < schema.minimum) {
      out.push(`${path}: below minimum ${schema.minimum}`)
    }
    if (
      typeof data === 'string' &&
      schema.minLength !== undefined &&
      data.length < schema.minLength
    ) {
      out.push(`${path}: shorter than ${schema.minLength}`)
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const record = data as Record<string, unknown>
      for (const key of schema.required ?? []) {
        if (!(key in record)) out.push(`${path}: missing "${key}"`)
      }
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        if (key in record) check(child as Schema, record[key], `${path}.${key}`, out)
      }
    }
    if (Array.isArray(data) && schema.items) {
      data.forEach((item, index) => check(schema.items, item, `${path}[${index}]`, out))
    }
    for (const sub of schema.allOf ?? []) check(sub, data, path, out)
    if (schema.anyOf) {
      const ok = schema.anyOf.some((sub: Schema) => {
        const subErrors: string[] = []
        check(sub, data, path, subErrors)
        return subErrors.length === 0
      })
      if (!ok) out.push(`${path}: does not match anyOf`)
    }
    if (schema.oneOf) {
      const results = schema.oneOf.map((sub: Schema) => {
        const subErrors: string[] = []
        check(sub, data, path, subErrors)
        return subErrors
      })
      const matches = results.filter((result: string[]) => result.length === 0).length
      if (matches !== 1) {
        const detail = matches === 0 ? 'matches none' : `matches ${matches}`
        out.push(`${path}: oneOf ${detail}`)
      }
    }
  }

  check(root, value, '$', errors)
  return errors
}
