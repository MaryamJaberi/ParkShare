import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Car,
  Compass,
  HelpCircle,
  MessageCircle,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Language } from '../types/parkshare';
import { t } from '../i18n/translations';

export const PARKSHARE_TOUR_STORAGE_KEY = 'parkshare_tour_dismissed_v1';

export type TourTargetTab = 'manager' | 'bookings' | 'resident' | 'whatsapp' | 'federation';

interface TourStep {
  id: string;
  targetTab: TourTargetTab;
  icon: React.ComponentType<{ className?: string }>;
  badgeFa: string;
  badgeEn: string;
  badgeNl: string;
  titleFa: string;
  titleEn: string;
  titleNl: string;
  bodyFa: string;
  bodyEn: string;
  bodyNl: string;
  tipFa: string;
  tipEn: string;
  tipNl: string;
}

interface Props {
  lang: Language;
  role: 'manager' | 'resident';
  activeTab: string;
  onNavigateTab: (tab: TourTargetTab) => void;
  onDismissForever: () => void;
  onOpenFullGuide: () => void;
}

const MANAGER_TOUR_STEPS: TourStep[] = [
  {
    id: 'mgr-buildings',
    targetTab: 'manager',
    icon: Building2,
    badgeFa: 'گام ۱ · ساختمان و قوانین',
    badgeEn: 'Step 1 · Buildings & Rules',
    badgeNl: 'Stap 1 · Gebouwen & Regels',
    titleFa: 'ساختمان بوستون، برج سیاتل و قوانین اشتراک‌گذاری',
    titleEn: 'Boston & Seattle Towers + Sharing Rules',
    titleNl: 'Torens Boston & Seattle + Deelregels',
    bodyFa:
      'در این بخش ساختمان جدید بسازید (مثلاً بوستون و سیاتل)، لیست رسمی ساکنان را وارد کنید و تعیین کنید اشتراک‌گذاری فقط رایگان باشد یا اجاره موقت پولی با سقف منصفانه مجاز باشد.',
    bodyEn:
      'Create separate towers (such as Boston and Seattle), import your official resident whitelist, and decide whether sharing is free-only or allows capped paid hourly rates.',
    bodyNl:
      'Maak aparte torens aan (zoals Boston en Seattle), importeer de officiële bewonerslijst en stel in of delen gratis of betaald mag zijn met eerlijke limieten.',
    tipFa: 'همین صفحه همچنین کارت ۳مرحله‌ای اتصال به گروه واتساپ ساختمان را دارد.',
    tipEn: 'This screen also includes the 3-step WhatsApp group & private bot connector.',
    tipNl: 'Op dit scherm vind je ook de 3-stappenkoppeling voor je WhatsApp-groep.',
  },
  {
    id: 'mgr-bookings',
    targetTab: 'bookings',
    icon: CalendarClock,
    badgeFa: 'گام ۲ · تقویم و رزروها',
    badgeEn: 'Step 2 · Live Schedule',
    badgeNl: 'Stap 2 · Live Rooster',
    titleFa: 'کنترل رزروها و بازگشت اضطراری مالک',
    titleEn: 'Monitor Reservations & Owner Recalls',
    titleNl: 'Beheer reserveringen & terugroepacties',
    bodyFa:
      'تمام رزروهای فعال را بدون افشای مشخصات شخصی ساکنان ببینید. اگر مالک پارکینگ زودتر برگردد، سیستم مهمان را خودکار به جای پارک آزاد بعدی منتقل می‌کند.',
    bodyEn:
      'Monitor active reservations pseudonymously. If a bay owner returns early, ParkShare automatically relocates the temporary driver to the next available bay.',
    bodyNl:
      'Bekijk actieve boekingen volledig anoniem. Komt een eigenaar eerder terug, dan verplaatst het systeem de gast automatisch naar een andere vrije plek.',
    tipFa: 'تداخل زمانی و رزرو تکراری به‌صورت خودکار مسدود می‌شود.',
    tipEn: 'Overlapping or duplicate bookings are blocked atomically.',
    tipNl: 'Dubbele of overlappende boekingen worden automatisch geblokkeerd.',
  },
  {
    id: 'mgr-resident',
    targetTab: 'resident',
    icon: Car,
    badgeFa: 'گام ۳ · تجربه ساکنان',
    badgeEn: 'Step 3 · Resident Experience',
    badgeNl: 'Stap 3 · Bewonerservaring',
    titleFa: 'نقشه تعاملی طبقه و مسیریابی داخل پارکینگ',
    titleEn: 'Interactive Floor Map & In-Garage Route',
    titleNl: 'Interactieve plattegrond & garageroute',
    bodyFa:
      'دقیقاً ببینید ساکنان چطور بر اساس خودرو یا شارژر برقی فیلتر می‌کنند، روی نقشه هر طبقه جای پارک انتخاب می‌کنند و مسیر دقیق تا جای پارک را می‌بینند.',
    bodyEn:
      'Preview how residents filter by Car/EV/SUV, tap open spots on the visual floor map, and follow in-garage route guidance right to their reserved bay.',
    bodyNl:
      'Bekijk hoe bewoners filteren op Auto/EV/SUV, plekken kiezen op de kaart en de garageroute naar hun gereserveerde plek volgen.',
    tipFa: 'ساکنان می‌توانند جای پارک خود را نیز در ساعات آزاد به اشتراک بگذارند.',
    tipEn: 'Residents can also share their own bays during idle hours.',
    tipNl: 'Bewoners kunnen ook eenvoudig hun eigen plek delen op vrije uren.',
  },
  {
    id: 'mgr-privacy',
    targetTab: 'federation',
    icon: ShieldCheck,
    badgeFa: 'گام ۴ · اعتماد و حریم خصوصی',
    badgeEn: 'Step 4 · Trust & Privacy',
    badgeNl: 'Stap 4 · Vertrouwen & AVG',
    titleFa: 'حریم خصوصی اروپایی (GDPR/AVG) و اشتراک بین‌برجی',
    titleEn: 'European Privacy (GDPR) & Cross-Building Sharing',
    titleNl: 'Europese Privacy (AVG) & Torenkoppeling',
    bodyFa:
      'مدت نگهداری داده‌ها، چرخش کلید رمزگذاری هر ساختمان و اشتراک‌گذاری کنترل‌شده بین برج‌های بوستون و سیاتل را از اینجا تنظیم و گزارش‌گیری کنید.',
    bodyEn:
      'Configure data retention windows, per-building encryption keys, privacy audit logs, and optional cross-building federation between Boston and Seattle.',
    bodyNl:
      'Beheer bewaartermijnen, versleuteling per gebouw, AVG-auditlogs en optionele uitwisseling tussen Boston en Seattle.',
    tipFa: 'هر زمان از علامت سوال (؟) بالا می‌توانید اینفوگرافیک کامل و پیام واتساپ مدیر را باز کنید.',
    tipEn: 'Tap the (?) icon in the top bar anytime for the full visual infographic & manager pitch.',
    tipNl: 'Tik altijd op het (?)-icoon bovenin voor de volledige infographic en het WhatsApp-bericht.',
  },
];

