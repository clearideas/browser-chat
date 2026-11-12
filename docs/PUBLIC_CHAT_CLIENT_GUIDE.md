# Clear Ideas Public Chat Setup Guide

This guide explains how to configure a Clear Ideas site so the browser chat widget can use it: site
settings, allowed origins and widget access keys.

The wire protocol between the widget and a server (endpoints, sessions, streaming events, errors) is
specified in [`docs/protocol`](protocol/README.md). That specification applies to the Clear Ideas API
and to any other server. To try the widget without a Clear Ideas account, run the local test server
described in [`server/README.md`](../server/README.md).

## Overview

The public chat widget lets site visitors chat with an AI assistant that answers questions based on
your site's content. The widget identifies your site with a public access key and calls the Clear
Ideas API cross-origin from your web pages.

## Prerequisites

- A Clear Ideas account with at least one site
- The site must be set to public visibility
- Access to the Clear Ideas API for configuring site settings and creating access keys

## Site Configuration

Before using the public chat widget, you must configure the site settings. The widget configuration is located in the site's `attributes.widget.publicChat` object.

### Required Settings

```typescript
{
  enabled: boolean              // Must be true to enable public chat
  allowedOrigins: string[]      // Array of allowed CORS origins
}
```

### Optional Settings

The following settings allow you to customize the AI's behavior, tone, and capabilities:

#### Basic Configuration

- **`chatName`** (string, default: `"Clear Ideas Public Chat Bot"`)
  - The name of your chat bot that appears to visitors
  - Used in the initial greeting and throughout conversations
  - Example: `"Acme Support Assistant"` or `"Product Help Bot"`

- **`chatTagline`** (string, optional)
  - A short tagline or subtitle for the chat bot
  - Can be displayed alongside the chat name in the widget UI
  - Example: `"Your friendly AI assistant"` or `"Available 24/7"`

- **`heroGreeting`** (string, optional)
  - A prominent greeting message shown when the widget first opens
  - Can be more detailed than the initial greeting
  - Example: `"Welcome! I'm here to help you find exactly what you need."`

- **`initialGreeting`** (string, default: `"Hi, I'm {{chatName}}. How can I help?"`)
  - The first message shown to visitors when they start a chat
  - Supports the `{{chatName}}` variable which will be replaced with the `chatName` value
  - Example: `"Welcome! I'm {{chatName}}, your AI assistant. What can I help you with today?"`

- **`toolsEnabled`** (string[], default: `["retrieve_context", "lead_capture"]`)
  - Controls which capabilities the AI has access to
  - Available tools:
    - `"retrieve_context"`: Search and retrieve relevant content from your site
    - `"lead_capture"`: Collect visitor contact information (also accepts `"lead.capture"` for backward compatibility)
  - Example: `["retrieve_context", "lead_capture"]`

#### AI Behavior Customization

- **`brandVoice`** (string, optional)
  - Instructions that define how the AI should communicate
  - Examples of tone, style, formality level, and personality
  - Example: `"Friendly, professional, and concise. Use simple language and avoid jargon. Always be helpful and empathetic."`
  - **Use case**: Maintain brand consistency in all AI responses

- **`audience`** (string, optional)
  - Description of your target audience to help the AI tailor responses
  - Helps the AI adjust language, examples, and explanations appropriately
  - Example: `"Small business owners with limited technical knowledge"` or `"Enterprise IT administrators"`
  - **Use case**: Ensure responses are appropriate for your visitors' expertise level

- **`answerLength`** (string, optional)
  - Preferred length for AI responses
  - Examples: `"brief"`, `"concise"`, `"detailed"`, `"comprehensive"`
  - **Use case**: Control response verbosity to match your communication style

- **`terminology`** (string[], optional)
  - Array of custom terms or phrases the AI should use consistently
  - Helps maintain consistent language across your brand
  - Example: `["AI Assistant", "Knowledge Base", "Support Portal"]` instead of generic terms
  - **Use case**: Ensure consistent use of branded terminology

#### Content and Context Control

- **`priorityPages`** (string[], optional, max 5 items)
  - URLs or page identifiers that should be prioritized when searching for context
  - The AI will prefer content from these pages when answering questions
  - Limited to maximum 5 items
  - Example: `["https://yourdomain.com/pricing", "https://yourdomain.com/features"]`
  - **Use case**: Ensure important pages are referenced first in responses

