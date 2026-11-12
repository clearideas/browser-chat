// Portuguese (Brazil). Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Olá, {name}',
    greetingAnonymous: 'Olá',
    heroGreetingDefault: 'Como podemos ajudar?',
    backToHome: 'Voltar ao início',
    close: 'Fechar',
  },
  home: {
    chatWith: 'Conversar com {name}',
    chatDefaultTitle: 'Conversar com nosso assistente',
    chatDefaultDescription: 'Tire dúvidas e receba ajuda',
  },
  input: {
    placeholder: 'Faça uma pergunta...',
    placeholderVoice: 'Faça uma pergunta ou use o modo de voz',
    startVoiceRecording: 'Iniciar conversa por voz ao vivo',
    sendMessage: 'Enviar mensagem',
    stopReply: 'Parar a resposta',
    cancelRecording: 'Cancelar gravação',
    sendRecording: 'Enviar gravação',
    voiceModeTooltip: 'Modo de voz / Ditado',
  },
  audio: {
    pause: 'Pausar áudio',
    play: 'Reproduzir áudio',
    position: 'Posição do áudio',
  },
  voice: {
    conversation: 'Conversa por voz ao vivo',
    transcript: 'Transcrição ao vivo',
    live: 'Ao vivo',
    connecting: 'Conectando...',
    failed: 'Não foi possível conectar',
    muted: 'Microfone desativado',
    speaking: 'Falando',
    listening: 'Ouvindo',
    connectingHint: 'Iniciando uma sessão de voz segura',
    interruptHint: 'Você pode interromper a qualquer momento',
    listeningHint: 'É só começar a falar',
    mute: 'Desativar microfone',
    unmute: 'Ativar microfone',
    end: 'Encerrar',
    useRecorded: 'Usar gravação de voz',
    microphoneDenied:
      'O acesso ao microfone foi negado. Permita-o no navegador para usar o chat por voz.',
    microphoneMissing: 'Nenhum microfone encontrado. Conecte um para usar o chat por voz.',
    recordingFailed: 'Não foi possível iniciar a gravação. Tente novamente.',
    noAudio: 'Nenhum áudio foi gravado. Tente novamente.',
    unavailable: 'O chat por voz está indisponível no momento. Tente novamente mais tarde.',
  },
  fab: {
    openChat: 'Abrir chat',
    closeChat: 'Fechar chat',
  },
  chat: {
    defaultName: 'Assistente Clear Ideas®',
    newChat: 'Iniciar uma nova conversa',
    newChatAria: 'Iniciar uma nova conversa',
    poweredBy: 'Com tecnologia Clear Ideas®',
    disclaimer:
      'Este é um assistente de IA e pode cometer erros. Verifique as informações importantes.',
    unavailable: 'O chat está indisponível no momento. Tente novamente mais tarde.',
    voiceDisabled: 'O chat por voz não está ativado',
    configMissing: 'Endpoint da API ou chave de acesso não configurados',
    accessKeyRequired: 'A chave de acesso é obrigatória',
    apiNotConfigured:
      'Endpoint da API não configurado. Informe a propriedade apiBaseUrl ou defina VITE_API_BASE_URL na compilação.',
    sendFailed: 'Não foi possível enviar a mensagem. Verifique sua conexão e tente novamente.',
    sendVoiceFailed:
      'Não foi possível enviar a mensagem de voz. Verifique sua conexão e tente novamente.',
    streamError: 'Ocorreu um erro ao processar sua mensagem',
    connectionError:
      'Não foi possível acessar o serviço de chat. Verifique sua conexão e tente novamente.',
    replyTimeout: 'O assistente está demorando muito para responder. Tente novamente.',
    unknownError: 'Algo deu errado. Tente novamente.',
    conversation: 'Conversa',
    typing: 'O assistente está digitando',
    youSaid: 'Você disse:',
    assistantSaid: 'O assistente disse:',
    opensInNewTab: '(abre em uma nova aba)',
    image: 'Imagem',
  },
  disclaimerDialog: {
    label: 'Aviso',
    scrollToContinue: 'Role para continuar',
    ok: 'OK',
  },
  helloBubble: {
    close: 'Fechar',
  },
} satisfies WidgetMessages
