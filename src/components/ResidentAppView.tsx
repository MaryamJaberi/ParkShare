import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Lock,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  Community,
  ExtendedParkingRequest,
  Language,
  OptimizedScheduleOption,
  ParkingCategory,
  ParkingReview,
  Reservation,
  Resource,
  UserProfile,
} from '../types/parkshare';
import { DEFAULT_RANKING_WEIGHTS } from '../data/seedData';
import { runSmartMatchingPipeline } from '../engines/coreEngine';
import { formatDuration, formatMinutes, reservationStatusLabels, t } from '../i18n/translations';
import { downloadJsonFile, pseudonymizeUser } from '../utils/privacy';
import { CATEGORY_LABELS } from './ParkingCatalogExplorer';

interface Props {
  lang: Language;
  currentUserRole: 'manager' | 'resident';
  currentUserId?: string;
  users: UserProfile[];
  communities: Community[];
  resources: Resource[];
  reservations: Reservation[];
  reviews: ParkingReview[];
  extendedRequests: ExtendedParkingRequest[];
  networkOffline: boolean;
  onBookOption: (
    option: OptimizedScheduleOption,
    requester: UserProfile,
    anonymousBooking: boolean
  ) => Promise<{ ok: boolean; message: string }> | { ok: boolean; message: string };
  onCancelReservation: (reservationId: string) => void;
  onSubmitReview: (review: Omit<ParkingReview, 'id' | 'createdAt'>) => void;
  onSubmitExtendedRequest: (req: Omit<ExtendedParkingRequest, 'id' | 'status' | 'createdAt'>) => void;
  onEraseUserReservations: (userId: string) => void;
  onLogPrivacyExport: (communityId: string, userAlias: string) => void;
  onOpenTrustCenter: () => void;
  onOpenManagerPanel?: () => void;
}

const TIME_HOURS = Array.from({ length: 19 }, (_, i) => (i + 6) * 60);

const REVIEW_TAGS = [
  { fa: 'دسترسی راحت', en: 'Easy access' },
  { fa: 'نزدیک آسانسور', en: 'Near elevator' },
  { fa: 'شارژر EV سالم', en: 'EV worked well' },
  { fa: 'تمیز و استاندارد', en: 'Clean & spacious' },
  { fa: 'تأیید سریع', en: 'Fast approval' },
];