- **`disallowedTopics`** (string[], optional)
  - Topics the AI should avoid or decline to discuss
  - The AI will politely redirect conversations away from these topics
  - Example: `["pricing", "refunds", "competitor comparisons"]`
  - **Use case**: Prevent the AI from discussing sensitive topics or areas outside its expertise

#### Widget Styling and UI Configuration

- **`style`** (object, optional)
  - Controls the visual appearance of the widget
  - Properties:
    - **`color`** (string, optional): Primary accent color for the widget (e.g., `"#2866cf"` or `"rgb(40, 102, 207)"`)
    - **`mode`** (string, optional): Color theme mode. Options: `"dark"`, `"light"`, or `"system"` (default: `"system"`)
      - `"dark"`: Always use dark theme
      - `"light"`: Always use light theme
      - `"system"`: Automatically match the user's system preference
  - Example:
    ```json
    {
      "style": {
        "color": "#2866cf",
        "mode": "system"
      }
    }
    ```

- **`links`** (array, optional, max 4 items)
  - Quick links that appear in the widget dialog when it opens
  - Each link object contains:
    - **`title`** (string, required): Display text for the link
    - **`description`** (string, optional): Additional context or description for the link
    - **`url`** (string, required): Full URL to navigate to (must be `http://` or `https://`)
  - Example:
    ```json
    {
      "links": [
        {
          "title": "Documentation",
          "description": "Browse our help center",
          "url": "https://example.com/docs"
        },
        {
          "title": "Contact Support",
          "url": "https://example.com/support"
        }
      ]
    }
    ```

#### Lead Capture Configuration

These settings configure the lead capture tool (`lead_capture`) behavior:

- **`leadCaptureText`** (string, optional)
  - Custom text shown to visitors when the AI offers to capture their information
  - Example: `"I'd be happy to connect you with our team! May I have your email address?"`
  - **Use case**: Customize the lead capture prompt to match your brand voice

- **`meetingLink`** (string, optional)
  - URL to a meeting scheduler or calendar booking page
  - Can be included in lead capture responses or follow-up messages
  - Example: `"https://calendly.com/yourcompany/demo"`
  - **Use case**: Provide next steps after capturing a lead

- **`notifyUserIds`** (string[]/ObjectId[], optional, max 10 items)
  - Array of user IDs to receive notifications when a lead is captured
  - Each user ID must be either the account owner or a site member with admin role
  - Limited to maximum 10 user IDs
  - When a visitor provides their information via the lead capture tool, all users in this array will be notified
  - Example: `["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]`
  - **Use case**: Alert multiple team members immediately when interested visitors provide contact information

#### Voice Chat Configuration

- **`voice`** (object, optional)
  - Configuration for voice Q&A functionality
  - Properties:
    - **`enabled`** (boolean): Enable voice chat for this site (default: `false`)
    - **`ttsVoice`** (string, optional): Voice for text-to-speech - `"alloy"`, `"echo"`, `"fable"`, `"onyx"`, `"nova"`, or `"shimmer"` (default: `"alloy"` from system config)
  - **Note**: Advanced voice settings (whisper model, TTS model, max audio duration, max audio size) are configured at the system level and cannot be changed per-site.
  - Example:
    ```json
    {
      "voice": {
        "enabled": true,
        "ttsVoice": "alloy"
      }
    }
    ```
  - **Use case**: Enable voice-based Q&A for visitors who prefer speaking over typing

### Complete Configuration Example

Here's an example of a fully configured widget:

```json
{
  "attributes": {
    "widget": {
      "publicChat": {
        "enabled": true,
        "chatName": "Acme Support Bot",
        "initialGreeting": "Hi! I'm {{chatName}}. I'm here to help you find what you need. What can I help you with?",
        "allowedOrigins": [
          "https://yourdomain.com",
          "https://www.yourdomain.com",
          "https://*.yourdomain.com"
        ],
        "toolsEnabled": [
          "retrieve_context",
          "lead_capture"
        ],
        "brandVoice": "Friendly, professional, and helpful. Use clear, simple language. Always aim to solve the visitor's problem.",
        "audience": "Small business owners and entrepreneurs looking for solutions",
        "answerLength": "concise",
        "terminology": [
          "Acme Platform",
          "Knowledge Base",
          "Support Team"
        ],
        "chatTagline": "Your friendly AI assistant",
        "heroGreeting": "Welcome! I'm here to help you find exactly what you need.",
        "priorityPages": [
          "https://yourdomain.com/pricing",
          "https://yourdomain.com/getting-started"
        ],
        "disallowedTopics": [
          "competitor comparisons",
          "internal company policies"
        ],
        "leadCaptureText": "I'd love to connect you with our team! Can I get your email address?",
        "meetingLink": "https://calendly.com/acme/demo",
        "notifyUserIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
        "style": {
          "color": "#2866cf",
          "mode": "system"
        },
        "links": [
          {
            "title": "Documentation",
            "description": "Browse our help center",
            "url": "https://yourdomain.com/docs"
          },
          {
            "title": "Contact Support",
            "url": "https://yourdomain.com/support"
          }
        ],
        "voice": {
          "enabled": true,
          "ttsVoice": "alloy"
        }
      }
    }
  }
}
```

