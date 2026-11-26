import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Car,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  EyeOff,
  HelpCircle,
  Lock,
  MessageCircle,
  Play,
  Printer,
  QrCode,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  X,
  Zap,
} from 'lucide-react';
import { Language } from '../types/parkshare';
import { t } from '../i18n/translations';
import { GARAGE_ROUTE_IMAGE_URL, PSTopDownCarSvg } from './ui/ParkShareUIKit';

interface Props {
  lang: Language;
  onClose?: () => void;
  onStartTour?: () => void;
  showTourButton?: boolean;
}

type JourneyFilter = 'all' | 'manager' | 'sharer' | 'borrower';

interface InfographicStep {
  stepNumber: number;
  title: string;
  subtitle: string;
  badge: string;
  preview: React.ReactNode;
}

export function getManagerWhatsAppPitch(lang: Language): string {
  if (lang === 'nl') {
    return `Hallo! Ik wil graag een korte en praktische oplossing delen voor het parkeerprobleem in ons gebouw: *ParkShare*.

In plaats van tientallen losse berichten in de WhatsApp-groep ("Heeft iemand vandaag een plek vrij?"), regelt *ParkShare* alles overzichtelijk, veilig en volledig onder controle van het gebouwbeheer:

1️⃣ *Alleen voor erkende bewoners (Whitelist):* Alleen bewoners op de officiële lijst van de beheerder kunnen inloggen — geen buitenstaanders.
2️⃣ *100% Privacy (AVG/GDPR-proof):* Buren zien elkaars naam, huisnummer, telefoonnummer of e-mailadres nooit. Alle reserveringen zijn pseudoniem.
3️⃣ *Vrijwillig gratis óf betaald delen:* De beheerder bepaalt de spelregels — alleen gratis delen of met een uurtarief + eerlijke limieten (max. uren/dagen) tegen misbruik.
4️⃣ *Koppeling met onze WhatsApp-groep:* We kunnen ParkShare direct aan onze WhatsApp-groep koppelen via een privé-bot, zodat bewoners zelfs vanuit WhatsApp met één klik een plek kunnen zoeken of vrijgeven zonder de groep te vervuilen.
5️⃣ *Klaar voor zowel Boston als Seattle:* Elke toren krijgt een eigen besloten omgeving (en als het beheer dat wil, kunnen Boston en Seattle onderling vrije plekken delen).

Ik laat het je graag in 2 minuten zien — je hebt als beheerder volledig overzicht en kunt alles met één klik aanpassen.`;
  }

  if (lang === 'en') {
    return `Hi! I'd love to share a simple, private solution for building parking requests: *ParkShare*.

Instead of messy back-and-forth messages in a WhatsApp group ("Is anyone's parking spot free today?"), *ParkShare* organizes everything cleanly, securely, and fully under Building Management control:

1️⃣ *Official Whitelist Only:* Only verified residents approved by the building manager can join — outsiders can never register or see spots.
2️⃣ *European Privacy by Design:* Neighbors never see each other's name, unit number, phone, or email. All bookings stay pseudonymous.
3️⃣ *Manager-Controlled Rules (Free or Paid):* Management decides whether spots are shared free or at a capped hourly rate, plus fair-use limits (hourly/daily/monthly) to prevent permanent subletting.
4️⃣ *Works Directly with Our WhatsApp Group:* We can connect ParkShare to our building WhatsApp group with a 1-on-1 private bot, so residents can request or book in seconds right from WhatsApp without spamming the group.
5️⃣ *Ready for Both Boston & Seattle Towers:* Each building gets its own isolated space, and management can even allow cross-tower overflow sharing between Boston and Seattle if desired.

Happy to walk you through a quick 2-minute demo whenever convenient!`;
  }

  return `سلام وقتتون بخیر 🌿
می‌خواستم یک راهکار خیلی ساده، امن و منظم برای اشتراک‌گذاری جای پارک‌های خالی ساختمان معرفی کنم به اسم *ParkShare*.

به‌جای اینکه هر روز توی گروه واتساپ پیام‌های شلوغ ردوبدل بشه («کسی امروز جای پارکش خالیه؟»)، همه‌چیز خیلی تمیز و زیر نظر مستقیم مدیریت ساختمان انجام می‌شه:

1️⃣ *ورود فقط با لیست رسمی مدیر:* هیچ فرد غریبه‌ای نمی‌تونه ثبت‌نام کنه یا ظرفیت پارکینگ‌ها رو ببینه؛ فقط ساکنانی که مدیر تایید کرده دسترسی دارن.
2️⃣ *حفظ کامل حریم خصوصی (استاندارد اروپا):* اسم، شماره واحد، شماره تماس و ایمیل همسایه‌ها هرگز برای همدیگه نمایش داده نمی‌شه و تمام رزروها با کد ناشناس انجام می‌شه.
3️⃣ *قوانین کاملاً دست مدیر ساختمانه:* مدیر تعیین می‌کنه اشتراک‌گذاری فقط رایگان باشه یا امکان اجاره موقت ساعتی (پولی) هم وجود داشته باشه؛ با سقف ساعتی، روزانه و ماهانه تا پارکینگ موقت تبدیل به اجاره دائمی نشه.
4️⃣ *وصل می‌شه به همین گروه واتساپ:* با یک کلیک به گروه واتساپ ساختمان وصل می‌شه و از طریق بات خصوصی، ساکنان می‌تونن مستقیم از داخل واتساپ جای پارک پیدا کنن یا رزرو کنن، بدون اینکه گروه شلوغ بشه یا شماره‌ای لو بره.
5️⃣ *قابل راه‌اندازی برای برج سیاتل هم هست:* هم برای ساختمان خودمون (بوستون) و هم برای برج *سیاتل* می‌شه فضای مجزا ساخت و حتی اگه مدیریت اجازه بده، در زمان کمبود جا، بین دو برج هم اشتراک‌گذاری کنترل‌شده انجام بشه.

اگه موافق باشید توی ۲ دقیقه نسخه زنده و راهنمای تصویریش رو نشونتون بدم تا ببینید چقدر کار همه رو راحت‌تر می‌کنه.`;
}

