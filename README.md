# Browser Chat

Standalone chat widget for the Clear Ideas® platform. This package provides a Vue 3 component that can be embedded into any website to enable AI-powered chat functionality.

## Installation

### From npm

After the first public release:

```bash
npm install @clearideas/chat
```

Public releases require no npm account or registry token. To use an unreleased checkout, run `npm ci`, `npm run check`, and `npm pack`, then install the resulting `.tgz`.

The widget is a client for the [Public Chat Protocol](docs/protocol/README.md), not an AI server. It works with the Clear Ideas API (see the [setup guide](docs/PUBLIC_CHAT_CLIENT_GUIDE.md)) or with any backend that implements the protocol. The browser only ever holds a public widget access key; AI provider keys and administrative credentials stay on your server. A [test server](server/README.md) with canned replies is included for development.

### From CDN (No Build Step Required)

You can use the widget directly in any HTML page without a build step by loading it from a CDN. The script is a single self-contained file: Vue and the widget styles are bundled, and it has no other runtime dependencies. (The separate `clearideas-widget.css` file is still published for pages that already link it, but it is no longer needed.)

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Clear Ideas Widget (includes Vue and the widget styles) -->
    <script src="https://cdn.example.com/clearideas-widget/clearideas-widget.iife.js"></script>
  </head>
  <body>
    <!-- Your page content -->

    <script>
      // Initialize the widget
      const widget = window.ClearIdeasWidget.init({
        accessKey: 'your-access-key',
        apiBaseUrl: 'https://api.clearideas.com',
        position: 'bottom-right',
        width: 380,
        height: 540,
      })

      // Control the widget programmatically
      // widget.open()
      // widget.close()
      // widget.toggle()
      // widget.sendMessage('Hello!')
      // widget.destroy()
    </script>
  </body>
</html>
```

**Note:** Replace `https://cdn.example.com/clearideas-widget/` with your actual CDN URL where the built files are hosted.

Alternatively, you can use HTML data attributes for automatic initialization (no JavaScript required):

```html
<!DOCTYPE html>
<html>
  <head>
    <!-- Clear Ideas Widget (includes Vue and the widget styles) -->
    <script src="https://cdn.example.com/clearideas-widget/clearideas-widget.iife.js"></script>
  </head>
  <body>
    <!-- Widget will auto-initialize from data attributes -->
    <div
      data-clearideas-widget
      data-access-key="your-access-key"
      data-api-base-url="https://api.clearideas.com"
      data-position="bottom-right"
      data-width="380"
      data-height="540"
    ></div>
  </body>
</html>
```

## Usage

### JavaScript/TypeScript

```typescript
import { init } from '@clearideas/chat'

const widget = init({
  accessKey: 'your-access-key',
  apiBaseUrl: 'https://api.clearideas.com',
  position: 'bottom-right',
  width: 380,
  height: 540,
})

// Control the widget programmatically
widget.open()
widget.close()
widget.toggle()
widget.sendMessage('Hello!')
widget.destroy()
```

### HTML Data Attributes (Auto-initialization)

You can also initialize the widget automatically using HTML data attributes:

```html
<div
  data-clearideas-widget
  data-access-key="your-access-key"
  data-api-base-url="https://api.clearideas.com"
  data-position="bottom-right"
  data-width="380"
  data-height="540"
  data-open-on-load="false"
  data-locale="fr"
></div>
```

### Vue Component Usage

```vue
<template>
  <ClearIdeasWidgetStandalone
    :access-key="accessKey"
    :api-base-url="apiBaseUrl"
    position="bottom-right"
    :width="380"
    :height="540"
  />
</template>

<script setup lang="ts">
import ClearIdeasWidgetStandalone from '@clearideas/chat/ClearIdeasWidgetStandalone.vue'
// The component renders in your app's DOM (no shadow root), so include the widget styles:
import '@clearideas/chat/style.css'

const accessKey = 'your-access-key'
const apiBaseUrl = 'https://api.clearideas.com'
</script>
```

### Global API (Script Tag)

When loaded via script tag (including CDN), the widget exposes a global API via `window.ClearIdeasWidget`:

