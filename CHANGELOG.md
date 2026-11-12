# Changelog

## Unreleased

### Security

- Message content is rendered with a new built-in Markdown renderer that creates elements directly instead of parsing HTML, so server or model output cannot inject markup or script. Raw HTML is shown as text, images are shown as links instead of being loaded (preventing data exfiltration through image URLs), and only absolute `http:`, `https:` and `mailto:` links are clickable.
- Fixed script injection through citation tooltips (`data-tippy-content` rendered with `allowHTML`) and through the hello bubble icon (`iconUrl` interpolated into HTML).
- Links from server configuration, `setActions()` and citations open only `http(s)` URLs, in a new tab with `noopener,noreferrer`.
- Server configuration is validated before use: icon and link URLs must be `http(s)`, colors must be hex or `rgb()`, and invalid values fall back to defaults.
- Visitor messages are shown as plain text.
- Browser storage is namespaced by API base URL and access key, so a session ID or cached configuration is never sent to or shown for another server or site. Values stored by 0.1.x are adopted once.
- Chat IDs are percent-encoded in request paths.

### Changed

- Development scripts consolidated. `npm run dev` starts the watch build, a page server and the test server together. A small Node.js static server (`scripts/serve-static.mjs`) replaces Python for local pages and the browser tests. Removed `test:serve`, `test:serve:static` and `test:ui` (and the `@vitest/ui` dependency); added `test:unit`; `test:watch` and `test:coverage` use the unit project, and `test:coverage` no longer starts watch mode. Browser-test pages moved to `tests/e2e/pages/`, and `test-source.html` and `test-entry.js` were removed. See the scripts table in `CONTRIBUTING.md`.
- `npm run dev` no longer fails when a port is taken (for example 8787 by another program or an earlier run): it uses the next free port, says which program seems to hold the port, and tells the pages the test server's address (`/dev-config.js`). `npm run dev --pages-port=8100 --api-port=8788` chooses ports in any shell, and it prints where each port came from and, for a port that cannot be used, which program holds it or whether Windows reserves it. It prints "Ready" when the bundle is built, and builds only the unminified browser bundle, so it is ready in seconds and rebuilds in about one. The browser tests use their own ports (8100 and 8797) and always start fresh servers.
- The development server has an index page at `/` (`index.html`) that shows whether the bundle is built and the test server is running, and links to the demo (in each language) and the test pages.
- Development pages reworked: every page has a Dark mode switch (shared by all of them, defaulting to the system preference) that restyles the page and that the widget follows; `dev.html` has controls for site, language and position, and keeps the language when switching site (it was dropped). Each browser-test page now explains what it checks and what you should see, and works by hand against the test server instead of a fake API: `hit-test.html` became `hidden-launcher.html` (a site that opens the chat from its own button) and `locale-test.html` became `languages.html`. `remote.html` was removed: it loaded the production CDN build with a placeholder key against a fake API, so it could not work; its dark mode switch moved to `dev.html`.
- The test server's demo assistant is called Ada (it was "Demo Assistant", which read as English in every language).
- A page without `<html lang>` gets the widget in the browser's language; it was always English.
- If the server refuses the widget (`401` or `403` on `/init`: unknown key, chat disabled for the site, or origin not allowed), the launcher is hidden and a console warning says why. Previously a grey launcher stayed on the page and did nothing when clicked.
- Error messages: when a failed response has no `message`, visitors see a localized message instead of HTTP details such as "HTTP 502: Bad Gateway". Voice errors are localized (microphone denied or missing, recording failed, voice unavailable) instead of showing browser or provider text such as "Timed out connecting voice relay"; details go to the console.
- The widget's wrapper elements are now `<clearideas-widget>` (the default container, still with the id `clearideas-widget-container`) and `<clearideas-widget-host>`, both `display: contents`, instead of `<div>`s, so page rules for `div` can no longer give them borders or spacing.
- `window.__ClearIdeasWidgetLocaleDebug` was removed; the widget's root element carries `lang` and `dir` instead.
- "Clear Ideas" is now marked ® (it was ™) in the voice assistant name, the "Powered by" label and the package description.
- The widget renders in an open shadow root: page CSS no longer changes it, its CSS no longer affects the page, and it uses its own typography (overridable with `--ci-widget-font-family`). Loading the bundle no longer adds anything to the page's `<head>`; styles are applied with constructable stylesheets, so the widget works under a Content-Security-Policy without `'unsafe-inline'` styles. `shadowDom: false` (or `data-shadow-dom="false"`) restores rendering in the page DOM.
- All accent-colored elements follow the site color. Previously the send and recording buttons, input focus border, typing indicator and link chevrons stayed Clear Ideas orange. Text and icons on the accent switch between white and near-black for contrast, and links and citations use a shade of the accent that is readable on the message background. A page can set a default accent with `--ci-widget-accent`.
- The default orange accent now shows near-black text and icons (white on `#ED613F` is below the WCAG 4.5:1 contrast for normal text).
- Using the `.vue` component directly requires importing `@clearideas/chat/style.css` (the bundles no longer inject styles into the document).
- Runtime dependencies removed: `markdown-it`, `highlight.js`, `dompurify` and `tippy.js` (with `@popperjs/core`). Code blocks are no longer syntax-highlighted (no highlighting theme was shipped, so colors were never shown). Tooltips are CSS-only.
- Each JavaScript bundle now includes the widget styles; linking `clearideas-widget.css` is optional. The browser bundle is a single 266 KB file (82 KB gzipped, of which about 13 KB are the 13 languages), down from 390 KB plus a 48 KB stylesheet (145 KB gzipped).
- Network failures show one message in every browser ("Couldn't reach the chat service…") instead of a developer-oriented CORS message that appeared only in Chrome.
- Routine `console.log` output was removed. Warnings and errors are logged in production builds, and `window.__ClearIdeasWidgetDebug = true` enables debug logging (previously stripped from builds).
- Recorded voice on Safari is sent as `format: "m4a"` (it was mislabeled `webm`).

