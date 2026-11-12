// Spanish. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Hola, {name}',
    greetingAnonymous: 'Hola',
    heroGreetingDefault: '¿En qué podemos ayudarte?',
    backToHome: 'Volver al inicio',
    close: 'Cerrar',
  },
  home: {
    chatWith: 'Chatear con {name}',
    chatDefaultTitle: 'Chatear con nuestro asistente',
    chatDefaultDescription: 'Haz preguntas y obtén ayuda',
  },
  input: {
    placeholder: 'Haz una pregunta...',
    placeholderVoice: 'Haz una pregunta o usa el modo de voz',
    startVoiceRecording: 'Iniciar una conversación de voz en directo',
    sendMessage: 'Enviar mensaje',
    stopReply: 'Detener la respuesta',
    cancelRecording: 'Cancelar grabación',
    sendRecording: 'Enviar grabación',
    voiceModeTooltip: 'Modo de voz / Dictado',
  },
  audio: {
    pause: 'Pausar audio',
    play: 'Reproducir audio',
    position: 'Posición del audio',
  },
  voice: {
    conversation: 'Conversación de voz en directo',
    transcript: 'Transcripción en directo',
    live: 'En directo',
    connecting: 'Conectando...',
    failed: 'No se pudo conectar',
    muted: 'Micrófono silenciado',
    speaking: 'Hablando',
    listening: 'Escuchando',
    connectingHint: 'Iniciando una sesión de voz segura',
    interruptHint: 'Puedes interrumpir en cualquier momento',
    listeningHint: 'Empieza a hablar',
    mute: 'Silenciar micrófono',
    unmute: 'Activar micrófono',
    end: 'Finalizar',
    useRecorded: 'Usar voz grabada en su lugar',
    microphoneDenied:
      'Se denegó el acceso al micrófono. Permítelo en tu navegador para usar el chat de voz.',
    microphoneMissing: 'No se encontró ningún micrófono. Conecta uno para usar el chat de voz.',
    recordingFailed: 'No se pudo iniciar la grabación. Inténtalo de nuevo.',
    noAudio: 'No se grabó audio. Inténtalo de nuevo.',
    unavailable: 'El chat de voz no está disponible en este momento. Inténtalo más tarde.',
  },
  fab: {
    openChat: 'Abrir chat',
    closeChat: 'Cerrar chat',
  },
  chat: {
    defaultName: 'Asistente de Clear Ideas®',
    newChat: 'Iniciar un chat nuevo',
    newChatAria: 'Iniciar un chat nuevo',
    poweredBy: 'Con la tecnología de Clear Ideas®',
    disclaimer:
      'Este es un asistente de IA y puede cometer errores. Verifica la información importante.',
    unavailable: 'El chat no está disponible en este momento. Inténtalo más tarde.',
    voiceDisabled: 'El chat de voz no está activado',
    configMissing: 'No se ha configurado el punto de acceso de la API o la clave de acceso',
    accessKeyRequired: 'Se requiere la clave de acceso',
    apiNotConfigured:
      'No se ha configurado el punto de acceso de la API. Indica la propiedad apiBaseUrl o define VITE_API_BASE_URL al compilar.',
    sendFailed: 'No se pudo enviar el mensaje. Comprueba tu conexión e inténtalo de nuevo.',
    sendVoiceFailed:
      'No se pudo enviar el mensaje de voz. Comprueba tu conexión e inténtalo de nuevo.',
    streamError: 'Se produjo un error al procesar tu mensaje',
    connectionError:
      'No se pudo conectar con el servicio de chat. Comprueba tu conexión e inténtalo de nuevo.',
    replyTimeout: 'El asistente está tardando demasiado en responder. Inténtalo de nuevo.',
    unknownError: 'Algo salió mal. Inténtalo de nuevo.',
    conversation: 'Conversación',
    typing: 'El asistente está escribiendo',
    youSaid: 'Dijiste:',
    assistantSaid: 'El asistente dijo:',
    opensInNewTab: '(se abre en una pestaña nueva)',
    image: 'Imagen',
  },
  disclaimerDialog: {
    label: 'Aviso',
    scrollToContinue: 'Desplázate para continuar',
    ok: 'Aceptar',
  },
  helloBubble: {
    close: 'Cerrar',
  },
} satisfies WidgetMessages