```html
<script src="path/to/clearideas-widget.iife.js"></script>
<script>
  const widget = window.ClearIdeasWidget.init({
    accessKey: 'your-access-key',
    apiBaseUrl: 'https://api.clearideas.com',
  })

  // Use the widget instance
  widget.open()
</script>
```

## Configuration Options

### WidgetConfig

```typescript
interface WidgetConfig {
  // Required
  accessKey: string // Public widget access key (identifies the site; not a secret)

  // Server
  apiBaseUrl?: string // Chat server URL (default https://api.clearideas.com, or
  // VITE_API_BASE_URL at build time). Any server implementing
  // docs/protocol works.

  // Position and size
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  top?: number // Absolute position in pixels (instead of position)
  right?: number
  bottom?: number
  left?: number
  width?: number // Panel width in pixels (default 380)
  height?: number // Panel height in pixels (default 540)
  fabSize?: number // Launcher size in pixels (default 56)
  fabHide?: boolean // Hide the launcher, for sites that open the chat from their own button
  openOnLoad?: boolean // Open on page load (default false)

  // Appearance and language
  darkMode?: boolean | (() => boolean) | string // Force a theme: value, function or global name ("Dark mode")
  locale?: string // Language as a BCP 47 tag; default: the page language ("Languages")
  messages?: WidgetMessagesOption // Custom strings or extra languages ("Languages")
  replyTimeoutMs?: number // Give up on a reply after this long without data (default 120000)

  // Visitor (signed-in sites)
  userId?: string // Your ID for the signed-in user, sent to the server ("Signed-in users")
  userName?: string // Shown in the greeting ("Hi Ada"); stays in the browser
  userEmail?: string // Its first part is the greeting name when userName is unset; stays in the browser

  // Consent (GDPR)
  consentRequired?: boolean | (() => boolean) | string
  consentGranted?: boolean | (() => boolean) | string
  hasConsent?: boolean | (() => boolean) | string // init() returns an inert widget without consent
  throwOnMissingConsent?: boolean

  // Placement
  container?: string | HTMLElement // Element (or selector) to render into
  shadowDom?: boolean // Render in a shadow root (default true)
}
```

## Styling and isolation

The widget renders inside an open **shadow root** attached to an element it adds to the page (or to
the `container` you pass). Page CSS cannot change the widget, the widget's CSS cannot affect the
page, and the widget uses its own typography instead of inheriting the page's. Nothing is added to
the page's `<head>`.

Its colors come from the site configuration (`style.color` from the server). Every accent-colored
element follows that color, and text on it switches between white and near-black for contrast.
Without a server color, a page can set defaults with CSS variables on its root element:

```css
:root {
  --ci-widget-accent: #2866cf; /* accent color when the server sets none */
  --ci-widget-font-family: 'Inter', system-ui, sans-serif; /* match the page's font */
}
```

The widget works under a strict Content-Security-Policy: it applies its styles with constructable
stylesheets, so `style-src` does not need `'unsafe-inline'`. Allow `connect-src` to your chat
server.

To let page CSS restyle the widget instead, turn isolation off with `shadowDom: false` (or
`data-shadow-dom="false"`); the widget then renders in the page DOM and its styles apply to the
document.

## Signed-in users

On a site where visitors sign in, pass your ID for the user as `userId` (or `data-user-id`, or call
`setUserId()` after sign-in). The widget sends it with every request in the
`x-clearideas-public-chat-user-id` header (percent-encoded), so the server can attribute usage to
your users, for example to see which features they use.

- Each user ID has its own conversations, in the browser and on the server: after a different user
  signs in on the same browser, or the user signs out (`setUserId(undefined)`), the widget starts a
  new conversation, and switching back restores the earlier one.
- The ID is not verified (any page script can set it), so it is for attribution, not access
  control. Use an opaque ID rather than an email address.
- `userName` and `userEmail` only personalize the greeting and are never sent.

## Dark mode

