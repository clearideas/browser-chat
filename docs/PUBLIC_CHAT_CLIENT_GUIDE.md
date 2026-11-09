# Public Chat Widget Client Guide

This guide explains how to integrate the Clear Ideas Public Chat Widget into your website, allowing visitors to interact with an AI assistant powered by your site's content.

## Overview

The Public Chat Widget is a feature that enables site visitors to chat with an AI assistant that can answer questions based on your site's content. The widget uses access key authentication and supports CORS for cross-origin requests from your website.

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

You need to create a widget-type access key with the `public_chat:send` scope.

### Creating a Widget Access Key

```bash
POST /account/access-keys
Content-Type: application/json
Authorization: Bearer {your_auth_token}

{
  "name": "Website Widget Key",
  "keyType": "widget",
  "scopes": ["public_chat:send"],
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
  "scopes": ["public_chat:send"],
  "siteId": "..."
}
```

**Important Security Notes:**
- Store the access key securely - it will be exposed in your frontend code
- Widget keys are scoped to a specific site
- Only use widget keys in public frontend code - never use API keys
- Rotate keys regularly by creating new ones and updating your frontend

**Error Responses:**
- `403 Forbidden`: Public chat or voice chat disabled for site
- `404 Not Found`: Chat not found (when continuing with chatId)
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Transcription or TTS conversion failed

### POST /public/chat/voice

Send a voice message to the public chat widget. The audio is transcribed to text, processed through the LLM, and the response is converted back to audio.

**URL**: `https://api.clearideas.local/public/chat/voice` (development)
**URL**: `https://api.clearideas.com/public/chat/voice` (production)

**Headers:**
```
Authorization: Bearer {widget_access_key}
Content-Type: application/json
Origin: {your_website_origin}  // Must match an allowed origin
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "audio": "base64encodedaudiodata...",
  "format": "webm",
  "chatId": "507f1f77bcf86cd799439011"
}
```

**Request Fields:**
- **`audio`** (string, required): Base64-encoded audio data
- **`format`** (string, optional): Audio format - `"webm"`, `"mp3"`, `"wav"`, `"m4a"`, or `"ogg"` (default: `"webm"`)
- **`chatId`** (string, optional): Chat ID to continue an existing conversation

**Response (200 OK):**
```json
{
  "audio": "base64encodedmp3audiodata...",
  "transcript": "What products do you offer?",
  "response": "We offer a variety of products including... [yourdomain.com](https://yourdomain.com/products){data-original-url=\"https://yourdomain.com/products\"}",
  "chatId": "507f1f77bcf86cd799439011",
  "chatName": "Support Assistant"
}
```

**Response Fields:**
- **`audio`** (string): Base64-encoded WebM/Opus audio of the AI's response
- **`transcript`** (string): Transcribed text of the user's audio input
- **`response`** (string): Text response from the AI (includes markdown links with source citations)
- **`chatId`** (string): Chat ID for continuing the conversation
- **`chatName`** (string): Name of the chat bot

**Note**: The audio response is always in WebM/Opus format (optimal for streaming), regardless of the input format. The transcript and response text are included for display purposes (e.g., showing what was said and what the AI responded).

**Error Responses:**
- **400 Bad Request**: Invalid audio data, audio too large, or audio too long
  ```json
  {
    "message": "Audio file too large: 15.2MB (max: 10MB)"
  }
  ```
- **403 Forbidden**: Public chat or voice chat disabled for site
- **404 Not Found**: Chat not found (when continuing with chatId)
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Transcription or TTS conversion failed

**Example Usage:**
```javascript
// Record audio using MediaRecorder API
const mediaRecorder = new MediaRecorder(stream)
const chunks = []

mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
mediaRecorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' })

  // Convert to base64
  const reader = new FileReader()
  reader.onloadend = async () => {
    const base64Audio = reader.result.split(',')[1] // Remove data URL prefix

    // Send to API
    const response = await fetch('https://api.clearideas.com/public/chat/voice', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${widgetAccessKey}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        audio: base64Audio,
        format: 'webm',
        chatId: existingChatId // Optional: for continuing conversations
      }),
    })

    const data = await response.json()

    // Decode and play audio response
    const audioBlob = await fetch(`data:audio/webm;base64,${data.audio}`).then(r => r.blob())
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    audio.play()

    // Display transcript and response text
    console.log('User said:', data.transcript)
    console.log('AI responded:', data.response)
  }
  reader.readAsDataURL(blob)
}

mediaRecorder.start()
// ... stop recording when user finishes speaking
```

### POST /public/chat/voice/:id

Continue an existing voice conversation by sending a new voice message to a specific chat.

**URL**: `https://api.clearideas.local/public/chat/voice/:id` (development)
**URL**: `https://api.clearideas.com/public/chat/voice/:id` (production)

**Path Parameters:**
- `id` (string, required): The chat ID returned from a previous request

**Authentication:** Required via `Authorization` header with widget access key

**Headers:**
```
Authorization: Bearer YOUR_WIDGET_ACCESS_KEY
Content-Type: application/json
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "audio": "base64encodedaudiodata...",
  "format": "webm"
}
```

**Response:** Same format as `POST /public/chat/voice` (see above)

**Error Responses:**
- `403 Forbidden`: Public chat or voice chat disabled for site
- `404 Not Found`: Chat not found or doesn't belong to this site
- `429 Too Many Requests`: Rate limit exceeded

### POST /public/chat/voice/stream

Send a voice message with streaming response using Server-Sent Events (SSE). Provides real-time updates including transcript, streaming LLM response, and audio generation.

**URL**: `https://api.clearideas.local/public/chat/voice/stream` (development)
**URL**: `https://api.clearideas.com/public/chat/voice/stream` (production)

**Headers:**
```
Authorization: Bearer {widget_access_key}
Content-Type: application/json
Origin: {your_website_origin}  // Must match an allowed origin
Accept: text/event-stream
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "audio": "base64encodedaudiodata...",
  "format": "webm",
  "chatId": "507f1f77bcf86cd799439011"
}
```

