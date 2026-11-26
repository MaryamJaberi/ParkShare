import React, { useMemo, useState } from 'react';
import {
  Bell,
  Car,
  Check,
  Copy,
  Navigation,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Language } from '../types/parkshare';
import { t } from '../i18n/translations';
import {
  FloorMapSlot,
  GARAGE_ROUTE_IMAGE_URL,
  PS_DESIGN_TOKENS,
  PSButton,
  PSCard,
  PSFloorBayMap,
  PSFloorTabs,
  PSHeroBanner,
  PSRouteGuidanceCard,
  PSVehicleCategoryTiles,
} from './ui/ParkShareUIKit';

interface Props {
  lang: Language;
  onOpenLiveResidentApp?: () => void;
}

const DEMO_SLOTS: FloorMapSlot[] = [
  { id: 'kit-a1', code: 'A-1', floor: 'B1', zone: 'A', available: false, isFree: true },
  { id: 'kit-a2', code: 'A-2', floor: 'B1', zone: 'A', available: true, isFree: true, note: 'Near elevator · 2.5×5m' },
  { id: 'kit-a3', code: 'A-3', floor: 'B1', zone: 'A', available: true, evCharging: true, isFree: false, hourlyEur: 1.5, note: 'EV 11kW Type 2 · Wide entry' },
  { id: 'kit-a4', code: 'A-4', floor: 'B1', zone: 'A', available: false, isFree: true },
  { id: 'kit-b1', code: 'B-1', floor: 'B1', zone: 'B', available: false, isFree: true },
  { id: 'kit-b2', code: 'B-2', floor: 'B1', zone: 'B', available: true, isFree: true, note: 'Standard covered bay' },
  { id: 'kit-b3', code: 'B-3', floor: 'B1', zone: 'B', available: false, isFree: false, hourlyEur: 2.0 },
  { id: 'kit-b4', code: 'B-4', floor: 'B1', zone: 'B', available: true, evCharging: true, isFree: false, hourlyEur: 2.0, note: 'EV 22kW · Corner spot' },
  { id: 'kit-c1', code: 'C-1', floor: 'B2', zone: 'C', available: true, isFree: true, note: 'Near entrance ramp' },
  { id: 'kit-c2', code: 'C-2', floor: 'B2', zone: 'C', available: false, isFree: true },
  { id: 'kit-c3', code: 'C-3', floor: 'B2', zone: 'C', available: true, isFree: false, hourlyEur: 1.5, note: 'Extra maneuver space · SUV' },
  { id: 'kit-d1', code: 'D-1', floor: 'B2', zone: 'D', available: true, isFree: true, note: 'Quiet zone' },
];

