import { createRequire } from 'node:module'

import type { Page } from '@playwright/test'

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js')

/** Runs axe-core (WCAG 2.1 A/AA rules) on the widget, including its shadow root. */
export async function axeViolations(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: axePath })
  return page.evaluate(async () => {
    const host = document.querySelector('[data-clearideas-widget-host]')!
    const results = await (window as any).axe.run(host, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      resultTypes: ['violations'],
    })
    return results.violations.map(
      (violation: any) =>
        `${violation.id} (${violation.impact}): ${violation.help} -> ${violation.nodes
          .map((node: any) => node.target.join(' '))
          .join(', ')}`,
    )
  })
}