### Fixed

- Ending voice while the microphone permission prompt is open now releases the microphone and stops; previously the microphone stayed on and a realtime session was still requested (or recording started after "Cancel"). A recording cancelled after stopping is no longer sent, and cancelling no longer reports "No audio recorded".
- Overlapping configuration (`/init`) and session requests: a newer request aborts and supersedes an older one, so a late response (for example after switching locale twice) no longer overwrites newer settings, greetings or session IDs.
- Each `init()` returns an independent widget: `destroy()` affects only its own widget (previously it could destroy a newer one), widgets in different containers coexist, and each widget has its own locale. Calling `init()` again for the same container still replaces that widget. Widgets release their page listeners, timers and audio context when destroyed.
- The text box is no longer disabled while a reply loads, which moved keyboard focus to the page after every message.
- Auto-initialization from `data-clearideas-widget` now also works when the script loads after `DOMContentLoaded` (for example with `async`).
- `init()` options such as `container` were passed to the component and rendered as HTML attributes.
- Destroying the widget while it was loading left its configuration requests running.
- The home header colors did not update when the accent color changed.
- Clicking a citation could open it many times (a click listener was added on every streamed chunk).
- A failure while handling one stream event (for example invalid audio data) is logged and skipped instead of aborting the rest of that event and being reported as a parse error.
- Long unbroken text in server configuration no longer pushes the close button out of view.
- The `.vue` source no longer throws a `ReferenceError` in builds that do not define `__VITE_API_BASE_URL__`.
- Dark mode: the widget never followed the site's theme mode (`style.mode`), the page's dark theme or the system preference, because the absent `darkMode` option was read as `false`; only `darkMode: true` or `setDarkMode()` worked. It now follows them, live: switching the page theme (`class="dark"`/`"light"`, `data-theme`, `data-bs-theme` or `data-color-scheme` on `<html>` or `<body>`) or the system preference updates an open widget, and a site without a `style.mode` follows the system preference as the protocol's default `system` says. A `darkMode` function is read again whenever those change.
- A reply that stalled (no data from the server) kept the widget "typing" forever with sending disabled, and the only way out, closing the panel, silently cancelled the reply. Replies now time out after 120 seconds without data (`replyTimeoutMs`) with an error, and closing the panel (including Escape) no longer cancels a reply: it continues and is there when the panel reopens.
- Recorded voice replies kept showing "Pause audio" and never finished playing when the complete audio arrived before the browser's MediaSource had opened (typical on fast connections): the progressive stream was never ended. It is now ended once every chunk is appended.
- Microphone problems during a voice call (access denied, no microphone) were not shown: the message went to the chat view, which the voice screen hides. The voice screen now shows and announces it, and no longer offers recorded voice in that case (it would fail the same way).
- On a site with recorded voice only, the microphone button showed a failed realtime call first ("Realtime voice disabled for site"). A `403` from `POST /public/chat/realtime/session` now starts recording directly (protocol README §11).
- The hint and timer on the voice screen are darker, meeting the WCAG AA 4.5:1 contrast for small text.
- A message that fails before the reply starts is withdrawn as before, but its text is now put back in the input for a retry; it was lost.
- Sites with a hello bubble no longer log two "AudioContext was not allowed to start" warnings on every page load: the bubble sound plays only after the visitor has interacted with the page, as browsers require.
- English text that was not translatable: "Chat with …", the default chat title and description, "Hi there" (French showed "Bonjour there"), the default assistant name, the voice screen's labels, and the label of an image without a description.
- French strings have accents and French spacing ("Démarrer", "Écoute", "clé", "Propulsé par"); they had none.
- The send and recording buttons' tooltips were cut off by the input box; they show in full, and stay inside the panel in right-to-left languages.