export const ResidentAppView: React.FC<Props> = ({
  lang,
  currentUserRole,
  currentUserId,
  users,
  communities,
  resources,
  reservations,
  reviews,
  extendedRequests,
  networkOffline,
  onBookOption,
  onCancelReservation,
  onSubmitReview,
  onSubmitExtendedRequest,
  onEraseUserReservations,
  onLogPrivacyExport,
  onOpenTrustCenter,
  onOpenManagerPanel,
}) => {
  const residentUsers = useMemo(
    () => users.filter((u) => !u.suspended && (u.role === 'resident' || u.role === 'guest')),
    [users]
  );

  const [selectedUserId, setSelectedUserId] = useState<string>(
    currentUserId ?? residentUsers[0]?.id ?? users[0]?.id ?? ''
  );
  const [startMin, setStartMin] = useState<number>(540);
  const [endMin, setEndMin] = useState<number>(960);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [showPrivacySheet, setShowPrivacySheet] = useState<boolean>(false);
  const [showFairUseInfo, setShowFairUseInfo] = useState<boolean>(false);
  const [showExtendedForm, setShowExtendedForm] = useState<boolean>(false);

  const [sameBuildingOnly, setSameBuildingOnly] = useState<boolean>(true);
  const [blockFilter, setBlockFilter] = useState<string>('ALL');
  const [floorFilter, setFloorFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [evOnly, setEvOnly] = useState<boolean>(false);
  const [autoApproveOnly, setAutoApproveOnly] = useState<boolean>(false);
  const [freeOnly, setFreeOnly] = useState<boolean>(false);
  const [anonymousBooking, setAnonymousBooking] = useState<boolean>(true);

  const [extDays, setExtDays] = useState<number>(4);
  const [extRoute, setExtRoute] = useState<'manager' | 'owner_and_manager'>('owner_and_manager');
  const [extReason, setExtReason] = useState<'extended_guest' | 'temporary_work' | 'permanent_lease_inquiry'>(
    'extended_guest'
  );
  const [extNote, setExtNote] = useState<string>('');

  const [reviewingReservationId, setReviewingReservationId] = useState<string | null>(null);
  const [draftRating, setDraftRating] = useState<1 | 2 | 3 | 4 | 5>(5);
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [draftComment, setDraftComment] = useState<string>('');
  const [draftAnonymous, setDraftAnonymous] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const effectiveUserId = currentUserRole === 'resident' && currentUserId ? currentUserId : selectedUserId;

  const requester = useMemo(
    () => users.find((u) => u.id === effectiveUserId) ?? users[0] ?? null,
    [users, effectiveUserId]
  );

  const homeCommunity = useMemo(
    () => (requester ? communities.find((c) => c.id === requester.communityId) ?? communities[0] ?? null : null),
    [communities, requester]
  );

  const fairUse = homeCommunity?.fairUsePolicy ?? {
    maxHoursPerBooking: 12,
    maxDaysPerMonth: 10,
    maxConsecutiveDays: 3,
    cooldownHoursAfterStreak: 12,
    allowExtendedNegotiation: true,
  };
  const daysUsed = requester?.tempUsageThisMonth?.daysUsed ?? 0;
  const consecutiveDays = requester?.tempUsageThisMonth?.consecutiveDays ?? 0;
  const quotaPct = Math.min(100, Math.round((daysUsed / Math.max(1, fairUse.maxDaysPerMonth)) * 100));

  const validEndMin = endMin > startMin ? endMin : Math.min(1440, startMin + 60);
  const requestedHours = (validEndMin - startMin) / 60;

  // Fair-Use Anti-Abuse Guard Check
  const fairUseViolation = useMemo(() => {
    if (daysUsed >= fairUse.maxDaysPerMonth) {
      return {
        type: 'monthly_cap' as const,
        titleFa: `سقف پارکینگ موقت ماهانه شما (${fairUse.maxDaysPerMonth} روز) تکمیل شده است`,
        titleEn: `Monthly temporary parking cap reached (${daysUsed}/${fairUse.maxDaysPerMonth} days)`,
        descFa:
          'پارکینگ موقت برای نیازهای کوتاه‌مدت است و جایگزین اجاره پارکینگ دائمی نیست. برای نیاز بیشتر می‌توانید با مدیر ساختمان یا صاحب پارکینگ هماهنگ کنید.',
        descEn:
          'Temporary parking is for short-term neighbor needs, not replacing a permanent lease. Coordinate with the manager or bay owner below.',
      };
    }
    if (consecutiveDays >= fairUse.maxConsecutiveDays) {
      return {
        type: 'streak_cap' as const,
        titleFa: `سقف ${fairUse.maxConsecutiveDays} روز پیاپی تکمیل شده است`,
        titleEn: `Max ${fairUse.maxConsecutiveDays} consecutive days reached`,
        descFa: `برای حفظ انصاف میان همسایه‌ها، پس از ${fairUse.maxConsecutiveDays} روز پیاپی حداقل ${fairUse.cooldownHoursAfterStreak} ساعت وقفه لازم است یا باید درخواست هماهنگی ثبت شود.`,
        descEn: `A ${fairUse.cooldownHoursAfterStreak}h cooldown applies after ${fairUse.maxConsecutiveDays} consecutive days, or submit a coordination request.`,
      };
    }
    if (requestedHours > fairUse.maxHoursPerBooking) {
      return {
        type: 'duration_cap' as const,
        titleFa: `مدت انتخابی (${requestedHours} ساعت) بیش از سقف پارکینگ موقت (${fairUse.maxHoursPerBooking} ساعت) است`,
        titleEn: `Selected duration (${requestedHours}h) exceeds the ${fairUse.maxHoursPerBooking}h temporary cap`,
        descFa:
          'برای رزرو فوری، زمان را کوتاه‌تر کنید یا برای بازه طولانی‌تر درخواست هماهنگی با مدیر ساختمان بفرستید.',
        descEn: 'Shorten your time window to reserve immediately, or send a longer-stay request to the manager.',
      };
    }
    return null;
  }, [daysUsed, consecutiveDays, requestedHours, fairUse]);

  const advancedFiltersCount =
    (blockFilter !== 'ALL' ? 1 : 0) +
    (floorFilter !== 'ALL' ? 1 : 0) +
    (categoryFilter !== 'ALL' ? 1 : 0) +
    (!sameBuildingOnly ? 1 : 0);

  const totalActiveFilters = advancedFiltersCount + (evOnly ? 1 : 0) + (autoApproveOnly ? 1 : 0) + (freeOnly ? 1 : 0);

  const resetFilters = () => {
    setBlockFilter('ALL');
    setFloorFilter('ALL');
    setCategoryFilter('ALL');
    setEvOnly(false);
    setAutoApproveOnly(false);
    setFreeOnly(false);
    setSameBuildingOnly(true);
  };

  const availableBlocks = useMemo(() => {
    const set = new Set<string>();
    resources
      .filter((r) => r.type === 'parking' && (!sameBuildingOnly || r.communityId === requester?.communityId))
      .forEach((r) => {
        if (r.spaceMeta?.block) set.add(r.spaceMeta.block);
      });
    return Array.from(set).sort();
  }, [resources, sameBuildingOnly, requester?.communityId]);

  const availableFloors = useMemo(() => {
    const floorSet = new Set<string>();
    resources
      .filter((r) => r.type === 'parking' && (!sameBuildingOnly || r.communityId === requester?.communityId))
      .forEach((r) => floorSet.add(r.floorOrZone));
    homeCommunity?.floors?.forEach((f) => floorSet.add(f));
    return Array.from(floorSet).sort();
  }, [resources, sameBuildingOnly, requester?.communityId, homeCommunity]);

  const scopedResources = useMemo(() => {
    return resources.filter((r) => {
      if (r.type !== 'parking') return false;
      if (blockFilter !== 'ALL' && r.spaceMeta?.block !== blockFilter) return false;
      if (floorFilter !== 'ALL' && r.floorOrZone !== floorFilter) return false;
      if (categoryFilter !== 'ALL') {
        const cat: ParkingCategory =
          r.spaceMeta?.category ?? (r.evCharging ? 'ev' : r.accessible ? 'accessible' : 'standard');
        if (cat !== categoryFilter) return false;
      }
      return true;
    });
  }, [resources, blockFilter, floorFilter, categoryFilter]);

  const pipeline = useMemo(() => {
    if (!requester) {
      return {
        candidates: [],
        schedules: [],
        filteredSummary: {
          totalScanned: 0,
          federatedScanned: 0,
          policyAllowedOrConditional: 0,
          compatible: 0,
          availableForWindow: 0,
        },
      };
    }
    return runSmartMatchingPipeline(
      {
        requester,
        resourceType: 'parking',
        startMin,
        endMin: validEndMin,
        includeFederated: !sameBuildingOnly,
        freeOnly,
        instantApprovalOnly: autoApproveOnly,
        preferredFloor: floorFilter === 'ALL' ? 'ANY' : floorFilter,
        requireEvOrPower: evOnly,
        requireAccessible: false,
        weights: DEFAULT_RANKING_WEIGHTS,
        networkOffline,
      },
      scopedResources,
      communities,
      reservations
    );
  }, [
    requester,
    startMin,
    validEndMin,
    sameBuildingOnly,
    freeOnly,
    autoApproveOnly,
    floorFilter,
    evOnly,
    networkOffline,
    scopedResources,
    communities,
    reservations,
  ]);

  const bestAutoAssignOption = pipeline.schedules[0];

  const matchingAvailableList = useMemo(
    () => pipeline.candidates.filter((c) => c.passedHardFilters),
    [pipeline.candidates]
  );

  const myReservations = useMemo(
    () =>
      requester
        ? reservations.filter(
            (r) => r.requesterId === requester.id && r.status !== 'Cancelled' && r.status !== 'Expired'
          )
        : [],
    [reservations, requester]
  );

  const myExtendedRequests = useMemo(
    () => (requester ? extendedRequests.filter((r) => r.requesterId === requester.id) : []),
    [extendedRequests, requester]
  );

  const resourceMap = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources]);
  const communityMap = useMemo(() => new Map(communities.map((c) => [c.id, c])), [communities]);

  const ratingsByResource = useMemo(() => {
    const map = new Map<string, { avg: number; count: number }>();
    for (const rev of reviews) {
      const curr = map.get(rev.resourceId) ?? { avg: 0, count: 0 };
      const total = curr.avg * curr.count + rev.rating;
      const count = curr.count + 1;
      map.set(rev.resourceId, { avg: total / count, count });
    }
    return map;
  }, [reviews]);

  const reviewedReservationIds = useMemo(() => new Set(reviews.map((r) => r.reservationId)), [reviews]);

  const handleDirectBookCandidate = async (candidate: (typeof matchingAvailableList)[number]) => {
    if (!requester) return;
    if (fairUseViolation) {
      setShowExtendedForm(true);
      return;
    }
    const existingOpt = pipeline.schedules.find(
      (s) => s.type === 'continuous' && s.segments[0].resource.id === candidate.resource.id
    );
    if (!existingOpt) return;
    const res = await onBookOption(existingOpt, requester, anonymousBooking);
    setFeedback({ ok: res.ok, text: res.message });
  };

  const handleAutoAssign = async () => {
    if (!requester) return;
    if (fairUseViolation) {
      setShowExtendedForm(true);
      return;
    }
    if (!bestAutoAssignOption) return;
    const res = await onBookOption(bestAutoAssignOption, requester, anonymousBooking);
    setFeedback({ ok: res.ok, text: res.message });
  };

  if (!requester || !homeCommunity) {
    return (
      <div className="max-w-lg mx-auto py-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <h1 className="text-base font-bold text-slate-900">
            {t(lang, 'هنوز ساکنی در سیستم ثبت نشده است', 'No Residents Registered Yet')}
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            {t(
              lang,
              'ابتدا در پنل مدیر ساختمان، ساختمان و لیست مجاز صاحبان پارکینگ را اضافه کنید (یا دیتاست نمونه Boston Residence را بارگذاری کنید).',
              'Create a building and upload your resident whitelist (or load the Boston Residence sample) from the Building Manager panel first.'
            )}
          </p>
          {onOpenManagerPanel && (
            <button
              type="button"
              onClick={onOpenManagerPanel}
              className="min-h-[44px] px-5 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800"
            >
              {t(lang, 'رفتن به پنل مدیر ساختمان', 'Open Building Manager Panel')}
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleExtendedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmitExtendedRequest({
      communityId: homeCommunity.id,
      requesterId: requester.id,
      requesterAlias: pseudonymizeUser(requester.id, lang),
      requestedStartMin: startMin,
      requestedEndMin: validEndMin,
      requestedDays: extDays,
      routeTo: extRoute,
      reasonType: extReason,
      note:
        extNote.trim() ||
        t(
          lang,
          'درخواست هماهنگی برای پارکینگ فراتر از سقف موقت',
          'Coordination request for parking beyond temporary fair-use cap'
        ),
    });
    setExtNote('');
    setShowExtendedForm(false);
    setFeedback({
      ok: true,
      text: t(
        lang,
        'درخواست شما با شناسه ناشناس برای مدیر ساختمان ارسال شد.',
        'Your request was sent privately to the building manager / bay owner.'
      ),
    });
  };

  const handleReviewSubmit = (rsv: Reservation) => {
    onSubmitReview({
      reservationId: rsv.id,
      resourceId: rsv.resourceId,
      communityId: rsv.communityId,
      rating: draftRating,
      tags: draftTags,
      comment: draftComment.trim(),
      anonymous: draftAnonymous,
      authorAlias: draftAnonymous ? pseudonymizeUser(requester.id, lang) : requester.name,
    });
    setReviewingReservationId(null);
    setDraftRating(5);
    setDraftTags([]);
    setDraftComment('');
    setFeedback({
      ok: true,
      text: t(lang, 'ممنون! امتیاز شما ثبت شد.', 'Thank you! Your optional feedback was saved.'),
    });
  };

  const handleExportMyData = () => {
    const alias = pseudonymizeUser(requester.id, lang);
    downloadJsonFile(`parkshare-gdpr-${requester.id}.json`, {
      exportedAt: new Date().toISOString(),
      gdprArticle: 'Article 20 — Right to Data Portability',
      building: homeCommunity.name,
      dataResidency: homeCommunity.dataResidencyRegion,
      profile: {
        id: requester.id,
        unitNumber: requester.unitNumber,
        vehicle: requester.vehicle,
        tempUsageThisMonth: requester.tempUsageThisMonth,
      },
      myReservations,
      myExtendedRequests,
    });
    onLogPrivacyExport(homeCommunity.id, alias);
    setFeedback({
      ok: true,
      text: t(lang, 'فایل کامل داده‌های شما (GDPR) دانلود شد.', 'Your GDPR data package was downloaded.'),
    });
  };

  const applyQuickDuration = (hours: number) => {
    setEndMin(Math.min(1440, startMin + hours * 60));
  };

  const renderPrimaryMatchCard = () =>
    fairUseViolation ? (
      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3.5">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-amber-950">
            {lang === 'fa' ? fairUseViolation.titleFa : fairUseViolation.titleEn}
          </h2>
          <p className="text-xs text-amber-900/90 leading-relaxed">
            {lang === 'fa' ? fairUseViolation.descFa : fairUseViolation.descEn}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col gap-2 pt-1">
          {fairUse.allowExtendedNegotiation && (
            <button
              type="button"
              onClick={() => setShowExtendedForm(true)}
              className="w-full min-h-[44px] px-4 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 whitespace-nowrap"
            >
              {t(lang, 'هماهنگی با مدیر / صاحب پارکینگ', 'Coordinate with Manager / Owner')}
            </button>
          )}
          {fairUseViolation.type === 'duration_cap' && (
            <button
              type="button"
              onClick={() => setEndMin(Math.min(1440, startMin + fairUse.maxHoursPerBooking * 60))}
              className="w-full min-h-[44px] px-4 text-xs font-medium bg-white border border-amber-300 text-amber-950 rounded-xl hover:bg-amber-100/60 whitespace-nowrap"
            >
              {t(lang, `تنظیم روی ${fairUse.maxHoursPerBooking} ساعت مجاز`, `Set to ${fairUse.maxHoursPerBooking}h max`)}
            </button>
          )}
        </div>
      </section>
    ) : (
      <section className="bg-slate-900 text-white rounded-2xl p-5 space-y-4">
        {bestAutoAssignOption ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-[11px] text-blue-300 font-medium">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t(lang, 'بهترین پیشنهاد هوشمند', 'Best Smart Match')}</span>
                </div>
                <div className="text-xl font-bold font-mono tabular-nums tracking-tight">
                  {bestAutoAssignOption.segments
                    .map((s) => `${s.resource.code} (${s.resource.floorOrZone})`)
                    .join(' → ')}
                </div>
                <div className="text-xs text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono tabular-nums">
                    {formatMinutes(bestAutoAssignOption.segments[0].startMin)}–
                    {formatMinutes(bestAutoAssignOption.segments[bestAutoAssignOption.segments.length - 1].endMin)}
                  </span>
                  <span>·</span>
                  <span>
                    {bestAutoAssignOption.totalEstimatedEur === 0
                      ? t(lang, 'رایگان', 'Free')
                      : `€${bestAutoAssignOption.totalEstimatedEur.toFixed(2)}`}
                  </span>
                  <span>·</span>
                  <span>
                    {bestAutoAssignOption.requiresManualApproval
                      ? t(lang, 'تأیید مالک', 'Owner approval')
                      : t(lang, 'تأیید فوری', 'Instant')}
                  </span>
                </div>
              </div>

              {(() => {
                const firstId = bestAutoAssignOption.segments[0].resource.id;
                const stat = ratingsByResource.get(firstId);
                if (!stat) return null;
                return (
                  <div className="inline-flex items-center gap-1 text-xs font-mono text-amber-300 shrink-0">
                    <Star className="w-3.5 h-3.5 fill-amber-300" />
                    <span>{stat.avg.toFixed(1)}</span>
                  </div>
                );
              })()}
            </div>

            <button
              type="button"
              onClick={handleAutoAssign}
              className="w-full min-h-[48px] text-sm font-semibold bg-white text-slate-900 rounded-xl hover:bg-blue-50 active:scale-[0.99] transition-all"
            >
              {bestAutoAssignOption.requiresManualApproval
                ? t(lang, 'ارسال درخواست رزرو', 'Request Best Bay')
                : t(lang, 'رزرو فوری همین جایگاه', 'Reserve Instantly')}
            </button>
          </>
        ) : (
          <div className="space-y-3 text-center py-2">
            <p className="text-xs text-slate-300 leading-relaxed">
              {t(lang, 'با فیلترهای انتخابی فعلی جای پارک خالی نیست.', 'No open bay matches these filters.')}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {totalActiveFilters > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="min-h-[40px] px-4 text-xs font-semibold bg-white text-slate-900 rounded-xl"
                >
                  {t(lang, 'پاک کردن فیلترها', 'Clear Filters')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowExtendedForm(true)}
                className="min-h-[40px] px-4 text-xs font-medium border border-slate-700 text-slate-200 rounded-xl hover:bg-slate-800"
              >
                {t(lang, 'هماهنگی با مدیر ساختمان', 'Ask Building Manager')}
              </button>
            </div>
          </div>
        )}
      </section>
    );

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-6">
      {/* Adaptive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {t(lang, 'رزرو پارکینگ موقت', 'Temporary Parking')}
          </h1>
          <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-slate-700">
              {lang === 'fa' ? homeCommunity.nameFa : homeCommunity.name}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t(lang, 'واحد', 'Unit')} {requester.unitNumber ?? '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentUserRole === 'manager' && residentUsers.length > 1 && (
            <select
              aria-label={t(lang, 'انتخاب کاربر برای پیش‌نمایش', 'Select resident preview')}
              value={effectiveUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setFloorFilter('ALL');
                setFeedback(null);
                setShowExtendedForm(false);
              }}
              className="h-11 max-w-[220px] px-3 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-900 truncate"
            >
              {residentUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {lang === 'fa' ? u.nameFa : u.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setShowPrivacySheet((v) => !v)}
            className="min-h-[42px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100/70 transition-colors whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5 text-emerald-700" />
            <span>{t(lang, 'هویت مخفی', 'Identity Hidden')}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Privacy Control Sheet */}
      {showPrivacySheet && (
        <section className="bg-white border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>{t(lang, 'کنترل حریم خصوصی و حقوق داده شما (GDPR)', 'Your Privacy & GDPR Controls')}</span>
            </div>
            <button
              type="button"
              onClick={onOpenTrustCenter}
              className="text-blue-700 font-medium hover:underline whitespace-nowrap"
            >
              {t(lang, 'مرکز اعتماد ←', 'Trust Center →')}
            </button>
          </div>

          <p className="text-slate-600 leading-relaxed">
            {t(
              lang,
              `اطلاعات شخصی شما داخل محیط رمزگذاری‌شده ${homeCommunity.nameFa} می‌ماند و هرگز برای همسایه‌های دیگر نمایش داده نمی‌شود.`,
              `Your personal details stay inside ${homeCommunity.name}'s encrypted tenant and are never exposed to neighbors.`
            )}
          </p>

          <label className="flex items-center justify-between gap-3 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <span className="font-medium text-slate-800">
              {t(lang, 'رزرو ناشناس (نمایش شناسه مستعار به جای نام شما)', 'Pseudonymous bookings (hide my real name)')}
            </span>
            <input
              type="checkbox"
              checked={anonymousBooking}
              onChange={(e) => setAnonymousBooking(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-700"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportMyData}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              {t(lang, 'دانلود داده‌های من (GDPR)', 'Export My Data')}
            </button>
            <button
              type="button"
              onClick={() => {
                onEraseUserReservations(requester.id);
                setFeedback({
                  ok: true,
                  text: t(lang, 'سابقه رزروهای شما مطابق حق فراموش‌شدن حذف شد.', 'Your reservation history was erased.'),
                });
              }}
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 bg-white border border-red-200 rounded-xl text-red-700 hover:bg-red-50 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t(lang, 'حذف سابقه من', 'Erase History')}
            </button>
          </div>
        </section>
      )}

      {/* Feedback Toast Banner */}
      {feedback && (
        <div
          role="status"
          className={`px-4 py-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            feedback.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-red-50 border-red-200 text-red-950'
          }`}
        >
          <span className="font-medium leading-relaxed">{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline shrink-0">
            {t(lang, 'بستن', 'Close')}
          </button>
        </div>
      )}

      {/* ADAPTIVE 12-COLUMN GRID (Single column on mobile, balanced 7/5 split on desktop!) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* MAIN COLUMN (7 cols on desktop): Time Picker + Filters + Available Bays */}
        <div className="lg:col-span-7 space-y-5">
          {/* Time & Quick Filter Control Card */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="res-start" className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t(lang, 'از ساعت', 'From')}
                </label>
                <select
                  id="res-start"
                  value={startMin}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setStartMin(v);
                    if (endMin <= v) setEndMin(Math.min(1440, v + 120));
                  }}
                  className="w-full h-12 px-3.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                >
                  {TIME_HOURS.slice(0, -1).map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="res-end" className="block text-xs font-medium text-slate-600 mb-1.5">
                  {t(lang, 'تا ساعت', 'Until')} ({formatDuration(validEndMin - startMin, lang)})
                </label>
                <select
                  id="res-end"
                  value={validEndMin}
                  onChange={(e) => setEndMin(Number(e.target.value))}
                  className="w-full h-12 px-3.5 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                >
                  {TIME_HOURS.filter((m) => m > startMin).map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Duration Presets + 1-Tap Essential Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { h: 2, fa: '۲ ساعت', en: '2h' },
                  { h: 4, fa: '۴ ساعت', en: '4h' },
                  { h: 8, fa: 'امروز (۸س)', en: 'Today (8h)' },
                ].map((p) => {
                  const active = requestedHours === p.h;
                  return (
                    <button
                      key={p.h}
                      type="button"
                      onClick={() => applyQuickDuration(p.h)}
                      className={`min-h-[38px] px-3 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {lang === 'fa' ? p.fa : p.en}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFreeOnly((v) => !v)}
                  className={`min-h-[38px] px-3 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
                    freeOnly ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {t(lang, 'رایگان', 'Free')}
                </button>
                <button
                  type="button"
                  onClick={() => setAutoApproveOnly((v) => !v)}
                  className={`min-h-[38px] px-3 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
                    autoApproveOnly ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  {t(lang, 'فوری', 'Instant')}
                </button>
                <button
                  type="button"
                  onClick={() => setEvOnly((v) => !v)}
                  className={`min-h-[38px] inline-flex items-center gap-1 px-3 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
                    evOnly ? 'bg-blue-700 border-blue-700 text-white' : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>EV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
                    showFilters || advancedFiltersCount > 0
                      ? 'bg-blue-50 border-blue-200 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    {t(lang, 'بیشتر', 'More')}
                    {advancedFiltersCount > 0 ? ` (${advancedFiltersCount})` : ''}
                  </span>
                </button>
              </div>
            </div>

            {/* Expandable Advanced Location & Type Filters */}
            {showFilters && (
              <div className="pt-3.5 border-t border-slate-100 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {availableBlocks.length > 0 && (
                    <select
                      aria-label={t(lang, 'بلوک', 'Block')}
                      value={blockFilter}
                      onChange={(e) => setBlockFilter(e.target.value)}
                      className="h-11 px-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-900"
                    >
                      <option value="ALL">{t(lang, 'همه بلوک‌ها', 'All Blocks')}</option>
                      {availableBlocks.map((bl) => (
                        <option key={bl} value={bl}>
                          {t(lang, 'بلوک', 'Block')} {bl}
                        </option>
                      ))}
                    </select>
                  )}

                  <select
                    aria-label={t(lang, 'طبقه', 'Floor')}
                    value={floorFilter}
                    onChange={(e) => setFloorFilter(e.target.value)}
                    className="h-11 px-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-900"
                  >
                    <option value="ALL">{t(lang, 'همه طبقات', 'All Floors')}</option>
                    {availableFloors.map((fl) => (
                      <option key={fl} value={fl}>
                        {t(lang, 'طبقه', 'Floor')} {fl}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label={t(lang, 'نوع پارکینگ', 'Bay type')}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="h-11 px-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-900"
                  >
                    <option value="ALL">{t(lang, 'همه انواع پارکینگ', 'All Bay Types')}</option>
                    {(Object.keys(CATEGORY_LABELS) as ParkingCategory[]).map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat][lang]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {communities.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setSameBuildingOnly((v) => !v)}
                      className={`min-h-[38px] px-3.5 text-xs font-medium rounded-xl border transition-colors ${
                        !sameBuildingOnly
                          ? 'bg-blue-700 border-blue-700 text-white'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      {sameBuildingOnly
                        ? t(lang, 'فقط ساختمان خودم', 'My Building Only')
                        : t(lang, '+ سایر ساختمان‌های مجموعه', '+ Linked Buildings')}
                    </button>
                  ) : (
                    <span />
                  )}

                  {totalActiveFilters > 0 && (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t(lang, 'پاک کردن همه فیلترها', 'Reset all filters')}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Mobile Primary Match Card (Shown right below time bar on mobile; moved to sticky sidebar on desktop) */}
          <div className="lg:hidden">{renderPrimaryMatchCard()}</div>

          {/* Extended Request Form (When opened) */}
          {showExtendedForm && (
            <form
              onSubmit={handleExtendedSubmit}
              className="bg-white border border-blue-200 rounded-2xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  {t(lang, 'هماهنگی نیاز فراتر از پارکینگ موقت', 'Extended / Long-Term Coordination')}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowExtendedForm(false)}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  {t(lang, 'بستن', 'Close')}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t(lang, 'نوع نیاز شما', 'Request Type')}</label>
                  <select
                    value={extReason}
                    onChange={(e) => setExtReason(e.target.value as typeof extReason)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                  >
                    <option value="extended_guest">{t(lang, 'مهمان چندروزه (بیش از سقف موقت)', 'Multi-day guest stay')}</option>
                    <option value="temporary_work">{t(lang, 'پروژه یا نیاز موقت چندروزه', 'Temporary multi-day need')}</option>
                    <option value="permanent_lease_inquiry">
                      {t(lang, 'درخواست اجاره ماهانه / دائمی پارکینگ', 'Permanent / monthly parking lease')}
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t(lang, 'هماهنگی از طریق', 'Coordinate With')}</label>
                  <select
                    value={extRoute}
                    onChange={(e) => setExtRoute(e.target.value as typeof extRoute)}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                  >
                    <option value="owner_and_manager">
                      {t(lang, 'مدیر ساختمان + صاحب پارکینگ', 'Manager + Bay Owner')}
                    </option>
                    <option value="manager">{t(lang, 'فقط مدیر ساختمان', 'Building Manager Only')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">{t(lang, 'تعداد روز', 'Days')}</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={extDays}
                    onChange={(e) => setExtDays(Number(e.target.value))}
                    className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block font-medium text-slate-700 mb-1">{t(lang, 'توضیح کوتاه (اختیاری)', 'Note (Optional)')}</label>
                  <input
                    type="text"
                    value={extNote}
                    onChange={(e) => setExtNote(e.target.value)}
                    placeholder={t(lang, 'مثلاً مهمان آخر هفته...', 'e.g. Weekend guest...')}
                    className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full h-11 inline-flex items-center justify-center gap-2 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800"
              >
                <Send className="w-4 h-4" />
                {t(lang, 'ارسال درخواست هماهنگی', 'Submit Coordination Request')}
              </button>
            </form>
          )}

          {/* Available Parking Bays List */}
          <section className="space-y-3">
            <div className="flex items-center justify-between px-0.5">
              <h2 className="text-sm font-bold text-slate-900">
                {t(
                  lang,
                  `جایگاه‌های آزاد در این ساعت (${matchingAvailableList.length})`,
                  `Available Bays (${matchingAvailableList.length})`
                )}
              </h2>
              {totalActiveFilters > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  {t(lang, 'نمایش همه', 'Show all')}
                </button>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
              {matchingAvailableList.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <p className="text-sm font-medium text-slate-700">
                    {t(lang, 'در این ساعت و فیلتر پارکینگ خالی یافت نشد.', 'No open bays found for this time and filter.')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {t(lang, 'ساعت یا فیلترها را تغییر دهید تا گزینه‌های بیشتر نمایش داده شوند.', 'Adjust your hours or clear filters to see more spots.')}
                  </p>
                </div>
              ) : (
                matchingAvailableList.map((cand) => {
                  const r = cand.resource;
                  const stat = ratingsByResource.get(r.id);

                  return (
                    <div
                      key={r.id}
                      className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition-colors"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-sm font-bold text-blue-800">{r.code}</span>
                          {r.spaceMeta?.block && (
                            <span className="text-xs font-semibold text-slate-700">
                              {t(lang, 'بلوک', 'Blk')} {r.spaceMeta.block}
                            </span>
                          )}
                          <span className="text-slate-300">·</span>
                          <span className="text-xs font-mono text-slate-600">{r.floorOrZone}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-xs font-mono tabular-nums text-slate-500">
                            {r.dimensions.widthM}×{r.dimensions.lengthM}m
                          </span>
                          {stat && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-0.5 text-xs font-mono text-amber-600">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
                                {stat.avg.toFixed(1)}
                              </span>
                            </>
                          )}
                        </div>

                        {r.spaceMeta?.locationNoteFa && (
                          <div className="text-xs text-slate-600 truncate">
                            {lang === 'fa' ? r.spaceMeta.locationNoteFa : r.spaceMeta.locationNoteEn}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span className="font-semibold text-slate-900">
                            {r.pricing.isFree ? t(lang, 'رایگان', 'Free') : `€${r.pricing.hourlyEur.toFixed(1)}/h`}
                          </span>
                          <span>·</span>
                          <span>
                            {r.approvalMode === 'automatic' ? t(lang, 'تأیید فوری', 'Instant') : t(lang, 'تأیید مالک', 'Approval')}
                          </span>
                          {r.evCharging && (
                            <>
                              <span>·</span>
                              <span className="text-emerald-700 font-semibold">
                                EV{r.features?.evPowerKw ? ` ${r.features.evPowerKw}kW` : ''}
                              </span>
                            </>
                          )}
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {cand.availableSlots
                              .slice(0, 1)
                              .map((s) => `${formatMinutes(s.startMin)}–${formatMinutes(s.endMin)}`)
                              .join('')}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={Boolean(fairUseViolation)}
                        onClick={() => handleDirectBookCandidate(cand)}
                        className="min-h-[42px] px-4 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800 disabled:opacity-35 transition-colors whitespace-nowrap shrink-0"
                      >
                        {t(lang, 'رزرو', 'Book')}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* STICKY SIDEBAR COLUMN (5 cols on desktop): Primary Match + Fair-Use Quota + My Bookings */}
        <div className="lg:col-span-5 space-y-5 lg:sticky lg:top-24">
          {/* Desktop Best Match Card */}
          <div className="hidden lg:block">{renderPrimaryMatchCard()}</div>

          {/* Visual Monthly Quota & Fair-Use Rules Card */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-900">
                {t(lang, 'سهمیه پارکینگ موقت این ماه', 'Monthly Temporary Quota')}
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {daysUsed} / {fairUse.maxDaysPerMonth} {t(lang, 'روز', 'days')}
              </span>
            </div>

            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  quotaPct >= 90 ? 'bg-red-600' : quotaPct >= 70 ? 'bg-amber-500' : 'bg-blue-700'
                }`}
                style={{ width: `${Math.max(4, quotaPct)}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs pt-0.5">
              <button
                type="button"
                onClick={() => setShowFairUseInfo((v) => !v)}
                className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900 font-medium"
              >
                <span>{t(lang, `قوانین منصفانه (سقف ${fairUse.maxHoursPerBooking} ساعت)`, `Fair rules (${fairUse.maxHoursPerBooking}h max)`)}</span>
                {showFairUseInfo ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={() => setShowExtendedForm((v) => !v)}
                className="text-blue-700 font-medium hover:underline whitespace-nowrap"
              >
                {t(lang, 'نیاز طولانی‌تر دارید؟', 'Need longer?')}
              </button>
            </div>

            {showFairUseInfo && (
              <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs text-slate-600">
                <div className="grid grid-cols-3 gap-2 font-mono tabular-nums text-center">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-slate-900 font-bold">{fairUse.maxHoursPerBooking}h</div>
                    <div className="font-sans text-[11px] text-slate-500">{t(lang, 'هر رزرو', 'Per stay')}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-slate-900 font-bold">{fairUse.maxDaysPerMonth}d</div>
                    <div className="font-sans text-[11px] text-slate-500">{t(lang, 'در ماه', 'Monthly')}</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-slate-900 font-bold">{fairUse.maxConsecutiveDays}d</div>
                    <div className="font-sans text-[11px] text-slate-500">{t(lang, 'پیاپی', 'Streak')}</div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {t(
                    lang,
                    'این سقف‌ها برای جلوگیری از استفاده دائمی به جای اجاره پارکینگ و حفظ عدالت بین همه همسایه‌هاست.',
                    'Limits ensure temporary bays remain fair and are not used in place of a permanent lease.'
                  )}
                </p>
              </div>
            )}
          </section>

          {/* My Active Bookings & Optional Experience Rating */}
          {myReservations.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">
                  {t(lang, `رزروهای فعال من (${myReservations.length})`, `My Active Bookings (${myReservations.length})`)}
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {myReservations.map((rsv) => {
                  const res = resourceMap.get(rsv.resourceId);
                  const comm = communityMap.get(rsv.communityId);
                  const alreadyReviewed = reviewedReservationIds.has(rsv.id);
                  const isOpen = reviewingReservationId === rsv.id;

                  return (
                    <div key={rsv.id} className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span className="font-mono text-blue-800">{res?.code ?? rsv.resourceId}</span>
                            <span className="text-xs text-emerald-700">{reservationStatusLabels[rsv.status][lang]}</span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            {formatMinutes(rsv.startMin)}–{formatMinutes(rsv.endMin)}
                            <span className="mx-1.5 font-sans">·</span>
                            <span className="font-sans">{lang === 'fa' ? comm?.nameFa : comm?.name}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!alreadyReviewed ? (
                            <button
                              type="button"
                              onClick={() => setReviewingReservationId(isOpen ? null : rsv.id)}
                              className="min-h-[38px] inline-flex items-center gap-1 px-3 text-xs font-medium text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 whitespace-nowrap"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                              {t(lang, 'امتیاز', 'Rate')}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium px-2">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t(lang, 'ثبت شد', 'Rated')}
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => onCancelReservation(rsv.id)}
                            className="min-w-[38px] min-h-[38px] flex items-center justify-center text-red-600 hover:bg-red-50 rounded-xl"
                            aria-label={t(lang, 'لغو رزرو', 'Cancel reservation')}
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isOpen && (
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-800">
                              {t(lang, 'تجربه شما (اختیاری)', 'Your experience (Optional)')}
                            </span>
                            <div className="flex items-center gap-0.5" dir="ltr">
                              {([1, 2, 3, 4, 5] as const).map((star) => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => setDraftRating(star)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-200/60"
                                  aria-label={`${star} stars`}
                                >
                                  <Star
                                    className={`w-5 h-5 ${
                                      star <= draftRating ? 'fill-amber-400 text-amber-500' : 'text-slate-300'
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {REVIEW_TAGS.map((tag) => {
                              const label = lang === 'fa' ? tag.fa : tag.en;
                              const active = draftTags.includes(label);
                              return (
                                <button
                                  key={tag.en}
                                  type="button"
                                  onClick={() =>
                                    setDraftTags((prev) =>
                                      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
                                    )
                                  }
                                  className={`min-h-[34px] px-2.5 rounded-lg border text-[11px] font-medium ${
                                    active
                                      ? 'bg-slate-900 border-slate-900 text-white'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>

                          <input
                            type="text"
                            value={draftComment}
                            onChange={(e) => setDraftComment(e.target.value)}
                            placeholder={t(lang, 'نظر کوتاه شما (اختیاری)...', 'Optional short note...')}
                            className="w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-xs"
                          />

                          <div className="flex items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={draftAnonymous}
                                onChange={(e) => setDraftAnonymous(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-700"
                              />
                              <span>{t(lang, 'انتشار ناشناس', 'Post anonymously')}</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => handleReviewSubmit(rsv)}
                              className="min-h-[38px] px-4 font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800"
                            >
                              {t(lang, 'ثبت امتیاز', 'Save')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* My Extended Coordination Requests */}
          {myExtendedRequests.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-4 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">
                  {t(lang, 'درخواست‌های هماهنگی من', 'My Extended Requests')}
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {myExtendedRequests.map((req) => (
                  <div key={req.id} className="p-4 text-xs flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-semibold text-slate-900">
                        {req.requestedDays} {t(lang, 'روز', 'days')} ·{' '}
                        {req.reasonType === 'permanent_lease_inquiry'
                          ? t(lang, 'اجاره دائمی', 'Permanent lease')
                          : req.reasonType === 'extended_guest'
                            ? t(lang, 'مهمان چندروزه', 'Multi-day guest')
                            : t(lang, 'نیاز چندروزه', 'Extended stay')}
                      </div>
                      <div className="text-slate-500 truncate">{req.note}</div>
                    </div>
                    <span
                      className={`font-semibold shrink-0 ${
                        req.status === 'Approved_Exception'
                          ? 'text-emerald-700'
                          : req.status === 'Referred_Lease'
                            ? 'text-blue-700'
                            : req.status === 'Declined'
                              ? 'text-red-700'
                              : 'text-amber-700'
                      }`}
                    >
                      {req.status === 'Approved_Exception'
                        ? t(lang, 'تأیید شد', 'Approved')
                        : req.status === 'Referred_Lease'
                          ? t(lang, 'ارجاع به اجاره', 'Referred')
                          : req.status === 'Declined'
                            ? t(lang, 'رد شده', 'Declined')
                            : t(lang, 'در بررسی', 'Pending')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
