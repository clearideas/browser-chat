// Visitor-facing text in the server's responses, in the widget's languages. The widget sends its
// language in Accept-Language (protocol README §3.4); servers MAY localize what visitors read.
// Developer-facing text (fixture descriptions, sample content) stays in English.

import type { IncomingMessage } from 'node:http'

import { resolveLocale } from '../src/i18n/resolve.ts'
import { getHeader } from './http.ts'

/** Languages the test server localizes, matching the widget's built-in locales. */
export const SERVER_LANGUAGES = [
  'en',
  'fr',
  'es',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
  'ar',
] as const

/** A string, or strings by language (`en` is the fallback). */
export type Localized = string | Readonly<Partial<Record<string, string>>>

/** The request's language: the best match for Accept-Language, in q-value order. */
export function requestLanguage(req: IncomingMessage): string {
  const tags = (getHeader(req, 'accept-language') ?? '')
    .split(',')
    .map((part, index) => {
      const [tag = '', ...parameters] = part.trim().split(';')
      const q = parameters.map(p => p.trim()).find(p => p.startsWith('q='))
      return { tag: tag.trim(), q: q ? Number(q.slice(2)) : 1, index }
    })
    .filter(entry => entry.tag && entry.tag !== '*' && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(entry => entry.tag)
  return resolveLocale(tags, SERVER_LANGUAGES)
}

export function pick(value: Localized, language: string): string
export function pick(value: Localized | undefined, language: string): string | undefined
export function pick(value: Localized | undefined, language: string): string | undefined {
  if (value === undefined || typeof value === 'string') return value
  return value[language] ?? value.en
}

const MESSAGES = {
  echo: {
    en: 'You said: {text}',
    fr: 'Vous avez dit\u00a0: {text}',
    es: 'Dijiste: {text}',
    de: 'Sie sagten: {text}',
    it: 'Hai detto: {text}',
    pt: 'Você disse: {text}',
    nl: 'Je zei: {text}',
    pl: 'Napisano: {text}',
    ja: 'あなたのメッセージ：{text}',
    ko: '보낸 메시지: {text}',
    'zh-Hans': '您说：{text}',
    'zh-Hant': '您說：{text}',
    ar: 'قلت: {text}',
  },
  rateLimited: {
    en: 'Too many requests. Please wait and try again.',
    fr: 'Trop de requêtes. Veuillez patienter, puis réessayer.',
    es: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
    de: 'Zu viele Anfragen. Bitte warten Sie kurz und versuchen Sie es erneut.',
    it: 'Troppe richieste. Attendi e riprova.',
    pt: 'Muitas solicitações. Aguarde e tente novamente.',
    nl: 'Te veel verzoeken. Wacht even en probeer het opnieuw.',
    pl: 'Zbyt wiele żądań. Odczekaj chwilę i spróbuj ponownie.',
    ja: 'リクエストが多すぎます。しばらく待ってからもう一度お試しください。',
    ko: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    'zh-Hans': '请求过多，请稍后再试。',
    'zh-Hant': '要求過多，請稍後再試。',
    ar: 'طلبات كثيرة جدًا. يُرجى الانتظار ثم المحاولة مرة أخرى.',
  },
  unavailable: {
    en: 'The assistant is temporarily unavailable.',
    fr: "L'assistant est temporairement indisponible.",
    es: 'El asistente no está disponible temporalmente.',
    de: 'Der Assistent ist vorübergehend nicht verfügbar.',
    it: "L'assistente è temporaneamente non disponibile.",
    pt: 'O assistente está temporariamente indisponível.',
    nl: 'De assistent is tijdelijk niet beschikbaar.',
    pl: 'Asystent jest chwilowo niedostępny.',
    ja: 'アシスタントは一時的に利用できません。',
    ko: '어시스턴트를 일시적으로 사용할 수 없습니다.',
    'zh-Hans': '助手暂时不可用。',
    'zh-Hant': '助理暫時無法使用。',
    ar: 'المساعد غير متاح مؤقتًا.',
  },
  stoppedUnexpectedly: {
    en: 'The assistant stopped unexpectedly.',
    fr: "L'assistant s'est arrêté de manière inattendue.",
    es: 'El asistente se detuvo inesperadamente.',
    de: 'Der Assistent wurde unerwartet beendet.',
    it: "L'assistente si è interrotto inaspettatamente.",
    pt: 'O assistente parou inesperadamente.',
    nl: 'De assistent is onverwacht gestopt.',
    pl: 'Asystent nieoczekiwanie przerwał działanie.',
    ja: 'アシスタントが予期せず停止しました。',
    ko: '어시스턴트가 예기치 않게 중지되었습니다.',
    'zh-Hans': '助手意外停止。',
    'zh-Hant': '助理意外停止。',
    ar: 'توقف المساعد بشكل غير متوقع.',
  },
  messageTooLong: {
    en: 'Your message is too long. The limit is {max} characters.',
    fr: 'Votre message est trop long. La limite est de {max}\u00a0caractères.',
    es: 'Tu mensaje es demasiado largo. El límite es de {max} caracteres.',
    de: 'Ihre Nachricht ist zu lang. Das Limit liegt bei {max} Zeichen.',
    it: 'Il messaggio è troppo lungo. Il limite è di {max} caratteri.',
    pt: 'Sua mensagem é muito longa. O limite é de {max} caracteres.',
    nl: 'Je bericht is te lang. De limiet is {max} tekens.',
    pl: 'Wiadomość jest za długa. Limit wynosi {max} znaków.',
    ja: 'メッセージが長すぎます。上限は {max} 文字です。',
    ko: '메시지가 너무 깁니다. 최대 {max}자까지 입력할 수 있습니다.',
    'zh-Hans': '消息过长，最多 {max} 个字符。',
    'zh-Hant': '訊息過長，最多 {max} 個字元。',
    ar: 'رسالتك طويلة جدًا. الحد الأقصى {max} حرف.',
  },
  chatNotFound: {
    en: 'This conversation is no longer available. Please start a new chat.',
    fr: "Cette conversation n'est plus disponible. Veuillez démarrer un nouveau chat.",
    es: 'Esta conversación ya no está disponible. Inicia un chat nuevo.',
    de: 'Diese Unterhaltung ist nicht mehr verfügbar. Bitte starten Sie einen neuen Chat.',
    it: 'Questa conversazione non è più disponibile. Inizia una nuova chat.',
    pt: 'Esta conversa não está mais disponível. Inicie uma nova conversa.',
    nl: 'Dit gesprek is niet meer beschikbaar. Start een nieuwe chat.',
    pl: 'Ta rozmowa nie jest już dostępna. Rozpocznij nowy czat.',
    ja: 'この会話は利用できなくなりました。新しいチャットを開始してください。',
    ko: '이 대화는 더 이상 사용할 수 없습니다. 새 채팅을 시작해 주세요.',
    'zh-Hans': '此对话已不可用，请开始新的聊天。',
    'zh-Hant': '此對話已無法使用，請開始新的聊天。',
    ar: 'لم تعد هذه المحادثة متاحة. يُرجى بدء دردشة جديدة.',
  },
  voiceTranscript: {
    en: 'Voice message ({size} KB)',
    fr: 'Message vocal ({size}\u00a0Ko)',
    es: 'Mensaje de voz ({size} KB)',
    de: 'Sprachnachricht ({size} KB)',
    it: 'Messaggio vocale ({size} KB)',
    pt: 'Mensagem de voz ({size} KB)',
    nl: 'Spraakbericht ({size} KB)',
    pl: 'Wiadomość głosowa ({size} KB)',
    ja: '音声メッセージ（{size} KB）',
    ko: '음성 메시지 ({size}KB)',
    'zh-Hans': '语音消息（{size} KB）',
    'zh-Hant': '語音訊息（{size} KB）',
    ar: 'رسالة صوتية ({size} كيلوبايت)',
  },
  voiceReply: {
    en: 'I received your voice message. This test server does not recognize speech, so this reply is canned.',
    fr: "J'ai bien reçu votre message vocal. Ce serveur de test ne reconnaît pas la parole\u00a0: cette réponse est préenregistrée.",
    es: 'He recibido tu mensaje de voz. Este servidor de pruebas no reconoce la voz, así que esta respuesta es predefinida.',
    de: 'Ich habe Ihre Sprachnachricht erhalten. Dieser Testserver erkennt keine Sprache, daher ist diese Antwort vorgefertigt.',
    it: 'Ho ricevuto il tuo messaggio vocale. Questo server di test non riconosce la voce, quindi questa risposta è predefinita.',
    pt: 'Recebi sua mensagem de voz. Este servidor de teste não reconhece fala, então esta resposta é pronta.',
    nl: 'Ik heb je spraakbericht ontvangen. Deze testserver herkent geen spraak, dus dit antwoord ligt vast.',
    pl: 'Otrzymałem Twoją wiadomość głosową. Ten serwer testowy nie rozpoznaje mowy, więc ta odpowiedź jest przygotowana z góry.',
    ja: '音声メッセージを受け取りました。このテストサーバーは音声を認識しないため、この応答は定型文です。',
    ko: '음성 메시지를 받았습니다. 이 테스트 서버는 음성을 인식하지 않으므로 이 답변은 미리 준비된 것입니다.',
    'zh-Hans': '已收到您的语音消息。此测试服务器不识别语音，因此这是预设回复。',
    'zh-Hant': '已收到您的語音訊息。此測試伺服器不辨識語音，因此這是預設回覆。',
    ar: 'تلقيت رسالتك الصوتية. لا يتعرف خادم الاختبار هذا على الكلام، لذا فهذا رد معدّ مسبقًا.',
  },
  realtimeTranscript: {
    en: 'Spoken message {number}',
    fr: 'Message parlé {number}',
    es: 'Mensaje hablado {number}',
    de: 'Gesprochene Nachricht {number}',
    it: 'Messaggio parlato {number}',
    pt: 'Mensagem falada {number}',
    nl: 'Gesproken bericht {number}',
    pl: 'Wiadomość mówiona {number}',
    ja: '話したメッセージ {number}',
    ko: '음성 메시지 {number}',
    'zh-Hans': '语音消息 {number}',
    'zh-Hant': '語音訊息 {number}',
    ar: 'رسالة منطوقة {number}',
  },
  realtimeReply: {
    en: 'This is a canned spoken reply from the test server.',
    fr: 'Ceci est une réponse parlée préenregistrée du serveur de test.',
    es: 'Esta es una respuesta hablada predefinida del servidor de pruebas.',
    de: 'Dies ist eine vorgefertigte gesprochene Antwort des Testservers.',
    it: 'Questa è una risposta parlata predefinita del server di test.',
    pt: 'Esta é uma resposta falada pronta do servidor de teste.',
    nl: 'Dit is een vast gesproken antwoord van de testserver.',
    pl: 'To jest przygotowana z góry odpowiedź głosowa serwera testowego.',
    ja: 'これはテストサーバーからの定型の音声応答です。',
    ko: '테스트 서버의 미리 준비된 음성 답변입니다.',
    'zh-Hans': '这是测试服务器的预设语音回复。',
    'zh-Hant': '這是測試伺服器的預設語音回覆。',
    ar: 'هذا رد منطوق معدّ مسبقًا من خادم الاختبار.',
  },
} satisfies Record<string, Record<(typeof SERVER_LANGUAGES)[number], string>>

export type ServerMessage = keyof typeof MESSAGES

/** A visitor-facing message in the given language, with `{name}` placeholders filled in. */
export function serverMessage(
  key: ServerMessage,
  language: string,
  params: Record<string, string | number> = {},
): string {
  const template = pick(MESSAGES[key], language)
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