**Request Fields:**
- **`audio`** (string, required): Base64-encoded audio data
- **`format`** (string, optional): Audio format - `"webm"`, `"mp3"`, `"wav"`, `"m4a"`, or `"ogg"` (default: `"webm"`)
- **`chatId`** (string, optional): Chat ID to continue an existing conversation

**Response:** Server-Sent Events stream

**SSE Events:** See [Unified Event Schema](#unified-event-schema) section for complete event documentation.

**Event Flow:**
1. `info` - Initial connection info with chat ID
2. `transcript` - Transcribed text from audio (sent immediately after STT completes)
3. `content` - Streaming LLM response chunks (sent as LLM generates response)
4. `thinking` - Reasoning/thinking content (if supported by model)
5. `toolCall` - Tool call notifications (if tools are used)
6. `toolCallComplete` - Tool call finished
7. `message_finalized` - Complete message (user or assistant)
8. `audio` - Base64-encoded audio data (sent after TTS completes)
9. `done` - Final event with all complete data
10. `error` - Error occurred (if any error happens)

**Example Response Stream:**
```
data: {"type":"info","id":"507f1f77bcf86cd799439011","isNewChat":true,"chatName":"Support Assistant"}

data: {"type":"transcript","transcript":"What products do you offer?"}

data: {"type":"content","content":"We"}

data: {"type":"content","content":" offer"}

data: {"type":"content","content":" a variety"}

data: {"type":"content","content":" of products"}

data: {"type":"message_finalized","message":{"role":"assistant","content":"We offer a variety of products..."}}

data: {"type":"audioChunk","audioChunk":"base64encodedinitsegment...","audioChunkIndex":0,"isInitSegment":true}

data: {"type":"audioChunk","audioChunk":"base64encodedcluster1...","audioChunkIndex":1,"isInitSegment":false}

data: {"type":"audioChunk","audioChunk":"base64encodedcluster2...","audioChunkIndex":2,"isInitSegment":false}

data: {"type":"audio","audio":"base64encodedwebmaudiodata..."}

data: {"type":"done","chatId":"507f1f77bcf86cd799439011","chatName":"Support Assistant","transcript":"What products do you offer?","response":"We offer a variety of products... [yourdomain.com](https://yourdomain.com/products){data-original-url=\"https://yourdomain.com/products\"}","audio":"base64encodedwebmaudiodata..."}
```

**Note**: The `transcript` event is sent immediately after speech-to-text transcription completes, allowing clients to display what the user said before the LLM response is generated. The `audioChunk` events are sent as complete WebM clusters arrive from the TTS API - the first chunk contains the initialization segment (`isInitSegment: true`), followed by individual clusters. These chunks can be used with MediaSource API for progressive playback. The `audio` event contains the complete audio response in base64 format (sent for backward compatibility). The `response` field in the `done` event includes source citations for display purposes.

**Error Responses:**
- **400 Bad Request**: Invalid audio data, audio too large, or audio too long
- **403 Forbidden**: Public chat or voice chat disabled for site
- **404 Not Found**: Chat not found (when continuing with chatId)
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Transcription or TTS conversion failed

### POST /public/chat/voice/:id/stream

Continue an existing voice conversation with streaming response using Server-Sent Events (SSE).

**URL**: `https://api.clearideas.local/public/chat/voice/:id/stream` (development)
**URL**: `https://api.clearideas.com/public/chat/voice/:id/stream` (production)

**Path Parameters:**
- `id` (string, required): The chat ID returned from a previous request

**Authentication:** Required via `Authorization` header with widget access key

**Headers:**
```
Authorization: Bearer YOUR_WIDGET_ACCESS_KEY
Content-Type: application/json
Accept: text/event-stream
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "audio": "base64encodedaudiodata...",
  "format": "webm"
}
```

**Response:** Same format as `POST /public/chat/voice/stream` (see above)

**Error Responses:**
- `403 Forbidden`: Public chat or voice chat disabled for site
- `404 Not Found`: Chat not found or doesn't belong to this site
- `429 Too Many Requests`: Rate limit exceeded

### Access Key Setup for Voice Chat

Create a widget-type access key with the `public_chat:voice` scope:

```bash
POST /account/access-keys
Content-Type: application/json
Authorization: Bearer {your_auth_token}

{
  "name": "Website Widget Voice Key",
  "keyType": "widget",
  "scopes": ["public_chat:voice"],
  "siteId": "{your_site_id}"
}
```

**Note**: You can also include both `public_chat:send` and `public_chat:voice` scopes if you want to support both text and voice chat:

```json
{
  "scopes": ["public_chat:send", "public_chat:voice"]
}
```

## API Endpoints

### Initialize Widget

Get the initialization data for the widget, including the initial message, styling options, quick links, and any existing chat conversation for the current visitor.

**Endpoint:** `GET /public/chat/init`

**Authentication:** Required via `Authorization` header with widget access key

**Headers:**
```
Authorization: Bearer {widget_access_key}
x-clearideas-public-chat-session: {session_id}  // Optional: Include if session ID available from previous /init call
```

**Important:** This endpoint uses cookies to track anonymous visitors. The browser will automatically send cookies (`ci_public_chat_user_id`) with requests. Ensure your fetch/request configuration includes credentials:

```javascript
// Fetch API
fetch(url, {
  credentials: 'include'  // Required for cookies
})

// XMLHttpRequest
xhr.withCredentials = true

// Axios
axios.get(url, { withCredentials: true })
```

**Session ID Response Header:**
- The server returns the session ID in the `x-clearideas-public-chat-session-id` response header
- **Always retrieve and store this session ID** from the `/init` response
- Use this session ID in the `x-clearideas-public-chat-session` header for all subsequent API requests
- If cookies are blocked, this session header is essential for maintaining conversation continuity

**Response:** (Status 200 OK)

**New Chat (No Existing Conversation):**
```json
{
  "initialMessage": "Hi! I'm Acme Support Bot. How can I help you today?",
  "style": {
    "color": "#2866cf",
    "mode": "system"
  },
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
  ],
  "chatName": "Acme Support Bot",
  "iconUrl": "https://media.clearideas.com/bucket/path/to/icon.png",
  "voiceEnabled": true
}
```

**Existing Chat Found:**
```json
{
  "initialMessage": "Hi! I'm Acme Support Bot. How can I help you today?",
  "style": {
    "color": "#2866cf",
    "mode": "system"
  },
  "links": [
    {
      "title": "Documentation",
      "description": "Browse our help center",
      "url": "https://example.com/docs"
    }
  ],
  "chatName": "Acme Support Bot",
  "iconUrl": "https://media.clearideas.com/bucket/path/to/icon.png",
  "voiceEnabled": true,
  "existingChat": {
    "chatId": "507f1f77bcf86cd799439011",
    "messages": [
      {
        "role": "assistant",
        "content": "Hi! I'm Acme Support Bot. How can I help you today?"
      },
      {
        "role": "user",
        "content": "What products do you offer?"
      },
      {
        "role": "assistant",
        "content": "We offer a variety of products including... [yourdomain.com](https://yourdomain.com/products){data-original-url=\"https://yourdomain.com/products\"}"
      }
    ]
  }
}
```

**Note:** The `initialMessage` field has all variables (like `{{chatName}}`) already populated with their actual values. The `iconUrl` field is only included if a site icon is configured. The `voiceEnabled` field is only included if voice chat is enabled for the site.

**Response Fields:**
- **`initialMessage`** (string): The greeting message to display when the widget opens. All variables (like `{{chatName}}`) are already populated with their actual values.
- **`style`** (object): Visual styling options for the widget
  - **`color`** (string, optional): Primary accent color (e.g., `"#2866cf"`)
  - **`mode`** (string): Theme mode - `"dark"`, `"light"`, or `"system"` (defaults to `"system"` if not configured)
- **`links`** (array): Quick links to display in the widget (up to 4 links)
  - **`title`** (string): Display text for the link
  - **`description`** (string, optional): Additional context for the link
  - **`url`** (string): Full URL to navigate to
- **`chatName`** (string): The name of the chat bot
- **`iconUrl`** (string, optional): Full URL to the site's icon image. Only included if a site icon is configured.
- **`voiceEnabled`** (boolean, optional): Whether voice chat is enabled for this site. Only included if `true`. When present, clients can enable voice input UI.
- **`existingChat`** (object, optional): Present if the visitor has an existing conversation
  - **`chatId`** (string): The chat ID to use for continuing the conversation
  - **`messages`** (array): Array of previous messages in the conversation. Assistant messages may contain markdown links with `data-original-url` attributes for source citations.

**Processing Existing Chats:**

When `existingChat` is present in the response:

1. **Display previous messages**: Load and display the messages from `existingChat.messages` in your chat UI
2. **Use the chatId**: When sending new messages, use `POST /public/chat/:id` or `POST /public/chat/:id/stream` with the `chatId` from `existingChat.chatId` to continue the conversation
3. **Handle source links**: Messages may contain markdown links with `data-original-url` attributes - parse and render these appropriately (see [Source Attribution in Message Content](#source-attribution-in-message-content))

**Example Usage:**
```javascript
// Fetch initialization data when widget loads
let sessionId = localStorage.getItem('publicChatSessionId') // Check for existing session

const response = await fetch('https://api.clearideas.local/public/chat/init', {
  method: 'GET',
  headers: {
 is a typo. Let me fix it.

**Error Responses:**
- `403 Forbidden`: Public chat is disabled for the site
- `401 Unauthorized`: Invalid or missing access key
- `500 Internal Server Error`: Server error

### POST /public/chat

Send a chat message to the public chat widget (non-streaming).

**Note**: Tool calls and tool call responses are automatically filtered from the response. Only user and assistant messages with content are returned.

**URL**: `https://api.clearideas.local/public/chat` (development)
**URL**: `https://api.clearideas.com/public/chat` (production)

**Headers:**
```
Authorization: Bearer {widget_access_key}
Content-Type: application/json
Origin: {your_website_origin}  // Must match an allowed origin
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "message": {
    "content": "What products do you offer?",
    "aiModel": "groq-gpt-oss-120b"  // Optional, uses system config default if omitted
  }
}
```

**Response (200 OK):**
```json
{
  "chatId": "507f1f77bcf86cd799439011",
  "chatName": "Your Company Support Bot",
  "messages": [
    {
      "role": "assistant",
      "content": "Hi! I'm Your Company Support Bot. How can I help you today?"
    },
    {
      "role": "assistant",
      "content": "We offer a variety of products including... [yourdomain.com](https://yourdomain.com/products){data-original-url=\"https://yourdomain.com/products\"}"
    }
  ]
}
```

**Note**: Source citations are embedded directly in the message `content` as markdown links with `data-original-url` attributes. See the [Source Attribution in Message Content](#source-attribution-in-message-content) section for details.

**Error Responses:**

- **400 Bad Request**: Invalid request body
  ```json
  {
    "message": "Validation error",
    "details": "..."
  }
  ```

- **401 Unauthorized**: Missing or invalid access key
  ```json
  {
    "message": "Unauthorized"
  }
  ```

- **403 Forbidden**:
  - Public chat disabled for site
  - CORS origin not allowed
  ```json
  {
    "message": "Public chat disabled for site"
  }
  ```

- **429 Too Many Requests**: Rate limit exceeded
  ```json
  {
    "message": "Rate limit exceeded"
  }
  ```

### POST /public/chat/:id

Continue an existing chat conversation by sending a new message to a specific chat.

**URL**: `https://api.clearideas.local/public/chat/:id` (development)
**URL**: `https://api.clearideas.com/public/chat/:id` (production)

**Path Parameters:**
- `id` (string, required): The chat ID returned from a previous request

**Authentication:** Required via `Authorization` header with widget access key

**Headers:**
```
Authorization: Bearer YOUR_WIDGET_ACCESS_KEY
Content-Type: application/json
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "message": {
    "content": "What are your business hours?",
    "aiModel": null  // Optional, defaults to system config default (groq-gpt-oss-120b)
  }
}
```

**Response (200 OK):**
```json
{
  "chatId": "507f1f77bcf86cd799439011",
  "messages": [
    {
      "role": "assistant",
      "content": "Our business hours are Monday-Friday, 9am-5pm EST..."
    }
  ],
  "chatName": "Support Assistant"
}
```

**Note**: When continuing a chat, the initial greeting is not included in the response. Only the new assistant message is returned.

**Error Responses:**
- `403 Forbidden`: Public chat disabled for site
- `404 Not Found`: Chat not found or doesn't belong to this site
- `429 Too Many Requests`: Rate limit exceeded

### POST /public/chat/:id/stream

Continue an existing chat conversation with streaming response using Server-Sent Events (SSE).

**URL**: `https://api.clearideas.local/public/chat/:id/stream` (development)
**URL**: `https://api.clearideas.com/public/chat/:id/stream` (production)

**Path Parameters:**
- `id` (string, required): The chat ID returned from a previous request

**Authentication:** Required via `Authorization` header with widget access key

**Headers:**
```
Authorization: Bearer YOUR_WIDGET_ACCESS_KEY
Content-Type: application/json
Accept: text/event-stream
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "message": {
    "content": "Tell me more about your pricing",
    "aiModel": null  // Optional, defaults to system config default (groq-gpt-oss-120b)
  }
}
```

**Response:** Server-Sent Events stream

**SSE Events:** See [Unified Event Schema](#unified-event-schema) section for complete event documentation.

**Example Response Stream:**
```
data: {"type":"info","id":"507f1f77bcf86cd799439011","isNewChat":false}

data: {"type":"content","content":"Our"}

data: {"type":"content","content":" pricing"}

data: {"type":"content","content":" starts"}

data: {"type":"content","content":" at"}

data: {"type":"content","content":" $99"}

data: {"type":"content","content":"/month"}

data: {"type":"message_finalized","message":{"role":"assistant","content":"Our pricing starts at $99/month..."}}

data: {"type":"done","message":{"role":"assistant","content":"Our pricing starts at $99/month..."},"chatId":"507f1f77bcf86cd799439011"}
```

**Note**: When continuing a chat, the initial greeting is not included in the stream. Only the new assistant message is streamed.

**Error Responses:**
- `403 Forbidden`: Public chat disabled for site
- `404 Not Found`: Chat not found or doesn't belong to this site
- `429 Too Many Requests`: Rate limit exceeded

### POST /public/chat/stream

Send a chat message with streaming response using Server-Sent Events (SSE).

**URL**: `https://api.clearideas.local/public/chat/stream` (development)
**URL**: `https://api.clearideas.com/public/chat/stream` (production)

**Headers:**
```
Authorization: Bearer {widget_access_key}
Content-Type: application/json
Origin: {your_website_origin}  // Must match an allowed origin
Accept: text/event-stream
```

**Important:** Include credentials (cookies) with requests to maintain user session:
```javascript
fetch(url, {
  credentials: 'include'  // Required for cookie-based user tracking
})
```

**Request Body:**
```json
{
  "message": {
    "content": "What products do you offer?",
    "aiModel": "groq-gpt-oss-120b"  // Optional, uses system config default if omitted
  }
}
```

**Response (200 OK - Streaming):**

The response is sent as Server-Sent Events (SSE) using the [Unified Event Schema](#unified-event-schema). See that section for complete event documentation.

**Note**: Tool calls and tool call responses are filtered from the final `done` message. Only user and assistant messages with content are included.

## Unified Event Schema

All streaming endpoints (both text and voice chat) use a unified event schema via Server-Sent Events (SSE). This allows clients to handle updates consistently across both modes.

### Event Types

#### `info` - Initial Connection Info
Sent immediately when the stream starts. Contains chat identification and context.

**Fields:**
- `type`: `"info"`
- `id` (string): Chat ID
- `isNewChat` (boolean): Whether this is a new chat session
- `chatName` (string, optional): Name of the chat bot (voice mode)
- `chatId` (string, optional): Chat ID (alternative to `id`)

**Example:**
```json
{
  "type": "info",
  "id": "507f1f77bcf86cd799439011",
  "isNewChat": true,
  "chatName": "Support Assistant"
}
```

**When:** Sent once at the start of every stream.

---

#### `transcript` - Transcribed Text (Voice Mode Only)
Sent immediately after speech-to-text transcription completes. Allows clients to display what the user said before the LLM response is generated.

**Fields:**
- `type`: `"transcript"`
- `transcript` (string): The transcribed text from the audio input

**Example:**
```json
{
  "type": "transcript",
  "transcript": "What products do you offer?"
}
```

**When:** Sent once after STT completes, only in voice mode streams.

---

#### `content` - Streaming LLM Response Chunks
Sent as the LLM generates its response. Multiple `content` events are sent as text chunks arrive.

**Fields:**
- `type`: `"content"`
- `content` (string): A chunk of the LLM response text

**Example:**
```json
{
  "type": "content",
  "content": "We offer a variety"
}
```

**When:** Sent multiple times as the LLM generates its response (both text and voice modes).

---

#### `thinking` - Reasoning/Thinking Content (Optional)
Sent when the model outputs reasoning or thinking content (if supported by the model).

**Fields:**
- `type`: `"thinking"`
- `thinking` (string): Reasoning or thinking content

**Example:**
```json
{
  "type": "thinking",
  "thinking": "Let me search for product information..."
}
```

**When:** Sent if the model supports reasoning output (both text and voice modes).

---

#### `toolCall` - Tool Call Notification
Sent when the LLM invokes a tool (e.g., `retrieve_context`, `lead_capture`).

**Fields:**
- `type`: `"toolCall"`
- `toolCall` (object): Tool call details
  - `id` (string): Tool call ID
  - `function` (object): Function details
    - `name` (string): Tool name
    - `arguments` (string): JSON string of arguments

**Example:**
```json
{
  "type": "toolCall",
  "toolCall": {
    "id": "call_abc123",
    "function": {
      "name": "retrieve_context",
      "arguments": "{\"query\":\"products\"}"
    }
  }
}
```

**When:** Sent when tools are invoked (both text and voice modes).

---

#### `toolCallComplete` - Tool Call Finished
Sent when a tool call completes execution.

**Fields:**
- `type`: `"toolCallComplete"`

**Example:**
```json
{
  "type": "toolCallComplete"
}
```

**When:** Sent after each tool call completes (both text and voice modes).

---

#### `message_finalized` - Complete Message
Sent when a complete message (user or assistant) is finalized.

**Fields:**
- `type`: `"message_finalized"`
- `message` (object): Complete message object
  - `role` (string): `"user"` or `"assistant"`
  - `content` (string): Complete message content

**Example:**
```json
{
  "type": "message_finalized",
  "message": {
    "role": "assistant",
    "content": "We offer a variety of products including..."
  }
}
```

**When:** Sent when a message is complete (both text and voice modes). For voice mode, this is sent after the LLM response is generated but before TTS.

---

#### `audioChunk` - Streaming Audio Chunks (Voice Mode Only)
Sent as complete WebM clusters arrive from the TTS API. These chunks are properly fragmented WebM clusters that can be used with MediaSource API for progressive playback.

**Fields:**
- `type`: `"audioChunk"`
- `audioChunk` (string): Base64-encoded WebM/Opus audio chunk (complete WebM cluster or initialization segment)
- `audioChunkIndex` (number, optional): Chunk sequence number for ordering
- `isInitSegment` (boolean, optional): `true` if this is the WebM initialization segment (EBML header + Segment). Only the first chunk will have this flag set to `true`.

**Example (Initialization Segment):**
```json
{
  "type": "audioChunk",
  "audioChunk": "base64encodedinitsegment...",
  "audioChunkIndex": 0,
  "isInitSegment": true
}
```

**Example (Cluster):**
```json
{
  "type": "audioChunk",
  "audioChunk": "base64encodedclusterdata...",
  "audioChunkIndex": 1,
  "isInitSegment": false
}
```

**When:** Sent multiple times as WebM clusters arrive from TTS API, only in voice mode streams. The first chunk contains the initialization segment (`isInitSegment: true`), followed by individual clusters. These chunks can be used with MediaSource API for progressive playback.

---

#### `audio` - Audio Data (Voice Mode Only)
Sent after text-to-speech conversion completes. Contains the complete audio response. This event is sent for backward compatibility, even when `audioChunk` events are used.

**Fields:**
- `type`: `"audio"`
- `audio` (string): Base64-encoded WebM/Opus audio data (complete)

**Example:**
```json
{
  "type": "audio",
  "audio": "base64encodedwebmaudiodata..."
}
```

**When:** Sent once after TTS completes, only in voice mode streams. Clients can use this if they prefer to wait for the complete audio rather than handling chunks.

---

#### `done` - Stream Complete
Sent as the final event when the stream completes. Contains all final data for the interaction.

**Fields:**
- `type`: `"done"`
- `chatId` (string): Chat ID
- `chatName` (string, optional): Chat bot name
- `message` (object, text mode): Final assistant message
  - `role` (string): `"assistant"`
  - `content` (string): Complete message content
- `transcript` (string, voice mode): Transcribed user input
- `response` (string, voice mode): Formatted response text with source citations
- `audio` (string, voice mode): Base64-encoded WebM/Opus audio data
- `traceId` (string, optional): Trace ID for debugging

**Example (Text Mode):**
```json
{
  "type": "done",
  "message": {
    "role": "assistant",
    "content": "Our pricing starts at $99/month..."
  },
  "chatId": "507f1f77bcf86cd799439011",
  "traceId": "trace_abc123"
}
```

**Example (Voice Mode):**
```json
{
  "type": "done",
  "chatId": "507f1f77bcf86cd799439011",
  "chatName": "Support Assistant",
  "transcript": "What products do you offer?",
  "response": "We offer a variety of products... [yourdomain.com](https://yourdomain.com/products){data-original-url=\"https://yourdomain.com/products\"}",
  "audio": "base64encodedwebmaudiodata..."
}
```

**When:** Sent once at the end of every successful stream.

---

#### `error` - Error Occurred
Sent when an error occurs during processing.

**Fields:**
- `type`: `"error"`
- `error` (string): Error message
- `statusCode` (number, optional): HTTP status code

**Example:**
```json
{
  "type": "error",
  "error": "Audio transcription failed: Invalid audio format",
  "statusCode": 500
}
```

**When:** Sent when an error occurs. The stream ends after this event.

---

### Event Flow Comparison

#### Text Chat Stream Flow:
1. `info` → Initial connection info
2. `content` → Streaming LLM response chunks (multiple)
3. `thinking` → Reasoning content (optional, if supported)
4. `toolCall` → Tool invocations (optional, if tools are used)
5. `toolCallComplete` → Tool completions (optional)
6. `message_finalized` → Complete assistant message
7. `done` → Final event with complete data

#### Voice Chat Stream Flow:
1. `info` → Initial connection info
2. `transcript` → Transcribed user input (sent immediately after STT)
3. `content` → Streaming LLM response chunks (multiple)
4. `thinking` → Reasoning content (optional, if supported)
5. `toolCall` → Tool invocations (optional, if tools are used)
6. `toolCallComplete` → Tool completions (optional)
7. `message_finalized` → Complete assistant message
8. `audioChunk` → Streaming audio chunks (multiple, as they arrive from TTS)
9. `audio` → Complete audio response (sent after all chunks, for backward compatibility)
10. `done` → Final event with all data (transcript, response, audio)

### Client Implementation Tips

1. **Handle All Event Types**: Implement handlers for all event types, even if you don't use all of them. This ensures compatibility with future updates.

2. **Buffer Content**: Accumulate `content` chunks to build the complete response:
   ```javascript
   let accumulatedContent = ''
   // On each 'content' event:
   accumulatedContent += event.content
   ```

3. **Display Transcript Early**: In voice mode, display the `transcript` immediately to show what the user said, even before the LLM response starts.

4. **Handle Audio Streaming**: For voice mode, audio chunks are properly fragmented WebM clusters that support progressive playback:

   **Recommended Approach - Progressive Playback with MediaSource**: Use `audioChunk` events for progressive playback:
   ```javascript
   let mediaSource = null
   let sourceBuffer = null
   let initSegmentReceived = false

   // Initialize MediaSource when first chunk arrives
   if (event.type === 'audioChunk') {
     if (!mediaSource) {
       mediaSource = new MediaSource()
       const audioUrl = URL.createObjectURL(mediaSource)
       const audio = new Audio(audioUrl)
       audio.play()

       mediaSource.addEventListener('sourceopen', () => {
         // Add source buffer for WebM/Opus
         sourceBuffer = mediaSource.addSourceBuffer('audio/webm; codecs="opus"')
       })
     }

     const chunkBlob = await fetch(`data:audio/webm;base64,${event.audioChunk}`).then(r => r.blob())
     const chunkBuffer = await chunkBlob.arrayBuffer()

     if (event.isInitSegment) {
       // First chunk is initialization segment
       if (sourceBuffer && !sourceBuffer.updating) {
         sourceBuffer.appendBuffer(chunkBuffer)
         initSegmentReceived = true
       }
     } else {
       // Subsequent chunks are clusters - append to source buffer
       if (sourceBuffer && !sourceBuffer.updating && initSegmentReceived) {
         sourceBuffer.appendBuffer(chunkBuffer)
       }
     }
   }

   // When stream ends, end MediaSource
   if (event.type === 'done') {
     if (mediaSource && mediaSource.readyState === 'open') {
       mediaSource.endOfStream()
     }
   }
   ```

   **Fallback Approach - Use Complete Audio**: If you prefer simpler implementation, wait for the `audio` event:
   ```javascript
   if (event.type === 'audio') {
     const audioBlob = await fetch(`data:audio/webm;base64,${event.audio}`).then(r => r.blob())
     const audioUrl = URL.createObjectURL(audioBlob)
     const audio = new Audio(audioUrl)
     audio.play()
   }
   ```

   **Note**: The `audioChunk` events are now properly fragmented into complete WebM clusters and initialization segments, making them compatible with MediaSource API for progressive playback. The first chunk will have `isInitSegment: true` and contains the WebM initialization segment, followed by individual clusters.

5. **Error Handling**: Always check for `error` events and handle them gracefully.

6. **Use `done` Event**: The `done` event contains all final data. You can use it to verify completeness or recover missed events.

## Implementation Examples

### Starting a New Chat

### JavaScript/TypeScript (Fetch API - Non-Streaming)

```typescript
const WIDGET_KEY = 'widget_abc123def456...'  // Your widget access key
const API_URL = 'https://api.clearideas.com/public/chat'

interface ChatMessage {
  content: string
  aiModel?: string
}

interface ChatResponse {
  chatId: string
  chatName: string
  messages: Array<{
    role: string
    content: string  // Contains markdown with embedded source links
  }>
}

async function sendChatMessage(message: ChatMessage, chatId?: string): Promise<ChatResponse> {
  // Use chatId if provided to continue existing conversation
  const url = chatId ? `${API_URL}/${chatId}` : API_URL

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WIDGET_KEY}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',  // Required for cookie-based user tracking
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  return response.json()
}

// Usage
try {
  const result = await sendChatMessage({
    content: 'What products do you offer?'
  })
  console.log('Chat ID:', result.chatId)
  console.log('Messages:', result.messages)
} catch (error) {
  console.error('Chat error:', error)
}
```

### JavaScript/TypeScript (Streaming with EventSource)

```typescript
const WIDGET_KEY = 'widget_abc123def456...'
const API_URL = 'https://api.clearideas.com/public/chat/stream'

interface StreamPayload {
  type: 'content' | 'thinking' | 'info' | 'toolCall' | 'toolCallComplete' | 'message_finalized' | 'done' | 'error'
  content?: string
  thinking?: string
  toolCall?: any
  message?: any
  error?: string
  id?: string
  isNewChat?: boolean
  chatId?: string
  statusCode?: number
}

async function sendChatMessageStream(
  message: { content: string; aiModel?: string },
  chatId: string | null,
  onContent: (content: string) => void,
  onComplete: (finalMessage: any, chatId: string) => void,
  onError: (error: string) => void
): Promise<void> {
  // Use chatId if provided to continue existing conversation
  const url = chatId ? `${API_URL}/${chatId}/stream` : `${API_URL}/stream`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WIDGET_KEY}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include',  // Required for cookie-based user tracking
    body: JSON.stringify({ message }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Response body is null')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6)) as StreamPayload

          switch (data.type) {
            case 'content':
              if (data.content) onContent(data.content)
              break
            case 'thinking':
              // Handle thinking content if needed
              break
            case 'done':
              if (data.message && data.chatId) {
                onComplete(data.message, data.chatId)
              }
              return
            case 'error':
              onError(data.error || 'Unknown error')
              return
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

// Usage - new chat
sendChatMessageStream(
  { content: 'What products do you offer?' },
  null,  // No chatId for new chat
  (content) => {
    // Stream content chunks as they arrive
    console.log('Streaming:', content)
  },
  (finalMessage, chatId) => {
    // Final complete message
    console.log('Complete:', finalMessage)
    console.log('Chat ID:', chatId)
    // Store chatId for future messages
  },
  (error) => {
    console.error('Stream error:', error)
  }
)

// Usage - continue existing chat
sendChatMessageStream(
  { content: 'Tell me more about pricing' },
  '507f1f77bcf86cd799439011',  // Use chatId from previous response
  (content) => {
    console.log('Streaming:', content)
  },
  (finalMessage, chatId) => {
    console.log('Complete:', finalMessage)
  },
  (error) => {
    console.error('Stream error:', error)
  }
)
```

### React Hook Example

```typescript
import { useState } from 'react'

const WIDGET_KEY = 'widget_abc123def456...'
const API_URL = 'https://api.clearideas.com/public/chat'

interface Message {
  role: 'user' | 'assistant'
  content: string  // Assistant messages contain markdown with embedded source links
}

export function usePublicChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatId, setChatId] = useState<string | null>(null)
  const [chatName, setChatName] = useState<string>('')

  // Initialize widget and load existing chat if available
  useEffect(() => {
    const initWidget = async () => {
      try {
        const response = await fetch('https://api.clearideas.com/public/chat/init', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${WIDGET_KEY}`,
            'Content-Type': 'application/json',
          },
          credentials: 'include',
        })

        if (response.ok) {
          const initData = await response.json()
          setChatName(initData.chatName)

          // If existing chat found, load previous messages
          if (initData.existingChat) {
            setChatId(initData.existingChat.chatId)
            setMessages(initData.existingChat.messages)
          }
        }
      } catch (err) {
        console.error('Failed to initialize widget:', err)
      }
    }

    initWidget()
  }, [])

  const sendMessage = async (content: string) => {
    setLoading(true)
    setError(null)

    try {
      // Use chatId if available to continue conversation
      const url = chatId ? `${API_URL}/${chatId}` : API_URL

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WIDGET_KEY}`,
          'Content-Type': 'application/json',
        },
        credentials: 'include',  // Required for cookie-based user tracking
        body: JSON.stringify({ message: { content } }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
        throw new Error(errorData.message || `HTTP ${response.status}`)
      }

      const data = await response.json()

      // Update chatId if not already set (first message in new chat)
      if (!chatId && data.chatId) {
        setChatId(data.chatId)
      }

      if (data.chatName) {
        setChatName(data.chatName)
      }

      // Add user message
      setMessages(prev => [...prev, { role: 'user', content }])

      // Add assistant messages (only new messages are returned when continuing a chat)
      setMessages(prev => [...prev, ...data.messages])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  return {
    messages,
    loading,
    error,
    chatId,
    chatName,
    sendMessage,
  }
}
```

### Vue 3 Composition API Example

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'

const WIDGET_KEY = 'widget_abc123def456...'
const API_URL = 'https://api.clearideas.com/public/chat'

interface Message {
  role: 'user' | 'assistant'
  content: string  // Assistant messages contain markdown with embedded source links
}

const messages = ref<Message[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const chatId = ref<string | null>(null)
const chatName = ref<string>('')
const inputText = ref('')

// Initialize widget on mount
onMounted(async () => {
  try {
    const response = await fetch('https://api.clearideas.com/public/chat/init', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${WIDGET_KEY}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    })

    if (response.ok) {
      const initData = await response.json()
      chatName.value = initData.chatName

      // If existing chat found, load previous messages
      if (initData.existingChat) {
        chatId.value = initData.existingChat.chatId
        messages.value = initData.existingChat.messages
      }
    }
  } catch (err) {
    console.error('Failed to initialize widget:', err)
  }
})

async function sendMessage() {
  if (!inputText.value.trim() || loading.value) return

  loading.value = true
  error.value = null

  try {
    // Use chatId if available to continue conversation
    const url = chatId.value ? `${API_URL}/${chatId.value}` : API_URL

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WIDGET_KEY}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',  // Required for cookie-based user tracking
      body: JSON.stringify({ message: { content: inputText.value } }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }))
      throw new Error(errorData.message || `HTTP ${response.status}`)
    }

    const data = await response.json()

    // Update chatId if not already set (first message in new chat)
    if (!chatId.value && data.chatId) {
      chatId.value = data.chatId
    }

    if (data.chatName) {
      chatName.value = data.chatName
    }

    messages.value.push({ role: 'user', content: inputText.value })
    // Add assistant messages (only new messages are returned when continuing a chat)
    messages.value.push(...data.messages)

    inputText.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to send message'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="chat-widget">
    <div v-if="chatName" class="chat-header">
      <h3>{{ chatName }}</h3>
    </div>

    <div class="messages">
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :class="['message', msg.role]"
      >
        <!-- Render markdown content (sources are embedded as links with data-original-url) -->
        <div class="content" v-html="renderMarkdown(msg.content)"></div>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="input-area">
      <input
        v-model="inputText"
        @keyup.enter="sendMessage"
        placeholder="Type your message..."
        :disabled="loading"
      />
      <button @click="sendMessage" :disabled="loading || !inputText.trim()">
        {{ loading ? 'Sending...' : 'Send' }}
      </button>
    </div>
  </div>
