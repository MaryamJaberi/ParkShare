import React, { useMemo, useState } from 'react';
import { Anchor, Car, Compass, MapPin, Shield } from 'lucide-react';
import {
  CityMapResource,
  CityResourceCategory,
  Community,
  DemandTimeSlot,
  Language,
  RouteWeights,
} from '../types/parkshare';
import { evaluateRouteMatching } from '../engines/coreEngine';
import { t } from '../i18n/translations';

interface Props {
  lang: Language;
  cityResources: CityMapResource[];
  demandSlots: DemandTimeSlot[];
  communities: Community[];
}

const CATEGORY_LABELS: Record<CityResourceCategory, { fa: string; en: string; color: string }> = {
  public: { fa: 'عمومی شهری', en: 'Public', color: '#0F4C81' },
  commercial: { fa: 'تجاری', en: 'Commercial', color: '#475569' },
  shared: { fa: 'اشتراکی فدرال', en: 'Federated Shared', color: '#15803D' },
  workplace: { fa: 'پارکینگ شرکتی', en: 'Workplace', color: '#0369A1' },
  ev: { fa: 'شارژ EV', en: 'EV Charging', color: '#0D9488' },
  residential: { fa: 'مسکونی خصوصی', en: 'Private Residential', color: '#B91C1C' },
  private: { fa: 'شخصی', en: 'Private', color: '#7C3AED' },
  marina: { fa: 'جایگاه قایق', en: 'Boat Berth', color: '#1D4ED8' },
};

