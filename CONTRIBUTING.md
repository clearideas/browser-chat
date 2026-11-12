# Contributing

Use Node.js 22.22.3+ or 24.15+ and npm. Clone the repository, then run:

```sh
npm ci
npm run check
```

The checks lint and type-check source, run the test suite, build the package, and inspect a locally packed release. No test needs a Clear Ideas account, provider key, AWS credentials, or private npm token. The suite has three Vitest projects:

- `unit`: components and client logic with mocked HTTP (MSW).
- `server`: the [test server](server/README.md) and the protocol conformance suite over real HTTP (`npm run test:server`).
- `live`: the real widget component against the test server in jsdom (`npm run test:live`).

In the `unit` and `live` projects a test fails if the widget logs a `console.warn` or `console.error` the test did not declare with `expectConsole()` (`tests/helpers/console-guard.ts`), and routine `console.log` output is hidden, so a passing run prints only results. Tests of error paths declare the log they expect, which also verifies that it happens.

`npm test` runs the three projects one after another; several unit tests wait fixed amounts of time and become flaky when they share the machine with the other projects. `test:watch` and `test:coverage` use the `unit` project for the same reason.

## Scripts

| Script                      | What it does                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`               | Rebuilds the browser bundle on change (unminified, IIFE only, for speed), serves the repository on http://127.0.0.1:8000 and runs the test server on http://127.0.0.1:8787; open the index when it prints "Ready". A taken port is replaced by the next free one; choose with `npm run dev --pages-port=8100 --api-port=8788` (or `DEV_PAGES_PORT`, `DEV_API_PORT`). |
| `npm run server`            | Only the test server ([server/README.md](server/README.md)).                                                                                                                                                                                                                                                                                                         |
| `npm run build`             | Builds the bundles and type declarations into `dist/`.                                                                                                                                                                                                                                                                                                               |
| `npm run lint` / `lint:fix` | ESLint and Prettier (`lint:fix` applies fixes).                                                                                                                                                                                                                                                                                                                      |
| `npm run type-check`        | TypeScript and Vue type checks.                                                                                                                                                                                                                                                                                                                                      |
| `npm test`                  | `test:unit`, `test:server` and `test:live`, one after another.                                                                                                                                                                                                                                                                                                       |
| `npm run test:unit`         | Component and client tests with mocked HTTP.                                                                                                                                                                                                                                                                                                                         |
| `npm run test:server`       | The test server's tests and the protocol conformance suite.                                                                                                                                                                                                                                                                                                          |
| `npm run test:conformance`  | Only the conformance suite; set `CHAT_SERVER_URL` to check another server.                                                                                                                                                                                                                                                                                           |
| `npm run test:live`         | The widget component against the test server in jsdom.                                                                                                                                                                                                                                                                                                               |
| `npm run test:e2e`          | Builds, then runs the browser tests (Playwright, Chromium).                                                                                                                                                                                                                                                                                                          |
| `npm run test:watch`        | Unit tests in watch mode.                                                                                                                                                                                                                                                                                                                                            |
| `npm run test:coverage`     | Unit tests with a coverage report in `coverage/`.                                                                                                                                                                                                                                                                                                                    |
| `npm run check`             | Lint, type-check, tests, build and package check; CI runs this plus the browser tests.                                                                                                                                                                                                                                                                               |

`index.html` (served at `/`) links to every page: `dev.html`, the demo for trying the widget by hand (site, language, position and dark mode controls), and the browser-test pages in `tests/e2e/pages/` (languages, hidden launcher, style isolation, strict CSP). Each test page states what it checks and what you should see, and the browser tests load each one and fail on console errors.

Browser tests run separately with `npm run test:e2e` after installing Playwright Chromium (`npx playwright install chromium`); they build the widget and start their own static file server and test server on ports 8100 and 8797, so they can run while `npm run dev` is running (override with `E2E_PAGES_PORT` and `E2E_API_PORT`). If Playwright's browser download host is blocked but the npm registry is reachable (Linux x64), fetch Chromium from npm instead:

```sh
node scripts/chromium-from-npm.mjs   # prints the executable path
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npm run test:e2e
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` also works with any locally installed Chromium or Chrome.

Voice tests (`tests/e2e/voice.spec.ts`) run Chromium with a fake microphone that plays a tone (`--use-fake-device-for-media-stream` in `playwright.config.ts`), against the test server's voice sites. The recorded-voice reply audio is a committed fixture; regenerate it with `node scripts/generate-voice-fixture.mjs`.

The browser tests include keyboard and screen reader checks and an axe-core audit of each widget state (`tests/e2e/accessibility.spec.ts`). Keep new UI keyboard-operable and labelled; the audit fails on WCAG 2.1 A/AA violations such as insufficient contrast.

## Translations

Widget strings live in `src/i18n/locales/`, one file per language, with English (`en.ts`) defining the keys. To fix a translation, edit its file. To add a language:

1. Copy `en.ts` to a file named after the language tag (for example `sv.ts`), type it as `WidgetMessages` like the others, translate every string and keep `{name}` placeholders, and list it in `src/i18n/locales/index.ts`.
2. Add the language to `SERVER_LANGUAGES` and the messages in `server/i18n.ts`, and to the demo site's text in `server/sites.ts`.
3. Add it to the language links in `index.html`, and to the expected list in `tests/unit/i18n/locales.test.ts`.

The tests then check it: the unit tests fail on missing or extra keys, changed placeholders and strings left in English, and the browser tests visit the demo in every language and fail if any English string appears (`tests/e2e/languages.spec.ts`). Right-to-left languages need their primary language subtag in `RTL_LANGUAGES` (`src/i18n/resolve.ts`). Each language adds about 1 KB (gzipped) to the bundle.

The translations other than English are drafts that no native speaker has reviewed yet (French started from the earlier translation); a native speaker's review is the most useful contribution for them.

## Protocol changes

Changes to the client/server contract start in [`docs/protocol`](docs/protocol/README.md): update the specification, the test server and the conformance tests together.

Open a pull request against `main` with a description of the change and its validation. Add focused tests when changing behavior. Use fabricated data and placeholder widget keys in examples; keep `.env`, credentials, generated tarballs, and local service data out of commits.

Contributions are made under the repository's [MIT license](LICENSE). Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

Dependency versions and compatibility decisions are documented in [DEPENDENCIES.md](DEPENDENCIES.md).