</template>
```

## Enabled Tools

The widget supports several tools that can be enabled via the `toolsEnabled` setting:

- **`retrieve_context`**: Allows the AI to search and retrieve relevant content from your site
- **`lead_capture`**: Enables lead capture functionality for collecting visitor information (also accepts `lead.capture` for backward compatibility)

Only enabled tools will be available to the AI during conversations. Configure these based on your needs:

```json
{
  "toolsEnabled": ["retrieve_context", "lead_capture"]
}
```

**Note**: Tool calls and tool call responses are automatically filtered from API responses. Only user and assistant messages with content are returned to clients.

## Chat Sessions and User Tracking

The public chat widget uses a dual-method approach to track anonymous users: **cookies** (primary, persistent across sessions) and **session headers** (fallback when cookies are blocked). This ensures continuity even in third-party widget scenarios or when users have cookie blocking enabled.

### Cookie-Based User Tracking (Primary Method)

- **Automatic**: Cookies are set automatically by the server when a visitor first interacts with the widget
- **Persistent**: Cookies persist for 1 year, allowing visitors to resume conversations even after closing the browser
- **Anonymous**: No personal information is stored in cookies - only an anonymous user ID
- **Primary**: The server checks cookies first for user identification

### Session Header Tracking (Fallback for Cookie-Blocked Scenarios)

When cookies are blocked (common in third-party widget scenarios), the widget uses session header tracking as a fallback. **Session initialization happens at the `/init` endpoint:**

1. **Call `/init` first**: Always call `GET /public/chat/init` when the widget loads
2. **Session ID generation**: If no session ID is provided, the server generates a UUID session ID
3. **Response header**: The server returns the session ID in the `x-clearideas-public-chat-session-id` response header
4. **Client storage**: Clients should store this session ID (in `localStorage` or `sessionStorage`)
5. **Subsequent requests**: Include the stored session ID in the `x-clearideas-public-chat-session` request header for all subsequent API calls

#### Client Implementation for Session Header Fallback

```javascript
// Initialize session tracking (call this when widget loads)
let sessionId = localStorage.getItem('publicChatSessionId')

