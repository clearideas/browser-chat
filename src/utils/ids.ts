let counter = 0

/** A document-unique id (widgets rendered without Shadow DOM share the page's id space). */
export function uniqueId(prefix: string): string {
  counter += 1
  return `${prefix}-${counter}`
}
