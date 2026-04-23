// Translations for bot-originated replies. These are strictly server-side —
// the frontend has its own i18n system in src/i18n. When the user changes the
// app language, we persist it on the telegram_links row and the bot consults
// this map via `t(lang, key, vars)`.
//
// Keep keys flat; nested lookups are overkill for the small number of strings
// the bot actually emits. English is the source of truth; missing keys in
// other locales silently fall back to English.

const EN = {
  'welcome.needsCode': '👋 Hi! Please send me your 6-digit pairing code to link this chat with your Pixcode account.',
  'welcome.alreadyPaired': '👋 You are already paired. I will forward your messages to your most recent session.',
  'pairing.invalidFormat': 'Please send only the 6-digit code (digits only).',
  'pairing.notFound': 'That code is invalid or has already been used. Please generate a new one in Pixcode and try again.',
  'pairing.expired': 'That code has expired. Please generate a new one in Pixcode.',
  'pairing.success': '✅ Linked successfully! You will now receive notifications for completed tasks. Send me a message any time to prompt your most recent session.',
  'pairing.stillNeeded': 'Please send your 6-digit pairing code first. Open Pixcode → Settings → Telegram to get one.',
  'bridge.queued': '📨 Message forwarded to your latest session. I will reply when the agent responds.',
  'bridge.disabled': 'Message bridge is disabled. Enable it in Pixcode → Settings → Telegram.',
  'notification.taskDone': '✅ {{title}} — task completed.',
  'notification.taskFailed': '⚠️ {{title}} — task failed: {{error}}',
  'notification.actionRequired': '❗ {{title}} — action required.',
  'unpaired.notice': 'This chat has been unlinked from Pixcode. Send your 6-digit code to link again.',
  'error.generic': 'Something went wrong. Please try again.',
};

const TR = {
  'welcome.needsCode': '👋 Merhaba! Bu sohbeti Pixcode hesabınla eşlemek için 6 haneli kodunu gönder.',
  'welcome.alreadyPaired': '👋 Zaten eşleşmişsin. Mesajlarını en son oturumuna ileteceğim.',
  'pairing.invalidFormat': 'Lütfen sadece 6 haneli kodu gönder (yalnız rakam).',
  'pairing.notFound': 'Bu kod geçersiz veya daha önce kullanılmış. Pixcode\'dan yeni bir tane oluştur.',
  'pairing.expired': 'Bu kodun süresi doldu. Pixcode\'dan yeni bir tane oluştur.',
  'pairing.success': '✅ Eşleşme başarılı! Bundan sonra tamamlanan görev bildirimlerini buradan alırsın. İstediğin zaman mesaj yazarak son oturumuna prompt gönderebilirsin.',
  'pairing.stillNeeded': 'Önce 6 haneli eşleşme kodunu gönder. Pixcode → Ayarlar → Telegram\'dan alabilirsin.',
  'bridge.queued': '📨 Mesaj son oturumuna iletildi. Ajan cevap verince sana yazacağım.',
  'bridge.disabled': 'Mesaj köprüsü kapalı. Pixcode → Ayarlar → Telegram\'dan açabilirsin.',
  'notification.taskDone': '✅ {{title}} — görev tamamlandı.',
  'notification.taskFailed': '⚠️ {{title}} — görev başarısız: {{error}}',
  'notification.actionRequired': '❗ {{title}} — işlem gerekli.',
  'unpaired.notice': 'Bu sohbetin Pixcode ile bağlantısı kesildi. Tekrar eşleşmek için 6 haneli kodunu gönder.',
  'error.generic': 'Bir şeyler ters gitti. Lütfen tekrar dene.',
};

const DE = {
  'welcome.needsCode': '👋 Hallo! Bitte sende mir deinen 6-stelligen Pairing-Code, um diesen Chat mit deinem Pixcode-Konto zu verknüpfen.',
  'welcome.alreadyPaired': '👋 Du bist bereits verknüpft. Ich leite deine Nachrichten an deine letzte Sitzung weiter.',
  'pairing.invalidFormat': 'Bitte sende nur den 6-stelligen Code (nur Ziffern).',
  'pairing.notFound': 'Dieser Code ist ungültig oder wurde bereits verwendet. Erzeuge in Pixcode einen neuen.',
  'pairing.expired': 'Der Code ist abgelaufen. Erzeuge in Pixcode einen neuen.',
  'pairing.success': '✅ Erfolgreich verknüpft! Du bekommst jetzt Benachrichtigungen zu abgeschlossenen Aufgaben und kannst jederzeit Nachrichten an deine letzte Sitzung senden.',
  'pairing.stillNeeded': 'Bitte sende zuerst deinen 6-stelligen Pairing-Code aus Pixcode → Einstellungen → Telegram.',
  'bridge.queued': '📨 Nachricht an deine letzte Sitzung weitergeleitet. Ich antworte, sobald der Agent antwortet.',
  'bridge.disabled': 'Die Nachrichtenbrücke ist deaktiviert. Aktiviere sie in Pixcode → Einstellungen → Telegram.',
  'notification.taskDone': '✅ {{title}} — Aufgabe abgeschlossen.',
  'notification.taskFailed': '⚠️ {{title}} — Aufgabe fehlgeschlagen: {{error}}',
  'notification.actionRequired': '❗ {{title}} — Aktion erforderlich.',
  'unpaired.notice': 'Dieser Chat wurde von Pixcode getrennt. Sende deinen 6-stelligen Code, um ihn erneut zu verknüpfen.',
  'error.generic': 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
};