async function initChat() {
  const headers = {
    'Authorization': `Bearer ${accessKey}`,
    ...(sessionId ? { 'x-clearideas-public-chat-session': sessionId } : {})
  }

  const response = await fetch('https://api.clearideas.local/public/chat/init', {
    method: 'GET',
    headers,
    credentials: 'include'
  })

  // Store session ID from response header (initialized at /init)
  const responseSessionId = response.headers.get('x-clearideas-public-chat-session-id')
  if (responseSessionId) {
    sessionId = responseSessionId
    localStorage.setItem('publicChatSessionId', sessionId)
  }

  return response.json()
}

// Use session ID in all subsequent requests
async function makeChatRequest(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessKey}`,
    ...(sessionId ? { 'x-clearideas-public-chat-session': sessionId } : {}),
    ...options.headers
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // Still include for cookie fallback
  })

  return response
}
```

**Important**:
- **Session initialization only happens at `/init`** - always call this endpoint first
- The server automatically falls back to session headers when cookies aren't available
- Clients only need to read `x-clearideas-public-chat-session-id` from `/init` response and include `x-clearideas-public-chat-session` header in subsequent requests

### Continuing Conversations

When a visitor returns to your site:

1. **Call `/init` endpoint**: When the widget loads, call `GET /public/chat/init` with credentials included
2. **Check for existing chat**: If `existingChat` is present in the response, load the previous messages
3. **Use the chatId**: Use `existingChat.chatId` for all subsequent requests to continue the conversation
4. **Send messages**: Use `POST /public/chat/:id` or `POST /public/chat/:id/stream` with the `chatId` to continue

