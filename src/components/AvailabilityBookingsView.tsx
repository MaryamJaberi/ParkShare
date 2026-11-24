import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  Community,
  Language,
  NotificationEvent,
  Reservation,
  ReservationStatus,
  Resource,
} from '../types/parkshare';
import { formatMinutes, reservationStatusLabels, t } from '../i18n/translations';
import { computeAvailableIntervals } from '../engines/coreEngine';

interface Props {
  lang: Language;
  communities: Community[];
  resources: Resource[];
  reservations: Reservation[];
  notifications: NotificationEvent[];
  onTransitionStatus: (reservationId: string, nextStatus: ReservationStatus) => void;
  onTriggerOwnerRecall: (reservationId: string) => void;
  onAcceptRelocation: (reservationId: string) => void;
  onSimulateDoubleBooking: (reservationId: string) => { ok: boolean; message: string };
}

const TIMELINE_START = 360; // 06:00
const TIMELINE_END = 1440; // 24:00
const TIMELINE_SPAN = TIMELINE_END - TIMELINE_START;
const HOUR_TICKS = [6, 9, 12, 15, 18, 21, 24];

export const AvailabilityBookingsView: React.FC<Props> = ({
  lang,
  communities,
  resources,
  reservations,
  notifications,
  onTransitionStatus,
  onTriggerOwnerRecall,
  onAcceptRelocation,
  onSimulateDoubleBooking,
}) => {
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE_ALL');
  const [timelineSearch, setTimelineSearch] = useState<string>('');
  const [onlyBookedBays, setOnlyBookedBays] = useState<boolean>(false);
  const [onlyActiveBays, setOnlyActiveBays] = useState<boolean>(false);
  const [showAllTimelineRows, setShowAllTimelineRows] = useState<boolean>(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const activeReservationResourceIds = useMemo(() => {
    const set = new Set<string>();
    reservations.forEach((r) => {
      if (['Confirmed', 'Active', 'Pending', 'Relocation Pending'].includes(r.status)) {
        set.add(r.resourceId);
      }
    });
    return set;
  }, [reservations]);

  const visibleResources = useMemo(() => {
    const q = timelineSearch.trim().toLowerCase();
    return resources.filter((r) => {
      if (selectedCommunityId !== 'ALL' && r.communityId !== selectedCommunityId) return false;
      if (onlyBookedBays && !activeReservationResourceIds.has(r.id)) return false;
      if (onlyActiveBays && !(r.active && r.sharingEnabled)) return false;
      if (q) {
        const hay = `${r.code} ${r.floorOrZone} ${r.spaceMeta?.block ?? ''} ${r.titleFa} ${r.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [resources, selectedCommunityId, onlyBookedBays, onlyActiveBays, timelineSearch, activeReservationResourceIds]);

  const displayedTimelineResources = useMemo(
    () => (showAllTimelineRows ? visibleResources : visibleResources.slice(0, 10)),
    [visibleResources, showAllTimelineRows]
  );

  const visibleReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (selectedCommunityId !== 'ALL' && r.communityId !== selectedCommunityId) return false;
      if (statusFilter === 'ACTIVE_ALL') {
        return !['Cancelled', 'Completed', 'Expired'].includes(r.status);
      }
      if (statusFilter === 'HISTORY') {
        return ['Cancelled', 'Completed', 'Expired', 'Disputed'].includes(r.status);
      }
      return true;
    });
  }, [reservations, selectedCommunityId, statusFilter]);

  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const communityMap = useMemo(() => new Map(communities.map((c) => [c.id, c])), [communities]);

  const toPct = (min: number) => {
    const clamped = Math.max(TIMELINE_START, Math.min(TIMELINE_END, min));
    return ((clamped - TIMELINE_START) / TIMELINE_SPAN) * 100;
  };

  const statusColorClass = (status: ReservationStatus) => {
    switch (status) {
      case 'Confirmed':
      case 'Active':
        return 'text-emerald-700 font-semibold';
      case 'Pending':
      case 'Relocation Pending':
        return 'text-amber-700 font-semibold';
      case 'Disputed':
      case 'Cancelled':
        return 'text-red-700 font-semibold';
      default:
        return 'text-slate-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Clean Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {t(lang, 'تقویم زمانی و مدیریت رزروها', 'Schedule & Booking Management')}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            {t(
              lang,
              'ساعات آزاد و رزروشده جایگاه‌ها را ببینید، درخواست‌ها را تأیید کنید و در نیاز اضطراری مالک، جابه‌جایی سریع انجام دهید.',
              'Monitor open windows, approve requests, and handle urgent owner recalls smoothly.'
            )}
          </p>
        </div>

        {communities.length > 1 && (
          <select
            aria-label={t(lang, 'فیلتر ساختمان', 'Filter building')}
            value={selectedCommunityId}
            onChange={(e) => setSelectedCommunityId(e.target.value)}
            className="h-11 px-3.5 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-900 self-start sm:self-auto"
          >
            <option value="ALL">{t(lang, 'همه ساختمان‌ها', 'All Buildings')}</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {lang === 'fa' ? c.nameFa : c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Conflict Alert Feedback */}
      {conflictMessage && (
        <div
          role="alert"
          className="px-4 py-3.5 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 text-xs sm:text-sm flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{conflictMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setConflictMessage(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            {t(lang, 'بستن', 'Dismiss')}
          </button>
        </div>
      )}

      {/* SECTION 1: DAILY AVAILABILITY TIMELINE */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {t(lang, 'برنامه زمانی امروز (۰۶:۰۰ تا ۲۴:۰۰)', 'Today’s Availability (06:00–24:00)')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(
                lang,
                'بازه‌های آزاد واقعی پس از کسر رزروها و زمان حائل بین دو خودرو محاسبه شده‌اند.',
                'Open windows automatically account for confirmed bookings and turnaround buffers.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-xs bg-emerald-200 border border-emerald-400" />
              {t(lang, 'آزاد', 'Available')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-xs bg-blue-700" />
              {t(lang, 'رزرو شده', 'Booked')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-xs bg-amber-500" />
              {t(lang, 'تعمیرات / جابه‌جایی', 'Maintenance / Recall')}
            </span>
          </div>
        </div>

        {/* Smart Timeline Controls (So 40 bays stay fast and scannable) */}
        {resources.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-4 h-4 text-slate-400 absolute top-3 start-3 pointer-events-none" />
              <input
                type="text"
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                placeholder={t(lang, 'جستجوی کد پارکینگ یا طبقه...', 'Search bay code or floor...')}
                className="w-full h-10 ps-9 pe-3 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyActiveBays((v) => !v)}
                className={`min-h-[38px] px-3 font-medium rounded-xl border transition-colors ${
                  onlyActiveBays ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                {t(lang, 'فقط پارکینگ‌های فعال', 'Active bays only')}
              </button>
              <button
                type="button"
                onClick={() => setOnlyBookedBays((v) => !v)}
                className={`min-h-[38px] px-3 font-medium rounded-xl border transition-colors ${
                  onlyBookedBays ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-700'
                }`}
              >
                {t(lang, 'فقط دارای رزرو', 'Booked only')}
              </button>
            </div>
          </div>
        )}

        {visibleResources.length === 0 ? (
          <div className="py-10 text-center text-xs sm:text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl">
            {resources.length === 0
              ? t(
                  lang,
                  'هنوز هیچ جایگاه پارکینگی ثبت نشده است. از «پنل مدیر ساختمان» لیست پارکینگ‌ها را وارد کنید.',
                  'No parking bays registered yet. Add bays from the Building Manager panel.'
                )
              : t(lang, 'جایگاهی با این فیلتر پیدا نشد.', 'No bays match this filter.')}
          </div>
        ) : (
          <>
            {/* MOBILE TIMELINE CARDS (< md): Zero awkward horizontal panning! */}
            <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {displayedTimelineResources.map((res) => {
                const freeSlots = computeAvailableIntervals(res, reservations);
                const resBookings = reservations.filter(
                  (r) =>
                    r.resourceId === res.id &&
                    ['Confirmed', 'Active', 'Pending', 'Relocation Pending'].includes(r.status)
                );

                return (
                  <div key={res.id} className="p-3.5 space-y-2 bg-white">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        <span className="font-mono text-blue-800">{res.code}</span>
                        <span className="text-slate-300">·</span>
                        <span>
                          {res.spaceMeta?.block ? `${t(lang, 'بلوک', 'Blk')} ${res.spaceMeta.block} · ` : ''}
                          {res.floorOrZone}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {!res.active
                          ? t(lang, 'غیرفعال', 'Inactive')
                          : res.pricing.isFree
                            ? t(lang, 'رایگان', 'Free')
                            : `€${res.pricing.hourlyEur}/h`}
                      </span>
                    </div>

                    {/* Visual 06:00-24:00 Strip */}
                    <div className="relative h-6 bg-slate-100 rounded-lg overflow-hidden" dir="ltr">
                      {freeSlots.map((slot, i) => (
                        <div
                          key={`m-free-${i}`}
                          className="absolute top-1 bottom-1 bg-emerald-200/90 border border-emerald-400/70 rounded-xs"
                          style={{
                            left: `${toPct(slot.startMin)}%`,
                            width: `${Math.max(1.5, toPct(slot.endMin) - toPct(slot.startMin))}%`,
                          }}
                        />
                      ))}
                      {resBookings.map((b) => (
                        <div
                          key={`m-b-${b.id}`}
                          className={`absolute top-1 bottom-1 rounded-xs ${
                            b.status === 'Relocation Pending' ? 'bg-amber-600' : 'bg-blue-700'
                          }`}
                          style={{
                            left: `${toPct(b.startMin)}%`,
                            width: `${Math.max(3, toPct(b.endMin) - toPct(b.startMin))}%`,
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
                      <span>06:00</span>
                      <span>
                        {freeSlots.length > 0
                          ? `${t(lang, 'آزاد:', 'Open:')} ${freeSlots.map((s) => `${formatMinutes(s.startMin)}–${formatMinutes(s.endMin)}`).join(', ')}`
                          : t(lang, 'بدون بازه آزاد', 'No open window')}
                      </span>
                      <span>24:00</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP GANTT MATRIX (md+) */}
            <div className="hidden md:block space-y-2">
              <div className="grid grid-cols-12 items-center text-[11px] font-mono tabular-nums text-slate-400 pb-2 border-b border-slate-100">
                <div className="col-span-3">{t(lang, 'جایگاه پارکینگ', 'Parking Bay')}</div>
                <div className="col-span-9 relative h-4" dir="ltr">
                  {HOUR_TICKS.map((h) => (
                    <span
                      key={h}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${toPct(h * 60)}%` }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
              </div>

              {displayedTimelineResources.map((res) => {
                const freeSlots = computeAvailableIntervals(res, reservations);
                const resBookings = reservations.filter(
                  (r) =>
                    r.resourceId === res.id &&
                    ['Confirmed', 'Active', 'Pending', 'Relocation Pending'].includes(r.status)
                );

                return (
                  <div
                    key={res.id}
                    className="grid grid-cols-12 items-center gap-3 py-2 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="col-span-3 min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 truncate">
                        <span className="font-mono text-blue-800">{res.code}</span>
                        <span className="font-normal text-slate-600 truncate">
                          {res.spaceMeta?.block ? `${t(lang, 'بلوک', 'Blk')} ${res.spaceMeta.block} · ` : ''}
                          {res.floorOrZone}
                        </span>
                        {!res.active && (
                          <span className="text-red-600 font-normal">· {t(lang, 'غیرفعال', 'Off')}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {t(lang, 'حائل', 'Buffer')} {res.bufferMinutes}m ·{' '}
                        {res.pricing.isFree ? t(lang, 'رایگان', 'Free') : `€${res.pricing.hourlyEur}/h`}
                      </div>
                    </div>

                    <div className="col-span-9 relative h-8 bg-slate-100 rounded-lg overflow-hidden" dir="ltr">
                      {HOUR_TICKS.slice(1, -1).map((h) => (
                        <div
                          key={h}
                          className="absolute top-0 bottom-0 w-px bg-slate-200/80"
                          style={{ left: `${toPct(h * 60)}%` }}
                        />
                      ))}

                      {freeSlots.map((slot, i) => (
                        <div
                          key={`free-${i}`}
                          title={`Available ${formatMinutes(slot.startMin)}–${formatMinutes(slot.endMin)}`}
                          className="absolute top-1.5 bottom-1.5 bg-emerald-200/90 border border-emerald-400/70 rounded-xs"
                          style={{
                            left: `${toPct(slot.startMin)}%`,
                            width: `${Math.max(1, toPct(slot.endMin) - toPct(slot.startMin))}%`,
                          }}
                        />
                      ))}

                      {res.maintenanceBlocks.map((m, i) => (
                        <div
                          key={`maint-${i}`}
                          title={m.reason}
                          className="absolute top-1.5 bottom-1.5 bg-amber-300/90 border border-amber-500 rounded-xs"
                          style={{
                            left: `${toPct(m.startMin)}%`,
                            width: `${Math.max(1.5, toPct(m.endMin) - toPct(m.startMin))}%`,
                          }}
                        />
                      ))}

                      {resBookings.map((b) => (
                        <div
                          key={b.id}
                          title={`${b.status}: ${formatMinutes(b.startMin)}–${formatMinutes(b.endMin)}`}
                          className={`absolute top-1.5 bottom-1.5 rounded-xs flex items-center px-2 text-[10px] font-mono text-white truncate ${
                            b.status === 'Relocation Pending'
                              ? 'bg-amber-600'
                              : b.status === 'Pending'
                                ? 'bg-slate-500'
                                : 'bg-blue-700'
                          }`}
                          style={{
                            left: `${toPct(b.startMin)}%`,
                            width: `${Math.max(2, toPct(b.endMin) - toPct(b.startMin))}%`,
                          }}
                        >
                          {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Expand/Collapse for large 40-bay complexes */}
            {visibleResources.length > 10 && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllTimelineRows((v) => !v)}
                  className="min-h-[40px] inline-flex items-center gap-1.5 px-4 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                >
                  {showAllTimelineRows ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      {t(lang, 'نمایش خلاصه (۱۰ جایگاه اول)', 'Show compact (first 10)')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      {t(lang, `نمایش همه ${visibleResources.length} جایگاه`, `Show all ${visibleResources.length} bays`)}
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* LOWER SPLIT: RESERVATIONS + NOTIFICATIONS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Reservations Management */}
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">
                {t(lang, 'مدیریت رزروها و نیاز اضطراری مالک', 'Reservations & Urgent Owner Recall')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  lang,
                  'تأیید رزروها، بررسی جلوگیری از تداخل هم‌زمان و جابه‌جایی سریع در صورت بازگشت زودتر صاحب پارکینگ.',
                  'Approve bookings, verify conflict protection, and relocate guests if an owner returns early.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
              {[
                ['ACTIVE_ALL', t(lang, 'جاری', 'Active')],
                ['HISTORY', t(lang, 'تاریخچه', 'History')],
                ['ALL', t(lang, 'همه', 'All')],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setStatusFilter(id)}
                  className={`min-h-[36px] px-3 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    statusFilter === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleReservations.length === 0 ? (
            <div className="p-10 text-center text-xs sm:text-sm text-slate-500">
              {t(lang, 'رزروی در این بخش ثبت نشده است.', 'No reservations in this view.')}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleReservations.map((rsv) => {
                const res = resourceMap.get(rsv.resourceId);
                const comm = communityMap.get(rsv.communityId);
                const altRes = rsv.suggestedAlternativeResourceId
                  ? resourceMap.get(rsv.suggestedAlternativeResourceId)
                  : undefined;

                return (
                  <div key={rsv.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 text-sm font-semibold text-slate-900">
                          <span className="font-mono text-blue-800">{res?.code ?? rsv.resourceId}</span>
                          <span>{lang === 'fa' ? res?.titleFa : res?.title}</span>
                          <span className="text-slate-300">·</span>
                          <span className={`text-xs ${statusColorClass(rsv.status)}`}>
                            {reservationStatusLabels[rsv.status][lang]}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                          {formatMinutes(rsv.startMin)}–{formatMinutes(rsv.endMin)}
                          <span className="mx-1.5 font-sans">·</span>
                          <span className="font-sans">{rsv.requesterName}</span>
                          <span className="mx-1.5 font-sans">·</span>
                          <span className="font-sans">{lang === 'fa' ? comm?.nameFa : comm?.name}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {rsv.status === 'Pending' && (
                          <button
                            type="button"
                            onClick={() => onTransitionStatus(rsv.id, 'Confirmed')}
                            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold bg-emerald-700 text-white rounded-xl hover:bg-emerald-800 whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t(lang, 'تأیید رزرو', 'Approve')}
                          </button>
                        )}

                        {(rsv.status === 'Confirmed' || rsv.status === 'Active') && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const resTest = onSimulateDoubleBooking(rsv.id);
                                setConflictMessage(resTest.message);
                              }}
                              className="min-h-[40px] px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 whitespace-nowrap"
                            >
                              {t(lang, 'تست ضد تداخل', 'Test Conflict Lock')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onTriggerOwnerRecall(rsv.id)}
                              className="min-h-[40px] inline-flex items-center gap-1.5 px-3 text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100 whitespace-nowrap"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t(lang, 'نیاز فوری مالک', 'Owner Recall')}
                            </button>
                          </>
                        )}

                        {!['Cancelled', 'Completed'].includes(rsv.status) && (
                          <button
                            type="button"
                            onClick={() => onTransitionStatus(rsv.id, 'Cancelled')}
                            className="min-h-[40px] inline-flex items-center gap-1 px-3 text-xs font-medium text-red-700 hover:bg-red-50 rounded-xl whitespace-nowrap"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            {t(lang, 'لغو', 'Cancel')}
                          </button>
                        )}
                      </div>
                    </div>

                    {rsv.status === 'Relocation Pending' && (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="text-xs text-amber-950 space-y-1">
                          <div className="font-bold">
                            {t(
                              lang,
                              `درخواست تخلیه ثبت شد — مهلت توافق‌شده: ${rsv.recallGraceMinutes ?? 30} دقیقه`,
                              `Owner recall active — grace window: ${rsv.recallGraceMinutes ?? 30} min`
                            )}
                          </div>
                          <div className="leading-relaxed">
                            {altRes
                              ? t(
                                  lang,
                                  `جایگاه جایگزین فوری پیدا شد: ${altRes.code} (${altRes.titleFa}). با تأیید، رزرو به‌صورت خودکار منتقل می‌شود.`,
                                  `Immediate alternative found: ${altRes.code} (${altRes.title}). Accept to transfer atomically.`
                                )
                              : t(
                                  lang,
                                  'پارکینگ جایگزین فوری یافت نشد. موضوع به مدیر ساختمان ارجاع شد.',
                                  'No automatic alternative found. Escalated to Building Manager.'
                                )}
                          </div>
                        </div>
                        {altRes && (
                          <button
                            type="button"
                            onClick={() => onAcceptRelocation(rsv.id)}
                            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 px-4 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800 whitespace-nowrap shrink-0"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {t(lang, `انتقال به ${altRes.code}`, `Relocate to ${altRes.code}`)}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Notifications & Coordination Log */}
        <section className="xl:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              {t(lang, 'اعلان‌ها و رویدادهای هماهنگی', 'Coordination Notifications')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(lang, 'پیام‌های ارسال‌شده به مالک، رزروکننده یا مدیر ساختمان.', 'Messages dispatched to owners, guests, or managers.')}
            </p>
          </div>
          <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {t(lang, 'هنوز اعلانی ثبت نشده است.', 'No notifications recorded yet.')}
              </div>
            ) : (
              notifications.map((evt) => (
                <div key={evt.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="font-medium text-slate-700">
                      {evt.recipient === 'both'
                        ? t(lang, 'گیرنده: هر دو طرف', 'To: Both parties')
                        : evt.recipient === 'owner'
                          ? t(lang, 'گیرنده: صاحب پارکینگ', 'To: Bay owner')
                          : evt.recipient === 'manager'
                            ? t(lang, 'گیرنده: مدیر ساختمان', 'To: Building manager')
                            : t(lang, 'گیرنده: رزروکننده', 'To: Guest')}
                    </span>
                    <span className="font-mono tabular-nums">{evt.timestamp}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900">
                    {lang === 'fa' ? evt.titleFa : evt.titleEn}
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {lang === 'fa' ? evt.detailFa : evt.detailEn}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
