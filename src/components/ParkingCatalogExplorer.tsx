import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Eye,
  Power,
  RotateCcw,
  Search,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  Community,
  Language,
  ParkingCategory,
  ParkingLifecycleStatus,
  Resource,
} from '../types/parkshare';
import { BOSTON_SCENARIOS } from '../data/bostonSampleDataset';
import { formatMinutes, t } from '../i18n/translations';

interface Props {
  lang: Language;
  community: Community;
  resources: Resource[];
  onToggleResourceActive: (resourceId: string) => void;
}

export const CATEGORY_LABELS: Record<ParkingCategory, { fa: string; en: string }> = {
  standard: { fa: 'عادی', en: 'Standard' },
  wide: { fa: 'عریض / SUV', en: 'Wide / SUV' },
  compact: { fa: 'کوچک', en: 'Compact' },
  motorcycle: { fa: 'موتورسیکلت', en: 'Motorcycle' },
  tandem: { fa: 'دوگانه (پشت‌سرهم)', en: 'Tandem (2 cars)' },
  accessible: { fa: 'مناسب معلولین', en: 'Accessible' },
  ev: { fa: 'برقی (EV)', en: 'EV Charger' },
  guest: { fa: 'پارکینگ مهمان', en: 'Guest' },
  storage_combo: { fa: 'انبار / ترکیبی', en: 'Storage Combo' },
};

const LIFECYCLE_LABELS: Record<ParkingLifecycleStatus, { fa: string; en: string; cls: string }> = {
  active: { fa: 'فعال و قابل رزرو', en: 'Active', cls: 'text-emerald-700' },
  inactive: { fa: 'غیرفعال', en: 'Inactive', cls: 'text-slate-500' },
  pending_approval: { fa: 'در انتظار تأیید', en: 'Pending Approval', cls: 'text-amber-700' },
  pending_owner_activation: { fa: 'منتظر فعال‌سازی مالک', en: 'Awaiting Owner', cls: 'text-amber-700' },
  reserved: { fa: 'رزرو شده', en: 'Reserved', cls: 'text-blue-700' },
  in_use: { fa: 'در حال استفاده', en: 'In Use', cls: 'text-blue-700' },
  maintenance: { fa: 'در تعمیرات', en: 'Maintenance', cls: 'text-red-700' },
  blocked: { fa: 'مسدود', en: 'Blocked', cls: 'text-red-700' },
  under_review: { fa: 'نیازمند بررسی', en: 'Under Review', cls: 'text-amber-800' },
};

const OWNERSHIP_LABELS = {
  private: { fa: 'خصوصی (متعلق به واحد)', en: 'Private (Unit-owned)' },
  shared: { fa: 'اشتراکی مجموعه', en: 'Shared Pool' },
  building_managed: { fa: 'مدیریت ساختمان (اختصاصی)', en: 'Building-Managed' },
  guest: { fa: 'مدیریت ساختمان (مهمان)', en: 'Building Guest Bay' },
};

const ENTRY_LABELS = {
  app: { fa: 'اپلیکیشن', en: 'App' },
  card: { fa: 'کارت تردد', en: 'Access Card' },
  remote: { fa: 'ریموت', en: 'Remote' },
  key: { fa: 'کلید', en: 'Key' },
  pin_code: { fa: 'کد ورود موقت', en: 'Temp PIN' },
};