### Starting New Chats

- **No existing chat**: If `/init` doesn't return `existingChat`, start a new conversation
- **New chat endpoint**: Use `POST /public/chat` or `POST /public/chat/stream` without a `chatId`
- **Get chatId**: The response will include a `chatId` - save this for continuing the conversation

### Important: Cookie Credentials

**All API requests must include credentials to maintain user sessions:**

```javascript
// ✅ Correct - includes credentials
fetch(url, {
  credentials: 'include'
})

// ❌ Incorrect - cookies won't be sent
fetch(url, {
  // Missing credentials: 'include'
})
```

Without credentials, each request will create a new anonymous user, preventing conversation continuity.

**Note**: Chat history is maintained server-side for each anonymous user. When continuing a chat, only new messages are returned in the response (not the full history).

## Message Filtering

Tool calls and tool call responses are automatically filtered from API responses. Only user and assistant messages with content are returned. This ensures a clean conversation experience for end users without exposing internal tool usage details.

- Tool calls (messages with `role: "tool"`) are filtered out
- Assistant messages that are tool call responses are filtered out
- Only messages with actual content (`content` field with text) are included

## Source Attribution in Message Content

When the AI references content from your site, source citations are embedded directly in the message content as markdown links. These links include the original URL where the content was retrieved from.

