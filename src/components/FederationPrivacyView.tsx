import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  Community,
  Language,
  PrivacyAuditEvent,
  Reservation,
  Resource,
} from '../types/parkshare';
import { t } from '../i18n/translations';
import { buildFederationPayload } from '../engines/coreEngine';
import { downloadJsonFile, scanPayloadForPii } from '../utils/privacy';

interface Props {
  lang: Language;
  isManager: boolean;
  communities: Community[];
  resources: Resource[];
  reservations: Reservation[];
  privacyAudits: PrivacyAuditEvent[];
  networkOffline: boolean;
  onToggleOffline: () => void;
  onToggleCommunityFederation: (communityId: string) => void;
  onToggleCommunityAnalyticsConsent: (communityId: string) => void;
  onRotateCommunityKey: (communityId: string) => void;
  onUpdateRetentionDays: (communityId: string, days: 0 | 30 | 90) => void;
  onLogBuildingExport: (communityId: string) => void;
}

const TRUST_PILLARS = [
  {
    titleFa: '۱. معماری قابل راستی‌آزمایی، نه صرفاً وعده',
    titleEn: '1. Verifiable Architecture, Not Blind Promises',
    descFa:
      'اطلاعات هر ساختمان به‌صورت کاملاً جداگانه و رمزگذاری‌شده نگهداری می‌شود و هیچ ساختمانی به داده‌های ساختمان دیگر دسترسی ندارد.',
    descEn:
      'Every building tenant is isolated and encrypted independently — no building can ever access another building’s data.',
  },
  {
    titleFa: '۲. اشتراک‌گذاری بدون نمایش اطلاعات شخصی',
    titleEn: '2. Zero Personal Info Shared with Neighbors',
    descFa:
      'در هنگام رزرو یا اشتراک‌گذاری، هیچ نام، شماره واحد، تلفن یا ایمیلی برای همسایه‌ها نمایش داده نمی‌شود؛ فقط کد پارکینگ، طبقه و ساعت آزاد.',
    descEn:
      'Neighbors never see your name, unit, phone, or email — only bay code, floor, and open time window.',
  },
  {
    titleFa: '۳. مالکیت کامل داده برای ساختمان و ساکنان',
    titleEn: '3. Full Data Ownership & Zero Lock-In',
    descFa:
      'اطلاعات متعلق به خود شماست. مدیر ساختمان هر لحظه می‌تواند کلید رمزگذاری را تعویض کند یا کل داده‌ها را دانلود نماید.',
    descEn:
      'Your building owns its data. Managers can rotate encryption keys or export all records as JSON anytime.',
  },
  {
    titleFa: '۴. حذف خودکار سوابق و حق فراموش‌شدن (GDPR)',
    titleEn: '4. Auto-Purge & Right to Erasure (GDPR)',
    descFa:
      'سوابق رزرو پس از مدت تعیین‌شده به شکل خودکار پاک می‌شوند و هر ساکن هر زمان می‌تواند فایل داده‌هایش را دریافت یا سابقه خود را حذف کند.',
    descEn:
      'Booking logs purge automatically after the chosen retention window, and every resident can export or erase their history anytime.',
  },
];