export const CityMobilityView: React.FC<Props> = ({
  lang,
  cityResources,
  demandSlots,
  communities,
}) => {
  const [weights, setWeights] = useState<RouteWeights>({
    detourTime: 25,
    price: 35,
    walkDistance: 25,
    uncertainty: 15,
  });
  const [parkHours, setParkHours] = useState<number>(8);
  const [categoryFilter, setCategoryFilter] = useState<CityResourceCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>('city-4');

  const filteredResources = useMemo(() => {
    if (categoryFilter === 'all') return cityResources;
    return cityResources.filter((r) => r.category === categoryFilter);
  }, [cityResources, categoryFilter]);

  const ranked = useMemo(
    () => evaluateRouteMatching(filteredResources, weights, parkHours),
    [filteredResources, weights, parkHours]
  );

  const bestOptionId = ranked.find((r) => r.eligible)?.resource.id;
  const selectedRanked = ranked.find((r) => r.resource.id === selectedId) ?? ranked[0];

  const consentedCommunitiesCount = communities.filter((c) => c.consentDemandAnalytics).length;
  const maxDemand = Math.max(...demandSlots.map((d) => d.requests), 120);

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {t(lang, 'شبکه شهری اروپا، تطبیق بر اساس مسیر و نقشه تقاضا', 'Level 3 — City Route-Aware Matching & Demand Heatmap')}
        </h1>
        <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
          {t(
            lang,
            'تطبیق منابع در امتداد مسیر روتردام به مرکز آمستردام با تابع هزینه Cost = aT + bP + cW + dU و تفکیک سه‌گانه آزاد بودن، قابلیت رزرو و مجوز ورود.',
            'Route-aware discovery along the Rotterdam → Amsterdam corridor optimizing Cost = aT + bP + cW + dU while separating availability, reservability, and access permission.'
          )}
        </p>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              categoryFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t(lang, 'همه منابع مسیر', 'All Corridor Resources')}
          </button>
          {(['shared', 'workplace', 'commercial', 'public', 'ev', 'marina', 'residential'] as CityResourceCategory[]).map(
            (cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  categoryFilter === cat ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {CATEGORY_LABELS[cat][lang]}
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span>{t(lang, 'مدت پارک در مقصد:', 'Parking Duration:')}</span>
          <select
            value={parkHours}
            onChange={(e) => setParkHours(Number(e.target.value))}
            className="px-2.5 py-1.5 font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900"
          >
            {[2, 4, 6, 8, 10, 12].map((h) => (
              <option key={h} value={h}>
                {h}h
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Interactive Corridor Map + Route Cost Tuner */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Vector Corridor Map */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Compass className="w-4 h-4 text-blue-700" />
              <span>{t(lang, 'مسیر مبدأ تا مقصد: روتردام (خانه) ← آمستردام مرکزی (محل کار)', 'Corridor: Rotterdam Home → Amsterdam Centraal')}</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {t(lang, 'رسیدن تخمینی: ۰۹:۰۰ CET · ۷۴ کیلومتر', 'ETA: 09:00 CET · 74 km')}
            </span>
          </div>

          <div className="relative w-full rounded-lg border border-slate-200 bg-slate-50 overflow-hidden" dir="ltr">
            <svg viewBox="0 0 1000 500" className="w-full h-auto block">
              {/* Architectural Grid */}
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#E2E8F0" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="1000" height="500" fill="url(#grid)" />

              {/* Stylized Dutch Coastline / Waterways */}
              <path
                d="M 0 130 Q 190 120 350 90 T 720 65 T 1000 55 L 1000 0 L 0 0 Z"
                fill="#E0F2FE"
                opacity="0.55"
              />
              <path
                d="M 40 460 Q 170 420 260 445 T 480 470"
                fill="none"
                stroke="#BAE6FD"
                strokeWidth="18"
                strokeLinecap="round"
              />
              <path
                d="M 750 110 Q 840 90 950 72"
                fill="none"
                stroke="#BAE6FD"
                strokeWidth="16"
                strokeLinecap="round"
              />

              {/* Highway Corridor Route (A13 / A4 / A10) */}
              <path
                d="M 140 435 C 230 390, 290 355, 340 325 C 420 280, 480 250, 560 215 C 650 175, 740 155, 845 115"
                fill="none"
                stroke="#1D4ED8"
                strokeWidth="4.5"
                strokeDasharray="10 6"
                opacity="0.7"
              />

              {/* City Labels */}
              <text x="110" y="468" className="fill-slate-500 text-[12px] font-semibold">Rotterdam (Origin)</text>
              <text x="285" y="382" className="fill-slate-400 text-[11px]">Delft</text>
              <text x="468" y="286" className="fill-slate-400 text-[11px]">Leiden</text>
              <text x="775" y="148" className="fill-slate-600 text-[12px] font-semibold">Amsterdam (Dest)</text>

              {/* Resource Markers */}
              {ranked.map((item) => {
                const r = item.resource;
                const isBest = r.id === bestOptionId;
                const isSelected = r.id === selectedRanked?.resource.id;
                const color = CATEGORY_LABELS[r.category].color;

                return (
                  <g
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="cursor-pointer"
                  >
                    {isBest && (
                      <circle
                        cx={r.x}
                        cy={r.y}
                        r={22}
                        fill="#1D4ED8"
                        opacity="0.14"
                      />
                    )}
                    <circle
                      cx={r.x}
                      cy={r.y}
                      r={isSelected ? 12 : 9.5}
                      fill={r.accessAllowed ? color : '#94A3B8'}
                      stroke={isSelected ? '#0F172A' : '#FFFFFF'}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text
                      x={r.x + 15}
                      y={r.y + 4}
                      className="fill-slate-800 text-[11px] font-medium"
                    >
                      {r.city === 'Amsterdam' ? r.name.replace('Amsterdam ', '') : r.name.split('·')[0]}
                      {isBest ? ' ★' : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Resource Inspector Strip (Section 12.1: Separate Available / Reservable / Access Allowed) */}
          {selectedRanked && (
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  {selectedRanked.resource.resourceType === 'boat_berth' ? (
                    <Anchor className="w-4 h-4 text-blue-700" />
                  ) : (
                    <Car className="w-4 h-4 text-blue-700" />
                  )}
                  <span>{lang === 'fa' ? selectedRanked.resource.nameFa : selectedRanked.resource.name}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {t(lang, 'منبع داده:', 'Data Source:')} {selectedRanked.resource.source}
                  <span className="mx-1.5">·</span>
                  <span className="font-mono tabular-nums">
                    {selectedRanked.resource.freeSpots}/{selectedRanked.resource.totalSpots} {t(lang, 'ظرفیت آزاد', 'free')}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-500">{t(lang, 'موجودی:', 'Available:')} </span>
                  <span className={selectedRanked.resource.availableNow ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                    {selectedRanked.resource.availableNow ? t(lang, 'بله', 'Yes') : t(lang, 'خیر', 'No')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">{t(lang, 'قابل رزرو:', 'Reservable:')} </span>
                  <span className={selectedRanked.resource.reservable ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                    {selectedRanked.resource.reservable ? t(lang, 'بله', 'Yes') : t(lang, 'فقط حضوری', 'Walk-in only')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">{t(lang, 'مجوز ورود:', 'Access:')} </span>
                  <span className={selectedRanked.resource.accessAllowed ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                    {selectedRanked.resource.accessAllowed ? t(lang, 'مجاز', 'Allowed') : t(lang, 'محدود به ساکنان', 'Residents only')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Route Cost Weights & Ranked Options */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {t(lang, 'ترجیحات تابع هزینه مسیر — Cost = aT + bP + cW + dU', 'Route Cost Function — Cost = aT + bP + cW + dU')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(lang, 'وزن کمتر بودن هزینه یا زمان مسیر را تغییر دهید تا بهترین توقفگاه به‌روز شود.', 'Adjust trade-offs between detour time, price, walk distance, and certainty.')}
              </p>
            </div>

            <div className="space-y-3">
              {(
                [
                  ['detourTime', t(lang, 'a · زمان اضافه مسیر (T)', 'a · Detour Time (T)')],
                  ['price', t(lang, 'b · هزینه پارکینگ (P)', 'b · Parking Price (P)')],
                  ['walkDistance', t(lang, 'c · پیاده‌روی تا مقصد (W)', 'c · Walk Distance (W)')],
                  ['uncertainty', t(lang, 'd · عدم قطعیت موجودی (U)', 'd · Uncertainty Risk (U)')],
                ] as [keyof RouteWeights, string][]
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-700">{label}</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">{weights[key]}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={5}
                    value={weights[key]}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                    className="w-full accent-blue-700"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Ranked List */}
          <div className="border-t border-slate-100 pt-4 space-y-2 max-h-[260px] overflow-y-auto">
            {ranked.map((item, idx) => (
              <button
                key={item.resource.id}
                type="button"
                onClick={() => setSelectedId(item.resource.id)}
                className={`w-full text-start p-2.5 rounded-lg border transition-colors ${
                  selectedRanked?.resource.id === item.resource.id
                    ? 'border-blue-600 bg-blue-50/40'
                    : 'border-slate-100 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-900 truncate">
                    {item.eligible ? `#${idx + 1} ` : ''}
                    {lang === 'fa' ? item.resource.nameFa : item.resource.name}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-blue-800 shrink-0">
                    {item.eligible ? `${item.totalCostScore}` : t(lang, 'غیرمجاز', 'Blocked')}
                  </span>
                </div>
                <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 flex items-center gap-2">
                  <span>+{item.resource.detourMinutes}m {t(lang, 'مسیر', 'detour')}</span>
                  <span>·</span>
                  <span>€{item.estimated8hEur.toFixed(1)}/{parkHours}h</span>
                  <span>·</span>
                  <span>{item.resource.walkMinutesToDest}m {t(lang, 'پیاده', 'walk')}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 12.3: Privacy-Preserving Parking Demand Heatmap */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {t(lang, 'نقشه تقاضای تجمیعی و ناشناس پارکینگ (Demand Heatmap)', 'Aggregated Privacy-Preserving Demand Heatmap')}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(
                lang,
                'تحلیل تقاضای ساعتی بدون قابلیت ردیابی الگوی رفت‌وآمد فردی و صرفاً از مجموعه‌هایی که رضایت تحلیل تجمیعی داده‌اند.',
                'Hourly demand vs. idle capacity computed strictly from consented communities with zero individual trip traceability.'
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
            <Shield className="w-4 h-4 text-emerald-700" />
            <span className="font-mono tabular-nums">
              {consentedCommunitiesCount}/{communities.length} {t(lang, 'مجموعه دارای رضایت تحلیل', 'consented nodes')}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-2">
          {demandSlots.map((slot) => {
            const reqHeight = Math.round((slot.requests / maxDemand) * 100);
            const idleHeight = Math.round((slot.idleCapacity / maxDemand) * 100);
            const shortageColor =
              slot.shortageIndex >= 0.75
                ? 'text-red-700'
                : slot.shortageIndex >= 0.5
                  ? 'text-amber-700'
                  : 'text-emerald-700';

            return (
              <div key={slot.slot} className="border border-slate-200 rounded-lg p-3.5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-slate-900">{slot.slot}</span>
                  <span className={`font-mono tabular-nums font-medium ${shortageColor}`}>
                    {Math.round(slot.shortageIndex * 100)}%
                  </span>
                </div>

                {/* Bar Pair */}
                <div className="h-24 flex items-end gap-2 pt-2 border-b border-slate-100">
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full bg-blue-700 rounded-t-xs transition-all"
                      style={{ height: `${Math.max(8, reqHeight)}%` }}
                    />
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      className="w-full bg-emerald-200 border border-emerald-400/70 rounded-t-xs transition-all"
                      style={{ height: `${Math.max(8, idleHeight)}%` }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
                  <span>{slot.requests} {t(lang, 'تقاضا', 'req')}</span>
                  <span>{slot.idleCapacity} {t(lang, 'آزاد', 'idle')}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-500 pt-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-blue-700" />
            {t(lang, 'درخواست‌های تجمیعی', 'Aggregated requests')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-2.5 rounded-xs bg-emerald-200 border border-emerald-400" />
            {t(lang, 'ظرفیت بلااستفاده', 'Idle shared capacity')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {t(lang, 'شاخص کمبود منطقه‌ای (درصد سمت چپ/راست هر کارت)', 'Regional shortage index shown per window')}
          </span>
        </div>
      </section>
    </div>
  );
};
