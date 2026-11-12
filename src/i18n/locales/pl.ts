// Polish. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'Cześć, {name}',
    greetingAnonymous: 'Cześć',
    heroGreetingDefault: 'W czym możemy pomóc?',
    backToHome: 'Powrót do strony głównej',
    close: 'Zamknij',
  },
  home: {
    chatWith: 'Czat: {name}',
    chatDefaultTitle: 'Porozmawiaj z naszym asystentem',
    chatDefaultDescription: 'Zadawaj pytania i uzyskaj pomoc',
  },
  input: {
    placeholder: 'Zadaj pytanie...',
    placeholderVoice: 'Zadaj pytanie lub użyj trybu głosowego',
    startVoiceRecording: 'Rozpocznij rozmowę głosową na żywo',
    sendMessage: 'Wyślij wiadomość',
    stopReply: 'Zatrzymaj odpowiedź',
    cancelRecording: 'Anuluj nagrywanie',
    sendRecording: 'Wyślij nagranie',
    voiceModeTooltip: 'Tryb głosowy / Dyktowanie',
  },
  audio: {
    pause: 'Wstrzymaj dźwięk',
    play: 'Odtwórz dźwięk',
    position: 'Pozycja odtwarzania',
  },
  voice: {
    conversation: 'Rozmowa głosowa na żywo',
    transcript: 'Transkrypcja na żywo',
    live: 'Na żywo',
    connecting: 'Łączenie...',
    failed: 'Nie udało się połączyć',
    muted: 'Mikrofon wyciszony',
    speaking: 'Mówi',
    listening: 'Słucha',
    connectingHint: 'Uruchamianie bezpiecznej sesji głosowej',
    interruptHint: 'Możesz przerwać w dowolnym momencie',
    listeningHint: 'Po prostu zacznij mówić',
    mute: 'Wycisz',
    unmute: 'Wyłącz wyciszenie',
    end: 'Zakończ',
    useRecorded: 'Użyj zamiast tego nagrania głosowego',
    microphoneDenied:
      'Odmówiono dostępu do mikrofonu. Zezwól na niego w przeglądarce, aby korzystać z czatu głosowego.',
    microphoneMissing:
      'Nie znaleziono mikrofonu. Podłącz mikrofon, aby korzystać z czatu głosowego.',
    recordingFailed: 'Nie udało się rozpocząć nagrywania. Spróbuj ponownie.',
    noAudio: 'Nie nagrano dźwięku. Spróbuj ponownie.',
    unavailable: 'Czat głosowy jest obecnie niedostępny. Spróbuj ponownie później.',
  },
  fab: {
    openChat: 'Otwórz czat',
    closeChat: 'Zamknij czat',
  },
  chat: {
    defaultName: 'Asystent Clear Ideas®',
    newChat: 'Rozpocznij nowy czat',
    newChatAria: 'Rozpocznij nowy czat',
    poweredBy: 'Obsługiwane przez Clear Ideas®',
    disclaimer: 'To jest asystent AI, który może popełniać błędy. Sprawdzaj ważne informacje.',
    unavailable: 'Czat jest obecnie niedostępny. Spróbuj ponownie później.',
    voiceDisabled: 'Czat głosowy nie jest włączony',
    configMissing: 'Nie skonfigurowano punktu końcowego API ani klucza dostępu',
    accessKeyRequired: 'Klucz dostępu jest wymagany',
    apiNotConfigured:
      'Nie skonfigurowano punktu końcowego API. Podaj właściwość apiBaseUrl lub ustaw VITE_API_BASE_URL podczas kompilacji.',
    sendFailed: 'Nie udało się wysłać wiadomości. Sprawdź połączenie i spróbuj ponownie.',
    sendVoiceFailed:
      'Nie udało się wysłać wiadomości głosowej. Sprawdź połączenie i spróbuj ponownie.',
    streamError: 'Podczas przetwarzania wiadomości wystąpił błąd',
    connectionError:
      'Nie można połączyć się z usługą czatu. Sprawdź połączenie i spróbuj ponownie.',
    replyTimeout: 'Asystent zbyt długo nie odpowiada. Spróbuj ponownie.',
    unknownError: 'Coś poszło nie tak. Spróbuj ponownie.',
    conversation: 'Rozmowa',
    typing: 'Asystent pisze',
    youSaid: 'Ty:',
    assistantSaid: 'Asystent:',
    opensInNewTab: '(otwiera się w nowej karcie)',
    image: 'Obraz',
  },
  disclaimerDialog: {
    label: 'Uwaga',
    scrollToContinue: 'Przewiń, aby kontynuować',
    ok: 'OK',
  },
  helloBubble: {
    close: 'Zamknij',
  },
} satisfies WidgetMessages
