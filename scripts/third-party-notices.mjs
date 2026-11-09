import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

export function thirdPartyNotices(moduleIds) {
  const packages = new Map()
  for (const id of moduleIds) {
    if (!id.includes('/node_modules/')) continue
    let directory = dirname(id.split('?')[0])
    let manifest
    while (directory !== parse(directory).root) {
      if (existsSync(join(directory, 'package.json'))) {
        const candidate = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
        if (candidate.name) {
          manifest = candidate
          break
        }
      }
      directory = dirname(directory)
    }
    if (!manifest) continue
    const notices = readdirSync(directory).filter(name =>
      /^(?:licen[cs]e|copying|notice)(?:[._-]|$)/i.test(name),
    )
    if (notices.length === 0) throw new Error(`Missing bundled license notice for ${manifest.name}`)
    packages.set(
      manifest.name,
      `${manifest.name} ${manifest.version}\nLicense: ${manifest.license || 'See included notices'}\n\n${notices.map(name => readFileSync(join(directory, name), 'utf8')).join('\n\n')}`,
    )
  }
  if (packages.size === 0) throw new Error('No bundled third-party notices were found')
  return [...packages.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, text]) => text)
    .join('\n\n' + '='.repeat(72) + '\n\n')
}
