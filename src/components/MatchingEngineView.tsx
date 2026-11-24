import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Lock,
  Sliders,
  X,
} from 'lucide-react';
import {
  CandidateEvaluation,
  Community,
  Language,
  OptimizedScheduleOption,
  RankingWeights,
  Reservation,
  Resource,
  ResourceType,
  UserProfile,
} from '../types/parkshare';
import { formatDuration, formatMinutes, resourceTypeLabels, t } from '../i18n/translations';
import { runSmartMatchingPipeline } from '../engines/coreEngine';
import { DEFAULT_RANKING_WEIGHTS } from '../data/seedData';

interface Props {
  lang: Language;
  users: UserProfile[];
  communities: Community[];
  resources: Resource[];
  reservations: Reservation[];
  networkOffline: boolean;
  onBookOption: (option: OptimizedScheduleOption, requester: UserProfile) => { ok: boolean; message: string };
}

const RESOURCE_TYPES: ResourceType[] = ['parking', 'boat_berth', 'storage', 'commercial'];
const TIME_HOURS = Array.from({ length: 19 }, (_, i) => (i + 6) * 60); // 06:00 to 24:00

export const MatchingEngineView: React.FC<Props> = ({
  lang,
  users,
  communities,
  resources,
  reservations,
  networkOffline,
  onBookOption,
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0].id);
  const [resourceType, setResourceType] = useState<ResourceType>('parking');
  const [startMin, setStartMin] = useState<number>(540); // 09:00
  const [endMin, setEndMin] = useState<number>(1260); // 21:00
  const [includeFederated, setIncludeFederated] = useState<boolean>(true);
  const [freeOnly, setFreeOnly] = useState<boolean>(false);
  const [instantApprovalOnly, setInstantApprovalOnly] = useState<boolean>(false);
  const [requireEvOrPower, setRequireEvOrPower] = useState<boolean>(false);
  const [preferredFloor, setPreferredFloor] = useState<string>('B1');
  const [weights, setWeights] = useState<RankingWeights>(DEFAULT_RANKING_WEIGHTS);
  const [showWeights, setShowWeights] = useState<boolean>(false);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const requester = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? users[0],
    [users, selectedUserId]
  );

  const validEndMin = endMin > startMin ? endMin : Math.min(1440, startMin + 60);

  const pipeline = useMemo(() => {
    return runSmartMatchingPipeline(
      {
        requester,
        resourceType,
        startMin,
        endMin: validEndMin,
        includeFederated,
        freeOnly,
        instantApprovalOnly,
        preferredFloor,
        requireEvOrPower,
        requireAccessible: false,
        weights,
        networkOffline,
      },
      resources,
      communities,
      reservations
    );
  }, [
    requester,
    resourceType,
    startMin,
    validEndMin,
    includeFederated,
    freeOnly,
    instantApprovalOnly,
    preferredFloor,
    requireEvOrPower,
    weights,
    networkOffline,
    resources,
    communities,
    reservations,
  ]);

  const handleBook = (option: OptimizedScheduleOption) => {
    const res = onBookOption(option, requester);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const updateWeight = (key: keyof RankingWeights, val: number) => {
    setWeights((prev) => ({ ...prev, [key]: val }));
  };

  const renderPolicyText = (decision: CandidateEvaluation['policy']['decision']) => {
    if (decision === 'Allowed') {
      return (
        <span className="text-emerald-700 font-medium">
          {t(lang, 'مجاز (Allowed)', 'Allowed')}
        </span>
      );
    }
    if (decision === 'Conditional') {
      return (
        <span className="text-amber-700 font-medium">
          {t(lang, 'مشروط (Conditional)', 'Conditional')}
        </span>
      );
    }
    return (
      <span className="text-red-700 font-medium">
        {t(lang, 'ردشده (Rejected)', 'Rejected')}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Core Description */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
            {t(lang, 'موتور تطبیق هوشمند و بهینه‌سازی زمان‌بندی', 'Smart Matching Engine & Scheduling Optimizer')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-3xl">
            {t(
              lang,
              'اجرای زنده خط لوله ۷ موتوره: سیاست دسترسی، محاسبه بازه‌های آزاد، سازگاری ابعاد، امتیازدهی وزن‌دار و زنجیره‌سازی با کمترین جابه‌جایی.',
              'Live 7-engine execution pipeline: policy gating, interval availability, physical compatibility, weighted ranking, and minimal-relocation schedule optimization.'
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowWeights((s) => !s)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 self-start md:self-auto"
        >
          <Sliders className="w-3.5 h-3.5" />
          {t(lang, 'تنظیم وزن‌های امتیازدهی', 'Tune Ranking Weights')}
        </button>
      </div>

      {/* Request Configurator Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        {/* Universal Resource Type Segmented Selector */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {RESOURCE_TYPES.map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() => setResourceType(rt)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  resourceType === rt
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {resourceTypeLabels[rt][lang]}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 font-mono tabular-nums">
            {t(lang, 'منطقه زمانی: Europe/Amsterdam', 'Timezone: Europe/Amsterdam')}
            <span className="mx-2">·</span>
            {t(lang, 'مدت درخواست:', 'Duration:')} {formatDuration(validEndMin - startMin, lang)}
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {t(lang, 'درخواست‌کننده (Who)', 'Requester Profile (Who)')}
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {lang === 'fa' ? u.nameFa : u.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {resourceType === 'boat_berth'
                ? requester.vessel
                  ? `${requester.vessel.type} · ${requester.vessel.lengthM}m × ${requester.vessel.beamM}m · ${t(lang, 'آبخور', 'Draft')} ${requester.vessel.draftM}m`
                  : t(lang, 'شناور پیش‌فرض ۹ متر', 'Default 9.0m motorboat')
                : `${requester.vehicle.type} · ${requester.vehicle.lengthM}m × ${requester.vehicle.widthM}m · H ${requester.vehicle.heightM}m`}
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {t(lang, 'ساعت شروع (When)', 'Start Time (CET)')}
            </label>
            <select
              value={startMin}
              onChange={(e) => {
                const v = Number(e.target.value);
                setStartMin(v);
                if (endMin <= v) setEndMin(Math.min(1440, v + 120));
              }}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {TIME_HOURS.slice(0, -1).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {t(lang, 'ساعت پایان (Until)', 'End Time (CET)')}
            </label>
            <select
              value={validEndMin}
              onChange={(e) => setEndMin(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              {TIME_HOURS.filter((m) => m > startMin).map((m) => (
                <option key={m} value={m}>
                  {formatMinutes(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {t(lang, 'طبقه یا زون ترجیحی', 'Preferred Floor / Zone')}
            </label>
            <select
              value={preferredFloor}
              onChange={(e) => setPreferredFloor(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            >
              <option value="ANY">{t(lang, 'بدون ترجیح خاص', 'Any Floor / Zone')}</option>
              <option value="B1">B1</option>
              <option value="B2">B2</option>
              <option value="G">G (Ground)</option>
              <option value="Dock-A">Dock-A</option>
              <option value="Dock-B">Dock-B</option>
            </select>
          </div>
        </div>

        {/* Hard Filters & Federation Switches */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 pt-3 border-t border-slate-100 text-xs text-slate-700">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeFederated}
              onChange={(e) => setIncludeFederated(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>{t(lang, 'جست‌وجو در شبکه فدرال (Boston + Seattle + Marina)', 'Include Federated Network Nodes')}</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={freeOnly}
              onChange={(e) => setFreeOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>{t(lang, 'فقط رایگان (فیلتر اجباری)', 'Free Only (Hard Filter)')}</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={instantApprovalOnly}
              onChange={(e) => setInstantApprovalOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>{t(lang, 'فقط تأیید خودکار', 'Instant Approval Only')}</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requireEvOrPower}
              onChange={(e) => setRequireEvOrPower(e.target.checked)}
              className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <span>
              {resourceType === 'boat_berth'
                ? t(lang, 'نیازمند برق ساحلی', 'Require Shore Power')
                : resourceType === 'storage'
                  ? t(lang, 'نیازمند تهویه کنترل‌شده', 'Require Climate Control')
                  : t(lang, 'نیازمند شارژر EV', 'Require EV Charging')}
            </span>
          </label>
        </div>

        {/* Collapsible Weights Tuner */}
        {showWeights && (
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-900">
                {t(lang, 'وزن‌های موتور امتیازدهی ترکیبی (Score = Σ wᵢ sᵢ)', 'Ranking Engine Weights (Score = Σ wᵢ sᵢ)')}
              </h3>
              <button
                type="button"
                onClick={() => setWeights(DEFAULT_RANKING_WEIGHTS)}
                className="text-xs text-blue-700 hover:underline"
              >
                {t(lang, 'بازنشانی به پیش‌فرض', 'Reset defaults')}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {(
                [
                  ['continuousDuration', t(lang, 'مدت پیوسته', 'Continuous')],
                  ['freePricing', t(lang, 'رایگان بودن', 'Free Pricing')],
                  ['instantApproval', t(lang, 'تأیید خودکار', 'Auto Approval')],
                  ['preferredFloor', t(lang, 'طبقه ترجیحی', 'Preferred Floor')],
                  ['elevatorProximity', t(lang, 'نزدیکی آسانسور', 'Proximity')],
                  ['lowRecallRisk', t(lang, 'ریسک پایین', 'Low Recall Risk')],
                ] as [keyof RankingWeights, string][]
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-mono tabular-nums font-medium text-slate-900">{weights[key]}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={50}
                    step={5}
                    value={weights[key]}
                    onChange={(e) => updateWeight(key, Number(e.target.value))}
                    className="w-full accent-blue-700"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 7-Engine Pipeline Execution Funnel */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          {
            step: '01',
            title: t(lang, 'موتور سیاست', 'Policy Engine'),
            metric: `${pipeline.filteredSummary.policyAllowedOrConditional} / ${pipeline.filteredSummary.totalScanned}`,
            sub: t(lang, 'مجاز یا مشروط', 'Allowed/Cond.'),
          },
          {
            step: '02',
            title: t(lang, 'دسترس‌پذیری', 'Availability'),
            metric: `${pipeline.filteredSummary.availableForWindow}`,
            sub: t(lang, 'دارای هم‌پوشانی بازه', 'Window overlap'),
          },
          {
            step: '03',
            title: t(lang, 'سازگاری ابعاد', 'Compatibility'),
            metric: `${pipeline.filteredSummary.compatible}`,
            sub: t(lang, 'منطبق با ابعاد', 'Spec matched'),
          },
          {
            step: '04',
            title: t(lang, 'رتبه‌بندی', 'Ranking'),
            metric: `${pipeline.candidates.filter((c) => c.passedHardFilters).length}`,
            sub: t(lang, 'گزینه واجد شرایط', 'Qualified'),
          },
          {
            step: '05',
            title: t(lang, 'بهینه‌ساز', 'Optimizer'),
            metric: `${pipeline.schedules.length}`,
            sub: t(lang, 'برنامه پیوسته/زنجیره‌ای', 'Schedules built'),
          },
          {
            step: '06',
            title: t(lang, 'قفل اتمیک', 'Conflict Guard'),
            metric: t(lang, 'فعال', 'Armed'),
            sub: t(lang, 'بدون تداخل رزرو', 'Zero double-book'),
          },
          {
            step: '07',
            title: t(lang, 'هماهنگی', 'Coordination'),
            metric: networkOffline ? t(lang, 'محلی', 'Local') : t(lang, 'فدرال', 'Federated'),
            sub: networkOffline ? t(lang, 'حالت آفلاین امن', 'Offline safe') : `${pipeline.filteredSummary.federatedScanned} ${t(lang, 'منبع فدرال', 'fed. scanned')}`,
          },
        ].map((stage) => (
          <div
            key={stage.step}
            className="bg-white border border-slate-200 rounded-lg px-3.5 py-3 flex flex-col justify-between"
          >
            <div className="text-xs text-slate-500">
              <span className="font-mono tabular-nums text-slate-400">{stage.step}</span>
              <span className="mx-1.5">·</span>
              <span className="text-slate-700 font-medium">{stage.title}</span>
            </div>
            <div className="mt-2 text-lg font-semibold font-mono tabular-nums text-slate-900">
              {stage.metric}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">{stage.sub}</div>
          </div>
        ))}
      </section>

      {/* Booking Feedback Banner */}
      {feedback && (
        <div
          className={`px-4 py-3 rounded-lg border text-sm flex items-center justify-between gap-4 ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-medium underline shrink-0"
          >
            {t(lang, 'بستن', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Engine 5: Optimized Schedule Recommendations */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            {t(
              lang,
              'پیشنهادهای بهینه‌ساز زمان‌بندی — max(αC + βD − γM − δR)',
              'Scheduling Optimizer Recommendations — max(αC + βD − γM − δR)'
            )}
          </h2>
          <span className="text-xs text-slate-500">
            {t(
              lang,
              'اولویت با یک فضای پیوسته (۰ جابه‌جایی) و سپس زنجیره‌های کم‌جابه‌جایی با رضایت مالک.',
              'Prioritizes single continuous space (0 relocations), then minimal-move chained itineraries.'
            )}
          </span>
        </div>

        {pipeline.schedules.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <p className="text-sm font-medium text-slate-900">
              {t(
                lang,
                'هیچ برنامه مجازی برای این ترکیب کاربر، بازه زمانی و محدودیت‌ها یافت نشد.',
                'No valid schedule matched this combination of user policy, dimensions, and time window.'
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t(
                lang,
                'جدول ممیزی کاندیداها در پایین دقیقاً علت رد شدن هر منبع (سیاست، ارتفاع، زمان یا فیلتر رایگان) را نشان می‌دهد.',
                'Inspect the Candidate Audit Table below to see exact Policy, Compatibility, or Availability rejection reasons.'
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pipeline.schedules.slice(0, 5).map((opt, idx) => {
              const isBest = idx === 0;
              return (
                <div
                  key={opt.id}
                  className={`bg-white border rounded-xl p-5 transition-colors ${
                    isBest ? 'border-blue-600/60' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                        <span className={isBest ? 'font-semibold text-blue-700' : 'font-medium text-slate-700'}>
                          {isBest
                            ? t(lang, 'بهترین پیشنهاد سیستم', 'Top Recommendation')
                            : `${t(lang, 'گزینه', 'Option')} #${idx + 1}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {opt.type === 'continuous'
                            ? t(lang, 'یک فضای پیوسته (۰ جابه‌جایی)', 'Single continuous space (0 relocations)')
                            : t(lang, `زنجیره متوالی (${opt.relocationCount} جابه‌جایی)`, `Chained itinerary (${opt.relocationCount} relocation)`)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-700">
                          {t(lang, 'پوشش:', 'Coverage:')} {Math.round(opt.coverageRatio * 100)}% ({formatDuration(opt.totalCoverageMin, lang)})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums text-slate-900 font-medium">
                          {opt.totalEstimatedEur === 0
                            ? t(lang, 'رایگان (€0)', 'Free (€0)')
                            : `€${opt.totalEstimatedEur.toFixed(2)}`}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {t(lang, 'امتیاز تابع هدف:', 'Objective:')} {opt.objectiveScore}
                        </span>
                      </div>

                      {/* Segment Timeline Visualization */}
                      <div className="space-y-2 pt-1">
                        {opt.segments.map((seg, sIdx) => {
                          const totalSpan = Math.max(1, validEndMin - startMin);
                          const leftPct = Math.max(0, ((seg.startMin - startMin) / totalSpan) * 100);
                          const widthPct = Math.min(100 - leftPct, ((seg.endMin - seg.startMin) / totalSpan) * 100);
                          return (
                            <div key={`${seg.resource.id}-${sIdx}`} className="space-y-1">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-2 font-medium text-slate-900">
                                  <span className="font-mono text-blue-800">{seg.resource.code}</span>
                                  <span>{lang === 'fa' ? seg.resource.titleFa : seg.resource.title}</span>
                                  {seg.isFederated && (
                                    <span className="text-xs font-normal text-slate-500">
                                      — {t(lang, 'فدرال از', 'Federated via')} {lang === 'fa' ? seg.community.nameFa : seg.community.name}
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono tabular-nums text-xs text-slate-600">
                                  {formatMinutes(seg.startMin)} – {formatMinutes(seg.endMin)}
                                  <span className="mx-1.5">·</span>
                                  {seg.resource.approvalMode === 'automatic'
                                    ? t(lang, 'تأیید خودکار', 'Auto-confirm')
                                    : t(lang, 'نیازمند تأیید مالک', 'Owner approval')}
                                </div>
                              </div>
                              <div className="h-2.5 w-full bg-slate-100 rounded-sm relative overflow-hidden" dir="ltr">
                                <div
                                  className={`h-full rounded-sm ${
                                    seg.isFederated
                                      ? 'bg-indigo-600'
                                      : opt.type === 'continuous'
                                        ? 'bg-blue-700'
                                        : sIdx === 0
                                          ? 'bg-blue-700'
                                          : 'bg-teal-600'
                                  }`}
                                  style={{
                                    marginLeft: `${leftPct}%`,
                                    width: `${Math.max(4, widthPct)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 lg:border-s lg:border-slate-100 lg:ps-5">
                      <button
                        type="button"
                        onClick={() => handleBook(opt)}
                        className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                          isBest
                            ? 'bg-blue-700 text-white hover:bg-blue-800'
                            : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {opt.requiresManualApproval
                          ? t(lang, 'ارسال درخواست رزرو', 'Request Approval')
                          : t(lang, 'رزرو اتمیک قطعی', 'Confirm Atomic Booking')}
                        <ArrowRight className={`w-3.5 h-3.5 ${lang === 'fa' ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Candidate Audit Matrix (Engines 1 - 4 Transparency) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {t(lang, 'جدول ممیزی منابع اسکن‌شده (Policy · Availability · Compatibility · Ranking)', 'Scanned Resource Audit Matrix (Engines 1–4)')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              lang,
              'روی هر ردیف کلیک کنید تا قوانین بررسی‌شده، سازگاری ابعاد و ریز امتیازدهی (با حفظ حریم خصوصی ریسک مالک) نمایش داده شود.',
              'Click any row to inspect Policy Engine rules, Compatibility dimensions, and weighted score breakdown.'
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs text-slate-600 font-medium">
                <th className="py-3 px-4 text-start">{t(lang, 'منبع / مجموعه', 'Resource / Node')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'موتور سیاست', 'Policy')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'سازگاری ابعاد', 'Compatibility')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'هم‌پوشانی آزاد', 'Free Overlap')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'هزینه', 'Pricing')}</th>
                <th className="py-3 px-4 text-end">{t(lang, 'امتیاز', 'Score')}</th>
                <th className="py-3 px-4 text-end">{t(lang, 'جزئیات', 'Trace')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pipeline.candidates.map((c) => {
                const isExpanded = expandedCandidateId === c.resource.id;
                return (
                  <React.Fragment key={c.resource.id}>
                    <tr
                      onClick={() => setExpandedCandidateId(isExpanded ? null : c.resource.id)}
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                        !c.passedHardFilters ? 'text-slate-500 bg-slate-50/40' : 'text-slate-900'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-700">{c.resource.code}</span>
                          <span>{lang === 'fa' ? c.resource.titleFa : c.resource.title}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {lang === 'fa' ? c.community.nameFa : c.community.name}
                          {c.isFederated && (
                            <>
                              <span className="mx-1.5">·</span>
                              <span className="text-indigo-700">{t(lang, 'فدرال', 'Federated')}</span>
                            </>
                          )}
                          {!c.passedHardFilters && c.hardFilterReason && (
                            <>
                              <span className="mx-1.5">·</span>
                              <span className="text-red-700">{c.hardFilterReason}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">{renderPolicyText(c.policy.decision)}</td>
                      <td className="py-3 px-4 text-xs">
                        {c.compatibility.compatible ? (
                          <span className="text-emerald-700 font-medium">{t(lang, 'سازگار', 'Compatible')}</span>
                        ) : (
                          <span className="text-red-700 font-medium">{t(lang, 'ناسازگار', 'Incompatible')}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums">
                        {c.maxContinuousOverlapMin > 0
                          ? formatDuration(c.maxContinuousOverlapMin, lang)
                          : t(lang, '۰ دقیقه', '0m')}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono tabular-nums">
                        {c.resource.pricing.isFree
                          ? t(lang, 'رایگان', 'Free')
                          : `€${c.resource.pricing.hourlyEur.toFixed(2)}/h`}
                      </td>
                      <td className="py-3 px-4 text-end font-mono tabular-nums font-semibold">
                        {c.passedHardFilters ? c.score.toFixed(1) : '—'}
                      </td>
                      <td className="py-3 px-4 text-end">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 inline text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 inline text-slate-400" />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={7} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                            {/* Policy Trace */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-slate-900">
                                {t(lang, '۱. بررسی‌های Policy Engine', '1. Policy Engine Checks')}
                              </h4>
                              <ul className="space-y-1.5">
                                {c.policy.checks.map((chk, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    {chk.passed ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    ) : (
                                      <X className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                                    )}
                                    <div>
                                      <span className="font-medium text-slate-800">{chk.rule}:</span>{' '}
                                      <span className="text-slate-600">{chk.detail}</span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Compatibility Trace */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-slate-900">
                                {t(lang, '۳. بررسی‌های Compatibility Engine', '3. Compatibility Checks')}
                              </h4>
                              <ul className="space-y-1.5">
                                {c.compatibility.checks.map((chk, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    {chk.passed ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                    ) : (
                                      <X className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                                    )}
                                    <div className="font-mono tabular-nums">
                                      <span className="font-sans font-medium text-slate-800">{chk.criterion}:</span>{' '}
                                      <span className="text-slate-600">
                                        {chk.actual} ({t(lang, 'نیاز', 'req')} {chk.required})
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Score Breakdown & Privacy Masking */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-slate-900">
                                {t(lang, '۴. ریز امتیازدهی Ranking Engine', '4. Ranking Breakdown')}
                              </h4>
                              <div className="space-y-1 font-mono tabular-nums text-slate-700">
                                <div className="flex justify-between">
                                  <span className="font-sans text-slate-600">{t(lang, 'پوشش پیوسته', 'Continuous')}</span>
                                  <span>{c.scoreBreakdown.continuousDuration}/100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-sans text-slate-600">{t(lang, 'رایگان بودن', 'Free Pricing')}</span>
                                  <span>{c.scoreBreakdown.freePricing}/100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-sans text-slate-600">{t(lang, 'تأیید خودکار', 'Auto Approval')}</span>
                                  <span>{c.scoreBreakdown.instantApproval}/100</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="font-sans text-slate-600">{t(lang, 'طبقه ترجیحی', 'Preferred Floor')}</span>
                                  <span>{c.scoreBreakdown.preferredFloor}/100</span>
                                </div>
                                <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                                  <span className="font-sans text-slate-600">{t(lang, 'احتمال نیاز فوری مالک', 'Owner Recall Risk')}</span>
                                  {c.scoreBreakdown.recallRiskMasked ? (
                                    <span className="inline-flex items-center gap-1 font-sans text-slate-500">
                                      <Lock className="w-3 h-3" />
                                      {t(lang, 'مخفی (استفاده داخلی)', 'Private (internal only)')}
                                    </span>
                                  ) : (
                                    <span>{c.scoreBreakdown.lowRecallRisk}/100</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
