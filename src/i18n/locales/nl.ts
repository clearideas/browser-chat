// Dutch. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Hallo {name}',
    greetingAnonymous: 'Hallo',
    heroGreetingDefault: 'Waarmee kunnen we helpen?',
    backToHome: 'Terug naar start',
    close: 'Sluiten',
  },
  home: {
    chatWith: 'Chat met {name}',
    chatDefaultTitle: 'Chat met onze assistent',
    chatDefaultDescription: 'Stel vragen en krijg hulp',
  },
  input: {
    placeholder: 'Stel een vraag...',
    placeholderVoice: 'Stel een vraag of gebruik de spraakmodus',
    startVoiceRecording: 'Live spraakgesprek starten',
    sendMessage: 'Bericht versturen',
    stopReply: 'Antwoord stoppen',
    cancelRecording: 'Opname annuleren',
    sendRecording: 'Opname versturen',
    voiceModeTooltip: 'Spraakmodus / Dicteren',
  },
  audio: {
    pause: 'Audio pauzeren',
    play: 'Audio afspelen',
    position: 'Audiopositie',
  },
  voice: {
    conversation: 'Live spraakgesprek',
    transcript: 'Live transcriptie',
    live: 'Live',
    connecting: 'Verbinden...',
    failed: 'Kan geen verbinding maken',
    muted: 'Microfoon gedempt',
    speaking: 'Spreekt',
    listening: 'Luistert',
    connectingHint: 'Beveiligde spraaksessie wordt gestart',
    interruptHint: 'Je kunt op elk moment onderbreken',
    listeningHint: 'Begin gewoon te praten',
    mute: 'Dempen',
    unmute: 'Dempen opheffen',
    end: 'Beëindigen',
    useRecorded: 'In plaats daarvan spraakopname gebruiken',
    microphoneDenied:
      'Toegang tot de microfoon is geweigerd. Sta dit toe in je browser om spraakchat te gebruiken.',
    microphoneMissing: 'Geen microfoon gevonden. Sluit er een aan om spraakchat te gebruiken.',
    recordingFailed: 'Opnemen kon niet worden gestart. Probeer het opnieuw.',
    noAudio: 'Er is geen audio opgenomen. Probeer het opnieuw.',
    unavailable: 'Spraakchat is momenteel niet beschikbaar. Probeer het later opnieuw.',
  },
  fab: {
    openChat: 'Chat openen',
    closeChat: 'Chat sluiten',
  },
  chat: {
    defaultName: 'Clear Ideas® Assistent',
    newChat: 'Nieuwe chat starten',
    newChatAria: 'Nieuwe chat starten',
    poweredBy: 'Mogelijk gemaakt door Clear Ideas®',
    disclaimer: 'Dit is een AI-assistent die fouten kan maken. Controleer belangrijke informatie.',
    unavailable: 'De chat is momenteel niet beschikbaar. Probeer het later opnieuw.',
    voiceDisabled: 'Spraakchat is niet ingeschakeld',
    configMissing: 'API-eindpunt of toegangssleutel niet geconfigureerd',
    accessKeyRequired: 'Toegangssleutel is vereist',
    apiNotConfigured:
      'API-eindpunt niet geconfigureerd. Geef de eigenschap apiBaseUrl op of stel VITE_API_BASE_URL in bij het bouwen.',
    sendFailed:
      'Bericht kon niet worden verstuurd. Controleer je verbinding en probeer het opnieuw.',
    sendVoiceFailed:
      'Spraakbericht kon niet worden verstuurd. Controleer je verbinding en probeer het opnieuw.',
    streamError: 'Er is een fout opgetreden bij het verwerken van je bericht',
    connectionError:
      'De chatservice is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.',
    replyTimeout: 'De assistent doet er te lang over om te antwoorden. Probeer het opnieuw.',
    unknownError: 'Er is iets misgegaan. Probeer het opnieuw.',
    conversation: 'Gesprek',
    typing: 'Assistent is aan het typen',
    youSaid: 'Jij zei:',
    assistantSaid: 'Assistent zei:',
    opensInNewTab: '(opent in een nieuw tabblad)',
    image: 'Afbeelding',
  },
  disclaimerDialog: {
    label: 'Let op',
    scrollToContinue: 'Scroll om door te gaan',
    ok: 'OK',
  },
  helloBubble: {
    close: 'Sluiten',
  },
} satisfies WidgetMessages
