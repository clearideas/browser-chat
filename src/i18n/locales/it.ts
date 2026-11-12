// Italian. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Ciao {name}',
    greetingAnonymous: 'Ciao',
    heroGreetingDefault: 'Come possiamo aiutarti?',
    backToHome: 'Torna alla home',
    close: 'Chiudi',
  },
  home: {
    chatWith: 'Chatta con {name}',
    chatDefaultTitle: 'Chatta con il nostro assistente',
    chatDefaultDescription: 'Fai domande e ricevi assistenza',
  },
  input: {
    placeholder: 'Fai una domanda...',
    placeholderVoice: 'Fai una domanda o usa la modalità vocale',
    startVoiceRecording: 'Avvia una conversazione vocale dal vivo',
    sendMessage: 'Invia messaggio',
    stopReply: 'Interrompi la risposta',
    cancelRecording: 'Annulla registrazione',
    sendRecording: 'Invia registrazione',
    voiceModeTooltip: 'Modalità vocale / Dettatura',
  },
  audio: {
    pause: "Metti in pausa l'audio",
    play: "Riproduci l'audio",
    position: 'Posizione audio',
  },
  voice: {
    conversation: 'Conversazione vocale dal vivo',
    transcript: 'Trascrizione dal vivo',
    live: 'Dal vivo',
    connecting: 'Connessione in corso...',
    failed: 'Impossibile connettersi',
    muted: 'Microfono disattivato',
    speaking: 'Sta parlando',
    listening: 'In ascolto',
    connectingHint: 'Avvio di una sessione vocale sicura',
    interruptHint: 'Puoi interrompere in qualsiasi momento',
    listeningHint: 'Inizia pure a parlare',
    mute: 'Disattiva microfono',
    unmute: 'Attiva microfono',
    end: 'Termina',
    useRecorded: 'Usa invece la registrazione vocale',
    microphoneDenied:
      "L'accesso al microfono è stato negato. Consentilo nel browser per usare la chat vocale.",
    microphoneMissing: 'Nessun microfono trovato. Collegane uno per usare la chat vocale.',
    recordingFailed: 'Impossibile avviare la registrazione. Riprova.',
    noAudio: 'Non è stato registrato alcun audio. Riprova.',
    unavailable: 'La chat vocale non è disponibile al momento. Riprova più tardi.',
  },
  fab: {
    openChat: 'Apri la chat',
    closeChat: 'Chiudi la chat',
  },
  chat: {
    defaultName: 'Assistente Clear Ideas®',
    newChat: 'Inizia una nuova chat',
    newChatAria: 'Inizia una nuova chat',
    poweredBy: 'Con tecnologia Clear Ideas®',
    disclaimer:
      'Questo è un assistente IA e può commettere errori. Verifica le informazioni importanti.',
    unavailable: 'La chat non è disponibile al momento. Riprova più tardi.',
    voiceDisabled: 'La chat vocale non è attiva',
    configMissing: 'Endpoint API o chiave di accesso non configurati',
    accessKeyRequired: 'La chiave di accesso è obbligatoria',
    apiNotConfigured:
      'Endpoint API non configurato. Specifica la proprietà apiBaseUrl o imposta VITE_API_BASE_URL in fase di build.',
    sendFailed: 'Impossibile inviare il messaggio. Controlla la connessione e riprova.',
    sendVoiceFailed: 'Impossibile inviare il messaggio vocale. Controlla la connessione e riprova.',
    streamError: "Si è verificato un errore durante l'elaborazione del messaggio",
    connectionError:
      'Impossibile raggiungere il servizio di chat. Controlla la connessione e riprova.',
    replyTimeout: "L'assistente sta impiegando troppo tempo a rispondere. Riprova.",
    unknownError: 'Qualcosa è andato storto. Riprova.',
    conversation: 'Conversazione',
    typing: "L'assistente sta scrivendo",
    youSaid: 'Hai detto:',
    assistantSaid: "L'assistente ha detto:",
    opensInNewTab: '(si apre in una nuova scheda)',
    image: 'Immagine',
  },
  disclaimerDialog: {
    label: 'Avviso',
    scrollToContinue: 'Scorri per continuare',
    ok: 'OK',
  },
  helloBubble: {
    close: 'Chiudi',
  },
} satisfies WidgetMessages
