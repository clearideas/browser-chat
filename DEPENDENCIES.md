# Dependency maintenance

Dependencies were refreshed against the public npm registry on 2026-11-09. Runtime packages and development tools use their current stable releases, with two intentional compatibility constraints:

- TypeScript stays on the latest 6.0.x release (6.0.3). The current typescript-eslint parser supports TypeScript versions below 6.1; TypeScript 7 is outside that supported range. Upgrade the compiler after the parser adds support and all checks pass.
- `@types/node` follows the current Node.js 24 line (24.19.2), matching the release/build runtime instead of describing Node.js 26-only APIs.

The optional framework peer dependencies describe the versions tested/supported by this release; they are not private package dependencies. Optional Nuxt is not installed just to build the framework-neutral analytics core.

The `package-lock.json` committed on 2026-11-09 referenced 50 package versions (for example `vue@3.5.45`, `vite@8.3.7`, `jsdom@31.0.0`, `@playwright/test@1.65.0`) that the npm registry did not serve, so `npm ci` failed. Those entries now use the newest published release of each package (one patch release earlier, except `jsdom`, which moves from 31.0.0 to 30.1.3); the other lockfile entries are unchanged. Raise the ranges again once the newer releases are available.

`rolldown` is pinned to 1.2.15 through `overrides` because the registry serves 1.2.16 with only its Linux glibc native bindings; without the pin, installs on macOS, Windows and musl Linux have no rolldown binary and `vite build` fails. Remove the override when a later rolldown release publishes all platform bindings.

The `minimatch` override selects the patched 11.x release because upstream development tools still request affected 10.x versions. Chat also overrides `glob` to the patched 14.x release for its test tooling. The overrides currently resolve to `minimatch@11.0.4` and `glob@14.0.3` because 11.0.5 and 14.0.4 were not available; confirm with `npm audit` that these releases include the fixes. Review/remove these overrides when upstream ranges include the fixes. Do not use `npm audit fix --force` to downgrade the toolchain.

The widget has no runtime dependencies besides Vue, which is bundled. Markdown rendering, tooltips and sanitization are implemented in the package (`src/utils/markdown.ts`, `src/components/MarkdownContent.ts`, `src/utils/safe.ts`) instead of `markdown-it`, `highlight.js`, `dompurify` and `tippy.js`, which kept the browser bundle small and removed HTML-string rendering of untrusted content. Add a runtime dependency only when it is worth its size in every page that embeds the widget.

`axe-core` is a development dependency used by the browser tests (`tests/e2e/accessibility.spec.ts`) to check the widget against WCAG 2.1 A/AA rules; it is not part of the package.

The test server (`server/`) and the conformance suite use only Node.js built-ins and add no packages. The server runs TypeScript directly with Node's type stripping, so its code uses only erasable TypeScript syntax (no enums, namespaces or parameter properties) and imports with `.ts` extensions; `tsconfig.json` enables `allowImportingTsExtensions` for that.

Run `npm outdated`, `npm audit`, and `npm run check` after changes. Browser Chat additionally runs `npm run test:e2e`. Changes to bundled dependencies must regenerate `dist/THIRD_PARTY_NOTICES.txt`; `check:package` requires the notices in its tarball.
