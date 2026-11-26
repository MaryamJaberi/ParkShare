import React, { useMemo, useState } from 'react';
import {
  Accessibility,
  ArrowDown,
  Bike,
  Car,
  CornerUpLeft,
  Navigation,
  Sparkles,
  Star,
  Truck,
  Zap,
} from 'lucide-react';
import { Language, ParkingCategory, Resource } from '../../types/parkshare';
import { t } from '../../i18n/translations';

export const GARAGE_ROUTE_IMAGE_URL = '/src/assets/images/parking_garage_route_1795707552123.jpg';

// ============================================================================
// PARKSHARE UI KIT — DESIGN TOKENS (Single Source of Truth)
// ============================================================================
export const PS_DESIGN_TOKENS = {
  colors: [
    {
      name: 'Royal Violet',
      nameFa: 'بنفش اصلی برند',
      token: '--ps-violet-600',
      hex: '#6E41C4',
      usageFa: 'دکمه اصلی رزرو، ناوبری فعال و هدر مسیریابی',
      usageEn: 'Primary CTA, active nav & route guidance header',
    },
    {
      name: 'Orchid Lavender',
      nameFa: 'ارکیده‌ای ملایم',
      token: '--ps-orchid',
      hex: '#D58AF0',
      usageFa: 'گرادیان هدر صفحه جستجو و کارت خوش‌آمدگویی',
      usageEn: 'Discovery hero gradient & ambient accents',
    },
    {
      name: 'Sunset Coral',
      nameFa: 'مرجانی انتخاب فعال',
      token: '--ps-coral',
      hex: '#F46A46',
      usageFa: 'طبقه فعال، جای پارک انتخاب‌شده روی نقشه و دکمه شناور +',
      usageEn: 'Active floor pill, selected bay car & floating + FAB',
    },
    {
      name: 'Lavender Mist',
      nameFa: 'پس‌زمینه مه‌بنفش',
      token: '--ps-canvas',
      hex: '#F6F5FB',
      usageFa: 'بوم اصلی برنامه برای تفکیک ملایم کارت‌های سفید',
      usageEn: 'App canvas separating crisp elevated white surfaces',
    },
    {
      name: 'Soft Hairline',
      nameFa: 'خطوط مرزی ظریف',
      token: '--ps-border',
      hex: '#ECE9F7',
      usageFa: 'مرز کارت‌ها، جدول‌ها و خطوط نقشه پارکینگ',
      usageEn: 'Card dividers, inputs & parking blueprint dashes',
    },
    {
      name: 'EV Mint',
      nameFa: 'سبز نعنایی EV',
      token: '--ps-mint',
      hex: '#17A373',
      usageFa: 'جایگاه شارژر برقی، وضعیت تأییدشده و رایگان',
      usageEn: 'EV charging, confirmed status & GDPR privacy',
    },
  ],
  radii: [
    { label: 'Control / Input', value: '14px (rounded-xl)' },
    { label: 'Card Surface', value: '20px (rounded-2xl)' },
    { label: 'Hero & Sheet', value: '24px (rounded-3xl)' },
    { label: 'Category Tile & FAB', value: '9999px (rounded-full)' },
  ],
} as const;

// ============================================================================
// 1. PS BUTTON
// ============================================================================
export type PSButtonVariant = 'violet' | 'coral' | 'secondary' | 'soft' | 'ghost' | 'danger';
export type PSButtonSize = 'sm' | 'md' | 'lg';

interface PSButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PSButtonVariant;
  size?: PSButtonSize;
  fullWidth?: boolean;
}

const BTN_VARIANT_CLS: Record<PSButtonVariant, string> = {
  violet: 'ps-violet-btn text-white border border-transparent',
  coral: 'ps-coral-btn text-white border border-transparent',
  secondary:
    'bg-white text-slate-800 border border-[#E5E0F5] hover:bg-[#F9F8FD] hover:border-[#D4CBEF]',
  soft: 'bg-[#F4EFFD] text-[#5F35B3] border border-[#E4D9FA] hover:bg-[#EAE0FB]',
  ghost: 'bg-transparent text-slate-600 hover:bg-[#F4EFFD]/70 hover:text-[#5F35B3]',
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
};