const VISIBILITY_MATRIX: {
  dataFa: string;
  dataEn: string;
  ownerFa: string;
  ownerEn: string;
  managerFa: string;
  managerEn: string;
  neighborFa: string;
  neighborEn: string;
  centralFa: string;
  centralEn: string;
}[] = [
  {
    dataFa: 'نام کامل و شماره واحد ساکن',
    dataEn: 'Full Name & Unit Number',
    ownerFa: 'مشاهده و ویرایش',
    ownerEn: 'View & edit',
    managerFa: 'فقط داخل پنل ساختمان',
    managerEn: 'Local tenant only',
    neighborFa: 'هرگز نمی‌بیند',
    neighborEn: 'Never visible',
    centralFa: 'هرگز ارسال نمی‌شود',
    centralEn: 'Never transmitted',
  },
  {
    dataFa: 'ایمیل و شماره تلفن تماس',
    dataEn: 'Email & Phone Number',
    ownerFa: 'فقط خود شخص',
    ownerEn: 'Self only',
    managerFa: 'ماسک‌شده روی صفحه',
    managerEn: 'Masked on screen',
    neighborFa: 'هرگز نمی‌بیند',
    neighborEn: 'Never visible',
    centralFa: 'هرگز ارسال نمی‌شود',
    centralEn: 'Never transmitted',
  },
  {
    dataFa: 'کد پارکینگ، طبقه، EV و ساعت آزاد',
    dataEn: 'Bay Code, Floor, EV & Window',
    ownerFa: 'تنظیم و توقف فوری',
    ownerEn: 'Control & pause',
    managerFa: 'مدیریت کامل',
    managerEn: 'Full management',
    neighborFa: 'فقط افراد لیست مجاز',
    neighborEn: 'Whitelisted only',
    centralFa: 'فقط با شناسه ناشناس',
    centralEn: 'Anonymous alias only',
  },
  {
    dataFa: 'سابقه رزروها و امتیازها',
    dataEn: 'Booking & Review History',
    ownerFa: 'ناشناس + حق حذف',
    ownerEn: 'Anonymous + erase',
    managerFa: 'گزارش تجمیعی ناشناس',
    managerEn: 'Aggregated anonymous',
    neighborFa: 'فقط امتیاز کلی جایگاه',
    neighborEn: 'Aggregate bay rating',
    centralFa: 'بدون داده شخصی',
    centralEn: 'Zero PII stored',
  },
  {
    dataFa: 'کلید رمزگذاری ساختمان',
    dataEn: 'Building Encryption Key',
    ownerFa: 'حفاظت خودکار',
    ownerEn: 'Protects owner data',
    managerFa: 'تحت کنترل و تعویض مدیر',
    managerEn: 'Controlled by manager',
    neighborFa: 'بدون دسترسی',
    neighborEn: 'No access',
    centralFa: 'غیرقابل دسترس',
    centralEn: 'Inaccessible',
  },
];