### Markdown Link Format

Sources appear in assistant message content using domain-based citation links in the following format:

```
[example.com](https://example.com/page){data-original-url="https://example.com/page"}
```

Where:
- `[example.com]` is the domain extracted from the source URL - displayed as a clickable link
- `(https://example.com/page)` is the URL that the citation links to (the original source URL)
- `{data-original-url="..."}` contains the `data-original-url` attribute with the original source URL

The domain is automatically extracted from the original URL (with `www.` prefix removed if present). If domain extraction fails, it defaults to `"source"`.

### Processing Source Links

When rendering assistant messages, clients should:

1. **Parse markdown content**: Use a markdown parser that supports attributes (e.g., markdown-it with markdown-it-attrs plugin)
2. **Extract `data-original-url`**: Access the `data-original-url` attribute from rendered link elements to get the original source URL
3. **Display citations**: Show domain citations ([[example.com]], [[another-site.com]], etc.) as clickable links that navigate to the original source

### Example Message Content

```json
{
  "role": "assistant",
  "content": "Based on our documentation [yourdomain.com](https://yourdomain.com/docs/getting-started){data-original-url=\"https://yourdomain.com/docs/getting-started\"}, you can get started by following these steps..."
}
```

When rendered, this will appear as:
> Based on our documentation [yourdomain.com](https://yourdomain.com/docs/getting-started), you can get started by following these steps...

### Client Implementation Example

```javascript
// Example: Extract data-original-url from rendered markdown links
function processMessageContent(content) {
  // After rendering markdown to HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(renderedMarkdown, 'text/html')

  // Find all links with data-original-url
  const sourceLinks = doc.querySelectorAll('a[data-original-url]')

  sourceLinks.forEach(link => {
    const originalUrl = link.getAttribute('data-original-url')
    // Use originalUrl for tracking, analytics, or custom link handling
    console.log('Source URL:', originalUrl)
  })

  return doc.body.innerHTML
}
```

**Note**: Only sources with public URLs (from content that has an `originalUrl`) will appear as clickable links. Sources without public URLs are automatically removed from the content.

## Rate Limiting

The public chat endpoint is subject to rate limiting based on access key failures. Check the response headers for rate limit information:

- `RateLimit-Limit`: Total requests allowed
- `RateLimit-Remaining`: Remaining requests
- `RateLimit-Reset`: Seconds until reset
- `Retry-After`: Seconds to wait (on 429 responses)

## Security Best Practices

1. **Never expose API keys**: Only use widget-type access keys in frontend code
2. **Use HTTPS**: Always use HTTPS in production
3. **Validate origins**: Only add trusted origins to `allowedOrigins`
4. **Rotate keys**: Regularly rotate access keys
5. **Monitor usage**: Monitor chat usage and rate limits
6. **Validate input**: Validate user input before sending to the API
7. **Handle errors gracefully**: Display user-friendly error messages

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
- Check the main API documentation
- Review the test files in `test/tests/public-widget-chat.test.ts` for examples
- Contact Clear Ideas support
