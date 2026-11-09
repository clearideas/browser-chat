# Browser Chat

Standalone chat widget for the Clear Ideas™ platform. This package provides a Vue 3 component that can be embedded into any website to enable AI-powered chat functionality.

## Installation

### From npm

After the first public release:

```bash
npm install @clearideas/chat
```

Public releases require no npm account or registry token. To use an unreleased checkout, run `npm ci`, `npm run check`, and `npm pack`, then install the resulting `.tgz`.

The widget is a client for the [Clear Ideas public chat API](docs/PUBLIC_CHAT_CLIENT_GUIDE.md), not a standalone AI server. It requires a configured public-chat site and a browser-visible widget access key, or a backend implementing the same API. Keep provider keys and administrative credentials on your server.

### From CDN (No Build Step Required)

You can use the widget directly in any HTML page without a build step by loading it from a CDN. All dependencies including Vue are bundled:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Load Clear Ideas Widget CSS -->
  <link rel="stylesheet" href="https://cdn.example.com/clearideas-widget/clearideas-widget.css">

  <!-- Load Clear Ideas Widget JS (includes Vue and all dependencies) -->
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
      height: 540
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
  <!-- Load Clear Ideas Widget CSS -->
  <link rel="stylesheet" href="https://cdn.example.com/clearideas-widget/clearideas-widget.css">

  <!-- Load Clear Ideas Widget JS (includes Vue and all dependencies) -->
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
  accessKey: string              // Widget access key for public chat API

  // Optional API configuration
  apiBaseUrl?: string            // API base URL (optional - defaults to https://api.clearideas.com)
                                   // Can be set at build time via VITE_API_BASE_URL environment variable

  // Widget positioning and styling
  openOnLoad?: boolean           // Open widget on page load (default: false)
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  width?: number                 // Widget width in pixels (default: 380)
  height?: number                // Widget height in pixels (default: 540)
  placeholder?: string           // Input placeholder text

  // Absolute positioning
  top?: number
  right?: number
  bottom?: number
  left?: number

  // User information
  userName?: string
  userEmail?: string
  userId?: string

  // Actions configuration
  actions?: WidgetAction[]

  // Features
  voiceEnabled?: boolean         // Enable voice chat
  darkMode?: boolean            // Override dark mode detection

  // Container
  container?: string | HTMLElement  // Container selector or element
}
```

## API Reference

### WidgetInstance

The `init()` function returns a `WidgetInstance` with the following methods:

- **`open()`**: Opens the widget
- **`close()`**: Closes the widget
- **`toggle()`**: Toggles widget open/closed state
- **`sendMessage(content: string)`**: Sends a message programmatically
- **`destroy()`**: Removes the widget from the DOM

## Types

The package exports the following TypeScript types:

- `WidgetConfig` - Configuration for widget initialization
- `WidgetInstance` - Widget control API
- `WidgetProps` - Component props
- `ChatMessage` - Chat message structure
- `InitResponse` - Initialization response from API
- `StreamEvent` - Streaming event types
- `WidgetAction` - Action button configuration

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
- `dist/clearideas-widget.css` - Widget styles

### Type Checking

```bash
npm run type-check
```

## Requirements

- Vue 3.5+ when importing the `.vue` source component; the prebuilt JavaScript bundles include Vue
- Modern browser with ES2020 support
- Node.js 22.22.3+ or 24.15+ for development
- A compatible public chat backend (not included)

## License

[MIT](LICENSE). Third-party dependencies retain their own licenses.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for checks and [SECURITY.md](SECURITY.md) for private vulnerability reporting. See [RELEASE.md](RELEASE.md) for package and optional CDN releases.

## Support

For issues and questions, please visit the [GitHub repository](https://github.com/clearideas/browser-chat) or contact Clear Ideas support.
