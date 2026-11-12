// German. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Hallo {name}',
    greetingAnonymous: 'Hallo',
    heroGreetingDefault: 'Wie können wir helfen?',
    backToHome: 'Zurück zur Startseite',
    close: 'Schließen',
  },
  home: {
    chatWith: 'Mit {name} chatten',
    chatDefaultTitle: 'Mit unserem Assistenten chatten',
    chatDefaultDescription: 'Stellen Sie Fragen und erhalten Sie Hilfe',
  },
  input: {
    placeholder: 'Stellen Sie eine Frage...',
    placeholderVoice: 'Stellen Sie eine Frage oder nutzen Sie den Sprachmodus',
    startVoiceRecording: 'Live-Sprachgespräch starten',
    sendMessage: 'Nachricht senden',
    stopReply: 'Antwort stoppen',
    cancelRecording: 'Aufnahme abbrechen',
    sendRecording: 'Aufnahme senden',
    voiceModeTooltip: 'Sprachmodus / Diktieren',
  },
  audio: {
    pause: 'Audio pausieren',
    play: 'Audio abspielen',
    position: 'Wiedergabeposition',
  },
  voice: {
    conversation: 'Live-Sprachgespräch',
    transcript: 'Live-Transkript',
    live: 'Live',
    connecting: 'Verbindung wird hergestellt...',
    failed: 'Verbindung fehlgeschlagen',
    muted: 'Mikrofon stummgeschaltet',
    speaking: 'Spricht',
    listening: 'Hört zu',
    connectingHint: 'Sichere Sprachsitzung wird gestartet',
    interruptHint: 'Sie können jederzeit unterbrechen',
    listeningHint: 'Sprechen Sie einfach los',
    mute: 'Stummschalten',
    unmute: 'Stummschaltung aufheben',
    end: 'Beenden',
    useRecorded: 'Stattdessen Sprachaufnahme verwenden',
    microphoneDenied:
      'Der Mikrofonzugriff wurde verweigert. Erlauben Sie ihn in Ihrem Browser, um den Sprachchat zu nutzen.',
    microphoneMissing:
      'Kein Mikrofon gefunden. Schließen Sie eines an, um den Sprachchat zu nutzen.',
    recordingFailed: 'Die Aufnahme konnte nicht gestartet werden. Bitte versuchen Sie es erneut.',
    noAudio: 'Es wurde kein Ton aufgenommen. Bitte versuchen Sie es erneut.',
    unavailable:
      'Der Sprachchat ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',
  },
  fab: {
    openChat: 'Chat öffnen',
    closeChat: 'Chat schließen',
  },
  chat: {
    defaultName: 'Clear Ideas® Assistent',
    newChat: 'Neuen Chat starten',
    newChatAria: 'Neuen Chat starten',
    poweredBy: 'Bereitgestellt von Clear Ideas®',
    disclaimer:
      'Dies ist ein KI-Assistent, der Fehler machen kann. Bitte überprüfen Sie wichtige Informationen.',
    unavailable: 'Der Chat ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.',
    voiceDisabled: 'Der Sprachchat ist nicht aktiviert',
    configMissing: 'API-Endpunkt oder Zugriffsschlüssel nicht konfiguriert',
    accessKeyRequired: 'Zugriffsschlüssel erforderlich',
    apiNotConfigured:
      'API-Endpunkt nicht konfiguriert. Geben Sie die Eigenschaft apiBaseUrl an oder setzen Sie VITE_API_BASE_URL beim Build.',
    sendFailed:
      'Die Nachricht konnte nicht gesendet werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
    sendVoiceFailed:
      'Die Sprachnachricht konnte nicht gesendet werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
    streamError: 'Bei der Verarbeitung Ihrer Nachricht ist ein Fehler aufgetreten',
    connectionError:
      'Der Chat-Dienst ist nicht erreichbar. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
    replyTimeout: 'Der Assistent braucht zu lange für eine Antwort. Bitte versuchen Sie es erneut.',
    unknownError: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
    conversation: 'Unterhaltung',
    typing: 'Der Assistent schreibt',
    youSaid: 'Sie sagten:',
    assistantSaid: 'Der Assistent sagte:',
    opensInNewTab: '(öffnet sich in einem neuen Tab)',
    image: 'Bild',
  },
  disclaimerDialog: {
    label: 'Hinweis',
    scrollToContinue: 'Zum Fortfahren scrollen',
    ok: 'OK',
  },
  helloBubble: {
    close: 'Schließen',
  },
} satisfies WidgetMessages