### Added

- Languages: Spanish, German, Italian, Portuguese, Dutch, Polish, Japanese, Korean, Chinese (Simplified and Traditional) and Arabic, besides English and French. Regional tags use their language (`fr-CA` → French), Chinese follows the script (`zh-TW` → Traditional), and other languages fall back to English. These translations are drafts that native speakers have not reviewed yet.
- Right-to-left layout for Arabic (and other right-to-left languages): the panel mirrors, arrows point the other way, and text from the server or the visitor takes its direction from its content, so English and Arabic each read correctly in either widget. Code blocks stay left to right. The widget root has `lang` and `dir` attributes.
- `messages` option and `setMessages()`: override built-in strings or add a language; missing strings fall back to the built-in language, then English. `BUILT_IN_LOCALES` (also `ClearIdeasWidget.BUILT_IN_LOCALES`) lists the built-in languages. Types `WidgetMessages`, `WidgetMessageOverrides` and `WidgetMessagesOption` are exported.
- Signed-in users: the `userId` option (and `setUserId()`, or `data-user-id`) is sent to the server in a new `x-clearideas-public-chat-user-id` header on every request (percent-encoded, up to 256 characters), so servers can attribute usage to users. Previously `userId` was accepted but never used. Conversations are kept per user ID in the browser and, per the protocol, on the server, so people sharing a browser do not see each other's chats; `setUserId(undefined)` signs out. The ID is unverified. Servers must allow the header in CORS (protocol README §3.3, §5.5); the test server stores it, scopes chats to it, and has a `/fixture whoami` reply. `data-user-name` and `data-user-email` are also read now.
- Voice in the test server, so voice can be tested without an AI service: recorded voice (canned transcript and reply, with WebM/Opus reply audio streamed in clusters) and realtime voice over a zero-dependency WebSocket relay (one-time tokens, origin checks, a canned spoken conversation saved to the chat). New sites `voice-public-key` and `recorded-voice-public-key`. Browser tests run both in Chromium with a fake microphone, including the reply audio playing to its end, mute, cancelling, microphone errors, French, and axe checks; the conformance suite checks recorded voice when a voice key is given (`CHAT_VOICE_ACCESS_KEY`). The protocol describes how to secure a WebSocket relay (§12.1).
- Stop button: while a reply streams, the send button becomes "Stop reply", which ends the reply and keeps the text received so far (also `widget.stopReply()`). A spoken reply stops too.
- `replyTimeoutMs` option (default 120000): how long to wait without any reply data before giving up. The protocol now recommends that servers send keep-alive comments at least every 30 seconds while a reply has no output yet (§6.1), and describes stopping (§6.2). The test server has `stall` and `stall-mid-stream` fixtures.
- Browser tests run in CI (Chromium).
- When opening fails because the server cannot be reached, a "Chat is unavailable right now" notice appears by the launcher (announced to screen readers); the next click tries again.
- The test server localizes everything a visitor reads (demo site configuration, echo, and error messages) into every built-in language, from `Accept-Language`. `GET /healthz` can be read from any origin, and `--messages-per-minute` sets the message rate limit. The protocol specification describes language negotiation (§3.4).
- Translation checks: unit tests fail on missing keys, changed placeholders and untranslated strings, and a browser test visits the demo in every language and fails if any English appears, whether from the widget or the server.