const IT = {
  'welcome.needsCode': '👋 Ciao! Inviami il tuo codice di abbinamento di 6 cifre per collegare questa chat al tuo account Pixcode.',
  'welcome.alreadyPaired': '👋 Sei già collegato. Inoltrerò i tuoi messaggi alla tua ultima sessione.',
  'pairing.invalidFormat': 'Invia solo il codice di 6 cifre (solo numeri).',
  'pairing.notFound': 'Codice non valido o già utilizzato. Generane uno nuovo in Pixcode.',
  'pairing.expired': 'Codice scaduto. Generane uno nuovo in Pixcode.',
  'pairing.success': '✅ Collegato con successo! Riceverai le notifiche delle attività completate e potrai inviare messaggi alla tua ultima sessione.',
  'pairing.stillNeeded': 'Invia prima il tuo codice di 6 cifre da Pixcode → Impostazioni → Telegram.',
  'bridge.queued': '📨 Messaggio inoltrato alla tua ultima sessione. Risponderò quando l\'agente risponde.',
  'bridge.disabled': 'Il bridge dei messaggi è disabilitato. Attivalo in Pixcode → Impostazioni → Telegram.',
  'notification.taskDone': '✅ {{title}} — attività completata.',
  'notification.taskFailed': '⚠️ {{title}} — attività fallita: {{error}}',
  'notification.actionRequired': '❗ {{title}} — azione richiesta.',
  'unpaired.notice': 'Questa chat è stata scollegata da Pixcode. Invia il tuo codice per ricollegarla.',
  'error.generic': 'Qualcosa è andato storto. Riprova.',
};

const JA = {
  'welcome.needsCode': '👋 こんにちは！このチャットをPixcodeアカウントにリンクするため、6桁のペアリングコードを送信してください。',
  'welcome.alreadyPaired': '👋 既にリンク済みです。メッセージは最新のセッションに転送されます。',
  'pairing.invalidFormat': '6桁の数字のみを送信してください。',
  'pairing.notFound': 'コードが無効か既に使用されています。Pixcodeで新しいコードを生成してください。',
  'pairing.expired': 'コードの有効期限が切れました。Pixcodeで新しいコードを生成してください。',
  'pairing.success': '✅ リンクに成功しました！完了通知を受け取り、最新セッションへメッセージを送信できます。',
  'pairing.stillNeeded': 'まず6桁のペアリングコードを送信してください。Pixcode → 設定 → Telegramで取得できます。',
  'bridge.queued': '📨 メッセージを最新セッションに転送しました。エージェントの応答時にお知らせします。',
  'bridge.disabled': 'メッセージブリッジは無効です。Pixcode → 設定 → Telegramで有効化してください。',
  'notification.taskDone': '✅ {{title}} — タスク完了。',
  'notification.taskFailed': '⚠️ {{title}} — タスク失敗: {{error}}',
  'notification.actionRequired': '❗ {{title}} — 操作が必要。',
  'unpaired.notice': 'このチャットはPixcodeから解除されました。6桁のコードで再リンクしてください。',
  'error.generic': 'エラーが発生しました。もう一度お試しください。',
};

