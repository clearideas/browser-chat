// Japanese. Keys and placeholders must match en.ts (checked by tests/unit/i18n).
import type { WidgetMessages } from '../types'

export default {
  header: {
    greeting: 'こんにちは、{name}さん',
    greetingAnonymous: 'こんにちは',
    heroGreetingDefault: 'どのようなご用件でしょうか？',
    backToHome: 'ホームに戻る',
    close: '閉じる',
  },
  home: {
    chatWith: '{name}とチャット',
    chatDefaultTitle: 'アシスタントとチャット',
    chatDefaultDescription: '質問してサポートを受けられます',
  },
  input: {
    placeholder: '質問を入力...',
    placeholderVoice: '質問を入力するか、音声モードを使用',
    startVoiceRecording: 'ライブ音声会話を開始',
    sendMessage: 'メッセージを送信',
    stopReply: '応答を停止',
    cancelRecording: '録音をキャンセル',
    sendRecording: '録音を送信',
    voiceModeTooltip: '音声モード / 音声入力',
  },
  audio: {
    pause: '一時停止',
    play: '再生',
    position: '再生位置',
  },
  voice: {
    conversation: 'ライブ音声会話',
    transcript: 'ライブ文字起こし',
    live: 'ライブ',
    connecting: '接続中...',
    failed: '接続できませんでした',
    muted: 'マイクはミュート中です',
    speaking: '話しています',
    listening: '聞いています',
    connectingHint: '安全な音声セッションを開始しています',
    interruptHint: 'いつでも話しかけて中断できます',
    listeningHint: 'そのまま話しかけてください',
    mute: 'ミュート',
    unmute: 'ミュート解除',
    end: '終了',
    useRecorded: '代わりに録音した音声を使う',
    microphoneDenied:
      'マイクへのアクセスが拒否されました。音声チャットを使うには、ブラウザでマイクを許可してください。',
    microphoneMissing: 'マイクが見つかりません。音声チャットを使うにはマイクを接続してください。',
    recordingFailed: '録音を開始できませんでした。もう一度お試しください。',
    noAudio: '音声が録音されませんでした。もう一度お試しください。',
    unavailable:
      '現在、音声チャットはご利用いただけません。しばらくしてからもう一度お試しください。',
  },
  fab: {
    openChat: 'チャットを開く',
    closeChat: 'チャットを閉じる',
  },
  chat: {
    defaultName: 'Clear Ideas® アシスタント',
    newChat: '新しいチャットを開始',
    newChatAria: '新しいチャットを開始',
    poweredBy: '提供：Clear Ideas®',
    disclaimer:
      'これは AI アシスタントのため、誤りが含まれる場合があります。重要な情報はご自身でご確認ください。',
    unavailable: '現在、チャットはご利用いただけません。しばらくしてからもう一度お試しください。',
    voiceDisabled: '音声チャットは有効になっていません',
    configMissing: 'API エンドポイントまたはアクセスキーが設定されていません',
    accessKeyRequired: 'アクセスキーが必要です',
    apiNotConfigured:
      'API エンドポイントが設定されていません。apiBaseUrl プロパティを指定するか、ビルド時に VITE_API_BASE_URL を設定してください。',
    sendFailed: 'メッセージを送信できませんでした。接続を確認して、もう一度お試しください。',
    sendVoiceFailed:
      '音声メッセージを送信できませんでした。接続を確認して、もう一度お試しください。',
    streamError: 'メッセージの処理中にエラーが発生しました',
    connectionError:
      'チャットサービスに接続できませんでした。接続を確認して、もう一度お試しください。',
    replyTimeout: 'アシスタントの応答に時間がかかりすぎています。もう一度お試しください。',
    unknownError: '問題が発生しました。もう一度お試しください。',
    conversation: '会話',
    typing: 'アシスタントが入力中です',
    youSaid: 'あなた：',
    assistantSaid: 'アシスタント：',
    opensInNewTab: '（新しいタブで開きます）',
    image: '画像',
  },
  disclaimerDialog: {
    label: 'お知らせ',
    scrollToContinue: 'スクロールして続行',
    ok: 'OK',
  },
  helloBubble: {
    close: '閉じる',
  },
} satisfies WidgetMessages