const RESIDENT_TOUR_STEPS: TourStep[] = [
  {
    id: 'res-find',
    targetTab: 'resident',
    icon: Car,
    badgeFa: 'گام ۱ · پیدا کردن و رزرو جای پارک',
    badgeEn: 'Step 1 · Find & Book a Space',
    badgeNl: 'Stap 1 · Zoek & boek een plek',
    titleFa: 'انتخاب روی نقشه زنده پارکینگ و مسیریابی',
    titleEn: 'Interactive Floor Map & Garage Route',
    titleNl: 'Plattegrond kiezen & garageroute',
    bodyFa:
      'ساعت مورد نیاز و نوع خودرو (معمولی، شارژر برقی یا شاسی‌بلند) را انتخاب کنید، روی نقشه هر طبقه جای پارک آزاد را لمس کنید و پس از رزرو، مسیر دقیق تا همان جای پارک را ببینید.',
    bodyEn:
      'Pick your time window and vehicle type (Car, EV, SUV), tap an available bay on the live floor map, review whether it is Free or Paid per building rules, and open route guidance.',
    bodyNl:
      'Kies je tijdvak en voertuigtype (Auto, EV, SUV), tik op een vrije plek op de kaart, controleer gratis/betaald en volg direct de route naar je plek.',
    tipFa: 'اگر جای پارک خودتان خالی است، از همین بخش ساعات آزادش را برای همسایه‌ها باز کنید.',
    tipEn: 'Have an idle spot? You can also manage your own shared bay schedule right here.',
    tipNl: 'Eigen plek vrij? Beheer je eigen deeluren ook direct in dit scherm.',
  },
  {
    id: 'res-whatsapp',
    targetTab: 'whatsapp',
    icon: MessageCircle,
    badgeFa: 'گام ۲ · بات واتساپ خصوصی',
    badgeEn: 'Step 2 · Private WhatsApp Bot',
    badgeNl: 'Stap 2 · Privé WhatsApp-bot',
    titleFa: 'رزرو سریع از داخل واتساپ بدون شلوغی گروه',
    titleEn: 'Book Directly in WhatsApp (1-on-1 Private)',
    titleNl: 'Boek direct via WhatsApp (1-op-1 privé)',
    bodyFa:
      'با بات خصوصی واتساپ می‌توانید در ۲ ثانیه جای پارک آزاد پیدا کنید، رزرو کنید یا جای پارک خودتان را آزاد بگذارید — بدون اینکه شماره تلفن یا واحد شما در گروه نمایش داده شود.',
    bodyEn:
      'Use the 1-on-1 WhatsApp bot to check open bays, book, or share your spot in seconds without exposing your phone number or apartment unit in a group chat.',
    bodyNl:
      'Zoek en reserveer in 2 seconden via de privé WhatsApp-bot zonder je telefoonnummer of appartement in een groepsapp te delen.',
    tipFa: 'تمام رزروهای واتساپ بلافاصله با تقویم اپلیکیشن همگام می‌شوند.',
    tipEn: 'All WhatsApp bookings sync live with the app schedule.',
    tipNl: 'Alle WhatsApp-boekingen synchroniseren direct met de app.',
  },
  {
    id: 'res-privacy',
    targetTab: 'federation',
    icon: ShieldCheck,
    badgeFa: 'گام ۳ · حریم خصوصی و سهمیه عادلانه',
    badgeEn: 'Step 3 · Privacy & Fair Use',
    badgeNl: 'Stap 3 · Privacy & Eerlijk gebruik',
    titleFa: 'هویت کاملاً مخفی و کنترل داده‌های شما',
    titleEn: 'Pseudonymous Identity & Your Data Rights',
    titleNl: 'Anonieme identiteit & jouw gegevensrechten',
    bodyFa:
      'نام، شماره واحد و تلفن شما هرگز برای همسایه‌های دیگر نمایش داده نمی‌شود. اینجا می‌توانید شفافیت قوانین ساختمان و تاریخچه حریم خصوصی را ببینید.',
    bodyEn:
      'Your name, unit number, and phone are never visible to other neighbors. Review building privacy guarantees and fair-use limits anytime.',
    bodyNl:
      'Je naam, huisnummer en telefoon zijn nooit zichtbaar voor buren. Bekijk hier het privacybeleid en je eerlijke gebruiksregels.',
    tipFa: 'هر زمان از علامت سوال (؟) بالا می‌توانید اینفوگرافیک کامل راهنما را ببینید.',
    tipEn: 'Tap the (?) button in the header anytime to open the full visual guide.',
    tipNl: 'Tik op (?) bovenin om altijd de complete visuele gids te openen.',
  },
];

