// Site configuration. A real server loads this from its database; the access key maps to a site.
// Text a visitor reads can be given per language (`Localized`, see i18n.ts).

import type { Localized } from './i18n.ts'

export interface SiteLink {
  title: Localized
  description?: Localized
  url: string
}

export interface SiteConfig {
  /** Internal site ID. Never sent to the browser. */
  id: string
  /** Public widget access key (protocol README §4). Visible to visitors; not a secret. */
  accessKey: string
  enabled: boolean
  /**
   * Origins allowed to use this site from a browser. Supported patterns:
   * - exact: `https://www.example.com`
   * - subdomain wildcard: `https://*.example.com`
   * - any port on loopback: `http://localhost` also matches `http://localhost:3000`
   * - `*`: any origin (local testing only)
   */
  allowedOrigins: string[]
  chatName: Localized
  /** Greeting. `{{chatName}}` is replaced. */
  initialMessage: Localized
  chatTagline?: Localized
  heroGreeting?: Localized
  iconUrl?: string
  style?: { color?: string; mode?: 'light' | 'dark' | 'system' }
  links?: SiteLink[]
  helloBubbleEnabled?: boolean
  helloBubbleText?: Localized
  helloBubbleDelay?: number
  disclaimerText?: Localized
  disclaimerDialogEnabled?: boolean
  disclaimerDialogText?: Localized
  /**
   * Optional voice profiles (protocol README §2): recorded voice and realtime voice over the
   * WebSocket relay. Either one advertises `voiceEnabled: true`.
   */
  voice?: { recorded: boolean; realtime: boolean }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function originMatches(origin: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (origin === pattern) return true

  let originUrl: URL
  let patternUrl: URL
  try {
    originUrl = new URL(origin)
    patternUrl = new URL(pattern.replace('://*.', '://wildcard.'))
  } catch {
    return false
  }
  if (originUrl.protocol !== patternUrl.protocol) return false

  if (pattern.includes('://*.')) {
    const suffix = patternUrl.host.slice('wildcard'.length) // ".example.com[:port]"
    return originUrl.host.endsWith(suffix) && originUrl.host.length > suffix.length
  }

  // A loopback pattern without a port matches any port (local development).
  return (
    !patternUrl.port &&
    LOOPBACK_HOSTS.has(patternUrl.hostname) &&
    originUrl.hostname === patternUrl.hostname
  )
}

export function isOriginAllowed(site: SiteConfig, origin: string): boolean {
  return site.allowedOrigins.some(pattern => originMatches(origin, pattern))
}

export const DEFAULT_DEV_ORIGINS = ['http://localhost', 'http://127.0.0.1']

/** A normal, well-behaved site. */
export function createDemoSite(allowedOrigins: string[] = DEFAULT_DEV_ORIGINS): SiteConfig {
  return {
    id: 'site-demo',
    accessKey: 'demo-public-key',
    enabled: true,
    allowedOrigins,
    // A personal name reads naturally in every language.
    chatName: 'Ada',
    initialMessage: {
      en: "Hi, I'm {{chatName}}. This is a local test server with canned replies. Type `/fixture help` to see the scenarios.",
      fr: 'Bonjour, je suis {{chatName}}. Ceci est un serveur de test local aux réponses préenregistrées. Tapez `/fixture help` pour voir les scénarios.',
      es: 'Hola, soy {{chatName}}. Este es un servidor de pruebas local con respuestas predefinidas. Escribe `/fixture help` para ver los escenarios.',
      de: 'Hallo, ich bin {{chatName}}. Dies ist ein lokaler Testserver mit vorgefertigten Antworten. Geben Sie `/fixture help` ein, um die Szenarien zu sehen.',
      it: 'Ciao, sono {{chatName}}. Questo è un server di test locale con risposte predefinite. Scrivi `/fixture help` per vedere gli scenari.',
      pt: 'Olá, eu sou {{chatName}}. Este é um servidor de teste local com respostas prontas. Digite `/fixture help` para ver os cenários.',
      nl: "Hallo, ik ben {{chatName}}. Dit is een lokale testserver met vaste antwoorden. Typ `/fixture help` om de scenario's te zien.",
      pl: 'Cześć, jestem {{chatName}}. To lokalny serwer testowy z gotowymi odpowiedziami. Wpisz `/fixture help`, aby zobaczyć scenariusze.',
      ja: 'こんにちは、{{chatName}}です。これは定型の応答を返すローカルのテストサーバーです。`/fixture help` と入力するとシナリオの一覧が表示されます。',
      ko: '안녕하세요, {{chatName}}입니다. 미리 준비된 답변을 보내는 로컬 테스트 서버입니다. 시나리오를 보려면 `/fixture help`를 입력하세요.',
      'zh-Hans':
        '你好，我是 {{chatName}}。这是一个返回预设回复的本地测试服务器。输入 `/fixture help` 查看测试场景。',
      'zh-Hant':
        '你好，我是 {{chatName}}。這是一個回傳預設回覆的本機測試伺服器。輸入 `/fixture help` 查看測試情境。',
      ar: 'مرحبًا، أنا {{chatName}}. هذا خادم اختبار محلي يرد بردود معدّة مسبقًا. اكتب `/fixture help` لعرض السيناريوهات.',
    },
    chatTagline: {
      en: 'Local test server',
      fr: 'Serveur de test local',
      es: 'Servidor de pruebas local',
      de: 'Lokaler Testserver',
      it: 'Server di test locale',
      pt: 'Servidor de teste local',
      nl: 'Lokale testserver',
      pl: 'Lokalny serwer testowy',
      ja: 'ローカルのテストサーバー',
      ko: '로컬 테스트 서버',
      'zh-Hans': '本地测试服务器',
      'zh-Hant': '本機測試伺服器',
      ar: 'خادم اختبار محلي',
    },
    heroGreeting: {
      en: 'What would you like to test?',
      fr: 'Que voulez-vous tester\u00a0?',
      es: '¿Qué quieres probar?',
      de: 'Was möchten Sie testen?',
      it: 'Cosa vuoi provare?',
      pt: 'O que você quer testar?',
      nl: 'Wat wil je testen?',
      pl: 'Co chcesz przetestować?',
      ja: '何をテストしますか？',
      ko: '무엇을 테스트할까요?',
      'zh-Hans': '您想测试什么？',
      'zh-Hant': '您想測試什麼？',
      ar: 'ماذا تريد أن تختبر؟',
    },
    style: { color: '#2866cf', mode: 'system' },
    links: [
      {
        title: {
          en: 'Protocol specification',
          fr: 'Spécification du protocole',
          es: 'Especificación del protocolo',
          de: 'Protokollspezifikation',
          it: 'Specifica del protocollo',
          pt: 'Especificação do protocolo',
          nl: 'Protocolspecificatie',
          pl: 'Specyfikacja protokołu',
          ja: 'プロトコル仕様',
          ko: '프로토콜 사양',
          'zh-Hans': '协议规范',
          'zh-Hant': '通訊協定規格',
          ar: 'مواصفات البروتوكول',
        },
        description: {
          en: 'How the widget talks to servers',
          fr: 'Comment le widget communique avec les serveurs',
          es: 'Cómo se comunica el widget con los servidores',
          de: 'Wie das Widget mit Servern kommuniziert',
          it: 'Come il widget comunica con i server',
          pt: 'Como o widget se comunica com os servidores',
          nl: 'Hoe de widget met servers communiceert',
          pl: 'Jak widżet komunikuje się z serwerami',
          ja: 'ウィジェットとサーバーの通信方法',
          ko: '위젯이 서버와 통신하는 방법',
          'zh-Hans': '小组件如何与服务器通信',
          'zh-Hant': '小工具如何與伺服器通訊',
          ar: 'كيف تتواصل الأداة مع الخوادم',
        },
        url: 'https://github.com/clearideas/chat/blob/main/docs/protocol/README.md',
      },
    ],
    disclaimerText: {
      en: 'Test server: replies are canned fixtures, not AI output.',
      fr: 'Serveur de test\u00a0: les réponses sont préenregistrées, pas générées par une IA.',
      es: 'Servidor de pruebas: las respuestas son predefinidas, no generadas por IA.',
      de: 'Testserver: Die Antworten sind vorgefertigt, nicht KI-generiert.',
      it: "Server di test: le risposte sono predefinite, non generate dall'IA.",
      pt: 'Servidor de teste: as respostas são prontas, não geradas por IA.',
      nl: 'Testserver: de antwoorden zijn vooraf vastgelegd, niet door AI gegenereerd.',
      pl: 'Serwer testowy: odpowiedzi są przygotowane z góry, a nie generowane przez AI.',
      ja: 'テストサーバー：応答は定型文で、AI が生成したものではありません。',
      ko: '테스트 서버: 답변은 미리 준비된 것이며 AI가 생성한 것이 아닙니다.',
      'zh-Hans': '测试服务器：回复为预设内容，并非 AI 生成。',
      'zh-Hant': '測試伺服器：回覆為預設內容，並非 AI 產生。',
      ar: 'خادم اختبار: الردود معدّة مسبقًا وليست من إنتاج الذكاء الاصطناعي.',
    },
  }
}

/** A site whose chat is switched off. Every authenticated request gets 403. */
export function createDisabledSite(allowedOrigins: string[] = DEFAULT_DEV_ORIGINS): SiteConfig {
  return {
    ...createDemoSite(allowedOrigins),
    id: 'site-disabled',
    accessKey: 'disabled-public-key',
    enabled: false,
  }
}

/**
 * XSS probe marker. Every hostile payload below tries to set `window.__ciXss` to a label naming
 * the injection point, so a test can assert `window.__ciXss === undefined` after rendering.
 * The assignment uses no quote characters (`/label/.source` is the string "label"), so it works in
 * single-quoted, double-quoted and unquoted HTML attribute contexts alike.
 */
export const XSS_MARKER = '__ciXss'
export const xssProbe = (label: string) => `window.${XSS_MARKER}=/${label}/.source`
const mark = xssProbe

/**
 * A site whose configuration is hostile. A well-behaved server validates configuration
 * (protocol README §7.1); this one deliberately does not, so tests can prove the widget treats
 * every server-supplied string as untrusted.
 */
export function createAdversarialSite(allowedOrigins: string[] = DEFAULT_DEV_ORIGINS): SiteConfig {
  return {
    id: 'site-adversarial',
    accessKey: 'adversarial-public-key',
    enabled: true,
    allowedOrigins,
    chatName: `<img src=x onerror="${mark('chatName')}">Hostile Bot`,
    initialMessage: {
      en: [
        'Greeting with a hostile citation:',
        `[<img src=x onerror="${mark('greeting-tooltip')}">](/site/abc/file/def)`,
        `<img src=x onerror="${mark('greeting-html')}">`,
      ].join('\n\n'),
    },
    chatTagline: `<img src=x onerror="${mark('chatTagline')}">`,
    heroGreeting: `<img src=x onerror="${mark('heroGreeting')}">`,
    iconUrl: `x' onerror='${mark('iconUrl')}`,
    style: {
      color: 'red;background-image:url(https://attacker.example/beacon)',
      mode: 'system',
    },
    links: [
      { title: '<b>javascript link</b>', url: `javascript:${mark('link-javascript')}` },
      {
        title: 'data link',
        url: `data:text/html,<script>${mark('link-data')}</script>`,
      },
      { title: 'ordinary link', url: 'https://example.com/' },
    ],
    helloBubbleEnabled: true,
    helloBubbleText: `<img src=x onerror="${mark('helloBubble')}">`,
    helloBubbleDelay: 0,
    disclaimerText: `<img src=x onerror="${mark('disclaimer')}">`,
    disclaimerDialogEnabled: true,
    disclaimerDialogText: `<img src=x onerror="${mark('disclaimerDialog')}">`,
  }
}

/** The demo site with voice: realtime voice over the relay, and recorded voice. */
export function createVoiceSite(allowedOrigins: string[] = DEFAULT_DEV_ORIGINS): SiteConfig {
  return {
    ...createDemoSite(allowedOrigins),
    id: 'site-voice',
    accessKey: 'voice-public-key',
    voice: { recorded: true, realtime: true },
  }
}

/**
 * The demo site with recorded voice only. Realtime voice is refused, so the widget offers
 * "Use recorded voice instead" (its fallback path).
 */
export function createRecordedVoiceSite(
  allowedOrigins: string[] = DEFAULT_DEV_ORIGINS,
): SiteConfig {
  return {
    ...createDemoSite(allowedOrigins),
    id: 'site-recorded-voice',
    accessKey: 'recorded-voice-public-key',
    voice: { recorded: true, realtime: false },
  }
}

export function createDefaultSites(allowedOrigins: string[] = DEFAULT_DEV_ORIGINS): SiteConfig[] {
  return [
    createDemoSite(allowedOrigins),
    createDisabledSite(allowedOrigins),
    createAdversarialSite(allowedOrigins),
    createVoiceSite(allowedOrigins),
    createRecordedVoiceSite(allowedOrigins),
  ]
}
