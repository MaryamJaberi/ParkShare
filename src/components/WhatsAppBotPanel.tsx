import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Lock,
  MessageCircle,
  QrCode,
  Send,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import {
  BuildingRosterEntry,
  BuildingWhatsAppGroupConfig,
  Community,
  Language,
} from '../types/parkshare';
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
  activeInviteToken?: string;
  residentOwnPhone?: string;
  residentOwnName?: string;
  onSimulateMessage: (payload: {
    senderPhone: string;
    messageText?: string;
    buttonId?: string;
  }) => Promise<WhatsAppBotReply | null>;
  onFetchConfig: () => Promise<WhatsAppConfigInfo | null>;
  onSaveWhatsAppGroup?: (
    communityId: string,
    config: BuildingWhatsAppGroupConfig
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenRoster?: () => void;
}

function currentClock(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function isSafeWhatsAppGroupUrl(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'chat.whatsapp.com' && parsed.pathname.length >= 4;
  } catch {
    return false;
  }
}

function extractPhoneDigits(raw: string | undefined): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

export const WhatsAppBotPanel: React.FC<Props> = ({
  lang,
  role,
  community,
  rosterEntries,
  activeInviteToken,
  residentOwnPhone,
  residentOwnName,
  onSimulateMessage,
  onFetchConfig,
  onSaveWhatsAppGroup,
  onOpenRoster,
}) => {
  const [config, setConfig] = useState<WhatsAppConfigInfo | null>(null);
  const [activeMode, setActiveMode] = useState<'connect' | 'simulator'>(
    role === 'manager' ? 'connect' : 'simulator'
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTechSetup, setShowTechSetup] = useState(false);

  // Per-building WhatsApp Group connection form state (Manager)
  const savedGroup = community?.whatsappGroup;
  const [groupName, setGroupName] = useState<string>('');
  const [groupInviteUrl, setGroupInviteUrl] = useState<string>('');
  const [botPhoneNumber, setBotPhoneNumber] = useState<string>('');
  const [pinLang, setPinLang] = useState<'fa' | 'en'>(lang);
  const [savingGroup, setSavingGroup] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const qrContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    onFetchConfig().then((cfg) => {
      if (cfg) setConfig(cfg);
    });
  }, [onFetchConfig]);

  // Hydrate form whenever the active building changes
  useEffect(() => {
    if (!community) return;
    const wg = community.whatsappGroup;
    setGroupName(
      wg?.groupName ||
        (lang === 'fa' ? `گروه ساکنان ${community.nameFa}` : `${community.name} Residents Group`)
    );
    setGroupInviteUrl(wg?.groupInviteUrl || '');
    setBotPhoneNumber(wg?.botPhoneNumber || config?.displayNumber || '');
    setPinLang(wg?.defaultLanguage || lang);
    setSaveFeedback(null);
  }, [community?.id, community?.whatsappGroup, config?.displayNumber, lang]);

  // Active whitelisted phones for this building
  const buildingRoster = useMemo(
    () =>
      rosterEntries.filter(
        (e) =>
          (!community || e.communityId === community.id) &&
          e.status !== 'revoked' &&
          e.phone &&
          e.phone.trim().length >= 7
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
          ? 'سلام! این شبیه‌ساز زنده بات خصوصی واتساپ ParkShare است.\n\nهمه درخواست‌ها، رزروها و اشتراک‌گذاری‌ها دقیقاً مثل واتساپ واقعی روی دیتابیس ساختمان ثبت می‌شوند و در تقویم پنل نمایش داده می‌شوند.\n\nیک پیام بنویسید (مثلاً «رزرو 9 تا 17») یا یکی از دکمه‌های زیر را بزنید:'
          : 'Welcome! This is the live private 1-on-1 ParkShare WhatsApp Bot.\n\nBookings, shares, and cancellations execute directly against your building database and sync live with the web dashboard.\n\nType e.g. "book 09:00-17:00" or tap a quick button:',
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
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const copyText = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Resolve effective WhatsApp bot number (server live number > manager saved number > draft input)
  const effectiveBotPhone =
    config?.displayNumber || savedGroup?.botPhoneNumber || botPhoneNumber || '';
  const cleanBotDigits = extractPhoneDigits(effectiveBotPhone);
  const hasRealBotNumber = cleanBotDigits.length >= 7;

  const waDirectBotLink = hasRealBotNumber
    ? `https://wa.me/${cleanBotDigits}?text=${encodeURIComponent(
        pinLang === 'fa' ? 'سلام، درخواست پارکینگ دارم' : 'Hi, I need a parking spot'
      )}`
    : '';

  const buildingDisplayFa = community?.nameFa || 'ساختمان ما';
  const buildingDisplayEn = community?.name || 'our building';
  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const webInviteUrl = activeInviteToken && originUrl ? `${originUrl}/?invite=${encodeURIComponent(activeInviteToken)}` : '';

  const groupPinMessage = useMemo(() => {
    const botLineFa = waDirectBotLink
      ? `چت خصوصی با دستیار واتساپ:\n${waDirectBotLink}`
      : 'لینک چت خصوصی بات: (پس از ثبت شماره واتساپ بات در مرحله ۱ به‌طور خودکار اینجا قرار می‌گیرد)';
    const botLineEn = waDirectBotLink
      ? `Private 1-on-1 WhatsApp Bot:\n${waDirectBotLink}`
      : 'Private Bot Link: (auto-generated once your WhatsApp number is saved in Step 1)';
    const webLineFa = webInviteUrl ? `\n\nثبت‌نام سریع در پنل وب ساختمان:\n${webInviteUrl}` : '';
    const webLineEn = webInviteUrl ? `\n\nResident Web Portal Registration:\n${webInviteUrl}` : '';

    if (pinLang === 'fa') {
      return `سامانه خصوصی اشتراک پارکینگ «${buildingDisplayFa}»\n\nبرای رزرو موقت جای پارک یا اشتراک‌گذاری جایگاه خالی خودتان، پیام را داخل گروه نفرستید — روی لینک زیر بزنید تا به‌صورت خصوصی (۱ به ۱) با دستیار واتساپ ParkShare گفتگو کنید:\n${botLineFa}${webLineFa}\n\nچرا خصوصی؟\n• شماره، واحد و زمان نبودن شما در گروه نمایش داده نمی‌شود.\n• فقط ساکنان لیست رسمی ساختمان دسترسی دارند.\n• رزرو، تأیید و لغو همان‌جا در واتساپ انجام می‌شود و با پنل ساختمان همگام است.`;
    }
    return `Private Resident Parking Sharing — ${buildingDisplayEn}\n\nNeed a temporary bay or want to share yours while away? Please don't post your absence in the building group — tap below to message the private 1-on-1 ParkShare WhatsApp Bot:\n${botLineEn}${webLineEn}\n\nGDPR Privacy First:\n• Your unit, phone & away schedule are never shown in the group.\n• Only verified numbers on the building whitelist can access spots.\n• Instant booking, confirmation & cancellation right inside WhatsApp.`;
  }, [pinLang, buildingDisplayFa, buildingDisplayEn, waDirectBotLink, webInviteUrl]);

  // Official WhatsApp share intent: opens WhatsApp app/Web directly so manager picks the building group & sends!
  const waShareToGroupHref = `https://wa.me/?text=${encodeURIComponent(groupPinMessage)}`;
  const safeSavedGroupUrl = isSafeWhatsAppGroupUrl(savedGroup?.groupInviteUrl)
    ? savedGroup?.groupInviteUrl
    : undefined;

  const webhookFullUrl = originUrl
    ? `${originUrl}${config?.webhookPath || '/api/whatsapp/webhook'}`
    : '/api/whatsapp/webhook';

  const handleSaveGroupForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!community || !onSaveWhatsAppGroup || savingGroup) return;
    setSavingGroup(true);
    setSaveFeedback(null);
    try {
      const result = await onSaveWhatsAppGroup(community.id, {
        enabled: true,
        groupName: groupName.trim() || (lang === 'fa' ? community.nameFa : community.name),
        groupInviteUrl: groupInviteUrl.trim() || undefined,
        botPhoneNumber: botPhoneNumber.trim() || undefined,
        defaultLanguage: pinLang,
        pinnedConfirmed: Boolean(savedGroup?.pinnedConfirmed),
        connectedAt: savedGroup?.connectedAt,
      });
      if (result.ok) {
        setSaveFeedback({
          ok: true,
          text: t(
            lang,
            'تنظیمات گروه واتساپ ذخیره شد. اکنون در مرحله ۲ پیام را به گروه بفرستید و پین کنید.',
            'WhatsApp group settings saved. Now send and pin the message in Step 2.'
          ),
        });
      } else {
        setSaveFeedback({
          ok: false,
          text: result.error || t(lang, 'ذخیره‌سازی ناموفق بود.', 'Could not save settings.'),
        });
      }
    } finally {
      setSavingGroup(false);
    }
  };

  const handleTogglePinnedConfirmed = async () => {
    if (!community || !onSaveWhatsAppGroup || savingGroup) return;
    setSavingGroup(true);
    setSaveFeedback(null);
    try {
      const nextPinned = !savedGroup?.pinnedConfirmed;
      const result = await onSaveWhatsAppGroup(community.id, {
        enabled: true,
        groupName:
          savedGroup?.groupName ||
          groupName.trim() ||
          (lang === 'fa' ? community.nameFa : community.name),
        groupInviteUrl: savedGroup?.groupInviteUrl || groupInviteUrl.trim() || undefined,
        botPhoneNumber: savedGroup?.botPhoneNumber || botPhoneNumber.trim() || undefined,
        defaultLanguage: savedGroup?.defaultLanguage || pinLang,
        pinnedConfirmed: nextPinned,
        connectedAt: savedGroup?.connectedAt,
      });
      if (result.ok) {
        setSaveFeedback({
          ok: true,
          text: nextPinned
            ? t(
                lang,
                'اتصال گروه واتساپ ساختمان فعال و تأیید شد.',
                'Building WhatsApp group connection confirmed and active.'
              )
            : t(lang, 'وضعیت پین پیام به‌روزرسانی شد.', 'Pin confirmation updated.'),
        });
      } else if (result.error) {
        setSaveFeedback({ ok: false, text: result.error });
      }
    } finally {
      setSavingGroup(false);
    }
  };

  const handleDownloadQrSvg = () => {
    const svgEl = qrContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `parkshare-whatsapp-qr-${community?.id || 'building'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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
  const step1Done = Boolean(savedGroup?.groupName && hasRealBotNumber);
  const step2Done = Boolean(savedGroup?.pinnedConfirmed);
  const step3Done = buildingRoster.length > 0;
  const completedStepsCount = [step1Done, step2Done, step3Done].filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Header Strip: Clean Title + Status + Manager Mode Switcher */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span className="font-semibold text-emerald-700">
              {t(lang, 'استاندارد اروپایی GDPR', 'European GDPR Standard')}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {config?.liveConnected
                ? t(lang, 'متصل به واتساپ رسمی Meta', 'Connected to Meta Cloud API')
                : t(lang, 'آماده اتصال به واتساپ گروه', 'Ready for WhatsApp Group Link')}
            </span>
            {role === 'manager' && community && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-medium text-slate-700">
                  {t(lang, `${completedStepsCount} از ۳ مرحله تکمیل`, `${completedStepsCount} of 3 steps ready`)}
                </span>
              </>
            )}
          </div>

          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {role === 'manager'
              ? t(lang, 'اتصال گروه واتساپ ساختمان به ParkShare', 'Connect Building WhatsApp Group')
              : t(lang, 'دستیار خصوصی واتساپ ParkShare', 'ParkShare Private WhatsApp Bot')}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            {role === 'manager'
              ? t(
                  lang,
                  'لینک پیام را یک‌بار در گروه واتساپ ساختمان پین کنید تا همسایه‌ها بدون افشای زمان غیبت یا شماره واحد، به‌صورت خصوصی (۱ به ۱) پارکینگ رزرو کنند.',
                  'Pin one welcome message in your building WhatsApp group so residents book and share bays privately 1-on-1 without exposing away schedules.'
                )
              : t(
                  lang,
                  'درخواست رزرو یا اشتراک پارکینگ خود را به‌صورت خصوصی در واتساپ بفرستید؛ هیچ پیامی در گروه عمومی ساختمان منتشر نمی‌شود.',
                  'Request or share bays privately via 1-on-1 WhatsApp chat — nothing is posted to the building group.'
                )}
          </p>
        </div>

        {/* Mode Switcher for Manager / Direct Launch CTA for Resident */}
        {role === 'manager' ? (
          <div className="inline-grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl shrink-0 self-start lg:self-center">
            <button
              type="button"
              onClick={() => setActiveMode('connect')}
              className={`min-h-[40px] px-3.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 ${
                activeMode === 'connect'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t(lang, 'اتصال گروه واتساپ', 'Connect Group')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('simulator')}
              className={`min-h-[40px] px-3.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center justify-center gap-1.5 ${
                activeMode === 'simulator'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{t(lang, 'تست زنده بات', 'Live Bot Test')}</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {waDirectBotLink && (
              <a
                href={waDirectBotLink}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
              >
                <MessageCircle className="w-4 h-4" />
                <span>{t(lang, 'شروع چت خصوصی در واتساپ', 'Open Private WhatsApp Bot')}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            )}
            {safeSavedGroupUrl && (
              <a
                href={safeSavedGroupUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-3.5 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                <Users className="w-4 h-4" />
                <span>{t(lang, 'گروه ساختمان', 'Building Group')}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* MANAGER MODE 1: GUIDED 3-STEP WHATSAPP GROUP CONNECTION */}
      {role === 'manager' && activeMode === 'connect' && (
        !community ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
            <div className="text-sm font-bold text-slate-900">
              {t(lang, 'ابتدا ساختمان خود را ثبت کنید', 'Create your building first')}
            </div>
            <p className="text-xs text-slate-500">
              {t(
                lang,
                'پس از ساخت اولین ساختمان، می‌توانید گروه واتساپ همان ساختمان را به بات خصوصی ParkShare متصل کنید.',
                'Once you create a building, you can link its WhatsApp group directly to the private ParkShare bot.'
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT 7 COLS: STEP 1 (SAVE GROUP) + STEP 2 (SEND & PIN IN WHATSAPP) */}
            <div className="lg:col-span-7 space-y-5">
              {/* STEP 1: BUILDING GROUP DETAILS */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {t(lang, '۱. مشخصات گروه واتساپ ساختمان', '1. Building WhatsApp Group Details')}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t(
                        lang,
                        'نام گروه و شماره واتساپ بات را ثبت کنید تا لینک مستقیم و QR کد اختصاصی ساختمان ساخته شود.',
                        'Save your group name and WhatsApp bot number to generate your building deep link and QR code.'
                      )}
                    </p>
                  </div>
                  {step1Done && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{t(lang, 'ذخیره شده', 'Saved')}</span>
                    </span>
                  )}
                </div>

                <form onSubmit={handleSaveGroupForm} className="space-y-3.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-700">
                        {t(lang, 'نام گروه واتساپ ساختمان', 'WhatsApp Group Name')}
                      </span>
                      <input
                        type="text"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        maxLength={80}
                        placeholder={t(lang, 'مثلاً: گروه همسایگان برج بوستون', 'e.g. Boston Residence Residents')}
                        className="w-full h-11 px-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="text-xs font-semibold text-slate-700">
                        {t(lang, 'شماره واتساپ بات (با کد کشور)', 'WhatsApp Bot Number (with country code)')}
                      </span>
                      <input
                        type="tel"
                        dir="ltr"
                        value={botPhoneNumber}
                        onChange={(e) => setBotPhoneNumber(e.target.value)}
                        placeholder="+31 6 1234 5678"
                        className="w-full h-11 px-3.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600"
                      />
                    </label>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-700">
                      {t(lang, 'لینک دعوت گروه واتساپ (اختیاری)', 'WhatsApp Group Invite Link (Optional)')}
                    </span>
                    <input
                      type="url"
                      dir="ltr"
                      value={groupInviteUrl}
                      onChange={(e) => setGroupInviteUrl(e.target.value)}
                      placeholder="https://chat.whatsapp.com/..."
                      className="w-full h-11 px-3.5 text-sm font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600"
                    />
                    <span className="block text-[11px] text-slate-500">
                      {t(
                        lang,
                        'در واتساپ وارد اطلاعات گروه شوید ← Invite via link ← لینک https://chat.whatsapp.com را اینجا بگذارید تا مستقیم از اپ وارد گروه شوید.',
                        'In WhatsApp open Group Info → Invite via link → paste https://chat.whatsapp.com/... to jump directly to your group.'
                      )}
                    </span>
                  </label>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        {t(lang, 'زبان پیام گروه:', 'Group message language:')}
                      </span>
                      <div className="inline-grid grid-cols-2 gap-0.5 p-0.5 bg-slate-100 rounded-lg text-xs">
                        <button
                          type="button"
                          onClick={() => setPinLang('fa')}
                          className={`min-h-[32px] px-2.5 rounded-md font-semibold whitespace-nowrap ${
                            pinLang === 'fa' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                          }`}
                        >
                          فارسی
                        </button>
                        <button
                          type="button"
                          onClick={() => setPinLang('en')}
                          className={`min-h-[32px] px-2.5 rounded-md font-semibold whitespace-nowrap ${
                            pinLang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                          }`}
                        >
                          English (EU)
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={savingGroup}
                      className="min-h-[44px] px-5 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                    >
                      {savingGroup
                        ? t(lang, 'در حال ذخیره...', 'Saving...')
                        : t(lang, 'ذخیره تنظیمات اتصال', 'Save Connection Settings')}
                    </button>
                  </div>

                  {saveFeedback && (
                    <div
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-medium ${
                        saveFeedback.ok
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                    >
                      {saveFeedback.text}
                    </div>
                  )}
                </form>
              </section>

              {/* STEP 2: SEND DIRECTLY TO WHATSAPP GROUP & PIN */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t(lang, '۲. ارسال مستقیم و پین در گروه واتساپ', '2. Send & Pin in Your WhatsApp Group')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {t(
                      lang,
                      'روی دکمه سبز بزنید تا واتساپ با متن آماده باز شود؛ گروه ساختمان خود را انتخاب کنید، بفرستید و آن را Pin کنید.',
                      'Tap the green button to open WhatsApp with the message pre-filled, choose your building group, send, and pin it.'
                    )}
                  </p>
                </div>

                <div
                  dir={pinLang === 'fa' ? 'rtl' : 'ltr'}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 whitespace-pre-line leading-relaxed max-h-60 overflow-y-auto"
                >
                  {groupPinMessage}
                </div>

                {/* Primary 1-Click WhatsApp Launch + Secondary Utilities */}
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5">
                  <a
                    href={waShareToGroupHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] px-4 inline-flex items-center justify-center gap-2 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 transition-colors whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>{t(lang, 'ارسال مستقیم به گروه در واتساپ', 'Send to Group in WhatsApp')}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  </a>

                  <button
                    type="button"
                    onClick={() => copyText(groupPinMessage, 'pin_msg')}
                    className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    {copiedId === 'pin_msg' ? (
                      <Check className="w-4 h-4 text-emerald-700" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>
                      {copiedId === 'pin_msg'
                        ? t(lang, 'کپی شد', 'Copied')
                        : t(lang, 'کپی متن پیام', 'Copy Message')}
                    </span>
                  </button>

                  {safeSavedGroupUrl && (
                    <a
                      href={safeSavedGroupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <Users className="w-4 h-4" />
                      <span>{t(lang, 'باز کردن گروه', 'Open Group')}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </section>
            </div>

            {/* RIGHT 5 COLS: SCANNABLE QR CODE + STEP 3 READINESS CHECKLIST + META WEBHOOK */}
            <div className="lg:col-span-5 space-y-5">
              {/* SCANNABLE QR CODE FOR GROUP & LOBBY */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {t(lang, 'QR کد ورود مستقیم به بات واتساپ', 'Scannable WhatsApp Bot QR Code')}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t(
                        lang,
                        'برای ارسال در گروه یا نصب در لابی و کنار آسانسور پارکینگ',
                        'Share in your WhatsApp group or print for the elevator lobby'
                      )}
                    </p>
                  </div>
                  <QrCode className="w-5 h-5 text-slate-400 shrink-0" />
                </div>

                {waDirectBotLink ? (
                  <div className="flex flex-col items-center gap-3.5 pt-1">
                    <div
                      ref={qrContainerRef}
                      className="p-4 bg-white border border-slate-200 rounded-2xl"
                    >
                      <QRCodeSVG value={waDirectBotLink} size={168} level="M" includeMargin={false} />
                    </div>
                    <div className="text-center space-y-0.5">
                      <div className="text-xs font-semibold text-slate-800">
                        {savedGroup?.groupName || groupName || buildingDisplayFa}
                      </div>
                      <div dir="ltr" className="text-[11px] font-mono text-slate-500 tabular-nums">
                        +{cleanBotDigits}
                      </div>
                    </div>
                    <div className="w-full grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadQrSvg}
                        className="min-h-[42px] px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t(lang, 'دانلود QR', 'Download QR')}</span>
                      </button>
                      <a
                        href={waDirectBotLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[42px] px-3 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100/70 whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{t(lang, 'باز کردن چت بات', 'Open Bot Chat')}</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-1.5">
                    <div className="text-xs font-semibold text-slate-700">
                      {t(lang, 'شماره واتساپ بات هنوز ثبت نشده است', 'Bot WhatsApp number not set yet')}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {t(
                        lang,
                        'در مرحله ۱ شماره واتساپ بات (با کد کشور) را وارد و ذخیره کنید تا QR کد واقعی و قابل اسکن اینجا نمایش داده شود.',
                        'Enter and save your WhatsApp bot number in Step 1 to generate a live scannable QR code.'
                      )}
                    </p>
                  </div>
                )}
              </section>

              {/* STEP 3: LIVE READINESS CHECKLIST & CONFIRMATION */}
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t(lang, '۳. وضعیت آمادگی و فعال‌سازی اتصال', '3. Readiness Checklist & Activation')}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t(
                      lang,
                      'بات فقط به شماره‌هایی پاسخ می‌دهد که در فهرست ساکنان این ساختمان ثبت کرده باشید.',
                      'The bot strictly responds only to phone numbers whitelisted in your building roster.'
                    )}
                  </p>
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {/* Check 1: Group & Bot Number */}
                  <div className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {step1Done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {t(lang, 'ثبت نام گروه و شماره واتساپ', 'Group name & WhatsApp number')}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {step1Done
                            ? `${savedGroup?.groupName} · +${cleanBotDigits}`
                            : t(lang, 'در مرحله ۱ ذخیره کنید', 'Complete Step 1 on the left')}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Check 2: Whitelisted Resident Phones */}
                  <div className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {step3Done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {t(lang, 'شماره موبایل ساکنان در لیست مجاز', 'Resident numbers in whitelist')}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {t(
                            lang,
                            `${buildingRoster.length} ساکن دارای شماره واتساپ ثبت‌شده`,
                            `${buildingRoster.length} residents with verified WhatsApp numbers`
                          )}
                        </div>
                      </div>
                    </div>
                    {onOpenRoster && (
                      <button
                        type="button"
                        onClick={onOpenRoster}
                        className="min-h-[34px] px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded-lg whitespace-nowrap shrink-0"
                      >
                        {step3Done
                          ? t(lang, 'مشاهده لیست', 'View Roster')
                          : t(lang, 'افزودن شماره', 'Add Numbers')}
                      </button>
                    )}
                  </div>

                  {/* Check 3: Pinned in Group Confirmation */}
                  <div className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {step2Done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {t(lang, 'پین کردن پیام در گروه واتساپ', 'Message pinned in WhatsApp group')}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {step2Done
                            ? t(lang, 'تأیید شده · فعال برای همسایه‌ها', 'Confirmed · active for residents')
                            : t(lang, 'پس از ارسال در گروه، دکمه زیر را بزنید', 'Confirm after pinning in your group')}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={savingGroup}
                    onClick={handleTogglePinnedConfirmed}
                    className={`flex-1 min-h-[42px] px-3.5 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap ${
                      step2Done
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100/70'
                        : 'bg-emerald-700 text-white hover:bg-emerald-800'
                    }`}
                  >
                    {step2Done
                      ? t(lang, '✓ پیام در گروه پین شده است', '✓ Pinned in Group (Active)')
                      : t(lang, 'در گروه پین کردم — فعال شود', 'I Pinned It — Mark Connected')}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveMode('simulator')}
                    className="min-h-[42px] px-3.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 whitespace-nowrap"
                  >
                    {t(lang, 'تست پاسخگویی بات', 'Test Bot Now')}
                  </button>
                </div>
              </section>

              {/* OFFICIAL META CLOUD API WEBHOOK DRAWER */}
              <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowTechSetup((v) => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-2 text-start hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {t(lang, 'تنظیمات فنی پاسخگویی خودکار (Meta Cloud API)', 'Automated Server Webhook (Meta Cloud API)')}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {config?.liveConnected
                        ? t(lang, 'کلیدهای Meta روی سرور فعال هستند', 'Meta API credentials active on server')
                        : t(lang, 'آدرس Webhook و لیست کلیدهای سرور برای پاسخگویی ۲۴ ساعته', 'Webhook URL & server secrets for 24/7 auto-replies')}
                    </div>
                  </div>
                  {showTechSetup ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>

                {showTechSetup && (
                  <div className="px-5 pb-5 pt-2 border-t border-slate-100 space-y-3 text-xs">
                    <div className="space-y-1.5">
                      <div className="font-semibold text-slate-700">
                        {t(lang, 'آدرس Webhook برای Meta Developers:', 'Callback Webhook URL:')}
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
                          {copiedId === 'webhook' ? (
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="font-semibold text-slate-700">
                        {t(lang, 'کلیدهای امنیتی در Settings → Secrets:', 'Server Secrets (Settings → Secrets):')}
                      </div>
                      <ul
                        dir="ltr"
                        className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1"
                      >
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
                        'امضای امنیتی تمامی پیام‌های ورودی در سرور بررسی می‌شود و هیچ توکن خصوصی در مرورگر ذخیره نمی‌گردد.',
                        'All inbound Meta webhooks are cryptographically verified on the server; private credentials never reach the browser.'
                      )}
                    </p>
                  </div>
                )}
              </section>
            </div>
          </div>
        )
      )}

      {/* MODE 2 (OR RESIDENT DEFAULT): LIVE INTERACTIVE 1-ON-1 WHATSAPP SIMULATOR */}
      {(role === 'resident' || activeMode === 'simulator') && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LIVE WHATSAPP 1-ON-1 CHAT SIMULATOR */}
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
            {/* WhatsApp Header */}
            <div className="bg-emerald-900 text-white px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-emerald-700 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-100" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold flex items-center gap-1.5 truncate">
                    <span>ParkShare Bot</span>
                    <span className="text-[11px] font-medium text-emerald-200">· Official 1-on-1</span>
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
                      privacyBadge: lang === 'fa' ? 'گفتگوی جدید · خصوصی' : 'New Private Chat',
                      text:
                        lang === 'fa'
                          ? 'گفتگو پاک شد. پیام خود را بفرستید یا یک دکمه را انتخاب کنید:'
                          : 'Chat cleared. Send a message or pick an option below:',
                      buttons: [
                        { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو ۹ تا ۱۷' : 'Book 09:00–17:00' },
                        { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'اشتراک جای پارک من' : 'Share My Bay' },
                        { id: 'cmd:my_bookings', title: lang === 'fa' ? 'رزروهای من' : 'My Bookings' },
                      ],
                    },
                  ])
                }
                className="min-h-[34px] text-[11px] font-medium text-emerald-100 hover:text-white px-3 rounded-lg bg-emerald-800/70 hover:bg-emerald-800 whitespace-nowrap shrink-0"
              >
                {t(lang, 'پاک کردن چت', 'Clear')}
              </button>
            </div>

            {/* Sender Phone Selector Bar */}
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
                      {t(
                        lang,
                        'شماره غریبه خارج از لیست (+31 6 **** 9999)',
                        'Unlisted Outsider (+31 6 **** 9999)'
                      )}
                    </option>
                  </select>
                </>
              ) : (
                <div className="flex items-center gap-2 text-slate-700">
                  <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    {t(lang, 'شماره تأییدشده شما:', 'Your verified phone:')}{' '}
                    <strong dir="ltr" className="font-mono">
                      {maskPhone(residentOwnPhone || '')}
                    </strong>
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

                    <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 font-mono tabular-nums">
                      <span>{m.timestamp}</span>
                      {m.sender === 'user' && <CheckCheck className="w-3.5 h-3.5 text-sky-500" />}
                    </div>
                  </div>

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
                          className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-200/90 rounded-xl shadow-xs transition-colors disabled:opacity-50 whitespace-nowrap"
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
                  className="min-h-[34px] px-3 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 hover:text-emerald-800 whitespace-nowrap shrink-0 transition-colors"
                >
                  {ex.label}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={handleSubmitForm}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
            >
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
                className="min-w-[44px] h-11 px-4 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 disabled:opacity-50 shrink-0 whitespace-nowrap"
                aria-label={t(lang, 'ارسال پیام', 'Send message')}
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">{t(lang, 'ارسال', 'Send')}</span>
              </button>
            </form>
          </section>

          {/* SIDE SUMMARY: COMMAND CHEATSHEET & PRIVACY GUARANTEES */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">
              {t(lang, 'دستورهای پشتیبانی‌شده در واتساپ', 'Supported WhatsApp Commands')}
            </h3>

            <dl className="divide-y divide-slate-100 text-xs">
              <div className="py-2.5 space-y-0.5">
                <dt className="font-semibold text-slate-900">
                  {t(lang, 'رزرو 9 تا 17', 'book 09:00-17:00')}
                </dt>
                <dd className="text-slate-500">
                  {t(lang, 'جستجوی بهترین جایگاه خالی و رزرو با یک لمس', 'Finds the best matching bay with 1-tap booking')}
                </dd>
              </div>
              <div className="py-2.5 space-y-0.5">
                <dt className="font-semibold text-slate-900">
                  {t(lang, 'آزاد 8 تا 18', 'share 08:00-18:00')}
                </dt>
                <dd className="text-slate-500">
                  {t(lang, 'اعلام بازه خالی پارکینگ شما به همسایه‌های مجاز', 'Publishes your bay availability to verified neighbors')}
                </dd>
              </div>
              <div className="py-2.5 space-y-0.5">
                <dt className="font-semibold text-slate-900">
                  {t(lang, 'توقف اشتراک', 'stop sharing')}
                </dt>
                <dd className="text-slate-500">
                  {t(lang, 'خارج کردن فوری پارکینگ شما از لیست رزرو', 'Immediately pauses sharing for your bay')}
                </dd>
              </div>
              <div className="py-2.5 space-y-0.5">
                <dt className="font-semibold text-slate-900">
                  {t(lang, 'رزروهای من / لغو', 'my bookings / cancel')}
                </dt>
                <dd className="text-slate-500">
                  {t(lang, 'مشاهده و لغو رزروهای فعال همگام با تقویم پنل', 'Inspect or cancel active reservations synced live')}
                </dd>
              </div>
            </dl>

            <div className="pt-2 border-t border-slate-100 space-y-2 text-[11px] text-slate-600 leading-relaxed">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>{t(lang, 'تضمین حریم خصوصی (GDPR)', 'GDPR Privacy Guarantee')}</span>
              </div>
              <p>
                {t(
                  lang,
                  'نام، شماره تلفن و واحد صاحب پارکینگ هرگز در پیام‌های واتساپ فاش نمی‌شود و شماره‌های خارج از لیست مدیر مسدود می‌گردند.',
                  'Owner name, phone, and unit are never disclosed in WhatsApp messages, and unlisted phones are blocked automatically.'
                )}
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