export const DesignSystemView: React.FC<Props> = ({ lang, onOpenLiveResidentApp }) => {
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  const [demoCategory, setDemoCategory] = useState<string>('ALL');
  const [demoFloor, setDemoFloor] = useState<string>('B1');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>('kit-a3');
  const [demoBookedNotice, setDemoBookedNotice] = useState<string | null>(null);
  const [demoSearch, setDemoSearch] = useState('');

  const selectedSlot = useMemo(
    () => DEMO_SLOTS.find((s) => s.id === selectedSlotId) ?? DEMO_SLOTS[2],
    [selectedSlotId]
  );

  const copyToken = (hex: string) => {
    navigator.clipboard?.writeText(hex).catch(() => {});
    setCopiedHex(hex);
    setTimeout(() => setCopiedHex(null), 1800);
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Hero Header */}
      <PSHeroBanner
        greeting={t(lang, 'سیستم طراحی ParkShare', 'ParkShare Design System', 'ParkShare Ontwerpsysteem')}
        headline={t(
          lang,
          'کیت رابط کاربری پارکینگ هوشمند (Lavender Violet & Sunset Coral)',
          'ParkShare UI Kit — Lavender Violet & Sunset Coral',
          'ParkShare UI Kit — Lavendelpaars & Koraaloranje'
        )}
        subtitle={t(
          lang,
          'الهام‌گرفته از طراحی مدرن پارکینگ موبایل: رنگ‌بندی آرام بنفش، تأکید مرجانی برای انتخاب فعال، نقشه تصویری طبقات و مسیریابی داخلی.',
          'Inspired by modern touch-first parking mobility: serene lavender-violet surfaces, coral active selections, visual floor blueprints, and indoor wayfinding.',
          'Geïnspireerd op moderne parkeer-apps: kalme lavendeltinten, koraaloranje selecties, visuele plattegronden en binnengarage-navigatie.'
        )}
        rightSlot={
          onOpenLiveResidentApp && (
            <button
              type="button"
              onClick={onOpenLiveResidentApp}
              className="min-h-[42px] px-4 rounded-2xl bg-white/95 text-[#5A2FA8] text-xs font-bold hover:bg-white transition-colors whitespace-nowrap shrink-0"
            >
              {t(lang, 'مشاهده در اپ زنده ←', 'Try in Live App →', 'Test in live app →')}
            </button>
          )
        }
      />

      {/* SECTION 01: LIVE INTERACTIVE 3-FLOW SHOWCASE (Find Space · Choose Space · Route) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {t(
                lang,
                '۰۱. سه الگوی اصلی تجربه کاربری (تعاملی و زنده)',
                '01. Core 3-Screen Parking Experience (Live Interactive)',
                '01. De 3 kernstromen voor parkeren (Live interactief)'
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(
                lang,
                'روی طبقات، دسته‌بندی خودروها و جایگاه‌های آزاد نقشه کلیک کنید تا کارت مسیریابی و انتخاب مرجانی به‌صورت زنده تغییر کند.',
                'Click floors, vehicle tiles, and open bays on the blueprint — the coral car selection and indoor route card update live.',
                'Klik op verdiepingen, voertuigcategorieën en vrije plekken — de selectie en routekaart werken direct bij.'
              )}
            </p>
          </div>
          {demoBookedNotice && (
            <span className="text-xs font-semibold text-[#17A373]">{demoBookedNotice}</span>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Flow 1: Find Your Parking Space Card */}
          <div className="xl:col-span-4">
            <PSCard variant="elevated" className="overflow-hidden">
              <div className="ps-hero-gradient text-white p-5 pb-7 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-white/25 backdrop-blur-xs flex items-center justify-center font-bold text-sm shrink-0">
                      PS
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-white/80">
                        {t(lang, 'صبح بخیر', 'Good Morning', 'Goedemorgen')}
                      </div>
                      <div className="text-sm font-bold truncate">
                        {t(lang, 'ساکن واحد ۴۰۲', 'Resident Unit 402', 'Bewoner Woning 402')}
                      </div>
                    </div>
                  </div>
                  <span className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4 text-white" />
                  </span>
                </div>

                <div className="text-xl font-bold leading-snug text-balance">
                  {t(lang, 'جای پارک خود را\nپیدا کنید', 'Find your\nParking Space', 'Vind uw\nparkeerplek')}
                </div>
              </div>

              <div className="-mt-4 bg-white rounded-t-3xl p-5 space-y-5">
                {/* Floating Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={demoSearch}
                    onChange={(e) => setDemoSearch(e.target.value)}
                    placeholder={t(lang, 'جستجوی کد پارکینگ یا بلوک...', 'Search space...', 'Zoek parkeerplek...')}
                    className="w-full h-11 ps-10 pe-3.5 text-xs bg-[#F6F5FB] border border-[#ECE9F7] rounded-2xl text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                {/* Pastel Circular Category Tiles */}
                <PSVehicleCategoryTiles
                  lang={lang}
                  selectedId={demoCategory}
                  onSelect={setDemoCategory}
                />

                {/* Nearby / Building Bays Preview */}
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-900">
                    {t(lang, 'جایگاه‌های آزاد ساختمان', 'Nearby Building Spaces', 'Beschikbaar in het gebouw')}
                  </div>
                  <div className="p-3 rounded-2xl bg-[#FAF9FE] border border-[#ECE9F7] flex items-center gap-3">
                    <img
                      src={GARAGE_ROUTE_IMAGE_URL}
                      alt="Boston Residence B1"
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        Boston Residence · {selectedSlot.code}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {t(lang, `طبقه ${selectedSlot.floor} · بلوک ${selectedSlot.zone}`, `Floor ${selectedSlot.floor} · Block ${selectedSlot.zone}`, `Laag ${selectedSlot.floor} · Blok ${selectedSlot.zone}`)}
                      </div>
                      <div className="text-xs font-bold text-[#5A2FA8] inline-flex items-center gap-1 pt-0.5">
                        <span className="w-4 h-4 rounded-full bg-[#EFEAFC] text-[#6E41C4] inline-flex items-center justify-center text-[10px]">
                          €
                        </span>
                        {selectedSlot.isFree
                          ? t(lang, 'رایگان', 'Free', 'Gratis')
                          : `€${(selectedSlot.hourlyEur ?? 1.5).toFixed(1)}/h`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Bottom Navigation Specimen */}
                <div className="pt-2 border-t border-[#ECE9F7] flex items-center justify-around">
                  <span className="text-[#6E41C4]">
                    <Car className="w-5 h-5" />
                  </span>
                  <span className="text-slate-400">
                    <Navigation className="w-5 h-5" />
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDemoBookedNotice(
                        t(
                          lang,
                          'دکمه شناور + آماده ثبت سریع رزرو یا اشتراک جای پارک است.',
                          'Floating coral + button triggers quick booking or bay sharing.',
                          'De zwevende + knop opent snel reserveren of delen.'
                        )
                      )
                    }
                    aria-label={t(lang, 'افزودن سریع', 'Quick action', 'Snelle actie')}
                    className="w-12 h-12 -mt-6 rounded-full ps-coral-btn text-white flex items-center justify-center"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  <span className="text-slate-400">
                    <ShieldCheck className="w-5 h-5" />
                  </span>
                  <span className="text-slate-400">
                    <Sparkles className="w-5 h-5" />
                  </span>
                </div>
              </div>
            </PSCard>
          </div>

          {/* Flow 2: Interactive Choose Space Blueprint */}
          <div className="xl:col-span-5">
            <PSFloorBayMap
              lang={lang}
              slots={DEMO_SLOTS}
              floors={['B1', 'B2']}
              activeFloor={demoFloor}
              onSelectFloor={setDemoFloor}
              selectedSlotId={selectedSlotId}
              onSelectSlot={(slot) => {
                setSelectedSlotId(slot.id);
                setDemoBookedNotice(null);
              }}
              onBookSelected={(slot) =>
                setDemoBookedNotice(
                  t(
                    lang,
                    `پیش‌نمایش رزرو جایگاه ${slot.code} (طبقه ${slot.floor}) با موفقیت تست شد.`,
                    `UI Kit preview: Space ${slot.code} (Floor ${slot.floor}) selected for booking.`,
                    `UI Kit voorbeeld: Plek ${slot.code} (Laag ${slot.floor}) gekozen.`
                  )
                )
              }
              timeSummary="09:00–17:00"
            />
          </div>

          {/* Flow 3: Live Synced In-Garage Route Guidance */}
          <div className="xl:col-span-3 space-y-4">
            <PSRouteGuidanceCard
              lang={lang}
              bayCode={selectedSlot.code}
              floor={selectedSlot.floor}
              zone={selectedSlot.zone}
              distanceMeters={selectedSlot.floor === 'B1' ? 65 : 110}
              locationNote={selectedSlot.note}
            />

            <PSCard variant="surface" className="p-4 space-y-2 text-xs">
              <div className="font-bold text-slate-900">
                {t(lang, 'همگام‌سازی زنده با نقشه', 'Synced with Floor Map', 'Gesynchroniseerd met plattegrond')}
              </div>
              <p className="text-slate-500 leading-relaxed">
                {t(
                  lang,
                  'با انتخاب هر جایگاه در نقشه وسط، هدر بنفش، شماره جایگاه و فاصله مسیر به‌طور خودکار به‌روزرسانی می‌شود.',
                  'Selecting any open bay on the map updates the royal violet route header, bay code, and indoor distance automatically.',
                  'Elke gekozen plek op de plattegrond werkt de routekaart en afstand direct bij.'
                )}
              </p>
            </PSCard>
          </div>
        </div>
      </section>

      {/* SECTION 02: COLOR TOKENS & SWATCHES */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[#6E41C4]" />
          <h2 className="text-base sm:text-lg font-bold text-slate-900">
            {t(lang, '۰۲. پالت رنگ و توکن‌های سیستم طراحی', '02. Color Palette & Design Tokens', '02. Kleurenpalet & Design Tokens')}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PS_DESIGN_TOKENS.colors.map((c) => (
            <button
              key={c.token}
              type="button"
              onClick={() => copyToken(c.hex)}
              className="text-start bg-white border border-[#ECE9F7] hover:border-[#D3C7F2] rounded-2xl p-4 flex items-center gap-3.5 transition-all"
            >
              <span
                className="w-12 h-12 rounded-2xl shrink-0 border border-black/5"
                style={{ backgroundColor: c.hex }}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900 truncate">
                    {lang === 'fa' ? c.nameFa : c.name}
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[#6E41C4] inline-flex items-center gap-1 shrink-0">
                    {copiedHex === c.hex ? <Check className="w-3 h-3 text-[#17A373]" /> : <Copy className="w-3 h-3" />}
                    {c.hex}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-slate-400">{c.token}</div>
                <div className="text-[11px] text-slate-500 leading-snug">
                  {lang === 'fa' ? c.usageFa : c.usageEn}
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* SECTION 03: BUTTONS, FLOOR TABS & TYPOGRAPHY SPECIMENS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <PSCard variant="surface" className="lg:col-span-7 p-5 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {t(lang, '۰۳. دکمه‌ها و کنترل‌های تعاملی', '03. Buttons & Interactive Controls', '03. Knoppen & Interactieve Elementen')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(lang, 'تمام دکمه‌ها حداقل ارتفاع ۴۰ تا ۵۰ پیکسل برای لمس راحت موبایل دارند.', 'All touch controls meet 40–50px minimum ergonomics.', 'Alle knoppen voldoen aan 40–50px aanraakergonomie.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <PSButton variant="violet" size="lg">
              {t(lang, 'رزرو جایگاه (اصلی)', 'Book Space (Primary)', 'Reserveer plek')}
            </PSButton>
            <PSButton variant="coral" size="md">
              {t(lang, 'انتخاب فعال مرجانی', 'Coral Accent', 'Koraal accent')}
            </PSButton>
            <PSButton variant="soft" size="md">
              {t(lang, 'مسیریابی', 'Soft Violet', 'Zacht paars')}
            </PSButton>
            <PSButton variant="secondary" size="md">
              {t(lang, 'ثانویه', 'Secondary', 'Secundair')}
            </PSButton>
            <PSButton variant="danger" size="sm">
              {t(lang, 'لغو رزرو', 'Cancel', 'Annuleren')}
            </PSButton>
          </div>

          <div className="pt-3 border-t border-[#ECE9F7] space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              {t(lang, 'انتخابگر طبقات (Floor Tabs)', 'Floor Selector Tabs', 'Verdieping-tabs')}
            </div>
            <PSFloorTabs
              lang={lang}
              floors={['B1', 'B2', 'B3', 'G']}
              activeFloor={demoFloor}
              onSelectFloor={setDemoFloor}
            />
          </div>
        </PSCard>

        <PSCard variant="surface" className="lg:col-span-5 p-5 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            {t(lang, '۰۴. تایپوگرافی و هندسه سطوح', '04. Typography & Surface Geometry', '04. Typografie & Vormgeving')}
          </h2>

          <div className="divide-y divide-[#ECE9F7] text-xs">
            <div className="py-2.5">
              <div className="text-xl font-bold text-slate-900 tracking-tight">
                {t(lang, 'عنوان اصلی صفحه — ۲۴ پیکسل Bold', 'Display Heading — 24px Bold', 'Hoofdtitel — 24px Bold')}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">Plus Jakarta Sans / Vazirmatn · 700</div>
            </div>
            <div className="py-2.5">
              <div className="text-sm font-semibold text-slate-800">
                {t(lang, 'تیتر کارت‌ها و بخش‌ها — ۱۴ پیکسل SemiBold', 'Section & Card Title — 14px SemiBold', 'Sectietitel — 14px SemiBold')}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">Line height 1.45 · High contrast</div>
            </div>
            <div className="py-2.5">
              <div className="font-mono tabular-nums text-sm font-bold text-[#5A2FA8]">
                B2-P1-0177 · 09:00–17:00 · €1.50/h
              </div>
              <div className="text-[11px] text-slate-400 font-mono">JetBrains Mono · tabular-nums</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            {PS_DESIGN_TOKENS.radii.map((r) => (
              <div key={r.label} className="p-2.5 rounded-xl bg-[#FAF9FE] border border-[#ECE9F7]">
                <div className="font-semibold text-slate-800">{r.label}</div>
                <div className="font-mono text-slate-500">{r.value}</div>
              </div>
            ))}
          </div>
        </PSCard>
      </section>
    </div>
  );
};