/* -------------------------------------------------------------------------- */
/* Real-App Mini Screen Previews (Styled with ParkShare Violet & Coral UI Kit) */
/* -------------------------------------------------------------------------- */

const MiniScreenFrame: React.FC<{ children: React.ReactNode; label?: string }> = ({
  children,
  label,
}) => (
  <div className="w-full rounded-2xl border border-[#E6E0F7] bg-[#F8F6FD] p-2.5 shadow-xs overflow-hidden">
    {label && (
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D58AF0]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#F46A46]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#6E41C4]" />
        </div>
        <span className="text-[9px] font-mono font-semibold text-[#7D7A92] uppercase tracking-wider truncate">
          {label}
        </span>
      </div>
    )}
    <div className="rounded-xl bg-white border border-[#ECE9F7] overflow-hidden">{children}</div>
  </div>
);

const InfographicRow: React.FC<{
  steps: InfographicStep[];
  lang: Language;
  accent: 'violet' | 'coral' | 'teal';
}> = ({ steps, lang, accent }) => {
  const isRtl = lang === 'fa';
  const badgeStyle =
    accent === 'coral'
      ? 'bg-[#F46A46] text-white shadow-[0_6px_14px_rgba(244,106,70,0.32)]'
      : accent === 'teal'
        ? 'bg-[#0F766E] text-white shadow-[0_6px_14px_rgba(15,118,110,0.28)]'
        : 'bg-[#6E41C4] text-white shadow-[0_6px_14px_rgba(110,65,196,0.32)]';

  const underlineStyle =
    accent === 'coral'
      ? 'bg-[#F46A46]'
      : accent === 'teal'
        ? 'bg-[#0F766E]'
        : 'bg-[#6E41C4]';

  const arrowColor =
    accent === 'coral'
      ? 'text-[#F46A46]'
      : accent === 'teal'
        ? 'text-[#0F766E]'
        : 'text-[#6E41C4]';

  return (
    <div className="relative">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 pt-4">
        {steps.map((step, idx) => (
          <div key={step.stepNumber} className="relative flex flex-col">
            {/* Step Card */}
            <div className="relative flex-1 bg-white rounded-[24px] border border-[#ECE9F7] ps-card-shadow px-4 pt-7 pb-4 flex flex-col justify-between gap-3.5 transition-transform hover:-translate-y-0.5">
              {/* Top Floating Number Badge (Reference Infographic Style) */}
              <div
                className={`absolute -top-4 inset-x-0 mx-auto w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold font-mono tabular-nums ${badgeStyle}`}
              >
                {step.stepNumber}
              </div>

              <div className="space-y-1.5 text-center">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#7D7A92]">
                  {step.badge}
                </div>
                <h4 className="text-sm font-extrabold text-[#171525] leading-snug">
                  {step.title}
                </h4>
                <p className="text-[11px] text-[#5C5873] leading-relaxed">{step.subtitle}</p>
              </div>

              {/* Real App Mini Preview */}
              <div className="mt-auto">{step.preview}</div>

              {/* Crisp Bottom Accent Dash (Reference Infographic Signature) */}
              <div className={`w-8 h-1 rounded-full mx-auto opacity-85 ${underlineStyle}`} />
            </div>

            {/* Horizontal Connector Arrow on Desktop */}
            {idx < steps.length - 1 && (
              <div
                aria-hidden="true"
                className={`hidden xl:flex items-center justify-center absolute top-1/2 -translate-y-1/2 -end-4 z-10 w-3 ${arrowColor}`}
              >
                {isRtl ? (
                  <ArrowLeft className="w-4 h-4 shrink-0" />
                ) : (
                  <ArrowRight className="w-4 h-4 shrink-0" />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export const HelpInfographicGuide: React.FC<Props> = ({
  lang,
  onClose,
  onStartTour,
  showTourButton = false,
}) => {
  const [journeyFilter, setJourneyFilter] = useState<JourneyFilter>('all');
  const [pitchLang, setPitchLang] = useState<Language>(lang);
  const [copiedPitch, setCopiedPitch] = useState(false);

  const handleCopyPitch = async () => {
    try {
      await navigator.clipboard.writeText(getManagerWhatsAppPitch(pitchLang));
      setCopiedPitch(true);
      setTimeout(() => setCopiedPitch(false), 2400);
    } catch {
      // Fallback ignored safely
    }
  };

  /* -------------------- TRACK 1: BUILDING MANAGER (5 STEPS) -------------------- */
  const managerSteps: InfographicStep[] = [
    {
      stepNumber: 1,
      badge: t(lang, 'ساختمان و برج‌ها', 'Multi-Tower Setup', 'Gebouwen & Torens'),
      title: t(lang, 'ساخت ساختمان بوستون و سیاتل', 'Set Up Boston & Seattle Towers', 'Boston & Seattle instellen'),
      subtitle: t(
        lang,
        'برای هر برج فضای کاملاً مجزا و رمزگذاری‌شده بسازید و در صورت تمایل اشتراک‌گذاری بین دو برج را فعال کنید.',
        'Create isolated workspaces per tower (Boston & Seattle) with optional cross-tower overflow sharing.',
        'Maak aparte omgevingen per toren (Boston & Seattle) met optioneel onderling delen.'
      ),
      preview: (
        <MiniScreenFrame label="Building Manager">
          <div className="p-2.5 space-y-2 text-[10px]">
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#F5F1FD] border border-[#E5DCFA]">
              <div className="flex items-center gap-1.5 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-[#6E41C4] shrink-0" />
                <span className="font-bold text-[#171525] truncate">Boston Tower</span>
              </div>
              <span className="font-mono text-[9px] font-bold text-[#0F766E]">48 bays</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-[#FFF5F2] border border-[#FCD9CE]">
              <div className="flex items-center gap-1.5 min-w-0">
                <Building2 className="w-3.5 h-3.5 text-[#F46A46] shrink-0" />
                <span className="font-bold text-[#171525] truncate">Seattle Tower</span>
              </div>
              <span className="font-mono text-[9px] font-bold text-[#E05330]">+ Add / Link</span>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 2,
      badge: t(lang, 'لیست مجاز', 'Official Whitelist', 'Beheer-whitelist'),
      title: t(lang, 'ثبت لیست رسمی ساکنان', 'Import Verified Residents', 'Bewonerslijst importeren'),
      subtitle: t(
        lang,
        'شماره واحد، کد پارکینگ و ایمیل یا تلفن ساکنان را وارد کنید. هیچ غریبه‌ای اجازه ثبت‌نام ندارد.',
        'Upload approved units & bay codes. Only whitelisted neighbors can activate accounts.',
        'Importeer erkende appartementen en plekcodes. Buitenstaanders krijgen nooit toegang.'
      ),
      preview: (
        <MiniScreenFrame label="Whitelist Roster">
          <div className="p-2.5 space-y-1.5 text-[10px]">
            {[
              { unit: '14B', bay: 'P1-004', ok: true },
              { unit: '22A', bay: 'P1-011', ok: true },
              { unit: 'Unknown', bay: 'Blocked', ok: false },
            ].map((row) => (
              <div
                key={row.unit}
                className="flex items-center justify-between px-2 py-1 rounded-lg bg-[#FAF9FE] border border-[#EFEBF9]"
              >
                <span className="font-mono font-bold text-[#171525]">{row.unit}</span>
                <span className="font-mono text-[#6E41C4]">{row.bay}</span>
                <span
                  className={`text-[9px] font-bold ${
                    row.ok ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {row.ok ? '✓ OK' : '✕ Deny'}
                </span>
              </div>
            ))}
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 3,
      badge: t(lang, 'قوانین و تعرفه', 'Rules & Pricing', 'Regels & Tarieven'),
      title: t(lang, 'تعیین رایگان یا پولی و سقف عادلانه', 'Free/Paid Rules & Fair-Use', 'Gratis/Betaald & Limieten'),
      subtitle: t(
        lang,
        'مشخص کنید اشتراک‌گذاری فقط رایگان باشد یا اجاره موقت پولی هم مجاز باشد؛ با سقف ساعتی و ماهانه.',
        'Toggle Free-only or Paid hourly sharing, audience scope, and anti-abuse hourly/monthly caps.',
        'Stel in of delen gratis of betaald mag zijn, plus eerlijke uur- en maandlimieten.'
      ),
      preview: (
        <MiniScreenFrame label="Policy Engine">
          <div className="p-2.5 space-y-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="text-[#5C5873] font-medium">
                {t(lang, 'اجاره پولی موقت', 'Paid sharing', 'Betaald delen')}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#EFEAFC] text-[#5A2FA8] font-bold text-[9px]">
                {t(lang, 'تحت کنترل مدیر', 'Manager ON/OFF', 'Beheerder AAN/UIT')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center pt-1 border-t border-[#F1EEFA]">
              <div className="p-1 rounded-lg bg-[#FAF9FE]">
                <div className="font-mono font-extrabold text-[#171525]">8h</div>
                <div className="text-[8px] text-[#7D7A92]">{t(lang, 'روزانه', 'Max/day', 'Max/dag')}</div>
              </div>
              <div className="p-1 rounded-lg bg-[#FAF9FE]">
                <div className="font-mono font-extrabold text-[#171525]">3d</div>
                <div className="text-[8px] text-[#7D7A92]">{t(lang, 'پیاپی', 'Streak', 'Reeks')}</div>
              </div>
              <div className="p-1 rounded-lg bg-[#FAF9FE]">
                <div className="font-mono font-extrabold text-[#171525]">40h</div>
                <div className="text-[8px] text-[#7D7A92]">{t(lang, 'ماهانه', 'Month', 'Maand')}</div>
              </div>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 4,
      badge: t(lang, 'اتصال واتساپ', 'WhatsApp Bridge', 'WhatsApp-koppeling'),
      title: t(lang, 'اتصال به گروه واتساپ ساختمان', 'Connect WhatsApp Group', 'Koppel WhatsApp-groep'),
      subtitle: t(
        lang,
        'پیام دعوت + کد QR را در گروه واتساپ بگذارید تا ساکنان مستقیم از بات خصوصی واتساپ رزرو کنند.',
        'Pin the 1-click QR & message in your WhatsApp group. Residents book privately via 1-on-1 bot.',
        'Deel de QR & link in de groepsapp. Bewoners boeken privé via de 1-op-1 bot zonder groepsspam.'
      ),
      preview: (
        <MiniScreenFrame label="WhatsApp Bot">
          <div className="p-2.5 flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
              <QrCode className="w-6 h-6" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-[10px] font-bold text-[#171525] truncate">
                {t(lang, 'گروه پارکینگ بوستون', 'Boston Parking Group', 'Boston Parkeergroep')}
              </div>
              <div className="text-[9px] text-emerald-700 font-semibold flex items-center gap-1">
                <MessageCircle className="w-3 h-3 shrink-0" />
                <span className="truncate">{t(lang, 'چت ۱به۱ بدون نمایش شماره', 'Private 1-on-1 GDPR bot', 'Privé 1-op-1 AVG-bot')}</span>
              </div>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 5,
      badge: t(lang, 'نظارت و گزارش', 'Live Control', 'Live Overzicht'),
      title: t(lang, 'مدیریت رزروها و گزارش حریم خصوصی', 'Monitor Schedule & Audits', 'Boekingen & AVG-log'),
      subtitle: t(
        lang,
        'جدول زمانی زنده، درخواست‌های تمدید و گزارش امنیتی هر ساختمان را یک‌جا مدیریت کنید.',
        'Track live occupancy, approve extended stays, and export zero-PII privacy audit reports.',
        'Bekijk live bezetting, keur langere aanvragen goed en exporteer AVG-auditrapporten.'
      ),
      preview: (
        <MiniScreenFrame label="Schedule & Audit">
          <div className="p-2.5 space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between text-[#171525] font-bold">
              <span>{t(lang, 'ظرفیت امروز', 'Today Utilization', 'Bezetting vandaag')}</span>
              <span className="font-mono text-[#6E41C4]">78%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#EFEAFC] overflow-hidden">
              <div className="w-[78%] h-full rounded-full ps-hero-gradient" />
            </div>
            <div className="flex items-center justify-between text-[9px] text-[#7D7A92] pt-0.5">
              <span>GDPR Log ✓</span>
              <span>0 leaks</span>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
  ];

  /* -------------------- TRACK 2: BAY OWNER / SHARER (5 STEPS) -------------------- */
  const sharerSteps: InfographicStep[] = [
    {
      stepNumber: 1,
      badge: t(lang, 'احراز هویت امن', 'Verified Entry', 'Veilige activatie'),
      title: t(lang, 'فعال‌سازی حساب با لینک دعوت', 'Activate via Invite Link', 'Activeer via uitnodiging'),
      subtitle: t(
        lang,
        'با ایمیل یا شماره ثبت‌شده و کد پارکینگ خود وارد شوید و نام کاربری اختصاصی بسازید.',
        'Verify your email/phone and bay code against the building roster to unlock your account.',
        'Verifieer je e-mail/telefoon en plekcode tegen de bewonerslijst om direct te starten.'
      ),
      preview: (
        <MiniScreenFrame label="Resident Verify">
          <div className="p-2.5 space-y-1.5 text-[10px]">
            <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{t(lang, 'تاییدشده در لیست رسمی', 'Verified on Roster', 'Geverifieerd op lijst')}</span>
            </div>
            <div className="px-2 py-1 rounded-lg bg-[#F5F1FD] font-mono text-[9px] text-[#5A2FA8] flex justify-between">
              <span>Unit 14B</span>
              <span>Bay P1-004</span>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 2,
      badge: t(lang, 'زمان‌بندی آزاد', 'Free Window', 'Beschikbare tijden'),
      title: t(lang, 'ثبت ساعات خالی بودن پارکینگ', 'Set Your Available Hours', 'Stel vrije uren in'),
      subtitle: t(
        lang,
        'ساعات سرکار رفتن یا سفر خود را مشخص کنید تا جای پارک شما فقط در همان بازه قابل رزرو باشد.',
        'Choose exact hours (e.g. 08:00–18:00 while at work or traveling) to share your spot.',
        'Kies exacte uren (bijv. 08:00–18:00 tijdens werk of vakantie) waarop je plek vrij is.'
      ),
      preview: (
        <MiniScreenFrame label="Availability">
          <div className="p-2.5 space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-1.5 rounded-lg bg-[#FAF9FE] border border-[#ECE9F7] text-center">
                <div className="text-[8px] text-[#7D7A92]">{t(lang, 'از ساعت', 'From', 'Van')}</div>
                <div className="font-mono font-extrabold text-[#171525]">08:00</div>
              </div>
              <div className="p-1.5 rounded-lg bg-[#FAF9FE] border border-[#ECE9F7] text-center">
                <div className="text-[8px] text-[#7D7A92]">{t(lang, 'تا ساعت', 'Until', 'Tot')}</div>
                <div className="font-mono font-extrabold text-[#171525]">18:00</div>
              </div>
            </div>
            <div className="text-[9px] font-semibold text-[#6E41C4] text-center">
              {t(lang, '۱ جای پارک آزاد · تایید خودکار', '10h open · Auto-approve ON', '10u vrij · Automatisch akkoord')}
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 3,
      badge: t(lang, 'رایگان یا پولی', 'Free or Paid', 'Gratis of Betaald'),
      title: t(lang, 'انتخاب رایگان یا اجاره ساعتی', 'Share Free or Paid Rate', 'Gratis of betaald delen'),
      subtitle: t(
        lang,
        'بر اساس قوانین مدیر ساختمان، جای پارک را رایگان به همسایه بدهید یا نرخ ساعتی مجاز تعیین کنید.',
        'Offer your bay free for neighbors or set an hourly rate whenever allowed by building policy.',
        'Deel gratis met buren of stel een uurtarief in als het gebouwbeleid dit toestaat.'
      ),
      preview: (
        <MiniScreenFrame label="Pricing & Policy">
          <div className="p-2.5 space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-center font-bold text-emerald-800">
                {t(lang, 'رایگان', 'Free', 'Gratis')}
              </div>
              <div className="p-1.5 rounded-lg bg-[#EFEAFC] border border-[#D4C3FA] text-center font-mono font-bold text-[#5A2FA8]">
                €1.50/h
              </div>
            </div>
            <div className="text-[9px] text-[#7D7A92] text-center">
              {t(lang, 'فقط ساکنان همین ساختمان', 'Residents only policy', 'Alleen bewoners beleid')}
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 4,
      badge: t(lang, 'هویت مخفی', 'Zero PII Exposure', 'Volledig anoniem'),
      title: t(lang, 'رزرو بدون نمایش مشخصات شما', 'Pseudonymous Bookings', 'Anonieme reserveringen'),
      subtitle: t(
        lang,
        'نام، شماره واحد، موبایل و ایمیل شما هرگز برای رزروکننده نمایش داده نمی‌شود.',
        'Borrowers only see the bay code and a pseudonymous ID — never your name, unit, or phone.',
        'Gebruikers zien alleen de plekcode en een anonieme code — nooit je naam of nummer.'
      ),
      preview: (
        <MiniScreenFrame label="Privacy Shield">
          <div className="p-2.5 space-y-1.5 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 font-bold text-[#5A2FA8]">
                <EyeOff className="w-3 h-3" /> Neighbor #4F2A
              </span>
              <span className="text-[9px] text-emerald-700 font-bold">GDPR ✓</span>
            </div>
            <div className="text-[9px] text-[#7D7A92] line-through">
              Unit 14B · +31 6 •••• ••••
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 5,
      badge: t(lang, 'بازگشت اضطراری', 'Owner Recall', 'Terugroepgarantie'),
      title: t(lang, 'فراخوان فوری هنگام بازگشت زودتر', '1-Tap Early Return Recall', 'Direct terugroepen'),
      subtitle: t(
        lang,
        'اگر زودتر برگشتید با یک لمس اعلام کنید؛ سیستم مهمان را خودکار به جای پارک آزاد بعدی منتقل می‌کند.',
        'Returning early? Trigger a 1-tap recall and ParkShare automatically relocates the borrower.',
        'Eerder thuis? Met één klik verplaatst ParkShare de gast automatisch naar een andere vrije plek.'
      ),
      preview: (
        <MiniScreenFrame label="Smart Recall">
          <div className="p-2.5 space-y-1.5 text-[10px]">
            <div className="px-2 py-1 rounded-lg bg-[#FFF0EB] border border-[#FCD4C8] text-[#D44A26] font-bold flex items-center justify-between">
              <span>{t(lang, 'بازگشت مالک', 'Owner Returning', 'Eigenaar komt terug')}</span>
              <RefreshCw className="w-3 h-3" />
            </div>
            <div className="text-[9px] text-emerald-700 font-semibold text-center">
              {t(lang, 'انتقال خودکار به جای پارک B-2', 'Auto-relocated → Bay B-2', 'Auto-verplaatst → Plek B-2')}
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
  ];

  /* -------------------- TRACK 3: TEMPORARY PARKER / BORROWER (5 STEPS) -------------------- */
  const borrowerSteps: InfographicStep[] = [
    {
      stepNumber: 1,
      badge: t(lang, 'جست‌وجو و فیلتر', 'Find Space', 'Plek zoeken'),
      title: t(lang, 'جست‌وجو بر اساس نوع خودرو و ساعت', 'Filter by Car, EV or SUV', 'Filter op Auto, EV of SUV'),
      subtitle: t(
        lang,
        'ساعت نیاز خود را انتخاب کنید و با کاشی‌های سریع، جای پارک معمولی یا دارای شارژر برقی (EV) را فیلتر کنید.',
        'Pick your time window and tap vehicle tiles (Car, EV Charger, SUV/Van, Accessible) to filter.',
        'Kies je tijdvak en filter direct op Auto, EV-laadpaal, SUV of ruime toegang.'
      ),
      preview: (
        <MiniScreenFrame label="Find your Parking Space">
          <div className="ps-hero-gradient p-2.5 text-white space-y-2">
            <div className="text-[10px] font-extrabold leading-tight">
              {t(lang, 'جای پارک خود را پیدا کنید', 'Find your Parking Space', 'Vind jouw parkeerplek')}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {[
                { bg: 'bg-[#FFE4E8] text-[#E04D67]', icon: Car },
                { bg: 'bg-[#DFF8F2] text-[#0F967B]', icon: Zap },
                { bg: 'bg-[#E5F2FF] text-[#2878D8]', icon: Search },
                { bg: 'bg-[#EFEAFC] text-[#6E41C4]', icon: ShieldCheck },
              ].map((tile, i) => {
                const Icon = tile.icon;
                return (
                  <div
                    key={i}
                    className={`h-7 rounded-full flex items-center justify-center ${tile.bg}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                );
              })}
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 2,
      badge: t(lang, 'نقشه زنده طبقه', 'Choose Space', 'Kies plek op kaart'),
      title: t(lang, 'انتخاب مستقیم روی نقشه پارکینگ', 'Pick on Interactive Floor Map', 'Selecteer op plattegrond'),
      subtitle: t(
        lang,
        'طبقه را عوض کنید، جای پارک‌های اشغال‌شده و آزاد را ببینید و با یک لمس جای پارک دلخواه را انتخاب کنید.',
        'Switch garage floors, see occupied top-down cars, and tap any open bay to highlight it.',
        'Wissel van verdieping, zie bezette plekken en tik direct op een vrije parkeerplaats.'
      ),
      preview: (
        <MiniScreenFrame label="Choose Space · B1">
          <div className="p-2.5 space-y-2">
            <div className="flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-full bg-[#F46A46] text-white text-[9px] font-bold">
                B1
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#F2EFFA] text-[#7D7A92] text-[9px] font-semibold">
                B2
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 items-center">
              <div className="h-8 rounded-lg border border-dashed border-[#DDD6F3] flex items-center justify-center opacity-80">
                <PSTopDownCarSvg className="w-11 h-5" />
              </div>
              <div className="h-8 rounded-lg bg-[#FFF1EC] border-e-2 border-[#F46A46] flex items-center justify-center">
                <div className="px-1.5 py-0.5 rounded-md bg-[#F46A46] shadow-xs">
                  <PSTopDownCarSvg selected className="w-9 h-4" />
                </div>
              </div>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 3,
      badge: t(lang, 'رزرو آنی و شفاف', 'Book & Rules', 'Direct boeken'),
      title: t(lang, 'بررسی رایگان/پولی و ثبت رزرو', 'Confirm Rate & Book Space', 'Check tarief & reserveer'),
      subtitle: t(
        lang,
        'قبل از تایید، رایگان بودن یا نرخ ساعتی مجاز و مانده سهمیه منصفانه خود را شفاف ببینید.',
        'Review whether the bay is Free or Paid (per manager policy) and book atomically with zero double-bookings.',
        'Bekijk direct of de plek gratis of betaald is en reserveer direct zonder dubbele boekingen.'
      ),
      preview: (
        <MiniScreenFrame label="Confirm Booking">
          <div className="p-2.5 space-y-2 text-[10px]">
            <div className="flex items-center justify-between">
              <span className="font-mono font-extrabold text-[#171525]">A-3 · EV</span>
              <span className="font-mono font-bold text-[#6E41C4]">€1.50/h</span>
            </div>
            <div className="w-full py-1.5 rounded-xl ps-violet-btn text-white text-center font-bold text-[10px]">
              {t(lang, 'رزرو جای پارک', 'Book Space', 'Plek boeken')}
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 4,
      badge: t(lang, 'رزرو با واتساپ', 'WhatsApp Option', 'Via WhatsApp'),
      title: t(lang, 'یا رزرو ۲ثانیه‌ای از بات واتساپ', 'Or Book via WhatsApp Bot', 'Of boek via WhatsApp-bot'),
      subtitle: t(
        lang,
        'حتی بدون باز کردن مرورگر، توی چت خصوصی بات پیام «جای پارک» بفرستید و با دکمه شیشه‌ای رزرو کنید.',
        'Message the private WhatsApp bot anytime and tap interactive quick-reply buttons to reserve.',
        'Stuur de privé WhatsApp-bot een bericht en reserveer met één tik via snelle knoppen.'
      ),
      preview: (
        <MiniScreenFrame label="WhatsApp 1-on-1">
          <div className="p-2.5 space-y-1.5 text-[9px] bg-[#F2F7F4]">
            <div className="bg-white rounded-lg p-1.5 border border-emerald-100 text-[#171525]">
              {t(lang, '✅ جای پارک A-3 تا ۱۸:۰۰ رزرو شد.', '✅ Bay A-3 reserved until 18:00.', '✅ Plek A-3 geboekt tot 18:00.')}
            </div>
            <div className="flex gap-1">
              <span className="flex-1 text-center py-1 rounded-md bg-emerald-600 text-white font-bold">
                {t(lang, 'مسیریابی', 'Route', 'Route')}
              </span>
              <span className="flex-1 text-center py-1 rounded-md bg-white border border-emerald-200 text-emerald-800 font-bold">
                {t(lang, 'لغو', 'Cancel', 'Annuleer')}
              </span>
            </div>
          </div>
        </MiniScreenFrame>
      ),
    },
    {
      stepNumber: 5,
      badge: t(lang, 'مسیریابی پارکینگ', 'In-Garage Route', 'Garage-navigatie'),
      title: t(lang, 'راهنمای مسیر تا دقیقاً همان جای پارک', 'Follow In-Garage Route', 'Volg route naar de plek'),
      subtitle: t(
        lang,
        'مسیر طبقه، فاصله تا جای پارک و جهت پیچیدن را روی نمای پارکینگ ببینید و راحت پارک کنید.',
        'See exact turn-by-turn garage guidance, floor level, and distance right to your reserved bay.',
        'Volg de duidelijke routeaanwijzing met afstand en verdieping rechtstreeks naar jouw plek.'
      ),
      preview: (
        <MiniScreenFrame label="Route · 65 m">
          <div className="relative h-20 overflow-hidden bg-[#1D1730]">
            <img
              src={GARAGE_ROUTE_IMAGE_URL}
              alt="Garage route preview"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-85"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#241645]/80 via-transparent to-[#5B31B3]/55" />
            <div className="absolute top-1.5 inset-x-2 flex items-center justify-between text-white">
              <span className="text-[9px] font-bold">Bay A-3</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white text-[#171525] font-mono font-extrabold text-[8px]">
                65 m
              </span>
            </div>
            <svg
              viewBox="0 0 120 40"
              className="absolute bottom-0 inset-x-0 w-full h-10 pointer-events-none"
              aria-hidden="true"
            >
              <path
                d="M 46 40 C 52 24, 62 18, 70 6 L 80 6 C 72 19, 64 26, 62 40 Z"
                fill="rgba(139, 98, 224, 0.78)"
              />
              <path
                d="M 52 33 L 58 27 L 64 33"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </MiniScreenFrame>
      ),
    },
  ];

  const showManager = journeyFilter === 'all' || journeyFilter === 'manager';
  const showSharer = journeyFilter === 'all' || journeyFilter === 'sharer';
  const showBorrower = journeyFilter === 'all' || journeyFilter === 'borrower';

  return (
    <div className="space-y-8 pb-8">
      {/* Top Hero Banner */}
      <section className="relative overflow-hidden rounded-[28px] ps-hero-gradient text-white p-6 sm:p-8 shadow-[0_18px_42px_rgba(90,47,168,0.2)]">
        <div className="pointer-events-none absolute -top-16 -end-16 w-60 h-60 rounded-full bg-white/15 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -start-10 w-52 h-52 rounded-full bg-[#F46A46]/25 blur-2xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="space-y-2.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-white/90">
              <HelpCircle className="w-4 h-4" />
              <span>
                {t(
                  lang,
                  'راهنمای کامل و اینفوگرافیک مرحله‌به‌مرحله ParkShare',
                  'ParkShare Complete Visual Guide & Step-by-Step Infographic',
                  'ParkShare Complete Visuele Gids & Stappenplan-infographic'
                )}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-balance">
              {t(
                lang,
                'ParkShare چگونه کار می‌کند؟',
                'How Does ParkShare Work?',
                'Hoe werkt ParkShare?'
              )}
            </h1>
            <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
              {t(
                lang,
                'مسیر کامل با صفحات واقعی اپلیکیشن برای مدیر ساختمان، مالک پارکینگ (اشتراک‌گذاری رایگان یا پولی) و ساکن متقاضی پارکینگ موقت — هماهنگ با برج‌های بوستون و سیاتل و بات خصوصی واتساپ.',
                'End-to-end visual walkthrough with real app screens for Building Managers, Bay Owners (free or paid sharing), and Temporary Parkers — ready for Boston & Seattle towers and private WhatsApp booking.',
                'Compleet visueel overzicht met echte app-schermen voor Gebouwbeheerders, Plekeigenaren (gratis of betaald delen) en Tijdelijke Parkeerders — klaar voor toren Boston & Seattle en WhatsApp.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {showTourButton && onStartTour && (
              <button
                type="button"
                onClick={onStartTour}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-[#F46A46] hover:bg-[#E25A36] text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {t(lang, 'شروع تور تعاملی داخل اپ', 'Start Interactive App Tour', 'Start interactieve rondleiding')}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[42px] px-4 py-2 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/25 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              {t(lang, 'چاپ / ذخیره PDF', 'Print / Save PDF', 'Print / PDF opslaan')}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-[42px] px-4 py-2 rounded-2xl bg-white text-[#5A2FA8] hover:bg-[#F5F1FD] text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <X className="w-4 h-4" />
                {t(lang, 'بستن راهنما', 'Close Guide', 'Gids sluiten')}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Role Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t(lang, 'فیلتر مسیر راهنما', 'Guide journey filter', 'Kies gebruikersroute')}
          className="inline-flex flex-wrap items-center gap-1.5 p-1.5 bg-white border border-[#ECE9F7] rounded-2xl ps-card-shadow"
        >
          {(
            [
              {
                id: 'all',
                label: t(lang, 'همه مسیرها (اینفوگرافیک کامل)', 'All 3 Journeys (Full Infographic)', 'Alle 3 routes (Volledig)'),
              },
              {
                id: 'manager',
                label: t(lang, '۱. مدیر ساختمان', '1. Building Manager', '1. Gebouwbeheerder'),
              },
              {
                id: 'sharer',
                label: t(lang, '۲. اشتراک‌گذاری جای پارک', '2. Share Your Bay', '2. Eigen plek delen'),
              },
              {
                id: 'borrower',
                label: t(lang, '۳. رزرو موقت پارکینگ', '3. Borrow a Spot', '3. Tijdelijk parkeren'),
              },
            ] as const
          ).map((tab) => {
            const active = journeyFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setJourneyFilter(tab.id)}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                  active
                    ? 'ps-violet-btn text-white'
                    : 'text-[#5C5873] hover:bg-[#F5F1FD] hover:text-[#5A2FA8]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="text-xs text-[#7D7A92] font-medium">
          {t(
            lang,
            'زبان فعلی راهنما: فارسی (تغییر از نوار بالا)',
            'Guide language: English (switch in top bar)',
            'Gidstaal: Nederlands (wissel in bovenbalk)'
          )}
        </div>
      </div>

      {/* TRACK 1: BUILDING MANAGER */}
      {showManager && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#EFEAFC] text-[#5A2FA8] flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#171525]">
                  {t(
                    lang,
                    'مسیر ۱: مدیر ساختمان (راه‌اندازی بوستون، سیاتل و واتساپ)',
                    'Track 1: Building Manager (Boston, Seattle & WhatsApp Setup)',
                    'Route 1: Gebouwbeheerder (Boston, Seattle & WhatsApp-koppeling)'
                  )}
                </h2>
                <p className="text-xs text-[#6B6780]">
                  {t(
                    lang,
                    'کنترل کامل لیست ساکنان، قوانین رایگان/پولی، سقف مصرف منصفانه و اتصال مستقیم به گروه واتساپ.',
                    'Full whitelist governance, free/paid sharing rules, fair-use caps, and WhatsApp group integration.',
                    'Volledige controle over bewonerslijst, gratis/betaald beleid, limieten en WhatsApp-groep.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <InfographicRow steps={managerSteps} lang={lang} accent="violet" />
        </section>
      )}

      {/* TRACK 2: BAY OWNER / SHARER */}
      {showSharer && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#E3F7F3] text-[#0F766E] flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#171525]">
                  {t(
                    lang,
                    'مسیر ۲: مالک جای پارک (اشتراک‌گذاری رایگان یا اجاره ساعتی)',
                    'Track 2: Bay Owner (Share Free or Optional Hourly Rate)',
                    'Route 2: Plekeigenaar (Gratis of betaald delen volgens regels)'
                  )}
                </h2>
                <p className="text-xs text-[#6B6780]">
                  {t(
                    lang,
                    'در ساعاتی که سرکار یا سفر هستید، جای پارک خود را با حفظ کامل حریم خصوصی و امکان بازگشت اضطراری به اشتراک بگذارید.',
                    'Share idle hours privately with zero personal data exposure and instant early-return recall protection.',
                    'Deel vrije uren volledig anoniem met directe terugroepgarantie als je eerder thuiskomt.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <InfographicRow steps={sharerSteps} lang={lang} accent="teal" />
        </section>
      )}

      {/* TRACK 3: TEMPORARY PARKER / BORROWER */}
      {showBorrower && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#FFF0EB] text-[#E05330] flex items-center justify-center shrink-0">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#171525]">
                  {t(
                    lang,
                    'مسیر ۳: ساکن متقاضی پارکینگ موقت (نقشه طبقه، واتساپ و مسیریابی)',
                    'Track 3: Temporary Parker (Floor Map, WhatsApp & Route)',
                    'Route 3: Tijdelijke Parkeerder (Plattegrond, WhatsApp & Route)'
                  )}
                </h2>
                <p className="text-xs text-[#6B6780]">
                  {t(
                    lang,
                    'جست‌وجو بر اساس خودرو/شارژر برقی، انتخاب روی نقشه زنده پارکینگ یا رزرو از بات واتساپ و مسیریابی دقیق تا جای پارک.',
                    'Filter by Car/EV/SUV, tap an open bay on the live floor map or WhatsApp bot, and follow turn-by-turn garage route.',
                    'Filter op Auto/EV/SUV, kies op de interactieve kaart of via WhatsApp en volg de garageroute.'
                  )}
                </p>
              </div>
            </div>
          </div>

          <InfographicRow steps={borrowerSteps} lang={lang} accent="coral" />
        </section>
      )}

      {/* Why Better Than WhatsApp Group Alone + Ready-to-Send Manager WhatsApp Pitch */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Comparison Card */}
        <div className="lg:col-span-5 bg-white rounded-[24px] border border-[#ECE9F7] ps-card-shadow p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EFEAFC] text-[#5A2FA8] flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-[#171525]">
                {t(
                  lang,
                  'چرا ParkShare خیلی بهتر از یک گروه واتساپ معمولی است؟',
                  'Why ParkShare Beats a Regular WhatsApp Group',
                  'Waarom ParkShare veel beter werkt dan een gewone WhatsApp-groep'
                )}
              </h3>
            </div>
          </div>

          <div className="space-y-3 text-xs">
            {[
              {
                icon: Lock,
                title: t(lang, 'بدون لو رفتن شماره و واحد', 'Zero Phone / Unit Exposure', 'Geen telefoon- of huisnummers zichtbaar'),
                desc: t(
                  lang,
                  'در گروه واتساپ شماره و نام همه دیده می‌شود؛ اینجا همه‌چیز با کد ناشناس و تایید مدیر است.',
                  'In group chat everyone sees your phone and unit; ParkShare keeps every booking pseudonymous.',
                  'In een groepsapp ziet iedereen je nummer; in ParkShare blijft elke boeking anoniem.'
                ),
              },
              {
                icon: ShieldCheck,
                title: t(lang, 'بدون رزرو تکراری و بی‌نظمی', 'Zero Double-Bookings', 'Geen dubbele afspraken of chaos'),
                desc: t(
                  lang,
                  'سیستم به‌صورت خودکار تداخل ساعت‌ها را می‌بندد و دیگر نیازی به خواندن ده‌ها پیام نیست.',
                  'Atomic scheduling blocks conflicts automatically — no scrolling through dozens of chat messages.',
                  'Automatische planning voorkomt conflicten zonder tientallen berichten terug te lezen.'
                ),
              },
              {
                icon: CreditCard,
                title: t(lang, 'اجاره رایگان یا پولی قانونی', 'Manager-Controlled Free or Paid', 'Gratis of betaald onder beheerregels'),
                desc: t(
                  lang,
                  'مدیر ساختمان می‌تواند رایگان بودن یا تعرفه ساعتی مجاز و سقف ماهانه را دقیق تنظیم کند.',
                  'Building management controls free vs paid sharing and enforces anti-abuse monthly caps.',
                  'De beheerder bepaalt gratis vs. betaald delen en voorkomt misbruik met eerlijke limieten.'
                ),
              },
              {
                icon: MessageCircle,
                title: t(lang, 'همراه با اتصال به همین گروه واتساپ', 'Still Works Inside WhatsApp', 'Koppelt direct met WhatsApp'),
                desc: t(
                  lang,
                  'لازم نیست همسایه‌ها عادتشان را عوض کنند؛ از طریق لینک پین‌شده در گروه و بات خصوصی ۱به۱ رزرو می‌کنند.',
                  'Neighbors keep their habit — one tap from the pinned group message opens the private booking bot.',
                  'Bewoners klikken op het vastgezette groepsbericht en boeken privé in 2 seconden.'
                ),
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-[#FAF9FE] border border-[#EFEBF9]"
                >
                  <Icon className="w-4 h-4 text-[#6E41C4] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-[#171525]">{item.title}</div>
                    <p className="text-[#5C5873] mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ready-to-Send WhatsApp Pitch for Building Manager */}
        <div className="lg:col-span-7 bg-white rounded-[24px] border border-[#ECE9F7] ps-card-shadow p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#171525]">
                  {t(
                    lang,
                    'متن آماده پیام واتساپ برای مدیر ساختمان (بوستون و سیاتل)',
                    'Ready-to-Send WhatsApp Message for Building Manager',
                    'Kant-en-klaar WhatsApp-bericht voor de gebouwbeheerder'
                  )}
                </h3>
                <p className="text-[11px] text-[#7D7A92]">
                  {t(
                    lang,
                    'زبان پیام را انتخاب کنید و با یک کلیک کپی و برای مدیر ساختمان ارسال کنید.',
                    'Choose the manager’s preferred language and copy with one tap.',
                    'Kies de gewenste taal van de beheerder en kopieer met één klik.'
                  )}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center p-0.5 bg-[#F2EFFA] border border-[#E4DEF4] rounded-xl">
              {(['nl', 'en', 'fa'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setPitchLang(code)}
                  className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    pitchLang === code
                      ? 'bg-white text-[#5A2FA8] shadow-xs'
                      : 'text-[#6B6780] hover:text-[#171525]'
                  }`}
                >
                  {code === 'nl' ? 'NL' : code === 'en' ? 'EN' : 'فارسی'}
                </button>
              ))}
            </div>
          </div>

          <div
            dir={pitchLang === 'fa' ? 'rtl' : 'ltr'}
            className="flex-1 rounded-2xl bg-[#F4F9F6] border border-emerald-200/80 p-4 text-xs text-[#171525] leading-relaxed whitespace-pre-line font-normal max-h-[290px] overflow-y-auto"
          >
            {getManagerWhatsAppPitch(pitchLang)}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-[#7D7A92]">
              {t(
                lang,
                'شامل معرفی امنیت، حریم خصوصی، اتصال واتساپ و پشتیبانی برج سیاتل',
                'Covers privacy, manager rules, WhatsApp bot, and Boston + Seattle towers',
                'Inclusief AVG-privacy, beheerregels, WhatsApp-bot en toren Boston + Seattle'
              )}
            </span>
            <button
              type="button"
              onClick={handleCopyPitch}
              className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-all whitespace-nowrap ${
                copiedPitch
                  ? 'bg-emerald-600 text-white'
                  : 'ps-violet-btn text-white'
              }`}
            >
              {copiedPitch ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedPitch
                ? t(lang, 'متن پیام کپی شد!', 'Message Copied!', 'Bericht gekopieerd!')
                : t(lang, 'کپی پیام واتساپ مدیر', 'Copy WhatsApp Pitch', 'Kopieer WhatsApp-bericht')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