- Stream parsing follows the Server-Sent Events standard: `data:` with or without a space, multi-line `data:`, LF/CRLF/CR line endings, and `event:`/`id:`/`retry:` fields. Consecutive `data:` lines without blank lines (accepted by 0.1.x) still work. The protocol's framing rule for servers is now a recommendation (`docs/protocol` §6.1).
- Auto-initialization picks up `data-clearideas-widget` elements added after the page loaded, and destroys a widget when its element is removed (for example on a single-page-app route change).
- Accessibility: home actions are buttons reachable by keyboard; the panel is a labelled dialog that Escape closes; focus moves into the panel when opened and back to the launcher when closed; the conversation is a live log (busy while a reply streams, so each reply is announced once) with a "typing" status, errors are alerts, messages are labelled for screen readers ("You said", "Assistant said"), decorative icons are hidden, the text box has a label, focus is visible, motion is reduced when the system asks for it, and the error and disclaimer text meet WCAG AA contrast. Browser tests check each state with axe-core.
- Public Chat Protocol v1 specification in `docs/protocol`: normative rules, OpenAPI 3.1 definition, and JSON Schema for streaming events. It documents the existing wire format, including the previously undocumented `POST /public/chat/session` and `POST /public/chat/realtime/session` endpoints. `GET /public/chat/init` may now return `protocolVersion`; clients treat a missing value as 1.
- Zero-dependency test server in `server/` implementing the core text-chat profile with canned reply fixtures, including hostile-content fixtures for client security tests. It never calls an AI service; `server/provider.ts` shows where a real server would.
- Protocol conformance suite (`npm run test:conformance`) that runs against the test server or any server via `CHAT_SERVER_URL`, plus live widget tests against the test server and a `dev.html` page for manual testing.
- Browser tests exercise the built widget against the test server in Chromium. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an existing browser, and `scripts/chromium-from-npm.mjs` fetches one from the npm registry where Playwright's download host is blocked.
- Development dependencies: lockfile entries that the npm registry did not serve were moved to the newest published releases so `npm ci` works, and `rolldown` is pinned to 1.2.15 (see `DEPENDENCIES.md`). `npm test` runs the test projects sequentially.
- Test output: unexpected `console.warn`/`console.error` output now fails a test, and error-path tests declare the logs they expect. The MSW network-error helper now simulates a real network failure (previously an HTTP 500), and a voice streaming fixture uses valid base64 audio.
- `docs/PUBLIC_CHAT_CLIENT_GUIDE.md` now covers Clear Ideas site setup only and links to the protocol specification for API details.

## 0.1.0

Initial public release under the MIT license.

- Embeddable browser chat widget and Vue source component.
- Text, voice, localization, and consent controls.
- ESM, CommonJS, browser bundles, and TypeScript declarations.
- Public contributor checks and npm packaging verification.

## 0.1.0-rc.1 — November 11, 2026

- Import the standalone public chat refactor and protocol conformance suites.
- Prepare public npm metadata and optional trusted publishing under `clearideas/chat`.
- Support watching all package formats for sibling application development.
- Keep expected-network-error assertions compatible with Node 24 error formatting.
