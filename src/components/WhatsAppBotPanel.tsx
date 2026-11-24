import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Lock,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
} from 'lucide-react';
import { BuildingRosterEntry, Community, Language } from '../types/parkshare';
import { t } from '../i18n/translations';
import { maskPhone } from '../utils/privacy';
import { WhatsAppBotReply, WhatsAppQuickReplyButton } from '../engines/whatsappBotEngine';

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  buttons?: WhatsAppQuickReplyButton[];
  privacyBadge?: string;
  authorized?: boolean;
}

interface WhatsAppConfigInfo {
  liveConnected: boolean;
  displayNumber: string;
  privacyMode: string;
  webhookPath: string;
}

interface Props {
  lang: Language;
  role: 'manager' | 'resident';
  community: Community | null;
  rosterEntries: BuildingRosterEntry[];
  residentOwnPhone?: string;
  residentOwnName?: string;
  onSimulateMessage: (payload: {
    senderPhone: string;
    messageText?: string;
    buttonId?: string;
  }) => Promise<WhatsAppBotReply | null>;
  onFetchConfig: () => Promise<WhatsAppConfigInfo | null>;
}

function currentClock(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export const WhatsAppBotPanel: React.FC<Props> = ({
  lang,
  role,
  community,
  rosterEntries,
  residentOwnPhone,
  residentOwnName,
  onSimulateMessage,
  onFetchConfig,
}) => {
  const [config, setConfig] = useState<WhatsAppConfigInfo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pinLang, setPinLang] = useState<'fa' | 'en'>(lang);
  const [showTechSetup, setShowTechSetup] = useState(false);

  // Active whitelisted phones for this building (for manager simulator)
  const buildingRoster = useMemo(
    () =>
      rosterEntries.filter(
        (e) => (!community || e.communityId === community.id) && e.phone && e.phone.trim().length >= 7
      ),
    [rosterEntries, community]
  );

  const [selectedSenderPhone, setSelectedSenderPhone] = useState<string>(() => {
    if (role === 'resident') return residentOwnPhone || '';
    return buildingRoster[0]?.phone || '+31 6 0000 9999';
  });

  useEffect(() => {
    if (role === 'resident' && residentOwnPhone) {
      setSelectedSenderPhone(residentOwnPhone);
    } else if (role === 'manager' && buildingRoster.length > 0) {
      const exists =
        selectedSenderPhone === '+31 6 0000 9999' ||
        buildingRoster.some((e) => e.phone === selectedSenderPhone);
      if (!exists) {
        setSelectedSenderPhone(buildingRoster[0].phone);
      }
    }
  }, [role, residentOwnPhone, buildingRoster, selectedSenderPhone]);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'init-welcome',
      sender: 'bot',
      timestamp: currentClock(),
      authorized: true,
      privacyBadge:
        lang === 'fa'
          ? 'چت خصوصی ۱ به ۱ · بدون انتشار در گروه'
          : 'Private 1-on-1 · Zero Group Exposure',
      text:
        lang === 'fa'
          ? '👋 سلام! این شبیه‌ساز زنده بات خصوصی واتساپ ParkShare است.\n\nهمه درخواست‌ها، رزروها و اشتراک‌گذاری‌ها دقیقاً مثل واتساپ واقعی روی دیتابیس ساختمان ثبت می‌شوند و در تقویم پنل نمایش داده می‌شوند.\n\nیک پیام بنویسید (مثلاً «رزرو 9 تا 17») یا یکی از دکمه‌های زیر را بزنید:'
          : '👋 Welcome! This is the live private 1-on-1 ParkShare WhatsApp Bot.\n\nBookings, shares, and cancellations execute directly against your building database and sync live with the web dashboard.\n\nType e.g. "book 09:00-17:00" or tap a quick button:',
      buttons: [
        { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو ۹ تا ۱۷' : 'Book 09:00–17:00' },
        { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'اشتراک جای پارک من' : 'Share My Bay' },
        { id: 'cmd:quota_privacy', title: lang === 'fa' ? 'سهمیه و حریم خصوصی' : 'Quota & GDPR' },
      ],
    },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onFetchConfig().then((cfg) => {
      if (cfg) setConfig(cfg);
    });
  }, [onFetchConfig]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cleanBotDigits = (config?.displayNumber || '+31600000000').replace(/[^\d]/g, '');
  const waDeepLink = `https://wa.me/${cleanBotDigits}?text=${encodeURIComponent(
    pinLang === 'fa' ? 'سلام، درخواست پارکینگ دارم' : 'Hi, I need a parking spot'
  )}`;

  const buildingDisplayFa = community?.nameFa || 'ساختمان ما';
  const buildingDisplayEn = community?.name || 'our building';

  const groupPinMessage =
    pinLang === 'fa'
      ? `🅿️ سامانه خصوصی اشتراک پارکینگ «${buildingDisplayFa}»\n\nبرای رزرو موقت جای پارک یا اشتراک‌گذاری جایگاه خالی خودتان، پیام را داخل گروه نفرستید — روی لینک زیر بزنید تا به‌صورت خصوصی (۱ به ۱) با دستیار واتساپ ParkShare گفتگو کنید:\n${waDeepLink}\n\n🔐 چرا خصوصی؟\n• شماره، واحد و زمان نبودن شما در گروه نمایش داده نمی‌شود.\n• فقط ساکنان لیست رسمی ساختمان دسترسی دارند.\n• تأییدیه و لغو رزرو همان‌جا در واتساپ انجام می‌شود.`
      : `🅿️ Private Resident Parking Sharing — ${buildingDisplayEn}\n\nNeed a temporary bay or want to share yours while away? Please don't post your absence in the building group — tap below to message the private 1-on-1 ParkShare WhatsApp Bot:\n${waDeepLink}\n\n🔐 GDPR Privacy First:\n• Your unit, phone & away schedule are never shown in the group.\n• Only verified numbers on the building whitelist can access spots.\n• Instant confirmation & cancellation right inside WhatsApp.`;

  const webhookFullUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${config?.webhookPath || '/api/whatsapp/webhook'}`
      : '/api/whatsapp/webhook';

  const sendToBot = async (opts: { text?: string; buttonId?: string; displayLabel?: string }) => {
    if (sending) return;
    const phone = role === 'resident' ? residentOwnPhone || '' : selectedSenderPhone;
    if (!phone) return;

    const outgoingText = opts.displayLabel || opts.text || '';
    if (outgoingText) {
      setMessages((prev) => [
        ...prev,
        {
          id: `u-${Date.now()}`,
          sender: 'user',
          text: outgoingText,
          timestamp: currentClock(),
        },
      ]);
    }

    setSending(true);
    try {
      const reply = await onSimulateMessage({
        senderPhone: phone,
        messageText: opts.text,
        buttonId: opts.buttonId,
      });
      if (reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: 'bot',
            text: reply.replyText,
            timestamp: currentClock(),
            buttons: reply.buttons,
            privacyBadge: lang === 'fa' ? reply.privacyBadgeFa : reply.privacyBadgeEn,
            authorized: reply.authorized,
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = draft.trim();
    if (!clean) return;
    setDraft('');
    await sendToBot({ text: clean, displayLabel: clean });
  };

  const quickExamples =
    lang === 'fa'
      ? [
          { label: 'رزرو ۹ تا ۱۷', text: 'رزرو 9 تا 17' },
          { label: 'فقط رایگان ۱۰ تا ۱۶', text: 'رزرو 10 تا 16 رایگان' },
          { label: 'آزاد ۸ تا ۱۸', text: 'آزاد 8 تا 18' },
          { label: 'رزروهای من', text: 'رزروهای من' },
          { label: 'سهمیه و حریم خصوصی', text: 'سهمیه' },
        ]
      : [
          { label: 'Book 09:00–17:00', text: 'book 09:00-17:00' },
          { label: 'Free 10–16', text: 'book 10-16 free' },
          { label: 'Share 08–18', text: 'share 08:00-18:00' },
          { label: 'My Bookings', text: 'my bookings' },
          { label: 'Quota & GDPR', text: 'quota' },
        ];

  const isOutsiderSelected = selectedSenderPhone === '+31 6 0000 9999';

  return (
    <div className="space-y-5">
      {/* European Privacy-First Architecture Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <MessageCircle className="w-4 h-4" />
              <span>
                {t(
                  lang,
                  'مدل استاندارد اروپایی (GDPR): لینک پین‌شده در گروه + بات خصوصی ۱ به ۱',
                  'European GDPR Standard: Pinned Group Link + Private 1-on-1 WhatsApp Bot'
                )}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {t(lang, 'دستیار واتساپ ParkShare (همگام با پنل)', 'ParkShare WhatsApp Bot (Live Sync)')}
            </h2>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${
              config?.liveConnected ? 'text-emerald-700' : 'text-blue-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                config?.liveConnected ? 'bg-emerald-600' : 'bg-blue-600'
              }`}
            />
            {config?.liveConnected
              ? t(lang, 'متصل به واتساپ رسمی Meta', 'Connected to Meta Cloud API')
              : t(lang, 'حالت تست زنده (آماده اتصال Meta)', 'Live Sandbox (Ready for Meta API)')}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>{t(lang, 'غیبت شما در گروه لو نمی‌رود', 'No Absence Leaked in Group')}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {t(
                lang,
                'همسایه فقط روی لینک پین‌شده در گروه می‌زند و در چت خصوصی رزرو یا اشتراک می‌گذارد؛ کسی نمی‌فهمد چه واحدی خالی است.',
                'Residents tap the pinned group link and message privately 1-on-1 — nobody in the group sees who is away.'
              )}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span>{t(lang, 'تطبیق خودکار شماره با لیست مجاز', 'Automatic Whitelist Gate')}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {t(
                lang,
                'شماره واتساپ بدون نیاز به رمز، با لیست رسمی مدیر ساختمان چک می‌شود؛ شماره‌های غریبه مسدود می‌شوند.',
                'The sender phone is verified automatically against the manager whitelist; outsiders are blocked silently.'
              )}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <Sparkles className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
              <span>{t(lang, 'جواب و رزرو آنی در واتساپ', 'Instant Booking & Replies')}</span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              {t(
                lang,
                'جستجو، تأیید دکمه‌ای، قوانین منصفانه ماهانه و لغو رزرو همان‌جا انجام و زنده با تقویم وب همگام می‌شود.',
                'Search, 1-tap button confirmation, Fair-Use caps, and cancellation all sync live with the web calendar.'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Main 12-Col Grid: Interactive WhatsApp Chat (Left/7) + Group Pin & Webhook Setup (Right/5) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LIVE WHATSAPP 1-ON-1 CHAT SIMULATOR */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          {/* WhatsApp Header */}
          <div className="bg-emerald-900 text-white px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-100" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold flex items-center gap-1.5 truncate">
                  <span>ParkShare Bot</span>
                  <span className="text-[10px] font-medium text-emerald-200">✓ Official 1-on-1</span>
                </div>
                <div className="text-[11px] text-emerald-200/90 truncate">
                  {community
                    ? lang === 'fa'
                      ? `${community.nameFa} · چت خصوصی GDPR`
                      : `${community.name} · Private GDPR Chat`
                    : t(lang, 'چت خصوصی واتساپ', 'Private WhatsApp Chat')}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setMessages([
                  {
                    id: `reset-${Date.now()}`,
                    sender: 'bot',
                    timestamp: currentClock(),
                    authorized: true,
                    privacyBadge:
                      lang === 'fa' ? 'گفتگوی جدید · خصوصی' : 'New Private Chat',
                    text:
                      lang === 'fa'
                        ? 'گفتگو ریست شد. پیام خود را بفرستید یا یک دکمه را انتخاب کنید:'
                        : 'Chat cleared. Send a message or pick an option below:',
                    buttons: [
                      { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو ۹ تا ۱۷' : 'Book 09:00–17:00' },
                      { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'اشتراک جای پارک من' : 'Share My Bay' },
                      { id: 'cmd:my_bookings', title: lang === 'fa' ? 'رزروهای من' : 'My Bookings' },
                    ],
                  },
                ])
              }
              className="text-[11px] font-medium text-emerald-100 hover:text-white px-2.5 py-1.5 rounded-lg bg-emerald-800/70 hover:bg-emerald-800 shrink-0"
            >
              {t(lang, 'پاک کردن چت', 'Clear')}
            </button>
          </div>

          {/* Sender Phone Selector Bar (Manager can switch between whitelisted neighbors & outsider test) */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            {role === 'manager' ? (
              <>
                <div className="flex items-center gap-1.5 text-slate-600 shrink-0">
                  {isOutsiderSelected ? (
                    <UserX className="w-4 h-4 text-red-600" />
                  ) : (
                    <UserCheck className="w-4 h-4 text-emerald-700" />
                  )}
                  <span className="font-medium">
                    {t(lang, 'تست با شماره واتساپ:', 'Simulate WhatsApp Sender:')}
                  </span>
                </div>
                <select
                  value={selectedSenderPhone}
                  onChange={(e) => setSelectedSenderPhone(e.target.value)}
                  className="flex-1 sm:max-w-xs h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg font-medium text-slate-800"
                >
                  {buildingRoster.map((e) => (
                    <option key={e.id} value={e.phone}>
                      {e.ownerName} ({e.bayCode}) · {maskPhone(e.phone)}
                    </option>
                  ))}
                  <option value="+31 6 0000 9999">
                    {t(lang, '⛔ شماره غریبه خارج از لیست (+31 6 **** 9999)', '⛔ Unlisted Outsider (+31 6 **** 9999)')}
                  </option>
                </select>
              </>
            ) : (
              <div className="flex items-center gap-2 text-slate-700">
                <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  {t(lang, 'شماره تأییدشده شما:', 'Your verified phone:')}{' '}
                  <strong className="font-mono">{maskPhone(residentOwnPhone || '')}</strong>
                  {residentOwnName ? ` (${residentOwnName})` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Chat Feed */}
          <div
            ref={chatScrollRef}
            className="p-4 space-y-3 bg-[#efeae2] min-h-[340px] max-h-[460px] overflow-y-auto"
          >
            {/* End-to-End Privacy Notice Pill inside chat */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#fff5c4] text-[#54656f] text-[11px] text-center shadow-xs">
                <Lock className="w-3 h-3 shrink-0" />
                <span>
                  {t(
                    lang,
                    'گفتگوی خصوصی ۱ به ۱ · هیچ پیامی به گروه ساختمان ارسال نمی‌شود',
                    'Private 1-on-1 chat · Nothing is shared to the building group'
                  )}
                </span>
              </div>
            </div>

            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] sm:max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs space-y-2 ${
                    m.sender === 'user'
                      ? 'bg-[#d9fdd3] text-slate-900 rounded-ee-xs'
                      : m.authorized === false
                        ? 'bg-red-50 border border-red-200 text-red-950 rounded-es-xs'
                        : 'bg-white text-slate-900 rounded-es-xs'
                  }`}
                >
                  {m.sender === 'bot' && m.privacyBadge && (
                    <div
                      className={`text-[10px] font-semibold pb-1 border-b ${
                        m.authorized === false
                          ? 'text-red-700 border-red-200'
                          : 'text-emerald-700 border-slate-100'
                      }`}
                    >
                      {m.privacyBadge}
                    </div>
                  )}

                  <div className="whitespace-pre-line">{m.text}</div>

                  <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 font-mono">
                    <span>{m.timestamp}</span>
                    {m.sender === 'user' && <CheckCheck className="w-3.5 h-3.5 text-sky-500" />}
                  </div>
                </div>

                {/* WhatsApp Interactive Quick-Reply Buttons */}
                {m.sender === 'bot' && m.buttons && m.buttons.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5 max-w-[88%] sm:max-w-[82%]">
                    {m.buttons.map((btn) => (
                      <button
                        key={`${m.id}-${btn.id}`}
                        type="button"
                        disabled={sending}
                        onClick={() =>
                          sendToBot({
                            buttonId: btn.id,
                            displayLabel: btn.title,
                          })
                        }
                        className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200/90 rounded-xl shadow-xs transition-colors disabled:opacity-50"
                      >
                        {btn.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 1-Tap Sample Command Strip */}
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {quickExamples.map((ex) => (
              <button
                key={ex.label}
                type="button"
                disabled={sending}
                onClick={() => sendToBot({ text: ex.text, displayLabel: ex.text })}
                className="min-h-[32px] px-2.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 hover:text-emerald-800 whitespace-nowrap shrink-0 transition-colors"
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Chat Input Bar */}
          <form onSubmit={handleSubmitForm} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              placeholder={t(
                lang,
                'مثلاً: رزرو 9 تا 17 یا آزاد 8 تا 18...',
                'e.g. book 09:00-17:00 or share 08:00-18:00...'
              )}
              className="flex-1 h-11 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="min-w-[44px] h-11 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-50 shrink-0"
              aria-label={t(lang, 'ارسال پیام', 'Send message')}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">{t(lang, 'ارسال', 'Send')}</span>
            </button>
          </form>
        </section>

        {/* RIGHT COLUMN: READY-TO-PIN GROUP MESSAGE + META CLOUD API CONNECTION */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: Pinned Message for Building WhatsApp Group */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                {t(lang, 'پیام آماده برای پین در گروه واتساپ', 'Ready-to-Pin Group Message')}
              </h3>
              <div className="inline-grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100 rounded-lg text-[11px]">
                <button
                  type="button"
                  onClick={() => setPinLang('fa')}
                  className={`px-2 py-1 rounded-md font-semibold ${
                    pinLang === 'fa' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  فارسی
                </button>
                <button
                  type="button"
                  onClick={() => setPinLang('en')}
                  className={`px-2 py-1 rounded-md font-semibold ${
                    pinLang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  EN (EU)
                </button>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {t(
                lang,
                'مدیر ساختمان فقط یک بار این پیام را در گروه واتساپ ساختمان پین می‌کند. ساکنان با یک لمس وارد چت خصوصی بات می‌شوند.',
                'Pin this message once in your building WhatsApp group. Residents tap the link to enter private 1-on-1 chat.'
              )}
            </p>

            <div
              dir={pinLang === 'fa' ? 'rtl' : 'ltr'}
              className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-line leading-relaxed max-h-52 overflow-y-auto"
            >
              {groupPinMessage}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => copyText(groupPinMessage, 'pin_msg')}
                className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800"
              >
                {copiedId === 'pin_msg' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copiedId === 'pin_msg'
                    ? t(lang, 'کپی شد!', 'Copied!')
                    : t(lang, 'کپی متن گروه', 'Copy Group Message')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => copyText(waDeepLink, 'wa_link')}
                className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                {copiedId === 'wa_link' ? <Check className="w-4 h-4 text-emerald-700" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copiedId === 'wa_link'
                    ? t(lang, 'لینک کپی شد', 'Link Copied')
                    : t(lang, 'کپی لینک مستقیم', 'Copy Direct Link')}
                </span>
              </button>
            </div>
          </section>

          {/* Card 2: Official Meta WhatsApp Business Cloud API Setup (Collapsible) */}
          {role === 'manager' && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowTechSetup((v) => !v)}
                className="w-full px-5 py-4 flex items-center justify-between gap-2 text-start hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {t(lang, 'اتصال به خط رسمی واتساپ (Meta Cloud API)', 'Connect Official WhatsApp (Meta Cloud API)')}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {t(
                      lang,
                      'آدرس Webhook امضاشده و کلیدهای مورد نیاز در سرور',
                      'Signed webhook URL & server environment secrets'
                    )}
                  </div>
                </div>
                {showTechSetup ? (
                  <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                )}
              </button>

              {showTechSetup && (
                <div className="px-5 pb-5 pt-1 border-t border-slate-100 space-y-3.5 text-xs">
                  <div className="space-y-1.5">
                    <div className="font-semibold text-slate-700">
                      {t(lang, 'آدرس Webhook برای پنل Meta Developers:', 'Callback Webhook URL (Meta Developers):')}
                    </div>
                    <div className="flex items-center gap-2">
                      <code
                        dir="ltr"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-800 font-mono text-[11px] truncate"
                      >
                        {webhookFullUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyText(webhookFullUrl, 'webhook')}
                        className="min-h-[36px] px-2.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0"
                      >
                        {copiedId === 'webhook' ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="font-semibold text-slate-700">
                      {t(lang, 'متغیرهای امنیتی (Settings → Secrets):', 'Required Server Secrets:')}
                    </div>
                    <ul dir="ltr" className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                      <li>WHATSAPP_VERIFY_TOKEN</li>
                      <li>WHATSAPP_APP_SECRET</li>
                      <li>WHATSAPP_ACCESS_TOKEN</li>
                      <li>WHATSAPP_PHONE_NUMBER_ID</li>
                      <li>WHATSAPP_DISPLAY_NUMBER</li>
                    </ul>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {t(
                      lang,
                      'تمامی پیام‌های ورودی از Meta با امضای رمزنگاری‌شده X-Hub-Signature-256 در سرور راستی‌آزمایی می‌شوند و هیچ توکنی در مرورگر ذخیره نمی‌شود.',
                      'All inbound Meta webhooks are cryptographically verified via X-Hub-Signature-256 on the server. No tokens ever reach the browser.'
                    )}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