export const FederationPrivacyView: React.FC<Props> = ({
  lang,
  isManager,
  communities,
  resources,
  reservations,
  privacyAudits,
  networkOffline,
  onToggleOffline,
  onToggleCommunityFederation,
  onToggleCommunityAnalyticsConsent,
  onRotateCommunityKey,
  onUpdateRetentionDays,
  onLogBuildingExport,
}) => {
  const [inspectedResourceId, setInspectedResourceId] = useState<string>(resources[0]?.id ?? '');
  const [showTechnicalProof, setShowTechnicalProof] = useState<boolean>(false);

  const inspectedResource = useMemo(
    () => resources.find((r) => r.id === inspectedResourceId) ?? resources[0] ?? null,
    [resources, inspectedResourceId]
  );

  const inspectedCommunity = useMemo(
    () =>
      inspectedResource
        ? communities.find((c) => c.id === inspectedResource.communityId) ?? communities[0] ?? null
        : communities[0] ?? null,
    [communities, inspectedResource]
  );

  const livePayload = useMemo(
    () =>
      !networkOffline && inspectedResource && inspectedCommunity
        ? buildFederationPayload(inspectedResource, inspectedCommunity, reservations)
        : null,
    [inspectedResource, inspectedCommunity, reservations, networkOffline]
  );

  const piiScan = useMemo(() => scanPayloadForPii(livePayload), [livePayload]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {t(lang, 'مرکز اعتماد و حریم خصوصی', 'Trust & Privacy Center')}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
            {t(
              lang,
              'چرا ساختمان‌ها و ساکنان می‌توانند به ParkShare اعتماد کنند؟ اینجا دقیقاً می‌بینید چه اطلاعاتی محافظت می‌شود و چه کسی به آن دسترسی دارد.',
              'Why buildings and residents trust ParkShare — transparent access boundaries, manager controls, and verifiable zero-PII guarantees.'
            )}
          </p>
        </div>

        {isManager && (
          <button
            type="button"
            onClick={onToggleOffline}
            className={`min-h-[42px] inline-flex items-center gap-2 px-4 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap self-start sm:self-auto ${
              networkOffline
                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {networkOffline ? <WifiOff className="w-4 h-4" /> : <Wifi className="w-4 h-4" />}
            {networkOffline ? t(lang, 'حالت آفلاین فعال است', 'Offline Mode Active') : t(lang, 'تست عملکرد آفلاین', 'Test Offline Mode')}
          </button>
        )}
      </div>

      {networkOffline && (
        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-950 text-xs sm:text-sm">
          <div className="font-bold">
            {t(lang, 'حالت استقلال کامل ساختمان فعال است', 'Independent Local Building Mode Active')}
          </div>
          <p className="mt-1 text-xs leading-relaxed">
            {t(
              lang,
              'ارتباط بیرونی قطع شده اما رزروهای داخلی هر ساختمان بدون وقفه و با قفل ضدتداخل به کار خود ادامه می‌دهند.',
              'External links are paused while internal building reservations and conflict protection keep running normally.'
            )}
          </p>
        </div>
      )}

      {/* SECTION 1: 4 CLEAR TRUST GUARANTEES */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            {t(lang, 'چرا می‌توانید به ما اعتماد کنید؟', 'Why You Can Trust ParkShare')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {TRUST_PILLARS.map((pillar) => (
            <div key={pillar.titleEn} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-1.5">
              <h3 className="text-sm font-bold text-slate-900">
                {lang === 'fa' ? pillar.titleFa : pillar.titleEn}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {lang === 'fa' ? pillar.descFa : pillar.descEn}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 2: TRANSPARENCY MATRIX (Cards on Mobile, Clean Table on Desktop) */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            {t(lang, 'شفافیت کامل: چه کسی چه اطلاعاتی می‌بیند؟', 'Transparency Matrix: Who Sees What?')}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {t(
              lang,
              'تفکیک دقیق دسترسی بین مالک پارکینگ، مدیر ساختمان، همسایه رزروکننده و سیستم مرکزی.',
              'Strict visibility boundary across the owner, manager, booking neighbor, and central system.'
            )}
          </p>
        </div>

        {/* Mobile Transparency Cards (< md) */}
        <div className="md:hidden space-y-2.5">
          {VISIBILITY_MATRIX.map((row) => (
            <div key={row.dataEn} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs">
              <div className="font-bold text-slate-900 border-b border-slate-100 pb-2">
                {lang === 'fa' ? row.dataFa : row.dataEn}
              </div>
              <dl className="grid grid-cols-2 gap-2.5">
                <div>
                  <dt className="text-[11px] text-slate-400">{t(lang, 'مالک پارکینگ', 'Bay Owner')}</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">{lang === 'fa' ? row.ownerFa : row.ownerEn}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">{t(lang, 'مدیر ساختمان', 'Manager')}</dt>
                  <dd className="font-medium text-slate-800 mt-0.5">{lang === 'fa' ? row.managerFa : row.managerEn}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">{t(lang, 'همسایه رزروکننده', 'Neighbor')}</dt>
                  <dd
                    className={`font-medium mt-0.5 ${
                      row.neighborEn.includes('Never') || row.neighborEn.includes('No access')
                        ? 'text-emerald-700'
                        : 'text-slate-800'
                    }`}
                  >
                    {lang === 'fa' ? row.neighborFa : row.neighborEn}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">{t(lang, 'سرور مرکزی', 'Central')}</dt>
                  <dd
                    className={`font-medium mt-0.5 ${
                      row.centralEn.includes('Never') || row.centralEn.includes('Zero') || row.centralEn.includes('Inaccessible')
                        ? 'text-emerald-700'
                        : 'text-slate-800'
                    }`}
                  >
                    {lang === 'fa' ? row.centralFa : row.centralEn}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>

        {/* Desktop Transparency Table (md+) */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs text-start border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                <th className="py-3 px-4 text-start">{t(lang, 'نوع داده', 'Data Category')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'مالک پارکینگ', 'Bay Owner')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'مدیر ساختمان', 'Building Manager')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'همسایه رزروکننده', 'Booking Neighbor')}</th>
                <th className="py-3 px-4 text-start">{t(lang, 'سیستم مرکزی / همکار', 'Central / Peer')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {VISIBILITY_MATRIX.map((row) => (
                <tr key={row.dataEn} className="hover:bg-slate-50/70">
                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    {lang === 'fa' ? row.dataFa : row.dataEn}
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">{lang === 'fa' ? row.ownerFa : row.ownerEn}</td>
                  <td className="py-3.5 px-4 text-slate-700">{lang === 'fa' ? row.managerFa : row.managerEn}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={
                        row.neighborEn.includes('Never') || row.neighborEn.includes('No access')
                          ? 'text-emerald-700 font-semibold'
                          : 'text-slate-700'
                      }
                    >
                      {lang === 'fa' ? row.neighborFa : row.neighborEn}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={
                        row.centralEn.includes('Never') ||
                        row.centralEn.includes('Zero') ||
                        row.centralEn.includes('Inaccessible')
                          ? 'text-emerald-700 font-semibold'
                          : 'text-slate-700'
                      }
                    >
                      {lang === 'fa' ? row.centralFa : row.centralEn}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3: MANAGER BUILDING SOVEREIGNTY CONTROLS (Cards on mobile, Table on desktop) */}
      {isManager && communities.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">
            {t(lang, 'تنظیمات کلید رمزگذاری و نگهداری سوابق ساختمان‌ها', 'Building Encryption & Retention Controls')}
          </h2>

          {/* Mobile Cards (< md) */}
          <div className="md:hidden space-y-3">
            {communities.map((c) => (
              <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{lang === 'fa' ? c.nameFa : c.name}</div>
                    <div className="font-mono text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                      <KeyRound className="w-3 h-3" />
                      {c.keyFingerprint}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleCommunityFederation(c.id)}
                    className={`min-h-[36px] px-3 font-medium rounded-xl border whitespace-nowrap ${
                      c.federationEnabled && !networkOffline
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {c.federationEnabled ? t(lang, 'اشتراک فعال', 'Shared') : t(lang, 'فقط داخلی', 'Local Only')}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {t(lang, 'مدت نگهداری سوابق رزرو (GDPR)', 'Reservation Retention')}
                  </label>
                  <select
                    value={c.dataRetentionDays}
                    onChange={(e) => onUpdateRetentionDays(c.id, Number(e.target.value) as 0 | 30 | 90)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                  >
                    <option value={0}>{t(lang, 'حذف فوری پس از رزرو', 'Immediate auto-purge')}</option>
                    <option value={30}>{t(lang, '۳۰ روز (GDPR)', '30 days (GDPR)')}</option>
                    <option value={90}>{t(lang, '۹۰ روز', '90 days')}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onRotateCommunityKey(c.id)}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-xl text-slate-700 font-medium"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {t(lang, 'تعویض کلید', 'Rotate Key')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      downloadJsonFile(`parkshare-sovereignty-${c.id}.json`, {
                        exportedAt: new Date().toISOString(),
                        community: c,
                        resourceCount: resources.filter((r) => r.communityId === c.id).length,
                      });
                      onLogBuildingExport(c.id);
                    }}
                    className="min-h-[42px] inline-flex items-center justify-center gap-1.5 bg-slate-900 text-white rounded-xl font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t(lang, 'دانلود JSON', 'Export JSON')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <table className="w-full text-xs text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                  <th className="py-3 px-4 text-start">{t(lang, 'ساختمان', 'Building')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'کلید رمزگذاری', 'Encryption Key')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'نگهداری سوابق', 'Retention')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'اشتراک بین‌ساختمانی', 'Cross-Building')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'آمار ناشناس', 'Anon Stats')}</th>
                  <th className="py-3 px-4 text-end">{t(lang, 'عملیات', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {communities.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900 text-sm">{lang === 'fa' ? c.nameFa : c.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{c.dataResidencyRegion}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="w-3.5 h-3.5" />
                        {c.keyFingerprint}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <select
                        value={c.dataRetentionDays}
                        onChange={(e) => onUpdateRetentionDays(c.id, Number(e.target.value) as 0 | 30 | 90)}
                        className="h-9 px-2.5 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        <option value={0}>{t(lang, 'حذف فوری پس از رزرو', 'Immediate auto-purge')}</option>
                        <option value={30}>{t(lang, '۳۰ روز (GDPR)', '30 days (GDPR)')}</option>
                        <option value={90}>{t(lang, '۹۰ روز', '90 days')}</option>
                      </select>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => onToggleCommunityFederation(c.id)}
                        className={`px-3 py-1.5 font-medium rounded-lg border whitespace-nowrap ${
                          c.federationEnabled && !networkOffline
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-slate-100 border-slate-200 text-slate-600'
                        }`}
                      >
                        {c.federationEnabled ? t(lang, 'فعال (بدون PII)', 'Enabled') : t(lang, 'فقط داخلی', 'Local Only')}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => onToggleCommunityAnalyticsConsent(c.id)}
                        className={`px-3 py-1.5 font-medium rounded-lg border whitespace-nowrap ${
                          c.consentDemandAnalytics
                            ? 'bg-blue-50 border-blue-200 text-blue-800'
                            : 'bg-white border-slate-200 text-slate-500'
                        }`}
                      >
                        {c.consentDemandAnalytics ? t(lang, 'مجاز', 'Opted In') : t(lang, 'غیرمجاز', 'Opted Out')}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-end">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onRotateCommunityKey(c.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          {t(lang, 'تعویض کلید', 'Rotate Key')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            downloadJsonFile(`parkshare-sovereignty-${c.id}.json`, {
                              exportedAt: new Date().toISOString(),
                              community: c,
                              resourceCount: resources.filter((r) => r.communityId === c.id).length,
                            });
                            onLogBuildingExport(c.id);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          JSON
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SECTION 4: COLLAPSIBLE TECHNICAL VERIFICATION (Zero-PII Payload Inspector) */}
      {inspectedResource && inspectedCommunity && (
        <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTechnicalProof((v) => !v)}
            className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-start hover:bg-slate-50/70 transition-colors"
          >
            <div>
              <div className="text-sm font-bold text-slate-900">
                {t(lang, 'راستی‌آزمایی فنی (مشاهده داده خروجی واقعی بدون اطلاعات شخصی)', 'Technical Proof (Inspect Live Zero-PII Output)')}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  lang,
                  'برای اطمینان فنی می‌توانید بسته واقعی ارسال‌شده بین ساختمان‌ها را ببینید و نبود نام، تلفن و ایمیل را تأیید کنید.',
                  'Inspect the exact outbound payload and verify zero personal fields ever leave your building.'
                )}
              </p>
            </div>
            <span className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 shrink-0">
              {showTechnicalProof ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </button>

          {showTechnicalProof && (
            <div className="p-4 sm:p-5 pt-0 space-y-4 border-t border-slate-100">
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700">
                  {t(lang, 'انتخاب پارکینگ برای بررسی:', 'Select a parking bay to inspect:')}
                </span>
                <select
                  value={inspectedResource.id}
                  onChange={(e) => setInspectedResourceId(e.target.value)}
                  className="h-10 px-3 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-800"
                >
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {lang === 'fa' ? r.titleFa : r.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <EyeOff className="w-4 h-4 text-slate-700" />
                      <span>{t(lang, 'اطلاعات خصوصی داخل ساختمان (هرگز خارج نمی‌شود)', 'Private Local Data (Never Leaves Building)')}</span>
                    </div>
                  </div>
                  <dl className="divide-y divide-slate-200/60 text-xs">
                    {[
                      [t(lang, 'نام مالک', 'Owner Name'), inspectedResource.ownerPrivate.fullName],
                      [t(lang, 'شماره واحد', 'Unit'), inspectedResource.ownerPrivate.unitNumber],
                      [t(lang, 'شماره تلفن', 'Phone'), inspectedResource.ownerPrivate.phone],
                      [t(lang, 'ایمیل', 'Email'), inspectedResource.ownerPrivate.email],
                    ].map(([label, val]) => (
                      <div key={label} className="py-2 flex items-center justify-between gap-3">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-mono text-slate-900 text-end">{val}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-xl p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <Lock className="w-4 h-4 text-emerald-400" />
                      <span>{t(lang, 'خروجی ناشناس تاییدشده', 'Verified Anonymous Output')}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-mono text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {piiScan.clean ? t(lang, 'بدون داده شخصی', '0 PII') : 'Alert'}
                    </span>
                  </div>

                  {livePayload ? (
                    <pre
                      dir="ltr"
                      className="text-xs font-mono leading-relaxed text-slate-200 bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 overflow-x-auto"
                    >
                      {JSON.stringify(livePayload, null, 2)}
                    </pre>
                  ) : (
                    <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                      {networkOffline
                        ? t(lang, 'شبکه آفلاین است — هیچ داده‌ای خارج نمی‌شود.', 'Offline mode — no outbound messages.')
                        : t(
                            lang,
                            'این جایگاه فقط برای استفاده داخلی ساختمان تنظیم شده و هیچ داده‌ای بیرون ارسال نمی‌شود.',
                            'This bay is local-only — zero outbound messages are emitted.'
                          )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION 5: RECENT PRIVACY AUDIT LOG */}
      <section className="space-y-3">
        <h2 className="text-sm sm:text-base font-bold text-slate-900">
          {t(lang, 'گزارش فعالیت‌های حریم خصوصی و امنیت', 'Privacy & Security Activity Log')}
        </h2>
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {privacyAudits.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {t(lang, 'هنوز رویدادی ثبت نشده است.', 'No audit events recorded yet.')}
            </div>
          ) : (
            privacyAudits.slice(0, 8).map((ev) => (
              <div
                key={ev.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <span className="text-slate-800 leading-relaxed">
                    {lang === 'fa' ? ev.summaryFa : ev.summaryEn}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 shrink-0">
                  <span className="text-emerald-800 font-medium">{ev.proofTag}</span>
                  <span>·</span>
                  <span>{ev.timestamp}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