### Setting Site Configuration

Update your site's widget settings via the API. See the [Complete Configuration Example](#complete-configuration-example) above for all available options.

```bash
PUT /site/{siteId}
Content-Type: application/json
Authorization: Bearer {your_auth_token}

{
  "attributes": {
    "widget": {
      "publicChat": {
        "enabled": true,
        "chatName": "Your Company Support Bot",
        "initialGreeting": "Hi! I'm {{chatName}}. How can I help you today?",
        "allowedOrigins": [
          "https://yourdomain.com",
          "https://*.yourdomain.com",
          "http://localhost:3000"
        ],
        "toolsEnabled": [
          "retrieve_context",
          "lead_capture"
        ],
        "brandVoice": "Friendly and professional",
        "audience": "Small business owners",
        "voice": {
          "enabled": true,
          "ttsVoice": "alloy"
        }
      }
    }
  }
}
```

**Note**: Settings take effect immediately after updating. You can update individual settings without providing all fields - only the fields you include will be updated.

### CORS Origin Patterns

The `allowedOrigins` array supports several patterns:

- **Exact match**: `"https://yourdomain.com"` - Matches exactly this origin
- **Wildcard subdomain**: `"https://*.yourdomain.com"` - Matches any subdomain (e.g., `https://app.yourdomain.com`, `https://www.yourdomain.com`)
- **Localhost**: `"http://localhost"` or `"http://localhost:3000"` - Matches localhost with or without port

**Important**: Each origin must include the protocol (`http://` or `https://`).

## Access Key Setup

Create a widget-type access key for the site. Use the `public_chat:send` scope for text chat and add
`public_chat:voice` for voice chat.

### Creating a Widget Access Key

```bash
POST /account/access-keys
Content-Type: application/json
Authorization: Bearer {your_auth_token}

{
  "name": "Website Widget Key",
  "keyType": "widget",
  "scopes": ["public_chat:send", "public_chat:voice"],
  "siteId": "{your_site_id}"
}
```

**Response:**
```json
{
  "key": "widget_abc123def456...",
  "id": "...",
  "name": "Website Widget Key",
  "keyType": "widget",
  "scopes": ["public_chat:send", "public_chat:voice"],
  "siteId": "..."
}
```

**Security notes:**
- The widget key is embedded in your web pages, so every visitor can see it. Treat it as a public
  site identifier, not a secret. Its protection comes from the site's `allowedOrigins`, its scopes
  and server-side rate limits.
- Widget keys are scoped to a single site.
- Only use widget keys in frontend code. Never put account API keys or AI provider keys in a page.
- Rotate keys by creating a new key, updating your pages, then revoking the old key.

## Using the widget

See the [README](../README.md) for installation and initialization, and
[CDN_USAGE.md](CDN_USAGE.md) for script-tag usage and all widget options. Point `apiBaseUrl` at
`https://api.clearideas.com` and pass the widget key as `accessKey`.

For building your own client or server, see the [protocol specification](protocol/README.md).

## Troubleshooting

### CORS Errors

If you see CORS errors:
1. Verify your origin is in the `allowedOrigins` array
2. Check that the origin matches exactly (including protocol and port)
3. Ensure the site has `enabled: true` in widget settings

### 403 Forbidden

- Verify `enabled: true` in site widget settings
- Check that the site is active
- Verify the access key is valid and has `public_chat:send` scope
- Ensure the access key's `siteId` matches the site

### 401 Unauthorized

- Verify the access key is correct
- Check that the Authorization header format is correct: `Bearer {key}`
- Ensure the access key hasn't been revoked

### Empty or No Response

- Check the response status code
- Verify the request body format is correct
- Check browser console for CORS or network errors
- Verify the site has content that the AI can reference

## Support

For additional support or questions about the Public Chat Widget:
- Read the [protocol specification](protocol/README.md)
- Open an issue in the [GitHub repository](https://github.com/clearideas/chat)
- Contact Clear Ideas support