const KO = {
  'welcome.needsCode': '👋 안녕하세요! Pixcode 계정과 이 채팅을 연결하려면 6자리 페어링 코드를 보내주세요.',
  'welcome.alreadyPaired': '👋 이미 연결되어 있습니다. 메시지를 최근 세션으로 전달합니다.',
  'pairing.invalidFormat': '숫자 6자리만 보내주세요.',
  'pairing.notFound': '코드가 유효하지 않거나 이미 사용되었습니다. Pixcode에서 새 코드를 생성하세요.',
  'pairing.expired': '코드가 만료되었습니다. Pixcode에서 새 코드를 생성하세요.',
  'pairing.success': '✅ 연결 성공! 완료 알림을 받고, 최근 세션에 메시지를 보낼 수 있습니다.',
  'pairing.stillNeeded': '먼저 6자리 페어링 코드를 보내주세요. Pixcode → 설정 → Telegram에서 얻을 수 있습니다.',
  'bridge.queued': '📨 메시지를 최근 세션에 전달했습니다. 에이전트가 응답하면 알려드릴게요.',
  'bridge.disabled': '메시지 브리지가 비활성화되어 있습니다. Pixcode → 설정 → Telegram에서 활성화하세요.',
  'notification.taskDone': '✅ {{title}} — 작업 완료.',
  'notification.taskFailed': '⚠️ {{title}} — 작업 실패: {{error}}',
  'notification.actionRequired': '❗ {{title}} — 조치 필요.',
  'unpaired.notice': '이 채팅은 Pixcode에서 연결 해제되었습니다. 6자리 코드로 다시 연결하세요.',
  'error.generic': '문제가 발생했습니다. 다시 시도해주세요.',
};

const RU = {
  'welcome.needsCode': '👋 Привет! Отправь мне 6-значный код сопряжения, чтобы связать этот чат с твоим аккаунтом Pixcode.',
  'welcome.alreadyPaired': '👋 Ты уже связан. Я буду пересылать твои сообщения в последнюю сессию.',
  'pairing.invalidFormat': 'Отправь только 6-значный код (только цифры).',
  'pairing.notFound': 'Код недействителен или уже использован. Создай новый в Pixcode.',
  'pairing.expired': 'Код истёк. Создай новый в Pixcode.',
  'pairing.success': '✅ Связано! Теперь ты будешь получать уведомления о завершённых задачах и сможешь отправлять сообщения в последнюю сессию.',
  'pairing.stillNeeded': 'Сначала отправь 6-значный код из Pixcode → Настройки → Telegram.',
  'bridge.queued': '📨 Сообщение переслано в последнюю сессию. Отвечу, когда агент ответит.',
  'bridge.disabled': 'Мост сообщений отключён. Включи его в Pixcode → Настройки → Telegram.',
  'notification.taskDone': '✅ {{title}} — задача выполнена.',
  'notification.taskFailed': '⚠️ {{title}} — задача провалена: {{error}}',
  'notification.actionRequired': '❗ {{title}} — требуется действие.',
  'unpaired.notice': 'Этот чат отвязан от Pixcode. Отправь 6-значный код, чтобы связать снова.',
  'error.generic': 'Что-то пошло не так. Попробуй ещё раз.',
};

const ZH = {
  'welcome.needsCode': '👋 你好！请发送 6 位配对码，将此聊天链接到你的 Pixcode 账户。',
  'welcome.alreadyPaired': '👋 你已经链接。我会把消息转发到你最近的会话。',
  'pairing.invalidFormat': '请只发送 6 位数字代码。',
  'pairing.notFound': '代码无效或已使用。请在 Pixcode 中生成新代码。',
  'pairing.expired': '代码已过期。请在 Pixcode 中生成新代码。',
  'pairing.success': '✅ 链接成功！你将收到任务完成通知，并可以向最近的会话发送消息。',
  'pairing.stillNeeded': '请先发送 6 位配对码。在 Pixcode → 设置 → Telegram 中获取。',
  'bridge.queued': '📨 消息已转发到最近的会话。智能体回复时我会通知你。',
  'bridge.disabled': '消息桥已禁用。在 Pixcode → 设置 → Telegram 中启用。',
  'notification.taskDone': '✅ {{title}} — 任务完成。',
  'notification.taskFailed': '⚠️ {{title}} — 任务失败：{{error}}',
  'notification.actionRequired': '❗ {{title}} — 需要操作。',
  'unpaired.notice': '此聊天已从 Pixcode 取消链接。发送 6 位代码即可重新链接。',
  'error.generic': '出了点问题，请重试。',
};

const LOCALES = {
  en: EN,
  tr: TR,
  de: DE,
  it: IT,
  ja: JA,
  ko: KO,
  ru: RU,
  'zh-CN': ZH,
};

const interpolate = (template, vars) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match;
  });
};

export const t = (language, key, vars) => {
  const locale = LOCALES[language] || LOCALES.en;
  const raw = locale[key] || LOCALES.en[key] || key;
  return interpolate(raw, vars);
};

export const SUPPORTED_LANGUAGES = Object.keys(LOCALES);