const BTN_SIZE_CLS: Record<PSButtonSize, string> = {
  sm: 'min-h-[38px] px-3.5 text-xs rounded-xl',
  md: 'min-h-[44px] px-4.5 text-xs sm:text-sm rounded-2xl',
  lg: 'min-h-[50px] px-6 text-sm rounded-2xl',
};

export const PSButton: React.FC<PSButtonProps> = ({
  variant = 'violet',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  children,
  ...rest
}) => (
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${BTN_VARIANT_CLS[variant]} ${BTN_SIZE_CLS[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    {...rest}
  >
    {children}
  </button>
);

// ============================================================================
// 2. PS CARD
// ============================================================================
interface PSCardProps {
  variant?: 'surface' | 'elevated' | 'hero' | 'subtle';
  className?: string;
  children: React.ReactNode;
}

export const PSCard: React.FC<PSCardProps> = ({ variant = 'surface', className = '', children }) => {
  const styles =
    variant === 'hero'
      ? 'ps-hero-gradient text-white rounded-3xl ps-card-shadow'
      : variant === 'elevated'
        ? 'bg-white border border-[#ECE9F7] rounded-3xl ps-card-shadow'
        : variant === 'subtle'
          ? 'bg-[#FAF9FE] border border-[#ECE9F7] rounded-2xl'
          : 'bg-white border border-[#ECE9F7] rounded-2xl';
  return <div className={`${styles} ${className}`}>{children}</div>;
};

// ============================================================================
// 3. PS VEHICLE / BAY CATEGORY TILES (Pastel Circular Tiles from Reference)
// ============================================================================
export interface PSCategoryOption {
  id: string;
  labelFa: string;
  labelEn: string;
  labelNl: string;
  bg: string;
  fg: string;
  activeRing: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const PS_CATEGORY_TILES: PSCategoryOption[] = [
  {
    id: 'ALL',
    labelFa: 'خودرو',
    labelEn: 'Car',
    labelNl: 'Auto',
    bg: 'bg-[#FCEBE8]',
    fg: 'text-[#E86343]',
    activeRing: 'ring-2 ring-[#F46A46] ring-offset-2',
    icon: Car,
  },
  {
    id: 'ev',
    labelFa: 'برقی EV',
    labelEn: 'EV Bay',
    labelNl: 'EV-laad',
    bg: 'bg-[#E5F7F0]',
    fg: 'text-[#17A373]',
    activeRing: 'ring-2 ring-[#17A373] ring-offset-2',
    icon: Zap,
  },
  {
    id: 'motorcycle',
    labelFa: 'موتور',
    labelEn: 'Bike',
    labelNl: 'Motor',
    bg: 'bg-[#E8F3FE]',
    fg: 'text-[#3B82F6]',
    activeRing: 'ring-2 ring-[#3B82F6] ring-offset-2',
    icon: Bike,
  },
  {
    id: 'wide',
    labelFa: 'ون / SUV',
    labelEn: 'Van / SUV',
    labelNl: 'Bus / SUV',
    bg: 'bg-[#EFEAFC]',
    fg: 'text-[#6E41C4]',
    activeRing: 'ring-2 ring-[#6E41C4] ring-offset-2',
    icon: Truck,
  },
  {
    id: 'accessible',
    labelFa: 'ویژه',
    labelEn: 'Access',
    labelNl: 'Toegang',
    bg: 'bg-[#FEF5E4]',
    fg: 'text-[#D97706]',
    activeRing: 'ring-2 ring-[#D97706] ring-offset-2',
    icon: Accessibility,
  },
];

interface PSVehicleCategoryTilesProps {
  lang: Language;
  selectedId: string;
  onSelect: (id: string) => void;
}

export const PSVehicleCategoryTiles: React.FC<PSVehicleCategoryTilesProps> = ({
  lang,
  selectedId,
  onSelect,
}) => (
  <div className="flex items-center justify-between sm:justify-start gap-3 sm:gap-5 overflow-x-auto no-scrollbar py-1 px-0.5">
    {PS_CATEGORY_TILES.map((tile) => {
      const Icon = tile.icon;
      const active = selectedId === tile.id;
      return (
        <button
          key={tile.id}
          type="button"
          onClick={() => onSelect(tile.id)}
          className="flex flex-col items-center gap-1.5 group shrink-0 min-w-[58px]"
        >
          <span
            className={`w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-150 ${tile.bg} ${tile.fg} ${
              active ? `${tile.activeRing} scale-[1.03]` : 'group-hover:scale-[1.04]'
            }`}
          >
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </span>
          <span
            className={`text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors ${
              active ? 'text-[#5A2FA8] font-bold' : 'text-slate-600 group-hover:text-slate-900'
            }`}
          >
            {t(lang, tile.labelFa, tile.labelEn, tile.labelNl)}
          </span>
        </button>
      );
    })}
  </div>
);

// ============================================================================
// 4. PS FLOOR TABS (Coral Active Floor Selector from "Choose Space")
// ============================================================================
interface PSFloorTabsProps {
  lang: Language;
  floors: string[];
  activeFloor: string;
  onSelectFloor: (floor: string) => void;
  includeAll?: boolean;
}

export const PSFloorTabs: React.FC<PSFloorTabsProps> = ({
  lang,
  floors,
  activeFloor,
  onSelectFloor,
  includeAll = false,
}) => {
  const items = includeAll ? ['ALL', ...floors] : floors;
  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
      {items.map((fl) => {
        const active = activeFloor === fl;
        const label =
          fl === 'ALL'
            ? t(lang, 'همه طبقات', 'All Floors', 'Alle lagen')
            : `${t(lang, 'طبقه', 'Floor', 'Laag')} ${fl}`;
        return (
          <button
            key={fl}
            type="button"
            onClick={() => onSelectFloor(fl)}
            className={`min-h-[40px] px-4 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
              active
                ? 'ps-coral-btn text-white'
                : 'bg-[#F5F3FC] text-slate-600 hover:bg-[#ECE7FA] hover:text-[#5A2FA8]'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// 5. ARCHITECTURAL TOP-DOWN CAR SILHOUETTE SVG
// ============================================================================
export const PSTopDownCarSvg: React.FC<{
  selected?: boolean;
  className?: string;
}> = ({ selected = false, className = 'w-14 h-7' }) => (
  <svg
    viewBox="0 0 96 44"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Subtle soft ground shadow */}
    <rect
      x="6"
      y="6"
      width="84"
      height="34"
      rx="13"
      fill={selected ? 'rgba(92, 24, 10, 0.22)' : 'rgba(71, 61, 107, 0.14)'}
    />
    {/* Car chassis body */}
    <rect
      x="4"
      y="4"
      width="86"
      height="34"
      rx="12"
      fill="#FFFFFF"
      stroke={selected ? '#FFFFFF' : '#CBD5E1'}
      strokeWidth="1.5"
    />
    {/* Cabin roof */}
    <rect
      x="28"
      y="9"
      width="34"
      height="24"
      rx="7"
      fill={selected ? '#FFF5F2' : '#F4F3FA'}
      stroke={selected ? '#F46A46' : '#CBD5E1'}
      strokeWidth="1.2"
    />
    {/* Front windshield */}
    <path
      d="M62 11C67 12.5 70 16 70 21C70 26 67 29.5 62 31L62 11Z"
      fill={selected ? '#2D2246' : '#334155'}
    />
    {/* Rear windshield */}
    <path
      d="M28 12C23.5 13.5 21 16.5 21 21C21 25.5 23.5 28.5 28 30L28 12Z"
      fill={selected ? '#473766' : '#475569'}
    />
    {/* Side windows */}
    <rect x="33" y="7.5" width="24" height="2.4" rx="1.2" fill="#475569" />
    <rect x="33" y="32.1" width="24" height="2.4" rx="1.2" fill="#475569" />
    {/* Headlights */}
    <rect x="85" y="9" width="3" height="6" rx="1.5" fill="#FDE68A" />
    <rect x="85" y="27" width="3" height="6" rx="1.5" fill="#FDE68A" />
    {/* Taillights */}
    <rect x="5" y="10" width="2.5" height="5" rx="1" fill="#F46A46" />
    <rect x="5" y="27" width="2.5" height="5" rx="1" fill="#F46A46" />
  </svg>
);

// ============================================================================
// 6. INTERACTIVE VISUAL FLOOR BAY MAP ("Choose Space" Blueprint)
// ============================================================================
export interface FloorMapSlot {
  id: string;
  code: string;
  floor: string;
  zone: string;
  available: boolean;
  evCharging?: boolean;
  isFree?: boolean;
  hourlyEur?: number;
  category?: ParkingCategory;
  note?: string;
}

interface PSFloorBayMapProps {
  lang: Language;
  slots: FloorMapSlot[];
  floors: string[];
  activeFloor: string;
  onSelectFloor: (floor: string) => void;
  selectedSlotId: string | null;
  onSelectSlot: (slot: FloorMapSlot) => void;
  onBookSelected?: (slot: FloorMapSlot) => void;
  onOpenRoute?: (slot: FloorMapSlot) => void;
  bookingDisabled?: boolean;
  timeSummary?: string;
}

export const PSFloorBayMap: React.FC<PSFloorBayMapProps> = ({
  lang,
  slots,
  floors,
  activeFloor,
  onSelectFloor,
  selectedSlotId,
  onSelectSlot,
  onBookSelected,
  onOpenRoute,
  bookingDisabled = false,
  timeSummary,
}) => {
  const floorSlots = useMemo(() => {
    const filtered =
      activeFloor === 'ALL' ? slots : slots.filter((s) => s.floor === activeFloor);
    return filtered.slice(0, 16);
  }, [slots, activeFloor]);

  // Group into left wing & right wing along the central ENTRY -> EXIT aisle
  const { leftSlots, rightSlots, leftZones, rightZones } = useMemo(() => {
    const half = Math.ceil(floorSlots.length / 2);
    const left = floorSlots.slice(0, half);
    const right = floorSlots.slice(half);
    const lZones = Array.from(new Set(left.map((s) => s.zone))).join(' · ') || 'A';
    const rZones = Array.from(new Set(right.map((s) => s.zone))).join(' · ') || 'B';
    return { leftSlots: left, rightSlots: right, leftZones: lZones, rightZones: rZones };
  }, [floorSlots]);

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) ?? null,
    [slots, selectedSlotId]
  );

  const openCount = floorSlots.filter((s) => s.available).length;

  const renderBayCell = (slot: FloorMapSlot, side: 'left' | 'right') => {
    const isSelected = slot.id === selectedSlotId;

    if (!slot.available) {
      return (
        <div
          key={slot.id}
          title={`${slot.code} — ${t(lang, 'اشغال / غیرقابل رزرو', 'Occupied', 'Bezet')}`}
          className="relative h-[62px] px-2.5 flex items-center justify-between border-b border-dashed border-[#DFDAF2] bg-[#FAF9FE]/60 select-none"
        >
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">{slot.code}</span>
          <PSTopDownCarSvg className="w-14 h-7 opacity-85" />
        </div>
      );
    }

    return (
      <button
        key={slot.id}
        type="button"
        onClick={() => onSelectSlot(slot)}
        aria-pressed={isSelected}
        className={`relative w-full h-[62px] px-2.5 flex items-center justify-between border-b border-dashed transition-all text-start ${
          isSelected
            ? 'bg-[#FFF0EC] border-[#F8C2B3]'
            : 'bg-white border-[#DFDAF2] hover:bg-[#F7F4FE]'
        }`}
      >
        <div className="min-w-0">
          <div
            className={`font-mono text-xs font-bold tabular-nums flex items-center gap-1 ${
              isSelected ? 'text-[#C8421F]' : 'text-[#5A2FA8]'
            }`}
          >
            <span>{slot.code}</span>
            {slot.evCharging && <Zap className="w-3 h-3 text-[#17A373] shrink-0" />}
          </div>
          <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
            {slot.isFree
              ? t(lang, 'رایگان', 'Free', 'Gratis')
              : `€${(slot.hourlyEur ?? 1.5).toFixed(1)}/h`}
          </div>
        </div>

        {isSelected ? (
          <div className="relative flex items-center">
            <span className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-2xl bg-[#F46A46] ps-coral-glow">
              <PSTopDownCarSvg selected className="w-12 h-6" />
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-semibold text-[#6E41C4]/80 px-2 py-1 rounded-lg bg-[#F4EFFD]">
            {t(lang, 'آزاد', 'Open', 'Vrij')}
          </span>
        )}

        {/* Signature vertical coral selection bar facing the driving lane */}
        {isSelected && (
          <span
            aria-hidden="true"
            className={`absolute top-1.5 bottom-1.5 w-1 rounded-full bg-[#F46A46] ${
              side === 'left' ? 'end-0' : 'start-0'
            }`}
          />
        )}
      </button>
    );
  };

  return (
    <PSCard variant="elevated" className="p-4 sm:p-5 space-y-4">
      {/* Top Header + Floor Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900">
              {t(lang, 'انتخاب تصویری جای پارک', 'Choose Space', 'Kies een parkeerplek')}
            </h3>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {t(
                lang,
                `${openCount} جایگاه آزاد از ${floorSlots.length} جایگاه نمایش‌داده‌شده`,
                `${openCount} open bays out of ${floorSlots.length} shown`,
                `${openCount} vrije plekken van ${floorSlots.length} weergegeven`
              )}
              {timeSummary ? ` · ${timeSummary}` : ''}
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F4EFFD] border border-[#D4C5F6]" />
              {t(lang, 'آزاد', 'Open', 'Vrij')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#F46A46]" />
              {t(lang, 'انتخاب شما', 'Selected', 'Gekozen')}
            </span>
          </div>
        </div>

        <PSFloorTabs
          lang={lang}
          floors={floors}
          activeFloor={activeFloor}
          onSelectFloor={onSelectFloor}
          includeAll={floors.length > 1}
        />
      </div>

      {/* Blueprint Floor Canvas */}
      {floorSlots.length === 0 ? (
        <div className="py-10 px-4 text-center rounded-2xl bg-[#FAF9FE] border border-dashed border-[#DFDAF2] space-y-1">
          <div className="text-sm font-semibold text-slate-700">
            {t(lang, 'جایگاهی در این طبقه ثبت نشده است', 'No bays on this floor', 'Geen plekken op deze laag')}
          </div>
          <p className="text-xs text-slate-500">
            {t(lang, 'طبقه دیگری را انتخاب کنید یا فیلترها را پاک نمایید.', 'Try another floor or clear active filters.', 'Kies een andere laag of wis filters.')}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#FCFBFF] border border-[#ECE9F7] p-3 sm:p-4">
          {/* Blueprint Column Headers */}
          <div className="grid grid-cols-[1fr_52px_1fr] items-center pb-2.5 border-b border-[#ECE9F7] text-center">
            <span className="text-xs font-bold text-[#6E41C4] tracking-wide">
              {t(lang, `بخش ${leftZones}`, `Zone ${leftZones}`, `Zone ${leftZones}`)}
            </span>
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-700">
              {t(lang, 'ورود', 'ENTRY', 'IN')}
            </span>
            <span className="text-xs font-bold text-[#6E41C4] tracking-wide">
              {t(lang, `بخش ${rightZones}`, `Zone ${rightZones}`, `Zone ${rightZones}`)}
            </span>
          </div>

          {/* Left Bays | Central Dashed Driving Lane | Right Bays */}
          <div className="grid grid-cols-[1fr_52px_1fr] items-stretch">
            <div className="border-e border-dashed border-[#DFDAF2]">
              {leftSlots.map((slot) => renderBayCell(slot, 'left'))}
            </div>

            {/* Driving Aisle with Entry -> Exit Dashed Path */}
            <div className="relative flex flex-col items-center justify-between py-4 select-none">
              <div className="w-2 h-2 rounded-full bg-[#6E41C4]" />
              <div className="flex-1 my-2 border-e-2 border-dashed border-[#D3C7F2] relative flex flex-col items-center justify-evenly">
                <ArrowDown className="w-3.5 h-3.5 text-[#9A84D6]" />
                <ArrowDown className="w-3.5 h-3.5 text-[#9A84D6]" />
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-600">
                {t(lang, 'خروج', 'EXIT', 'UIT')}
              </span>
            </div>

            <div className="border-s border-dashed border-[#DFDAF2]">
              {rightSlots.map((slot) => renderBayCell(slot, 'right'))}
            </div>
          </div>
        </div>
      )}

      {/* Selected Space Action Bar (Signature Royal Violet CTA) */}
      {selectedSlot && selectedSlot.available ? (
        <div className="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <span className="font-mono text-sm text-[#5A2FA8]">{selectedSlot.code}</span>
              <span className="text-slate-300">·</span>
              <span>
                {t(lang, 'طبقه', 'Floor', 'Laag')} {selectedSlot.floor}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-[#E35733]">
                {selectedSlot.isFree
                  ? t(lang, 'رایگان', 'Free', 'Gratis')
                  : `€${(selectedSlot.hourlyEur ?? 1.5).toFixed(1)}/h`}
              </span>
            </div>
            {selectedSlot.note && (
              <div className="text-[11px] text-slate-500 truncate">{selectedSlot.note}</div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenRoute && (
              <PSButton variant="soft" size="md" onClick={() => onOpenRoute(selectedSlot)}>
                <Navigation className="w-4 h-4" />
                <span>{t(lang, 'مسیریابی', 'Route', 'Route')}</span>
              </PSButton>
            )}
            {onBookSelected && (
              <PSButton
                variant="violet"
                size="md"
                disabled={bookingDisabled}
                onClick={() => onBookSelected(selectedSlot)}
                className="flex-1 sm:flex-initial"
              >
                <span>{t(lang, 'رزرو همین جایگاه', 'Book Space', 'Reserveer plek')}</span>
              </PSButton>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500 text-center py-1">
          {t(
            lang,
            'روی هر جایگاه «آزاد» در نقشه بالا کلیک کنید تا انتخاب و رزرو شود.',
            'Tap any open space on the floor map above to select and book.',
            'Tik op een vrije plek op de plattegrond om te kiezen en te reserveren.'
          )}
        </div>
      )}
    </PSCard>
  );
};

// ============================================================================
// 7. IN-GARAGE ROUTE GUIDANCE CARD ("Route" Right Screen from Reference)
// ============================================================================
interface PSRouteGuidanceCardProps {
  lang: Language;
  bayCode: string;
  floor: string;
  zone?: string;
  distanceMeters?: number;
  locationNote?: string;
  onClose?: () => void;
}

export const PSRouteGuidanceCard: React.FC<PSRouteGuidanceCardProps> = ({
  lang,
  bayCode,
  floor,
  zone,
  distanceMeters = 65,
  locationNote,
  onClose,
}) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="rounded-3xl overflow-hidden border border-[#E2DAF7] ps-card-shadow bg-white">
      {/* Deep Royal Violet Route Header */}
      <div className="bg-gradient-to-r from-[#7746CB] to-[#6334B5] text-white px-5 py-4 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">
              {t(lang, 'مسیریابی داخلی', 'Route', 'Route')}
            </span>
            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-white/15">
              {bayCode}
            </span>
          </div>
          <p className="text-xs text-violet-100 leading-snug truncate">
            {t(
              lang,
              `ورود به طبقه ${floor}${zone ? ` · بلوک ${zone}` : ''} · بپیچید به سمت جایگاه`,
              `Head to Floor ${floor}${zone ? ` · Block ${zone}` : ''} · Turn left to parking spot`,
              `Ga naar laag ${floor}${zone ? ` · Blok ${zone}` : ''} · Sla linksaf naar uw plek`
            )}
          </p>
        </div>

        {/* Crisp White Distance & Coral Turn Badge (Direct Inspiration!) */}
        <div className="bg-white text-slate-900 rounded-2xl px-3 py-2 flex flex-col items-center justify-center min-w-[68px] shrink-0 shadow-sm">
          <span className="w-7 h-7 rounded-full bg-[#F46A46] text-white flex items-center justify-center mb-0.5">
            <CornerUpLeft className="w-4 h-4" />
          </span>
          <span className="font-mono tabular-nums text-[11px] font-bold text-slate-900">
            {distanceMeters} m
          </span>
        </div>
      </div>

      {/* Garage Perspective Viewport with Translucent Violet Directional Ribbon */}
      <div className="relative h-56 sm:h-64 bg-slate-800 overflow-hidden">
        {!imgError ? (
          <img
            src={GARAGE_ROUTE_IMAGE_URL}
            alt={t(lang, 'مسیر پارکینگ سرپوشیده ساختمان', 'Underground residential parking garage lane', 'Ondergrondse parkeergarage')}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 flex items-center justify-center text-slate-400 text-xs">
            {t(lang, 'نمای مسیر پارکینگ', 'Garage Lane Preview', 'Garageweergave')}
          </div>
        )}

        {/* Measured bottom scrim for legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#211338]/75 via-transparent to-[#211338]/20 pointer-events-none" />

        {/* Signature Translucent Violet Perspective Path Ribbon with White Chevrons */}
        <svg
          viewBox="0 0 360 220"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="psRouteRibbon" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#7C4BD4" stopOpacity="0.82" />
              <stop offset="65%" stopColor="#8E5CE6" stopOpacity="0.62" />
              <stop offset="100%" stopColor="#B180F5" stopOpacity="0.22" />
            </linearGradient>
          </defs>
          {/* Perspective curved driving ribbon leading into bay */}
          <path
            d="M 135 220 C 145 160, 168 130, 148 92 L 178 92 C 204 128, 224 162, 232 220 Z"
            fill="url(#psRouteRibbon)"
          />
          {/* White directional chevrons */}
          <path
            d="M 168 190 L 182 178 L 196 190"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d="M 165 152 L 178 141 L 191 152"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.9"
          />
          <path
            d="M 157 118 L 168 109 L 179 118"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity="0.75"
          />
        </svg>

        {/* Destination Tag Overlaid Cleanly */}
        <div className="absolute bottom-3 inset-x-4 flex items-end justify-between gap-2 text-white">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs font-bold truncate">
              {locationNote ||
                t(
                  lang,
                  `جایگاه ${bayCode} — طبقه ${floor}`,
                  `Bay ${bayCode} — Floor ${floor}`,
                  `Plek ${bayCode} — Laag ${floor}`
                )}
            </div>
            <div className="text-[11px] text-violet-100/90">
              {t(
                lang,
                'ورود با پلاک‌خوان یا کارت ساختمان · دسترسی خصوصی',
                'Enter via building gate card / app · Private resident access',
                'Toegang via gebouwkaart / app · Privé bewonerstoegang'
              )}
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[34px] px-3 rounded-xl bg-white/95 text-slate-900 text-xs font-semibold hover:bg-white shrink-0"
            >
              {t(lang, 'بستن', 'Close', 'Sluiten')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 8. PS BAY LIST CARD (Refined Nearby Space Card from Left Screen)
// ============================================================================
interface PSBayListCardProps {
  lang: Language;
  resource: Resource;
  slotLabel: string;
  rating?: { avg: number; count: number };
  disabled?: boolean;
  onBook: () => void;
  onRoute?: () => void;
}

export const PSBayListCard: React.FC<PSBayListCardProps> = ({
  lang,
  resource,
  slotLabel,
  rating,
  disabled = false,
  onBook,
  onRoute,
}) => {
  const [thumbErr, setThumbErr] = useState(false);

  return (
    <div className="p-3.5 sm:p-4 bg-white border border-[#ECE9F7] rounded-2xl hover:border-[#D4C7F4] transition-all flex items-center justify-between gap-3.5">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        {/* Clean Garage Bay Thumbnail with Overlay Bay Code */}
        <div className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl overflow-hidden bg-[#F4EFFD] shrink-0 border border-[#ECE9F7]">
          {!thumbErr ? (
            <img
              src={GARAGE_ROUTE_IMAGE_URL}
              alt={resource.code}
              referrerPolicy="no-referrer"
              onError={() => setThumbErr(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#6E41C4]">
              <Car className="w-6 h-6" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#241440]/85 to-transparent px-1.5 py-1 text-center">
            <span className="font-mono text-[10px] font-bold text-white tracking-tight">
              {resource.code}
            </span>
          </div>
        </div>

        {/* Clean Unboxed Metadata */}
        <div className="min-w-0 space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-bold text-sm text-slate-900 truncate">
              {lang === 'fa' ? resource.titleFa : resource.title}
            </span>
            {rating && (
              <span className="inline-flex items-center gap-0.5 text-xs font-mono tabular-nums text-amber-600">
                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                {rating.avg.toFixed(1)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
            {resource.spaceMeta?.block && (
              <span>
                {t(lang, 'بلوک', 'Block', 'Blok')} {resource.spaceMeta.block}
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono">{resource.floorOrZone}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {resource.dimensions.widthM}×{resource.dimensions.lengthM}m
            </span>
            {resource.evCharging && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#17A373] font-semibold inline-flex items-center gap-0.5">
                  <Zap className="w-3 h-3" />
                  EV{resource.features?.evPowerKw ? ` ${resource.features.evPowerKw}kW` : ''}
                </span>
              </>
            )}
          </div>

          {/* Price + Open Window Row */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
            <span className="inline-flex items-center gap-1 font-bold text-[#5A2FA8]">
              <span className="w-4 h-4 rounded-full bg-[#EFEAFC] text-[#6E41C4] inline-flex items-center justify-center text-[10px]">
                {resource.pricing.isFree ? '✓' : '€'}
              </span>
              {resource.pricing.isFree
                ? t(lang, 'رایگان', 'Free', 'Gratis')
                : `€${resource.pricing.hourlyEur.toFixed(1)}/h`}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-500">{slotLabel}</span>
            <span className="text-slate-300">·</span>
            <span className="text-[11px] text-slate-500">
              {resource.approvalMode === 'automatic'
                ? t(lang, 'تأیید فوری', 'Instant', 'Direct')
                : t(lang, 'تأیید مالک', 'Approval', 'Goedkeuring')}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
        {onRoute && (
          <button
            type="button"
            onClick={onRoute}
            aria-label={t(lang, 'مسیریابی', 'Route', 'Route')}
            className="min-w-[38px] min-h-[38px] rounded-xl bg-[#F4EFFD] text-[#6E41C4] hover:bg-[#E9DFFA] flex items-center justify-center transition-colors"
          >
            <Navigation className="w-4 h-4" />
          </button>
        )}
        <PSButton variant="violet" size="sm" disabled={disabled} onClick={onBook}>
          <span>{t(lang, 'رزرو', 'Book', 'Boek')}</span>
        </PSButton>
      </div>
    </div>
  );
};

// ============================================================================
// 9. PS HERO BANNER HEADER (Lavender-Orchid Greeting Header)
// ============================================================================
interface PSHeroBannerProps {
  greeting: string;
  headline: string;
  subtitle?: string;
  rightSlot?: React.ReactNode;
  children?: React.ReactNode;
}

export const PSHeroBanner: React.FC<PSHeroBannerProps> = ({
  greeting,
  headline,
  subtitle,
  rightSlot,
  children,
}) => (
  <section className="ps-hero-gradient text-white rounded-3xl p-5 sm:p-6 ps-card-shadow space-y-4">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-1 min-w-0">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-white/85">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{greeting}</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-balance leading-snug">
          {headline}
        </h1>
        {subtitle && <p className="text-xs text-white/80 truncate">{subtitle}</p>}
      </div>
      {rightSlot && <div className="shrink-0">{rightSlot}</div>}
    </div>
    {children}
  </section>
);