export const ParkingCatalogExplorer: React.FC<Props> = ({
  lang,
  community,
  resources,
  onToggleResourceActive,
}) => {
  const [search, setSearch] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('ALL');
  const [floorFilter, setFloorFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [pricingFilter, setPricingFilter] = useState<'ALL' | 'FREE' | 'PAID' | 'AUTO' | 'MANUAL'>('ALL');
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [showSchemaTables, setShowSchemaTables] = useState(false);

  const availableBlocks = useMemo(() => {
    const set = new Set<string>();
    resources.forEach((r) => {
      if (r.spaceMeta?.block) set.add(r.spaceMeta.block);
    });
    return Array.from(set).sort();
  }, [resources]);

  const availableFloors = useMemo(() => {
    const set = new Set<string>(community.floors);
    resources.forEach((r) => set.add(r.floorOrZone));
    return Array.from(set);
  }, [community.floors, resources]);

  const activeFiltersCount =
    (search.trim() ? 1 : 0) +
    (blockFilter !== 'ALL' ? 1 : 0) +
    (floorFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (statusFilter !== 'ALL' ? 1 : 0) +
    (pricingFilter !== 'ALL' ? 1 : 0);

  const resetAllFilters = () => {
    setSearch('');
    setBlockFilter('ALL');
    setFloorFilter('ALL');
    setCategoryFilter('ALL');
    setStatusFilter('ALL');
    setPricingFilter('ALL');
  };

  const filteredResources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      const cat: ParkingCategory =
        r.spaceMeta?.category ?? (r.evCharging ? 'ev' : r.accessible ? 'accessible' : 'standard');
      const status: ParkingLifecycleStatus =
        r.lifecycleStatus ?? (r.active && r.sharingEnabled ? 'active' : 'pending_owner_activation');

      if (blockFilter !== 'ALL' && r.spaceMeta?.block !== blockFilter) return false;
      if (floorFilter !== 'ALL' && r.floorOrZone !== floorFilter) return false;
      if (categoryFilter !== 'ALL' && cat !== categoryFilter) return false;
      if (statusFilter === 'ACTIVE' && !(r.active && r.sharingEnabled)) return false;
      if (statusFilter === 'INACTIVE' && r.active && r.sharingEnabled) return false;
      if (statusFilter === 'PENDING_OWNER' && status !== 'pending_owner_activation') return false;
      if (statusFilter === 'UNDER_REVIEW' && status !== 'under_review') return false;
      if (pricingFilter === 'FREE' && !r.pricing.isFree) return false;
      if (pricingFilter === 'PAID' && r.pricing.isFree) return false;
      if (pricingFilter === 'AUTO' && r.approvalMode !== 'automatic') return false;
      if (pricingFilter === 'MANUAL' && r.approvalMode !== 'manual') return false;

      if (q) {
        const hay = [
          r.code,
          r.floorOrZone,
          r.spaceMeta?.block ?? '',
          r.spaceMeta?.locationNoteFa ?? '',
          r.spaceMeta?.locationNoteEn ?? '',
          r.spaceMeta?.suitableForFa ?? '',
          r.titleFa,
          r.title,
          r.features?.evPowerKw ? `${r.features.evPowerKw}kw` : '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [resources, search, blockFilter, floorFilter, categoryFilter, statusFilter, pricingFilter]);

  const inspectedResource = useMemo(
    () => (inspectedId ? resources.find((r) => r.id === inspectedId) ?? null : null),
    [resources, inspectedId]
  );

  const hasScenarioTags = useMemo(() => resources.some((r) => Boolean(r.scenarioTag)), [resources]);

  const handleSelectScenario = (bayCode: string) => {
    const match = resources.find((r) => r.code.toUpperCase() === bayCode.toUpperCase());
    if (match) {
      setInspectedId(match.id);
    }
  };

  if (resources.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
        <div className="text-sm font-semibold text-slate-900">
          {t(lang, 'هنوز پارکینگی در این ساختمان ثبت نشده است', 'No Parking Bays Registered Yet')}
        </div>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          {t(
            lang,
            'از تب «لیست مجاز ساکنان» جایگاه‌ها را اضافه کنید یا دیتاست نمونه ۴۰ پارکینگی Boston Residence را بارگذاری نمایید.',
            'Add bays from the Resident Whitelist tab or load the 40-bay Boston Residence test dataset.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Complex Summary Strip (Boston Residence 800-space breakdown) */}
      {community.capacitySummary && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {t(lang, 'نمای کلی ظرفیت مجتمع', 'Complex Capacity Overview')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {community.blocks?.length ?? 6} {t(lang, 'بلوک', 'blocks')} · {community.floors.length}{' '}
                {t(lang, 'طبقه زیرزمین', 'basement floors')}
                {community.capacitySummary.exampleCode ? (
                  <>
                    {' · '}
                    <span className="font-mono text-slate-700">{community.capacitySummary.exampleCode}</span>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSchemaTables((prev) => !prev)}
              className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <Database className="w-3.5 h-3.5 text-blue-700" />
              {showSchemaTables
                ? t(lang, 'بستن معماری جداول', 'Hide DB Model')
                : t(lang, 'ساختار ۱۰ جدول دیتابیس', '10-Table DB Model')}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div>
              <div className="text-slate-500">{t(lang, 'کل ظرفیت', 'Total')}</div>
              <div className="font-mono tabular-nums font-bold text-slate-900 text-lg mt-0.5">
                {community.capacitySummary.totalSpaces}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t(lang, 'مسکونی', 'Residential')}</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 text-lg mt-0.5">
                {community.capacitySummary.residentialSpaces}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t(lang, 'مهمان', 'Guest')}</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 text-lg mt-0.5">
                {community.capacitySummary.guestSpaces}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t(lang, 'عمومی / اشتراکی', 'Shared / Public')}</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 text-lg mt-0.5">
                {community.capacitySummary.sharedPublicSpaces}
              </div>
            </div>
            <div>
              <div className="text-slate-500">{t(lang, 'ویژه', 'Special')}</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 text-lg mt-0.5">
                {community.capacitySummary.specialSpaces}
              </div>
            </div>
          </div>

          {showSchemaTables && (
            <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              {[
                ['Buildings', t(lang, 'ساختمان‌ها و بلوک‌ها', 'Buildings & blocks')],
                ['ParkingSpaces', t(lang, 'ابعاد و مشخصات فیزیکی', 'Physical dimensions')],
                ['ParkingOwners', t(lang, 'مالکیت و فعال‌سازی', 'Ownership & state')],
                ['ParkingFeatures', t(lang, 'شارژر EV، دوربین، آسانسور', 'EV, camera, elevator')],
                ['ParkingAccessRules', t(lang, 'مجوز، تأیید و روش ورود', 'Permits & entry')],
                ['ParkingAvailability', t(lang, 'ساعات آزاد و مسدود', 'Open windows')],
                ['Bookings', t(lang, 'رزروها و تاریخچه', 'Reservations')],
                ['PricingRules', t(lang, 'نرخ ساعتی و شارژ', 'Pricing & EV fees')],
                ['ParkingImages', t(lang, 'تصاویر ورودی و جایگاه', 'Bay photos')],
                ['ParkingReports', t(lang, 'گزارش خرابی و امتیازها', 'Reports & ratings')],
              ].map(([tbl, desc]) => (
                <div key={tbl} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="font-mono font-semibold text-blue-800">{tbl}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 5 Interactive Test Scenarios (Horizontal snap carousel on mobile, 5-col grid on desktop) */}
      {hasScenarioTags && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Sparkles className="w-3.5 h-3.5 text-blue-700" />
              <span>{t(lang, '۵ سناریوی آماده برای بررسی سریع', '5 Ready-to-Test Scenarios')}</span>
            </div>
            <span className="text-[11px] text-slate-400 lg:hidden">
              {t(lang, 'بکشید ←', 'Swipe →')}
            </span>
          </div>

          <div className="flex lg:grid lg:grid-cols-5 gap-2.5 overflow-x-auto lg:overflow-visible snap-x snap-mandatory no-scrollbar pb-1">
            {BOSTON_SCENARIOS.map((sc) => {
              const isSelected = inspectedResource?.code === sc.bayCode;
              return (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => handleSelectScenario(sc.bayCode)}
                  className={`snap-start shrink-0 w-[235px] lg:w-auto p-3.5 rounded-2xl border text-start transition-colors space-y-1 ${
                    isSelected
                      ? 'bg-blue-50 border-blue-600'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-blue-700">{sc.bayCode}</span>
                    <span className="text-[11px] text-slate-500">{t(lang, 'جزئیات', 'Inspect')}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900">
                    {lang === 'fa' ? sc.titleFa : sc.titleEn}
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                    {lang === 'fa' ? sc.descFa : sc.descEn}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Catalog Card: Search, Filters + Desktop Table / Mobile Cards */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {t(
                lang,
                `بانک پارکینگ‌ها (${filteredResources.length} از ${resources.length})`,
                `Parking Catalog (${filteredResources.length} of ${resources.length})`
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {t(lang, 'روی هر پارکینگ بزنید تا تمام مشخصات (الف تا ط) باز شود.', 'Select any bay to open its full A–I specification sheet.')}
            </p>
          </div>

          {activeFiltersCount > 0 && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t(lang, `پاک کردن فیلترها (${activeFiltersCount})`, `Reset Filters (${activeFiltersCount})`)}
            </button>
          )}
        </div>

        {/* Multi-Facet Filter Bar (44px inputs for mobile ergonomics) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute top-3.5 start-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'جستجو (P1-004، 22kW، آسانسور...)', 'Search P1-004, 22kW...')}
              className="w-full h-11 ps-9 pe-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
            />
          </div>

          {availableBlocks.length > 0 && (
            <select
              aria-label={t(lang, 'فیلتر بلوک', 'Filter by block')}
              value={blockFilter}
              onChange={(e) => setBlockFilter(e.target.value)}
              className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-800"
            >
              <option value="ALL">{t(lang, 'همه بلوک‌ها', 'All Blocks')}</option>
              {availableBlocks.map((b) => (
                <option key={b} value={b}>
                  {t(lang, `بلوک ${b}`, `Block ${b}`)}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label={t(lang, 'فیلتر طبقه', 'Filter by floor')}
            value={floorFilter}
            onChange={(e) => setFloorFilter(e.target.value)}
            className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="ALL">{t(lang, 'همه طبقات', 'All Floors')}</option>
            {availableFloors.map((f) => (
              <option key={f} value={f}>
                {t(lang, `طبقه ${f}`, `Floor ${f}`)}
              </option>
            ))}
          </select>

          <select
            aria-label={t(lang, 'فیلتر نوع پارکینگ', 'Filter by bay type')}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="ALL">{t(lang, 'همه انواع پارکینگ', 'All Types')}</option>
            {(Object.keys(CATEGORY_LABELS) as ParkingCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {t(lang, CATEGORY_LABELS[cat].fa, CATEGORY_LABELS[cat].en)}
              </option>
            ))}
          </select>

          <select
            aria-label={t(lang, 'فیلتر وضعیت', 'Filter by status')}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="ALL">{t(lang, 'همه وضعیت‌ها', 'All Statuses')}</option>
            <option value="ACTIVE">{t(lang, 'فقط فعال', 'Active only')}</option>
            <option value="INACTIVE">{t(lang, 'غیرفعال / منتظر', 'Inactive / Pending')}</option>
            <option value="PENDING_OWNER">{t(lang, 'منتظر فعال‌سازی مالک', 'Awaiting Owner')}</option>
            <option value="UNDER_REVIEW">{t(lang, 'نیازمند بررسی', 'Under Review')}</option>
          </select>

          <select
            aria-label={t(lang, 'فیلتر قیمت و تأیید', 'Filter by pricing and approval')}
            value={pricingFilter}
            onChange={(e) => setPricingFilter(e.target.value as typeof pricingFilter)}
            className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-800"
          >
            <option value="ALL">{t(lang, 'قیمت و تأیید: همه', 'Price & Approval: All')}</option>
            <option value="FREE">{t(lang, 'فقط رایگان', 'Free only')}</option>
            <option value="PAID">{t(lang, 'فقط پولی', 'Paid only')}</option>
            <option value="AUTO">{t(lang, 'رزرو خودکار', 'Auto-booking')}</option>
            <option value="MANUAL">{t(lang, 'نیازمند تأیید', 'Needs approval')}</option>
          </select>
        </div>

        {/* Empty Filter Result */}
        {filteredResources.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 rounded-xl">
            <p className="text-sm font-medium text-slate-700">
              {t(lang, 'پارکینگی با این فیلترها پیدا نشد.', 'No parking bays match your current filters.')}
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              {t(lang, 'نمایش همه پارکینگ‌ها', 'Show all parking bays')}
            </button>
          </div>
        ) : (
          <>
            {/* MOBILE CARD LIST (< md): Zero horizontal scrolling, 44px touch targets */}
            <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {filteredResources.map((r) => {
                const cat: ParkingCategory =
                  r.spaceMeta?.category ?? (r.evCharging ? 'ev' : r.accessible ? 'accessible' : 'standard');
                const status: ParkingLifecycleStatus =
                  r.lifecycleStatus ?? (r.active && r.sharingEnabled ? 'active' : 'pending_owner_activation');
                const statusMeta = LIFECYCLE_LABELS[status];

                return (
                  <div key={r.id} className="p-4 space-y-2.5 bg-white">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-mono font-bold text-blue-800">{r.code}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs font-medium text-slate-700">
                            {r.spaceMeta?.block ? `${t(lang, 'بلوک', 'Blk')} ${r.spaceMeta.block} · ` : ''}
                            <span className="font-mono">{r.floorOrZone}</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600 mt-0.5">
                          <span className="font-medium text-slate-800 inline-flex items-center gap-1">
                            {cat === 'ev' && <Zap className="w-3 h-3 text-emerald-700" />}
                            {t(lang, CATEGORY_LABELS[cat].fa, CATEGORY_LABELS[cat].en)}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums text-slate-500">
                            {r.dimensions.widthM}×{r.dimensions.lengthM}m
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="font-medium text-slate-800">
                            {r.pricing.isFree ? t(lang, 'رایگان', 'Free') : `€${r.pricing.hourlyEur}/h`}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold shrink-0 ${statusMeta.cls}`}>
                        {t(lang, statusMeta.fa, statusMeta.en)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 truncate">
                      {lang === 'fa' ? r.spaceMeta?.locationNoteFa ?? r.titleFa : r.spaceMeta?.locationNoteEn ?? r.title}
                    </p>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setInspectedId(r.id)}
                        className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-1.5 px-3 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-xl active:bg-slate-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t(lang, 'مشاهده جزئیات کامل', 'Inspect Specs')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleResourceActive(r.id)}
                        className={`min-h-[42px] px-3.5 text-xs font-medium rounded-xl border whitespace-nowrap ${
                          r.active && r.sharingEnabled
                            ? 'bg-white border-amber-200 text-amber-800'
                            : 'bg-emerald-700 border-emerald-700 text-white'
                        }`}
                      >
                        {r.active && r.sharingEnabled ? t(lang, 'غیرفعال', 'Pause') : t(lang, 'فعال‌سازی', 'Activate')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP HIGH-DENSITY DATA TABLE (md+) */}
            <div className="hidden md:block border border-slate-200 rounded-2xl overflow-x-auto">
              <table className="w-full text-xs text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                    <th className="py-3 px-3.5 text-start">{t(lang, 'شناسه', 'Code')}</th>
                    <th className="py-3 px-3.5 text-start">{t(lang, 'موقعیت', 'Location')}</th>
                    <th className="py-3 px-3.5 text-start">{t(lang, 'نوع و ابعاد', 'Type & Size')}</th>
                    <th className="py-3 px-3.5 text-start">{t(lang, 'امکانات و موقعیت مکانی', 'Features & Notes')}</th>
                    <th className="py-3 px-3.5 text-start">{t(lang, 'رزرو و تعرفه', 'Booking & Price')}</th>
                    <th className="py-3 px-3.5 text-start">{t(lang, 'وضعیت', 'Status')}</th>
                    <th className="py-3 px-3.5 text-end">{t(lang, 'عملیات', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredResources.map((r) => {
                    const cat: ParkingCategory =
                      r.spaceMeta?.category ?? (r.evCharging ? 'ev' : r.accessible ? 'accessible' : 'standard');
                    const status: ParkingLifecycleStatus =
                      r.lifecycleStatus ?? (r.active && r.sharingEnabled ? 'active' : 'pending_owner_activation');
                    const statusMeta = LIFECYCLE_LABELS[status];

                    return (
                      <tr
                        key={r.id}
                        onClick={() => setInspectedId(r.id)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                          inspectedId === r.id ? 'bg-blue-50/50' : ''
                        }`}
                      >
                        <td className="py-3 px-3.5 font-mono font-semibold text-blue-800 whitespace-nowrap">
                          {r.code}
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap text-slate-700">
                          {r.spaceMeta?.block ? `${t(lang, 'بلوک', 'Blk')} ${r.spaceMeta.block} · ` : ''}
                          <span className="font-mono">{r.floorOrZone}</span>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-medium text-slate-900 flex items-center gap-1">
                            {cat === 'ev' && <Zap className="w-3 h-3 text-emerald-700" />}
                            <span>{t(lang, CATEGORY_LABELS[cat].fa, CATEGORY_LABELS[cat].en)}</span>
                          </div>
                          <div className="font-mono tabular-nums text-[11px] text-slate-500">
                            {r.dimensions.widthM}×{r.dimensions.lengthM}m
                          </div>
                        </td>
                        <td className="py-3 px-3.5 text-slate-600 max-w-[240px]">
                          <div className="truncate">
                            {lang === 'fa' ? r.spaceMeta?.locationNoteFa ?? r.titleFa : r.spaceMeta?.locationNoteEn ?? r.title}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            {r.pricing.isFree ? t(lang, 'رایگان', 'Free') : `€${r.pricing.hourlyEur}/h`}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {r.accessRules?.approvalBy === 'manager'
                              ? t(lang, 'تأیید مدیر', 'Manager approval')
                              : r.approvalMode === 'manual'
                                ? t(lang, 'تأیید مالک', 'Owner approval')
                                : t(lang, 'رزرو خودکار', 'Auto-booking')}
                          </div>
                        </td>
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <span className={`font-medium inline-flex items-center gap-1 ${statusMeta.cls}`}>
                            {status === 'active' && <CheckCircle2 className="w-3.5 h-3.5" />}
                            {t(lang, statusMeta.fa, statusMeta.en)}
                          </span>
                        </td>
                        <td
                          className="py-3 px-3.5 text-end whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectedId(r.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-medium"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              {t(lang, 'جزئیات', 'Inspect')}
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleResourceActive(r.id)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                              title={t(lang, 'تغییر وضعیت فعال‌سازی', 'Toggle activation')}
                              aria-label={t(lang, 'تغییر وضعیت فعال‌سازی', 'Toggle activation')}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* RESPONSIVE BAY INSPECTOR: Mobile Bottom Sheet / Desktop Centered Modal (Never loses scroll!) */}
      {inspectedResource && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setInspectedId(null)}
          />
          <div className="relative w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 max-h-[88vh] flex flex-col overflow-hidden z-10">
            {/* Sheet Grab Handle (Mobile) */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-bold text-blue-800">{inspectedResource.code}</span>
                  {inspectedResource.spaceMeta?.block && (
                    <span className="text-xs font-semibold text-slate-700">
                      {t(lang, `بلوک ${inspectedResource.spaceMeta.block}`, `Block ${inspectedResource.spaceMeta.block}`)}
                    </span>
                  )}
                  <span className="text-slate-300">·</span>
                  <span className="text-xs font-mono text-slate-700">{inspectedResource.floorOrZone}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {lang === 'fa'
                    ? inspectedResource.spaceMeta?.locationNoteFa ?? inspectedResource.titleFa
                    : inspectedResource.spaceMeta?.locationNoteEn ?? inspectedResource.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedId(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl shrink-0"
                aria-label={t(lang, 'بستن', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Physical Specs */}
                <div className="space-y-2 pb-4 sm:pb-0 border-b sm:border-b-0 border-slate-100">
                  <div className="font-semibold text-slate-900">
                    {t(lang, 'مشخصات فیزیکی فضا', 'Physical Space Specs')}
                  </div>
                  <dl className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'نوع جایگاه', 'Category')}</dt>
                      <dd className="font-semibold text-slate-900">
                        {t(
                          lang,
                          CATEGORY_LABELS[inspectedResource.spaceMeta?.category ?? 'standard'].fa,
                          CATEGORY_LABELS[inspectedResource.spaceMeta?.category ?? 'standard'].en
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'ابعاد و ارتفاع', 'Dimensions')}</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {inspectedResource.dimensions.widthM}×{inspectedResource.dimensions.lengthM}m · H{' '}
                        {inspectedResource.dimensions.heightOrDepthM}m
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'مناسب برای', 'Suitable for')}</dt>
                      <dd className="text-slate-900">
                        {lang === 'fa'
                          ? inspectedResource.spaceMeta?.suitableForFa ?? 'خودرو سواری'
                          : inspectedResource.spaceMeta?.suitableForEn ?? 'Standard car'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'ساختار مجاور', 'Adjacent')}</dt>
                      <dd className="text-slate-900">
                        {inspectedResource.spaceMeta?.adjacentStructure === 'wall'
                          ? t(lang, 'کنار دیوار', 'Next to wall')
                          : inspectedResource.spaceMeta?.adjacentStructure === 'pillar'
                            ? t(lang, 'کنار ستون', 'Next to pillar')
                            : t(lang, 'آزاد / بدون مانع', 'Clear')}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Ownership & Access */}
                <div className="space-y-2 pb-4 sm:pb-0 border-b sm:border-b-0 border-slate-100">
                  <div className="font-semibold text-slate-900">
                    {t(lang, 'مالکیت، فعال‌سازی و دسترسی', 'Ownership, Activation & Access')}
                  </div>
                  <dl className="space-y-1.5 text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'نوع مالکیت', 'Ownership')}</dt>
                      <dd className="font-medium text-slate-900">
                        {t(
                          lang,
                          OWNERSHIP_LABELS[inspectedResource.ownership?.ownershipType ?? 'private'].fa,
                          OWNERSHIP_LABELS[inspectedResource.ownership?.ownershipType ?? 'private'].en
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'وضعیت فعال‌سازی', 'Activation')}</dt>
                      <dd
                        className={`font-semibold ${
                          inspectedResource.active && inspectedResource.sharingEnabled
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {inspectedResource.active && inspectedResource.sharingEnabled
                          ? t(lang, 'فعال (قابل رزرو)', 'Active (Bookable)')
                          : t(lang, 'غیرفعال / منتظر مالک', 'Inactive / Pending')}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'تأیید رزرو', 'Approval')}</dt>
                      <dd className="text-slate-900">
                        {inspectedResource.accessRules?.approvalBy === 'manager'
                          ? t(lang, 'تأیید مدیر', 'Manager')
                          : inspectedResource.accessRules?.approvalBy === 'owner' ||
                              inspectedResource.approvalMode === 'manual'
                            ? t(lang, 'تأیید مالک', 'Owner')
                            : t(lang, 'خودکار', 'Automatic')}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt>{t(lang, 'روش ورود', 'Entry')}</dt>
                      <dd className="text-slate-900 text-end">
                        {(inspectedResource.accessRules?.entryMethods ?? ['app', 'card'])
                          .map((m) => t(lang, ENTRY_LABELS[m].fa, ENTRY_LABELS[m].en))
                          .join(' · ')}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {/* Pricing, EV & Schedule */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {t(lang, 'تعرفه، امکانات و زمان‌بندی آزاد', 'Pricing, Features & Availability')}
                  </span>
                  <span className="font-mono font-bold text-slate-900">
                    {inspectedResource.pricing.isFree
                      ? t(lang, 'رایگان', 'Free')
                      : `€${inspectedResource.pricing.hourlyEur}/h`}
                  </span>
                </div>

                {inspectedResource.evCharging && (
                  <div className="text-emerald-800 font-medium flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" />
                    <span>
                      {t(lang, 'شارژر برقی', 'EV Charger')}{' '}
                      {inspectedResource.features?.evPowerKw ? `${inspectedResource.features.evPowerKw}kW` : ''}{' '}
                      {inspectedResource.features?.evConnector ?? 'Type 2'}
                      {inspectedResource.features?.separateMeter
                        ? t(lang, ' · کنتور جداگانه', ' · Separate meter')
                        : ''}
                      {inspectedResource.features?.separateEvFee
                        ? t(lang, ' · هزینه شارژ مجزا', ' · Separate EV billing')
                        : ''}
                    </span>
                  </div>
                )}

                <div className="font-mono tabular-nums text-slate-700">
                  {t(lang, 'ساعات آزاد:', 'Open window:')}{' '}
                  {inspectedResource.declaredAvailability
                    .map((s) => `${formatMinutes(s.startMin)}–${formatMinutes(s.endMin)}`)
                    .join(', ')}
                </div>

                {inspectedResource.accessRules?.ruleNoteFa && (
                  <p className="text-blue-800 leading-relaxed pt-1">
                    {lang === 'fa' ? inspectedResource.accessRules.ruleNoteFa : inspectedResource.accessRules.ruleNoteEn}
                  </p>
                )}
              </div>
            </div>

            {/* Pinned Sheet Footer CTA */}
            <div className="px-5 py-3.5 pb-safe border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setInspectedId(null)}
                className="min-h-[44px] px-4 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                {t(lang, 'بستن', 'Close')}
              </button>
              <button
                type="button"
                onClick={() => onToggleResourceActive(inspectedResource.id)}
                className={`min-h-[44px] inline-flex items-center gap-2 px-5 text-xs font-semibold rounded-xl transition-colors ${
                  inspectedResource.active && inspectedResource.sharingEnabled
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-emerald-700 text-white hover:bg-emerald-800'
                }`}
              >
                <Power className="w-4 h-4" />
                {inspectedResource.active && inspectedResource.sharingEnabled
                  ? t(lang, 'غیرفعال کردن اشتراک این جایگاه', 'Deactivate Bay')
                  : t(lang, 'فعال کردن جایگاه برای رزرو', 'Activate Bay for Booking')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