By default the widget's theme comes from the site configuration (`style.mode` from the server):
`light`, `dark`, or `system` (the default). With `system`, the widget follows the page's theme markup
(`class="dark"` or `class="light"`, `data-theme`, `data-bs-theme` or `data-color-scheme` on `<html>`
or `<body>`), and otherwise the visitor's system preference. It follows changes to either
immediately, so a theme switch on the page needs no extra code.

To decide yourself, pass `darkMode` (a boolean, a function, or the name of a global holding either)
or call `setDarkMode()`. A `darkMode` function is called again whenever the page's theme attributes
or the system preference change; if your theme lives elsewhere, call `setDarkMode()` when it
changes.

## Multiple widgets and single-page apps

Each `init()` call creates an independent widget, and its `destroy()` removes only that widget.
Calling `init()` again for the same container (or again without a container) replaces the widget in
it, so you can re-initialize after a login or a consent change. Widgets in different containers
coexist.

With data attributes, elements with `data-clearideas-widget` are initialized when the page is ready
and whenever they are added later; when such an element is removed from the page, its widget is
destroyed. This also works when the widget script itself is loaded after the page (for example with
`async` or by a tag manager).

## Accessibility

The widget is operable by keyboard (Tab, Enter/Space, and Escape to close) and works with screen
readers: the panel is a labelled dialog, new messages and errors are announced, and focus moves into
the panel when it opens and back to the launcher when it closes. Opening on page load (`openOnLoad`)
does not take focus from the page. Text and controls meet WCAG 2.1 AA contrast, and animations are
reduced when the system asks for reduced motion. Browser tests check every widget state with
axe-core.

## Languages

The widget ships with English, French, Spanish, German, Italian, Portuguese, Dutch, Polish,
Japanese, Korean, Chinese (Simplified and Traditional) and Arabic. The list is also available at
runtime as `ClearIdeasWidget.BUILT_IN_LOCALES` (or the `BUILT_IN_LOCALES` export).

By default the widget follows the page's `<html lang>`, including later changes, and uses the
browser's languages when the page declares none. The `locale` option (or `setLocale()`, or
`data-locale`) sets a language for one widget instead. Matching is by language: `fr-CA` uses
French and `pt-BR` Portuguese, Chinese follows the script (`zh-TW` and `zh-HK` are Traditional),
and languages without a translation use English.

The widget marks its root element with `lang` and `dir`, so screen readers pronounce it correctly
and Arabic lays the panel out right to left. Text from the server or the visitor takes its
direction from its own content, so an English reply reads correctly in an Arabic widget and the
other way round.

The widget sends its language to the server in `Accept-Language` (protocol README §3.4). Text from
the server (greeting, headline, link titles, disclaimers, replies and error messages) is the
server's to localize; the included test server translates its visitor-facing text into every
built-in language.

To change strings or add a language, pass `messages` (or call `setMessages()` later). Strings you
leave out fall back to the built-in language, then to English:

```js
ClearIdeasWidget.init({
  accessKey: 'your-access-key',
  messages: {
    // Override built-in strings
    fr: { chat: { poweredBy: 'Fourni par Exemple' } },
    // Add a language; it is used when the page (or locale) asks for Swedish
    sv: {
      fab: { openChat: 'Öppna chatten', closeChat: 'Stäng chatten' },
      input: { placeholder: 'Ställ en fråga...' },
    },
  },
})
```

The keys are those of [`src/i18n/locales/en.ts`](src/i18n/locales/en.ts) (typed as
`WidgetMessages`). The built-in translations other than English are first drafts that have not yet
been reviewed by native speakers; corrections are welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)).

## API Reference

### WidgetInstance

The `init()` function returns a `WidgetInstance` with the following methods:

- **`open()`**, **`close()`**, **`toggle()`**: Open or close the panel
- **`openChatDirectly()`**: Opens the conversation, skipping the home view
- **`sendMessage(content: string)`**: Sends a message programmatically
- **`stopReply()`**: Stops the reply in progress, keeping the text received so far (visitors have a
  stop button in place of the send button while a reply streams)
- **`hide()`**, **`show()`**: Hide or show the launcher (the panel can still be opened with `open()`)
- **`setLocale(locale)`**, **`setMessages(messages)`**: Language and custom strings ("Languages");
  `setLocale(undefined)` follows the page language again
