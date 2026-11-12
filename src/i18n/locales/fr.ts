// French. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
// `\u00a0` is the no-break space French puts before `?` and `:`.
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Bonjour {name}',
    greetingAnonymous: 'Bonjour',
    heroGreetingDefault: 'Comment pouvons-nous vous aider\u00a0?',
    backToHome: "Retour à l'accueil",
    close: 'Fermer',
  },
  home: {
    chatWith: 'Discuter avec {name}',
    chatDefaultTitle: 'Discuter avec notre assistant',
    chatDefaultDescription: "Posez vos questions et obtenez de l'aide",
  },
  input: {
    placeholder: 'Posez une question...',
    placeholderVoice: 'Posez une question ou utilisez le mode vocal',
    startVoiceRecording: 'Démarrer une conversation vocale en direct',
    sendMessage: 'Envoyer le message',
    stopReply: 'Arrêter la réponse',
    cancelRecording: "Annuler l'enregistrement",
    sendRecording: "Envoyer l'enregistrement",
    voiceModeTooltip: 'Mode vocal / Dictée',
  },
  audio: {
    pause: "Mettre l'audio en pause",
    play: "Lire l'audio",
    position: 'Position de lecture',
  },
  voice: {
    conversation: 'Conversation vocale en direct',
    transcript: 'Transcription en direct',
    live: 'En direct',
    connecting: 'Connexion...',
    failed: 'Connexion impossible',
    muted: 'Micro coupé',
    speaking: 'Parle',
    listening: 'Écoute',
    connectingHint: "Démarrage d'une session vocale sécurisée",
    interruptHint: 'Vous pouvez interrompre à tout moment',
    listeningHint: 'Commencez simplement à parler',
    mute: 'Couper le micro',
    unmute: 'Activer le micro',
    end: 'Terminer',
    useRecorded: "Utiliser plutôt l'enregistrement vocal",
    microphoneDenied:
      "L'accès au micro a été refusé. Autorisez-le dans votre navigateur pour utiliser le chat vocal.",
    microphoneMissing: 'Aucun micro détecté. Branchez-en un pour utiliser le chat vocal.',
    recordingFailed: "Impossible de démarrer l'enregistrement. Veuillez réessayer.",
    noAudio: "Aucun son n'a été enregistré. Veuillez réessayer.",
    unavailable: 'Le chat vocal est indisponible pour le moment. Veuillez réessayer plus tard.',
  },
  fab: {
    openChat: 'Ouvrir le chat',
    closeChat: 'Fermer le chat',
  },
  chat: {
    defaultName: 'Assistant Clear Ideas®',
    newChat: 'Démarrer un nouveau chat',
    newChatAria: 'Démarrer un nouveau chat',
    poweredBy: 'Propulsé par Clear Ideas®',
    disclaimer:
      'Ceci est un assistant IA qui peut se tromper. Veuillez vérifier les informations importantes.',
    unavailable: 'Le chat est indisponible pour le moment. Veuillez réessayer plus tard.',
    voiceDisabled: "Le chat vocal n'est pas activé",
    configMissing: "Le point d'accès API ou la clé d'accès n'est pas configuré",
    accessKeyRequired: "La clé d'accès est requise",
    apiNotConfigured:
      "Le point d'accès API n'est pas configuré. Fournissez la propriété apiBaseUrl ou définissez VITE_API_BASE_URL lors de la compilation.",
    sendFailed: "Échec de l'envoi du message. Vérifiez votre connexion et réessayez.",
    sendVoiceFailed: "Échec de l'envoi du message vocal. Vérifiez votre connexion et réessayez.",
    streamError: "Une erreur s'est produite pendant le traitement de votre message",
    connectionError:
      'Impossible de joindre le service de chat. Vérifiez votre connexion et réessayez.',
    replyTimeout: "L'assistant met trop de temps à répondre. Veuillez réessayer.",
    unknownError: "Une erreur s'est produite. Veuillez réessayer.",
    conversation: 'Conversation',
    typing: "L'assistant écrit",
    youSaid: 'Vous avez dit\u00a0:',
    assistantSaid: "L'assistant a dit\u00a0:",
    opensInNewTab: "(s'ouvre dans un nouvel onglet)",
    image: 'Image',
  },
  disclaimerDialog: {
    label: 'Avis',
    scrollToContinue: 'Faites défiler pour continuer',
    ok: "D'accord",
  },
  helloBubble: {
    close: 'Fermer',
  },
} satisfies WidgetMessages