export const GuidedTourOverlay: React.FC<Props> = ({
  lang,
  role,
  activeTab,
  onNavigateTab,
  onDismissForever,
  onOpenFullGuide,
}) => {
  const steps = useMemo(
    () => (role === 'manager' ? MANAGER_TOUR_STEPS : RESIDENT_TOUR_STEPS),
    [role]
  );
  const [stepIdx, setStepIdx] = useState(0);

  const safeIdx = Math.min(stepIdx, steps.length - 1);
  const current = steps[safeIdx];
  const Icon = current.icon;
  const isRtl = lang === 'fa';
  const isLast = safeIdx === steps.length - 1;

  const goToStep = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, nextIdx));
    setStepIdx(clamped);
    const target = steps[clamped].targetTab;
    if (target !== activeTab) {
      onNavigateTab(target);
    }
  };

  return (
    <aside
      aria-label={t(lang, 'تور راهنمای اپلیکیشن', 'Interactive App Tour', 'Interactieve rondleiding')}
      className="fixed bottom-[76px] lg:bottom-6 end-3 sm:end-6 z-40 w-[calc(100vw-24px)] max-w-[390px] bg-white rounded-[24px] border border-[#DFD8F5] shadow-[0_18px_46px_rgba(32,20,76,0.18)] overflow-hidden"
    >
      {/* Top Lavender Gradient Strip */}
      <div className="ps-hero-gradient px-4 py-3 text-white flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-extrabold truncate">
              {t(lang, 'تور سریع ParkShare', 'ParkShare Quick Tour', 'ParkShare Rondleiding')}
            </div>
            <div className="text-[10px] text-white/85 font-mono tabular-nums">
              {safeIdx + 1} / {steps.length} · {t(lang, current.badgeFa, current.badgeEn, current.badgeNl)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onDismissForever}
          aria-label={t(
            lang,
            'بستن تور و عدم نمایش مجدد',
            'Close tour and do not show again',
            'Rondleiding sluiten en niet meer tonen'
          )}
          className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Step Content */}
      <div className="p-4 space-y-3">
        {/* Progress Pills */}
        <div className="flex items-center gap-1.5">
          {steps.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goToStep(idx)}
              aria-label={`Step ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                idx === safeIdx
                  ? 'flex-1 bg-[#F46A46]'
                  : idx < safeIdx
                    ? 'w-6 bg-[#6E41C4]'
                    : 'w-4 bg-[#E6E0F7]'
              }`}
            />
          ))}
        </div>

        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-2xl bg-[#EFEAFC] text-[#5A2FA8] flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-extrabold text-[#171525] leading-snug">
              {t(lang, current.titleFa, current.titleEn, current.titleNl)}
            </h3>
            <p className="text-xs text-[#5C5873] leading-relaxed">
              {t(lang, current.bodyFa, current.bodyEn, current.bodyNl)}
            </p>
          </div>
        </div>

        <div className="px-3 py-2 rounded-xl bg-[#F8F6FD] border border-[#ECE9F7] text-[11px] text-[#5A2FA8] font-medium leading-relaxed">
          {t(lang, current.tipFa, current.tipEn, current.tipNl)}
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={onDismissForever}
            className="min-h-[36px] px-2.5 text-[11px] font-semibold text-[#7D7A92] hover:text-[#171525] rounded-xl hover:bg-[#F5F2FB] transition-colors whitespace-nowrap"
          >
            {t(lang, 'خروج و دیگر نشان نده', "Don't show again", 'Niet meer tonen')}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenFullGuide}
              title={t(lang, 'اینفوگرافیک کامل', 'Full Infographic Guide', 'Volledige gids')}
              className="min-w-[36px] min-h-[36px] px-2 rounded-xl bg-[#F3EFFC] text-[#5A2FA8] hover:bg-[#E7DFFA] flex items-center justify-center transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {safeIdx > 0 && (
              <button
                type="button"
                onClick={() => goToStep(safeIdx - 1)}
                className="min-h-[36px] px-3 rounded-xl bg-[#F2EFFA] text-[#5A2FA8] hover:bg-[#E5DDF9] text-xs font-bold inline-flex items-center gap-1 transition-colors whitespace-nowrap"
              >
                {isRtl ? <ArrowRight className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
                {t(lang, 'قبلی', 'Back', 'Vorige')}
              </button>
            )}

            {isLast ? (
              <button
                type="button"
                onClick={onDismissForever}
                className="min-h-[36px] px-3.5 rounded-xl ps-coral-btn text-white text-xs font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap"
              >
                {t(lang, 'پایان تور', 'Finish Tour', 'Afronden')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goToStep(safeIdx + 1)}
                className="min-h-[36px] px-3.5 rounded-xl ps-violet-btn text-white text-xs font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap"
              >
                {t(lang, 'مرحله بعد', 'Next', 'Volgende')}
                {isRtl ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