- **`setDarkMode(isDark)`**, **`setPosition(position)`**, **`setWidth(px)`**, **`setHeight(px)`**,
  **`setTop/Right/Bottom/Left(px)`**, **`setFabSize(px)`**: Change appearance after `init()`
- **`setUserName(name)`**, **`setUserEmail(email)`**, **`setUserId(id)`**: Update the visitor
- **`setConsentRequired(required)`**, **`setConsentGranted(granted)`**: Update consent
- **`setActions(actions)`**: Replace the home view actions
- **`destroy()`**: Removes this widget from the DOM and releases its resources (other widgets are unaffected)

Closing the panel does not cancel a reply in progress; it is there when the panel reopens. If no
data arrives for `replyTimeoutMs` (keep-alive comments count), the widget gives up and shows "The
assistant is taking too long to respond"; the visitor's message stays so they can try again.

If the server refuses the widget (`401` or `403`, for example an unknown key, chat disabled for the
site, or an origin that is not allowed), the launcher is hidden and a console warning says why. If
the server cannot be reached, the launcher stays and a click shows "Chat is unavailable right now";
the next click tries again.

## Types

The package exports the following TypeScript types:

- `WidgetConfig` - Configuration for widget initialization
- `WidgetInstance` - Widget control API
- `WidgetProps` - Component props
- `ChatMessage` - Chat message structure
- `InitResponse` - Initialization response from API
- `StreamEvent` - Streaming event types
- `WidgetAction` - Action button configuration
- `WidgetMessages`, `WidgetMessageOverrides`, `WidgetMessagesOption` - Strings for `messages`

## Development

### Building

```bash
npm run build
```

You can override the default API base URL at build time:

```bash
VITE_API_BASE_URL=https://api.example.com npm run build
```

This will generate:

- `dist/clearideas-widget.es.js` - ES module format
- `dist/clearideas-widget.cjs` - CommonJS format
- `dist/index.d.ts` - TypeScript declarations
- `dist/clearideas-widget.iife.js` - IIFE format for script tags
- `dist/clearideas-widget.css` - Widget styles (optional: every JavaScript bundle also injects them)

### Type Checking

```bash
npm run type-check
```

### Protocol and Test Server

The contract between the widget and a server is specified in [`docs/protocol`](docs/protocol/README.md) (with an OpenAPI definition and a JSON Schema for streaming events). To develop without a Clear Ideas account, run the included test server, which implements the protocol with canned replies and never calls an AI service:

```bash
npm run dev    # rebuilds on change, serves the pages and runs the test server
```

When it prints "Ready", open <http://127.0.0.1:8000/>, an index page that shows whether the bundle is built and the test server is running, and links to the demo page (`dev.html`) and the test pages. If port 8000 or 8787 is taken, the next free port is used (and printed); choose ports with `npm run dev --pages-port=8100 --api-port=8788` (this form, with `=` and without `--`, works in every shell, including PowerShell). The scripts are listed in [CONTRIBUTING.md](CONTRIBUTING.md#scripts).

`npm run test:conformance` checks a server against the protocol; point it at your own server with `CHAT_SERVER_URL`. See [server/README.md](server/README.md).

## Requirements

- Vue 3.5+ when importing the `.vue` source component; the prebuilt JavaScript bundles include Vue
- Modern browser with ES2020 support
- Node.js 22.22.3+ or 24.15+ for development
- A backend implementing the [Public Chat Protocol](docs/protocol/README.md) (a [test server](server/README.md) is included for development)

## License

[MIT](LICENSE). Third-party dependencies retain their own licenses.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and [SECURITY.md](SECURITY.md) for private vulnerability reporting. See [RELEASE.md](RELEASE.md) for package and optional CDN releases.

## Support

For issues and questions, please visit the [GitHub repository](https://github.com/clearideas/chat) or contact Clear Ideas support.

## Working with a sibling web application

Use `npm run dev:package` to watch and rebuild the ES/CommonJS/browser bundles for
an application that links this checkout. `npm run dev` remains the faster browser
playground watcher. The application must use the built ES entry and allow this
checkout through its development server's filesystem policy.
