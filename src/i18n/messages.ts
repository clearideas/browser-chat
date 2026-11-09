export const widgetMessages = {
  en: {
    header: {
      greeting: 'Hi {name}',
      heroGreetingDefault: 'How can we help?',
      backToHome: 'Back to home',
      close: 'Close',
    },
    input: {
      placeholder: 'Ask a question...',
      placeholderVoice: 'Ask a question or use voice mode',
      startVoiceRecording: 'Start live voice conversation',
      sendMessage: 'Send message',
      cancelRecording: 'Cancel recording',
      sendRecording: 'Send recording',
      voiceModeTooltip: 'Voice mode / Dictate',
    },
    audio: {
      pause: 'Pause audio',
      play: 'Play audio',
      position: 'Audio position',
    },
    voice: {
      live: 'Live',
      connecting: 'Connecting...',
      failed: 'Could not connect',
      muted: 'Microphone muted',
      speaking: 'Speaking',
      listening: 'Listening',
      connectingHint: 'Starting a secure voice session',
      interruptHint: 'You can interrupt at any time',
      listeningHint: 'Just start speaking',
      mute: 'Mute',
      unmute: 'Unmute',
      end: 'End',
      useRecorded: 'Use recorded voice instead',
    },
    fab: {
      openChat: 'Open chat',
      closeChat: 'Close chat',
    },
    chat: {
      newChat: 'Start a New Chat',
      newChatAria: 'Start a new chat',
      poweredBy: 'Powered by Clear Ideas™',
      disclaimer:
        'This is an AI assistant and may make mistakes. Please verify important information.',
      voiceDisabled: 'Voice chat is not enabled',
      configMissing: 'API endpoint or access key not configured',
      accessKeyRequired: 'Access key is required',
      apiNotConfigured:
        'API endpoint not configured. Please provide apiBaseUrl prop or set VITE_API_BASE_URL at build time.',
      sendFailed: 'Failed to send message. Please check your connection and try again.',
      sendVoiceFailed: 'Failed to send voice message. Please check your connection and try again.',
      streamError: 'An error occurred while processing your message',
      corsError:
        'CORS error: Server must allow Authorization header. Check server CORS configuration for {url}',
      responseBodyNull: 'Response body is null',
      unknownError: 'Unknown error',
    },
    disclaimerDialog: {
      scrollToContinue: 'Scroll to continue',
      ok: 'OK',
    },
    helloBubble: {
      close: 'Close',
    },
  },
  fr: {
    header: {
      greeting: 'Bonjour {name}',
      heroGreetingDefault: 'Comment pouvons-nous vous aider ?',
      backToHome: "Retour a l'accueil",
      close: 'Fermer',
    },
    input: {
      placeholder: 'Posez une question...',
      placeholderVoice: 'Posez une question ou utilisez le mode vocal',
      startVoiceRecording: 'Demarrer une conversation vocale en direct',
      sendMessage: 'Envoyer le message',
      cancelRecording: "Annuler l'enregistrement",
      sendRecording: "Envoyer l'enregistrement",
      voiceModeTooltip: 'Mode vocal / Dictee',
    },
    audio: {
      pause: "Mettre l'audio en pause",
      play: "Lire l'audio",
      position: "Position de l'audio",
    },
    voice: {
      live: 'En direct',
      connecting: 'Connexion...',
      failed: 'Connexion impossible',
      muted: 'Microphone coupe',
      speaking: 'Parle',
      listening: 'Ecoute',
      connectingHint: "Demarrage d'une session vocale securisee",
      interruptHint: 'Vous pouvez interrompre a tout moment',
      listeningHint: 'Commencez simplement a parler',
      mute: 'Couper le micro',
      unmute: 'Activer le micro',
      end: 'Terminer',
      useRecorded: "Utiliser plutot l'enregistrement vocal",
    },
    fab: {
      openChat: 'Ouvrir le chat',
      closeChat: 'Fermer le chat',
    },
    chat: {
      newChat: 'Demarrer un nouveau chat',
      newChatAria: 'Demarrer un nouveau chat',
      poweredBy: 'Propulse par Clear Ideas™',
      disclaimer:
        'Ceci est un assistant IA et il peut se tromper. Veuillez verifier les informations importantes.',
      voiceDisabled: "Le chat vocal n'est pas active",
      configMissing: "Le point d'acces API ou la cle d'acces n'est pas configure",
      accessKeyRequired: "La cle d'acces est requise",
      apiNotConfigured:
        "Le point d'acces API n'est pas configure. Fournissez la prop apiBaseUrl ou definissez VITE_API_BASE_URL a la compilation.",
      sendFailed: "Echec de l'envoi du message. Verifiez votre connexion et reessayez.",
      sendVoiceFailed: "Echec de l'envoi du message vocal. Verifiez votre connexion et reessayez.",
      streamError: "Une erreur s'est produite pendant le traitement de votre message",
      corsError:
        "Erreur CORS : le serveur doit autoriser l'en-tete Authorization. Verifiez la configuration CORS du serveur pour {url}",
      responseBodyNull: 'Le corps de la reponse est nul',
      unknownError: 'Erreur inconnue',
    },
    disclaimerDialog: {
      scrollToContinue: 'Faites defiler pour continuer',
      ok: "D'accord",
    },
    helloBubble: {
      close: 'Fermer',
    },
  },
} as const

export type WidgetLocale = keyof typeof widgetMessages
