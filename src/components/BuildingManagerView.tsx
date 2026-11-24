import React, { useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  LayoutGrid,
  Link2,
  MessageCircle,
  Minus,
  ParkingSquare,
  Plus,
  Scale,
  Search,
  ShieldAlert,
  ShieldCheck,
  Star,
  Upload,
  Users,
} from 'lucide-react';
import {
  AccessPolicyLevel,
  BlockedAccessAttempt,
  BuildingInviteLink,
  BuildingRosterEntry,
  Community,
  ExtendedParkingRequest,
  FairUsePolicy,
  Language,
  ParkingReview,
  Resource,
} from '../types/parkshare';
import { t } from '../i18n/translations';
import { deterministicHash, downloadJsonFile, maskEmail, maskPhone } from '../utils/privacy';
import { ParkingCatalogExplorer } from './ParkingCatalogExplorer';
import { WhatsAppBotPanel } from './WhatsAppBotPanel';
import { WhatsAppBotReply } from '../engines/whatsappBotEngine';

type ManagerSection = 'overview' | 'catalog' | 'roster' | 'rules' | 'whatsapp';

interface Props {
  lang: Language;
  communities: Community[];
  resources: Resource[];
  inviteLinks: BuildingInviteLink[];
  rosterEntries: BuildingRosterEntry[];
  blockedAttempts: BlockedAccessAttempt[];
  extendedRequests: ExtendedParkingRequest[];
  reviews: ParkingReview[];
  onCreateBuilding: (community: Community, initialInvite: BuildingInviteLink) => Promise<void> | void;
  onLoadBostonSample: () => Promise<string | null>;
  onToggleResourceActive: (resourceId: string) => void;
  onImportRosterEntries: (
    communityId: string,
    entries: BuildingRosterEntry[],
    activateImmediately?: boolean
  ) => Promise<number> | number;
  onToggleRosterStatus: (entryId: string) => void;
  onUpdateCommunityPolicies: (
    communityId: string,
    allowedUsagePolicies: AccessPolicyLevel[],
    allowPaidSharing: boolean
  ) => void;
  onUpdateFairUsePolicy: (communityId: string, fairUse: FairUsePolicy) => void;
  onDecideExtendedRequest: (requestId: string, status: ExtendedParkingRequest['status']) => void;
  onToggleInviteActive: (inviteId: string) => void;
  onOpenInviteForm: (token: string) => void;
  onOpenTrustCenter: () => void;
  onLogBuildingExport: (communityId: string) => void;
  onSimulateWhatsApp: (payload: {
    senderPhone: string;
    messageText?: string;
    buttonId?: string;
  }) => Promise<WhatsAppBotReply | null>;
  onFetchWhatsAppConfig: () => Promise<{
    liveConnected: boolean;
    displayNumber: string;
    privacyMode: string;
    webhookPath: string;
  } | null>;
}

const SAMPLE_CSV = `bay_code,floor,owner_name,unit,email,phone,ev_charger,height_m
P101,-1,Ali Rezaei,402,ali@example.com,+31 6 4012 8831,yes,2.2
P102,-1,Sara Ahmadi,508,sara@example.com,+31 6 5519 2044,no,2.15`;

const POLICY_OPTIONS: { value: AccessPolicyLevel; fa: string; en: string; descFa: string; descEn: string }[] = [
  {
    value: 'residents_only',
    fa: 'ساکنان همین ساختمان',
    en: 'Residents of this building',
    descFa: 'همیشه فعال برای همسایه‌های داخل ساختمان',
    descEn: 'Always active for building residents',
  },
  {
    value: 'residents_and_guests',
    fa: 'مهمانان ثبت‌شده ساکنان',
    en: 'Registered guests of residents',
    descFa: 'ساکنان می‌توانند برای مهمان خود جای پارک موقت بگیرند',
    descEn: 'Residents can reserve temporary spots for visitors',
  },
  {
    value: 'network_members',
    fa: 'سایر ساختمان‌های همین مجموعه',
    en: 'Other buildings you manage',
    descFa: 'امکان استفاده متقابل بین ساختمان‌های متصل همین مجموعه',
    descEn: 'Reciprocal sharing across your linked buildings',
  },
  {
    value: 'public',
    fa: 'کاربران بیرونی / عمومی',
    en: 'External / public users',
    descFa: 'قابل رزرو برای افراد خارج از ساختمان',
    descEn: 'Bookable by external city drivers',
  },
];

const PRESET_FLOORS_FA = ['-3', '-2', '-1', 'همکف', '1', '2', '3'];
const PRESET_FLOORS_EN = ['-3', '-2', '-1', 'G', '1', '2', '3'];

function parseCsvRoster(rawText: string, communityId: string, defaultFloor: string): BuildingRosterEntry[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsed: BuildingRosterEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(/[;,\t]+/).map((c) => c.trim());
    if (cols.length < 4) continue;
    if (i === 0 && /bay|code|پارکینگ|owner|email/i.test(cols[0] + cols[2])) continue;

    const bayCode = (cols[0] || '').toUpperCase();
    const floorOrZone = cols[1] || defaultFloor;
    const ownerName = cols[2] || '';
    const unitNumber = cols[3] || '';
    const email = (cols[4] || '').toLowerCase();
    const phone = cols[5] || '';
    const evRaw = (cols[6] || '').toLowerCase();
    const evCharging = evRaw === 'yes' || evRaw === 'true' || evRaw === '1' || evRaw === 'دارد' || evRaw === 'ev';
    const heightLimitM = Number(cols[7]) || 2.15;

    if (!bayCode || !ownerName || (!email && !phone)) continue;

    parsed.push({
      id: `ros-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      communityId,
      bayCode,
      floorOrZone,
      ownerName,
      unitNumber: unitNumber || 'Unassigned',
      email,
      phone,
      evCharging,
      heightLimitM,
      status: 'invited',
      addedAt: new Date().toISOString().slice(0, 10),
    });
  }
  return parsed;
}

export const BuildingManagerView: React.FC<Props> = ({
  lang,
  communities,
  resources,
  inviteLinks,
  rosterEntries,
  blockedAttempts,
  extendedRequests,
  reviews,
  onCreateBuilding,
  onLoadBostonSample,
  onToggleResourceActive,
  onImportRosterEntries,
  onToggleRosterStatus,
  onUpdateCommunityPolicies,
  onUpdateFairUsePolicy,
  onDecideExtendedRequest,
  onToggleInviteActive,
  onOpenInviteForm,
  onOpenTrustCenter,
  onLogBuildingExport,
  onSimulateWhatsApp,
  onFetchWhatsAppConfig,
}) => {
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>(communities[0]?.id ?? '');
  const [activeSection, setActiveSection] = useState<ManagerSection>('overview');
  const [showNewBuildingForm, setShowNewBuildingForm] = useState<boolean>(communities.length === 0);
  const [loadingSample, setLoadingSample] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [linkScope, setLinkScope] = useState<'single' | 'portfolio'>('single');
  const [maskPiiOnScreen, setMaskPiiOnScreen] = useState<boolean>(true);
  const [rosterAddMode, setRosterAddMode] = useState<'single' | 'bulk'>('single');
  const [rosterSearch, setRosterSearch] = useState<string>('');
  const [rosterStatusFilter, setRosterStatusFilter] = useState<'ALL' | 'verified' | 'invited' | 'revoked'>('ALL');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Create Building Form State
  const [bName, setBName] = useState('');
  const [bOrg, setBOrg] = useState('');
  const [bCity, setBCity] = useState('');
  const [selectedFloors, setSelectedFloors] = useState<string[]>(['-1']);
  const [customFloorInput, setCustomFloorInput] = useState('');
  const [linkedBuildingIds, setLinkedBuildingIds] = useState<string[]>([]);

  // Bulk Whitelist Import State
  const [bulkText, setBulkText] = useState<string>('');
  const [importFeedback, setImportFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Single Bay + Owner Quick Add
  const [bayCode, setBayCode] = useState('');
  const [bayFloor, setBayFloor] = useState('');
  const [bayEv, setBayEv] = useState(false);
  const [bayOwnerName, setBayOwnerName] = useState('');
  const [bayOwnerEmail, setBayOwnerEmail] = useState('');
  const [bayOwnerPhone, setBayOwnerPhone] = useState('');
  const [bayUnit, setBayUnit] = useState('');
  const [bayActiveNow, setBayActiveNow] = useState(false);

  const presetFloors = lang === 'fa' ? PRESET_FLOORS_FA : PRESET_FLOORS_EN;
  const allFloorChoices = useMemo(() => {
    const extra = selectedFloors.filter((f) => !presetFloors.includes(f));
    return [...presetFloors, ...extra];
  }, [presetFloors, selectedFloors]);

  const toggleFloorChoice = (floor: string) => {
    setSelectedFloors((prev) => {
      if (prev.includes(floor)) {
        return prev.length > 1 ? prev.filter((f) => f !== floor) : prev;
      }
      return [...prev, floor];
    });
  };

  const handleAddCustomFloor = () => {
    const clean = customFloorInput.trim();
    if (!clean) return;
    if (!selectedFloors.includes(clean)) {
      setSelectedFloors((prev) => [...prev, clean]);
    }
    setCustomFloorInput('');
  };

  const activeCommunity = useMemo(() => {
    if (communities.length === 0) return null;
    return communities.find((c) => c.id === selectedCommunityId) ?? communities[0];
  }, [communities, selectedCommunityId]);

  const effectiveFloorValue = bayFloor || activeCommunity?.floors?.[0] || '-1';

  const buildingResources = useMemo(
    () => (activeCommunity ? resources.filter((r) => r.communityId === activeCommunity.id && r.type === 'parking') : []),
    [resources, activeCommunity]
  );

  const buildingRoster = useMemo(
    () => (activeCommunity ? rosterEntries.filter((e) => e.communityId === activeCommunity.id) : []),
    [rosterEntries, activeCommunity]
  );

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    return buildingRoster.filter((entry) => {
      if (rosterStatusFilter !== 'ALL' && entry.status !== rosterStatusFilter) return false;
      if (!q) return true;
      return [entry.bayCode, entry.floorOrZone, entry.ownerName, entry.unitNumber, entry.email, entry.phone]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [buildingRoster, rosterSearch, rosterStatusFilter]);

  const buildingBlocked = useMemo(
    () => (activeCommunity ? blockedAttempts.filter((a) => a.communityId === activeCommunity.id) : []),
    [blockedAttempts, activeCommunity]
  );

  const buildingExtendedRequests = useMemo(
    () => (activeCommunity ? extendedRequests.filter((r) => r.communityId === activeCommunity.id) : []),
    [extendedRequests, activeCommunity]
  );

  const pendingExtendedCount = useMemo(
    () => buildingExtendedRequests.filter((r) => r.status === 'Pending').length,
    [buildingExtendedRequests]
  );

  const buildingReviews = useMemo(
    () => (activeCommunity ? reviews.filter((r) => r.communityId === activeCommunity.id) : []),
    [reviews, activeCommunity]
  );

  const avgBuildingRating = useMemo(() => {
    if (buildingReviews.length === 0) return null;
    return buildingReviews.reduce((acc, r) => acc + r.rating, 0) / buildingReviews.length;
  }, [buildingReviews]);

  const primaryInvite = useMemo(
    () => (activeCommunity ? inviteLinks.find((l) => l.communityId === activeCommunity.id) : undefined),
    [inviteLinks, activeCommunity]
  );

  const sameOrgCommunities = useMemo(() => {
    if (!activeCommunity) return [];
    return communities.filter(
      (c) => c.organization.trim().toLowerCase() === activeCommunity.organization.trim().toLowerCase()
    );
  }, [communities, activeCommunity]);

  const portfolioToken = useMemo(() => {
    if (!activeCommunity) return '';
    const slug = activeCommunity.organization.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'group';
    return `org-${slug}`;
  }, [activeCommunity]);

  const effectiveToken =
    activeCommunity && linkScope === 'portfolio' && sameOrgCommunities.length > 1
      ? portfolioToken
      : primaryInvite?.token ?? (activeCommunity ? `join-${activeCommunity.id}` : '');

  const getShareUrl = (token: string) => {
    const base =
      typeof window !== 'undefined' ? window.location.origin + window.location.pathname : 'https://parkshare.app/';
    return `${base}?invite=${token}`;
  };

  const handleCopyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(getShareUrl(token));
    } catch {
      // Ignore in restricted iframe
    }
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCreateBuildingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bName.trim()) return;

    const id = `comm-${Date.now()}`;
    const floors = selectedFloors.length > 0 ? selectedFloors : ['-1'];
    const orgLabel = bOrg.trim() || bName.trim();
    const newCommunity: Community = {
      id,
      name: bName.trim(),
      nameFa: bName.trim(),
      organization: orgLabel,
      city: bCity.trim() || 'Rotterdam',
      cityFa: bCity.trim() || 'روتردام',
      country: 'NL',
      timezone: 'Europe/Amsterdam',
      floors,
      deploymentModel: 'dedicated_cloud',
      encryptionLevel: 'customer_managed_keys',
      keyFingerprint: `key-${Math.random().toString(16).slice(2, 10)}`,
      federationEnabled: linkedBuildingIds.length > 0,
      connectedCommunityIds: linkedBuildingIds,
      allowExternalGuests: true,
      consentDemandAnalytics: false,
      strictWhitelistOnly: true,
      allowedUsagePolicies:
        linkedBuildingIds.length > 0
          ? ['residents_only', 'residents_and_guests', 'network_members']
          : ['residents_only', 'residents_and_guests'],
      allowPaidSharing: false,
      dataRetentionDays: 30,
      dataResidencyRegion: t(lang, 'محیط خصوصی و رمزگذاری‌شده ساختمان', 'Private Encrypted Building Tenant'),
      zeroPiiHashMode: true,
      fairUsePolicy: {
        maxHoursPerBooking: 12,
        maxDaysPerMonth: 10,
        maxConsecutiveDays: 3,
        cooldownHoursAfterStreak: 12,
        allowExtendedNegotiation: true,
      },
      enabledModules: ['parking'],
      coordinates: { lat: 51.908, lng: 4.486 },
    };

    const slug =
      bName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'building';

    const initialInvite: BuildingInviteLink = {
      id: `inv-${Date.now()}`,
      token: `${slug}-${Math.random().toString(36).slice(2, 6)}`,
      communityId: id,
      label: lang === 'fa' ? `لینک ورود همسایه‌های ${bName.trim()}` : `${bName.trim()} Resident Portal Link`,
      createdAt: new Date().toISOString().slice(0, 10),
      active: true,
      defaultFree: true,
      defaultAccessPolicy: 'residents_only',
      submissionsCount: 0,
    };

    await onCreateBuilding(newCommunity, initialInvite);
    setSelectedCommunityId(id);
    setBayFloor(floors[0] ?? '-1');
    setBName('');
    setSelectedFloors(['-1']);
    setCustomFloorInput('');
    setLinkedBuildingIds([]);
    setShowNewBuildingForm(false);
    setActiveSection('overview');
  };

  const handleToggleAllowedPolicy = (policy: AccessPolicyLevel) => {
    if (!activeCommunity || policy === 'residents_only') return;
    const current = activeCommunity.allowedUsagePolicies ?? ['residents_only'];
    const next = current.includes(policy) ? current.filter((p) => p !== policy) : [...current, policy];
    onUpdateCommunityPolicies(activeCommunity.id, next, activeCommunity.allowPaidSharing);
  };

  const handleSetPricingMode = (allowPaid: boolean) => {
    if (!activeCommunity) return;
    onUpdateCommunityPolicies(
      activeCommunity.id,
      activeCommunity.allowedUsagePolicies ?? ['residents_only'],
      allowPaid
    );
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeCommunity?.id ?? 'building'}-owners-whitelist.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCommunity) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || '');
      const parsed = parseCsvRoster(content, activeCommunity.id, activeCommunity.floors[0] ?? '-1');
      if (parsed.length === 0) {
        setImportFeedback({
          ok: false,
          text: t(lang, 'ردیف معتبری در فایل یافت نشد.', 'No valid rows found in CSV.'),
        });
      } else {
        const added = await onImportRosterEntries(activeCommunity.id, parsed, false);
        setImportFeedback({
          ok: true,
          text: t(lang, `${added} صاحب پارکینگ به لیست مجاز اضافه شد.`, `${added} owners added to whitelist.`),
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleBulkImportSubmit = async () => {
    if (!activeCommunity) return;
    const parsed = parseCsvRoster(bulkText, activeCommunity.id, activeCommunity.floors[0] ?? '-1');
    if (parsed.length === 0) {
      setImportFeedback({
        ok: false,
        text: t(
          lang,
          'فرمت ورودی معتبر نیست. هر خط: کد پارکینگ، طبقه، نام مالک، شماره واحد، ایمیل، تلفن',
          'Invalid rows. Format: bay_code, floor, owner_name, unit, email, phone'
        ),
      });
      return;
    }
    const added = await onImportRosterEntries(activeCommunity.id, parsed, false);
    setBulkText('');
    setImportFeedback({
      ok: true,
      text: t(lang, `${added} صاحب پارکینگ به لیست مجاز ساختمان اضافه شد.`, `${added} owners imported into whitelist.`),
    });
  };

  const handleAddSingleOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommunity || !bayCode.trim() || !bayOwnerName.trim()) return;
    const entry: BuildingRosterEntry = {
      id: `ros-${Date.now()}`,
      communityId: activeCommunity.id,
      bayCode: bayCode.trim().toUpperCase(),
      floorOrZone: effectiveFloorValue,
      ownerName: bayOwnerName.trim(),
      unitNumber: bayUnit.trim() || '-',
      email: bayOwnerEmail.trim().toLowerCase(),
      phone: bayOwnerPhone.trim(),
      evCharging: bayEv,
      heightLimitM: 2.15,
      status: bayActiveNow ? 'verified' : 'invited',
      addedAt: new Date().toISOString().slice(0, 10),
    };
    await onImportRosterEntries(activeCommunity.id, [entry], bayActiveNow);
    setBayCode('');
    setBayOwnerName('');
    setBayOwnerEmail('');
    setBayOwnerPhone('');
    setBayUnit('');
    setImportFeedback({
      ok: true,
      text: t(
        lang,
        `پارکینگ ${entry.bayCode} در لیست مجاز ثبت شد. اکنون این همسایه می‌تواند با لینک دعوت وارد شود.`,
        `Bay ${entry.bayCode} added to whitelist. The resident can now sign up via the invite link.`
      ),
    });
  };

  const hasBostonSample = useMemo(
    () => communities.some((c) => c.name === 'Boston Residence'),
    [communities]
  );

  const handleLoadSampleClick = async () => {
    setLoadingSample(true);
    try {
      const createdId = await onLoadBostonSample();
      if (createdId) {
        setSelectedCommunityId(createdId);
        setShowNewBuildingForm(false);
        setActiveSection('catalog');
      }
    } finally {
      setLoadingSample(false);
    }
  };

  const updateFairUseField = (
    field: keyof Omit<FairUsePolicy, 'allowExtendedNegotiation'>,
    value: number,
    min: number,
    max: number
  ) => {
    if (!activeCommunity) return;
    const clamped = Math.max(min, Math.min(max, value));
    onUpdateFairUsePolicy(activeCommunity.id, {
      ...activeCommunity.fairUsePolicy,
      [field]: clamped,
    });
  };

  const renderCreateBuildingForm = () => (
    <form
      onSubmit={handleCreateBuildingSubmit}
      className="bg-white border border-blue-200 rounded-2xl p-5 sm:p-6 space-y-5"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {communities.length === 0
              ? t(lang, 'تعریف اولین ساختمان شما', 'Create Your First Building')
              : t(lang, 'افزودن ساختمان جدید', 'Add New Building')}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {t(
              lang,
              'مشخصات پایه ساختمان را وارد کنید تا لینک دعوت و لیست مجاز ساکنان آماده شود.',
              'Enter basic building details to generate your whitelist and resident portal link.'
            )}
          </p>
        </div>
        {communities.length > 0 && (
          <button
            type="button"
            onClick={() => setShowNewBuildingForm(false)}
            className="min-h-[36px] px-3 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
          >
            {t(lang, 'بستن', 'Close')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor="b-name" className="block text-xs font-medium text-slate-700 mb-1.5">
            {t(lang, 'نام ساختمان', 'Building Name')}
          </label>
          <input
            id="b-name"
            type="text"
            required
            value={bName}
            onChange={(e) => setBName(e.target.value)}
            placeholder={t(lang, 'مثلاً: برج بوستون', 'e.g. Boston Tower')}
            className="w-full h-11 px-3.5 text-sm border border-slate-200 rounded-xl"
          />
        </div>

        <div>
          <label htmlFor="b-org" className="block text-xs font-medium text-slate-700 mb-1.5">
            {t(lang, 'نام مجموعه یا شرکت مدیر (اختیاری)', 'Management Group (Optional)')}
          </label>
          <input
            id="b-org"
            type="text"
            value={bOrg}
            onChange={(e) => setBOrg(e.target.value)}
            placeholder={t(lang, 'مثلاً: Vesteda', 'e.g. Vesteda')}
            className="w-full h-11 px-3.5 text-sm border border-slate-200 rounded-xl"
          />
        </div>

        <div>
          <label htmlFor="b-city" className="block text-xs font-medium text-slate-700 mb-1.5">
            {t(lang, 'شهر', 'City')}
          </label>
          <input
            id="b-city"
            type="text"
            value={bCity}
            onChange={(e) => setBCity(e.target.value)}
            placeholder={t(lang, 'مثلاً: روتردام', 'e.g. Rotterdam')}
            className="w-full h-11 px-3.5 text-sm border border-slate-200 rounded-xl"
          />
        </div>
      </div>

      {/* Clickable Floor Picker */}
      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-slate-700">
            {t(lang, 'پارکینگ در کدام طبقات است؟', 'Which floors have parking?')}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {t(lang, 'روی طبقات پارکینگ ساختمان بزنید تا انتخاب شوند.', 'Tap the floors that contain parking bays.')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {allFloorChoices.map((floor) => {
            const active = selectedFloors.includes(floor);
            return (
              <button
                key={floor}
                type="button"
                onClick={() => toggleFloorChoice(floor)}
                className={`min-w-[56px] min-h-[42px] px-3.5 text-xs font-semibold rounded-xl border transition-colors ${
                  active
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {floor}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 max-w-sm">
          <input
            type="text"
            value={customFloorInput}
            onChange={(e) => setCustomFloorInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddCustomFloor();
              }
            }}
            placeholder={t(lang, 'طبقه دیگر (مثلاً -4 یا محوطه)', 'Other floor (e.g. -4 or Yard)')}
            className="flex-1 h-11 px-3 text-xs bg-white border border-slate-200 rounded-xl"
          />
          <button
            type="button"
            onClick={handleAddCustomFloor}
            className="h-11 px-4 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap"
          >
            {t(lang, '+ افزودن', '+ Add')}
          </button>
        </div>
      </div>

      {communities.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-slate-100">
          <div className="text-xs font-medium text-slate-700">
            {t(
              lang,
              'اشتراک متقابل با سایر ساختمان‌های شما (اختیاری):',
              'Allow reciprocal parking with your other buildings (optional):'
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {communities.map((c) => {
              const checked = linkedBuildingIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="inline-flex items-center gap-2 min-h-[38px] text-xs text-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setLinkedBuildingIds((prev) =>
                        prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                      )
                    }
                    className="w-4 h-4 rounded border-slate-300 text-blue-700"
                  />
                  <span>{lang === 'fa' ? c.nameFa : c.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
        <div className="inline-flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            {t(
              lang,
              'اطلاعات هر ساختمان به‌صورت مستقل و رمزگذاری‌شده نگهداری می‌شود.',
              'Each building tenant is isolated and encrypted automatically.'
            )}
          </span>
        </div>
        <button
          type="submit"
          className="h-11 px-6 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          {t(lang, 'ثبت ساختمان و ادامه', 'Save Building & Continue')}
        </button>
      </div>
    </form>
  );

  // CLEAN SLATE LAUNCHPAD (Empty by default + 1-click Boston Residence test dataset)
  if (!activeCommunity) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg sm:text-xl font-bold">
              {t(lang, 'خوش آمدید — سامانه آماده شروع است', 'Welcome — Ready to Set Up Your Building')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              {t(
                lang,
                'هیچ داده‌ی پیش‌فرضی ثبت نشده است. ساختمان خودتان را بسازید یا برای بررسی سریع فیلترها و سناریوها، دیتاست تست ۴۰ پارکینگی Boston Residence را بارگذاری کنید.',
                'Your workspace starts completely clean. Create your own building below, or load the 40-bay Boston Residence test dataset in one click.'
              )}
            </p>
          </div>
          <button
            type="button"
            disabled={loadingSample}
            onClick={handleLoadSampleClick}
            className="min-h-[44px] px-4 py-2.5 text-xs font-semibold bg-white text-slate-900 rounded-xl hover:bg-blue-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {loadingSample
              ? t(lang, 'در حال بارگذاری...', 'Loading sample...')
              : t(lang, 'بارگذاری نمونه Boston Residence (۴۰ پارکینگ)', 'Load Boston Residence (40 Bays)')}
          </button>
        </div>

        {renderCreateBuildingForm()}
      </div>
    );
  }

  const activeBaysCount = buildingResources.filter((r) => r.sharingEnabled && r.active).length;
  const whitelistedCount = buildingRoster.filter((e) => e.status !== 'revoked').length;

  const sectionTabs: {
    id: ManagerSection;
    labelFa: string;
    labelEn: string;
    count?: number;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'overview', labelFa: 'نمای کلی و دعوت', labelEn: 'Overview & Invite', icon: LayoutGrid },
    {
      id: 'catalog',
      labelFa: 'بانک پارکینگ‌ها',
      labelEn: 'Parking Catalog',
      count: buildingResources.length,
      icon: ParkingSquare,
    },
    {
      id: 'roster',
      labelFa: 'لیست مجاز ساکنان',
      labelEn: 'Resident Whitelist',
      count: whitelistedCount,
      icon: Users,
    },
    {
      id: 'rules',
      labelFa: 'قوانین و درخواست‌ها',
      labelEn: 'Fair-Use & Requests',
      count: pendingExtendedCount > 0 ? pendingExtendedCount : undefined,
      icon: Scale,
    },
    {
      id: 'whatsapp',
      labelFa: 'بات واتساپ',
      labelEn: 'WhatsApp Bot',
      icon: MessageCircle,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Building Context Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 truncate">
              {lang === 'fa' ? activeCommunity.nameFa : activeCommunity.name}
            </h1>
            {avgBuildingRating !== null && (
              <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-700">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                {avgBuildingRating.toFixed(1)} ({buildingReviews.length})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {activeCommunity.organization} · {lang === 'fa' ? activeCommunity.cityFa : activeCommunity.city} ·{' '}
            {activeCommunity.floors.length} {t(lang, 'طبقه پارکینگ', 'parking floors')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {communities.length > 1 && (
            <select
              aria-label={t(lang, 'انتخاب ساختمان', 'Select building')}
              value={activeCommunity.id}
              onChange={(e) => {
                const next = communities.find((c) => c.id === e.target.value);
                setSelectedCommunityId(e.target.value);
                setImportFeedback(null);
                if (next?.floors?.[0]) setBayFloor(next.floors[0]);
              }}
              className="h-11 px-3 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-900"
            >
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'fa' ? c.nameFa : c.name}
                </option>
              ))}
            </select>
          )}

          {!hasBostonSample && (
            <button
              type="button"
              disabled={loadingSample}
              onClick={handleLoadSampleClick}
              className="h-11 px-3.5 text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
            >
              {loadingSample
                ? t(lang, 'در حال بارگذاری...', 'Loading...')
                : t(lang, 'نمونه تست ۴۰ پارکینگ بوستون', 'Load 40-Bay Sample')}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNewBuildingForm((v) => !v)}
            className="h-11 inline-flex items-center gap-1.5 px-4 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'ساختمان جدید', 'Add Building')}
          </button>
        </div>
      </div>

      {showNewBuildingForm && renderCreateBuildingForm()}

      {/* 4-Metric KPI Strip (Clickable shortcuts to relevant workspace tabs) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveSection('catalog')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 text-start transition-colors"
        >
          <div className="text-xs text-slate-500">{t(lang, 'پارکینگ‌های فعال', 'Active Bays')}</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            {activeBaysCount}
            <span className="text-sm font-normal text-slate-400"> / {buildingResources.length}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('roster')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 text-start transition-colors"
        >
          <div className="text-xs text-slate-500">{t(lang, 'ساکنان لیست مجاز', 'Whitelisted Residents')}</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {whitelistedCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('rules')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 text-start transition-colors"
        >
          <div className="text-xs text-slate-500">{t(lang, 'درخواست‌های استثنا', 'Pending Requests')}</div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              pendingExtendedCount > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {pendingExtendedCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveSection('roster')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-4 text-start transition-colors"
        >
          <div className="text-xs text-slate-500">{t(lang, 'ورود غیرمجاز مسدود', 'Blocked Outsiders')}</div>
          <div
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              buildingBlocked.length > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {buildingBlocked.length}
          </div>
        </button>
      </div>

      {/* Focused Sub-Navigation Tabs (Eliminates endless scrolling on desktop & mobile!) */}
      <div className="border-b border-slate-200 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-px">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-blue-700 text-blue-800'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{lang === 'fa' ? tab.labelFa : tab.labelEn}</span>
                {tab.count !== undefined && (
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      active ? 'text-blue-700 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: OVERVIEW — INVITE LINK + ACCESS POLICY + PRIVACY BAR */}
      {activeSection === 'overview' && (
        <div className="space-y-5">
          {/* Privacy Posture Strip */}
          <div className="bg-white border border-emerald-200 rounded-2xl px-4 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-700">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                {t(lang, 'محافظت از حریم خصوصی فعال است', 'Building Privacy Active')}
              </span>
              <span className="text-slate-300">·</span>
              <span>{t(lang, 'ورود فقط برای اعضای لیست مجاز', 'Whitelist-only resident signup')}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  downloadJsonFile(`parkshare-${activeCommunity.id}.json`, {
                    exportedAt: new Date().toISOString(),
                    building: activeCommunity,
                    baysCount: buildingResources.length,
                    hashedWhitelist: buildingRoster.map((e) => ({
                      bayCode: e.bayCode,
                      floor: e.floorOrZone,
                      status: e.status,
                      hash: deterministicHash(`${e.email}:${e.unitNumber}`),
                    })),
                  });
                  onLogBuildingExport(activeCommunity.id);
                }}
                className="inline-flex items-center gap-1.5 min-h-[36px] text-slate-700 hover:text-slate-900 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                {t(lang, 'خروجی داده (JSON)', 'Export Data')}
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={onOpenTrustCenter}
                className="min-h-[36px] text-blue-700 hover:underline font-medium"
              >
                {t(lang, 'مرکز اعتماد و حریم خصوصی', 'Trust Center')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
            {/* Unified Invite Link Card */}
            <section className="xl:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <Link2 className="w-4 h-4 text-blue-700" />
                      <h2>{t(lang, 'لینک واحد دعوت همسایه‌ها', 'Unified Resident Invite Link')}</h2>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {t(
                        lang,
                        'این یک لینک برای تمام ساکنان کافی است؛ هر فرد پس از احراز هویت در لیست مجاز، نام کاربری و رمز عبور خود را می‌سازد.',
                        'Share this single link in your building group. Only whitelisted owners can activate an account.'
                      )}
                    </p>
                  </div>
                  {primaryInvite && linkScope === 'single' && (
                    <button
                      type="button"
                      onClick={() => onToggleInviteActive(primaryInvite.id)}
                      className="min-h-[36px] px-2 text-xs font-medium text-slate-600 hover:text-slate-900 underline shrink-0"
                    >
                      {primaryInvite.active ? t(lang, 'توقف لینک', 'Pause') : t(lang, 'فعال‌سازی', 'Resume')}
                    </button>
                  )}
                </div>

                {sameOrgCommunities.length > 1 && (
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setLinkScope('single')}
                      className={`min-h-[38px] px-3 text-xs font-medium rounded-lg transition-colors ${
                        linkScope === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {t(lang, `فقط ${activeCommunity.nameFa}`, `${activeCommunity.name} Only`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkScope('portfolio')}
                      className={`min-h-[38px] px-3 text-xs font-medium rounded-lg transition-colors ${
                        linkScope === 'portfolio' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      {t(
                        lang,
                        `همه ساختمان‌های مجموعه (${sameOrgCommunities.length})`,
                        `All Group Buildings (${sameOrgCommunities.length})`
                      )}
                    </button>
                  </div>
                )}

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div
                    dir="ltr"
                    className="px-3.5 py-2.5 text-xs font-mono bg-white border border-slate-200 rounded-xl text-slate-800 truncate"
                  >
                    {getShareUrl(effectiveToken)}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(effectiveToken)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800 transition-colors whitespace-nowrap"
                    >
                      {copiedToken === effectiveToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedToken === effectiveToken
                        ? t(lang, 'لینک کپی شد', 'Link Copied')
                        : t(lang, 'کپی لینک برای ارسال', 'Copy Invite Link')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenInviteForm(effectiveToken)}
                      className="min-h-[44px] inline-flex items-center justify-center gap-2 px-4 text-xs font-medium bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-4 h-4" />
                      {t(lang, 'تست فرم همسایه', 'Preview Resident Form')}
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  {t(
                    lang,
                    'ابتدا مطمئن شوید لیست ساکنان مجاز وارد شده است.',
                    'Make sure your authorized resident list is uploaded first.'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSection('roster')}
                  className="text-blue-700 font-medium hover:underline whitespace-nowrap shrink-0"
                >
                  {t(lang, 'مدیریت لیست مجاز ←', 'Open Whitelist →')}
                </button>
              </div>
            </section>

            {/* Allowed Users & Pricing Rules */}
            <section className="xl:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3.5">
                  <h2 className="text-sm font-bold text-slate-900">
                    {t(lang, 'چه کسانی حق استفاده از پارکینگ دارند؟', 'Who May Use Parking in This Building?')}
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {t(
                      lang,
                      'ساکنان در فرم ثبت‌نام فقط از بین گزینه‌های فعال‌شده اینجا می‌توانند انتخاب کنند.',
                      'Residents only see the audience options enabled here during setup.'
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  {POLICY_OPTIONS.map((opt) => {
                    const checked = (activeCommunity.allowedUsagePolicies ?? ['residents_only']).includes(opt.value);
                    const isBaseline = opt.value === 'residents_only';
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 p-3.5 rounded-xl border transition-colors ${
                          checked ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'
                        } ${isBaseline ? 'cursor-default' : 'cursor-pointer hover:bg-slate-50'}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isBaseline}
                          onChange={() => handleToggleAllowedPolicy(opt.value)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-700 mt-0.5 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900">
                            {lang === 'fa' ? opt.fa : opt.en}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {lang === 'fa' ? opt.descFa : opt.descEn}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs font-medium text-slate-700">
                  {t(lang, 'قانون هزینه اشتراک‌گذاری:', 'Sharing Pricing Rule:')}
                </div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleSetPricingMode(false)}
                    className={`min-h-[40px] px-3 text-xs font-medium rounded-lg transition-colors ${
                      !activeCommunity.allowPaidSharing ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {t(lang, 'فقط رایگان', 'Free Only')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPricingMode(true)}
                    className={`min-h-[40px] px-3 text-xs font-medium rounded-lg transition-colors ${
                      activeCommunity.allowPaidSharing ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    {t(lang, 'رایگان یا پولی (اختیاری)', 'Free or Paid')}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* TAB 2: FULL PARKING CATALOG, MULTI-FACET FILTERS & 5 TEST SCENARIOS */}
      {activeSection === 'catalog' && (
        <ParkingCatalogExplorer
          lang={lang}
          community={activeCommunity}
          resources={buildingResources}
          onToggleResourceActive={onToggleResourceActive}
        />
      )}

      {/* TAB 3: OFFICIAL WHITELIST ROSTER (CLEAR ADD MODES + SEARCH + MOBILE CARDS) */}
      {activeSection === 'roster' && (
        <div className="space-y-5">
          {/* Add Owners Card */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {t(lang, 'افزودن به لیست رسمی ساکنان مجاز', 'Add to Official Authorized Resident List')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    lang,
                    'فقط افرادی که اینجا ثبت می‌شوند اجازه ساخت حساب و ورود به پنل پارکینگ را دارند.',
                    'Only residents registered here can verify their identity and create a login.'
                  )}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
                <button
                  type="button"
                  onClick={() => setRosterAddMode('single')}
                  className={`min-h-[38px] px-3.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    rosterAddMode === 'single' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {t(lang, 'افزودن تکی', 'Add Single')}
                </button>
                <button
                  type="button"
                  onClick={() => setRosterAddMode('bulk')}
                  className={`min-h-[38px] px-3.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    rosterAddMode === 'bulk' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {t(lang, 'ورود گروهی CSV', 'Bulk CSV')}
                </button>
              </div>
            </div>

            {rosterAddMode === 'single' ? (
              <form onSubmit={handleAddSingleOwner} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                  <div>
                    <label htmlFor="ros-bay" className="block font-medium text-slate-700 mb-1">
                      {t(lang, 'کد پارکینگ', 'Bay Code')}
                    </label>
                    <input
                      id="ros-bay"
                      type="text"
                      required
                      dir="ltr"
                      value={bayCode}
                      onChange={(e) => setBayCode(e.target.value)}
                      placeholder="P1-041"
                      className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label htmlFor="ros-floor" className="block font-medium text-slate-700 mb-1">
                      {t(lang, 'طبقه', 'Floor')}
                    </label>
                    <select
                      id="ros-floor"
                      value={effectiveFloorValue}
                      onChange={(e) => setBayFloor(e.target.value)}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                    >
                      {activeCommunity.floors.map((fl) => (
                        <option key={fl} value={fl}>
                          {t(lang, 'طبقه', 'Floor')} {fl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="ros-unit" className="block font-medium text-slate-700 mb-1">
                      {t(lang, 'شماره واحد', 'Unit Number')}
                    </label>
                    <input
                      id="ros-unit"
                      type="text"
                      dir="ltr"
                      value={bayUnit}
                      onChange={(e) => setBayUnit(e.target.value)}
                      placeholder="402"
                      className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label htmlFor="ros-name" className="block font-medium text-slate-700 mb-1">
                      {t(lang, 'نام صاحب پارکینگ', 'Owner Full Name')}
                    </label>
                    <input
                      id="ros-name"
                      type="text"
                      required
                      value={bayOwnerName}
                      onChange={(e) => setBayOwnerName(e.target.value)}
                      placeholder={t(lang, 'مثلاً: سارا احمدی', 'e.g. Sara Ahmadi')}
                      className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label htmlFor="ros-email" className="block font-medium text-slate-700 mb-1">
                      {t(lang, 'ایمیل (برای احراز هویت)', 'Email (for verification)')}
                    </label>
                    <input
                      id="ros-email"
                      type="email"
                      required
                      dir="ltr"
                      value={bayOwnerEmail}
                      onChange={(e) => setBayOwnerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div>
                    <label htmlFor="ros-phone" className="block font-medium text-slate-700 mb-1">
                      {t(lang, 'شماره تلفن (اختیاری)', 'Phone (Optional)')}
                    </label>
                    <input
                      id="ros-phone"
                      type="text"
                      dir="ltr"
                      value={bayOwnerPhone}
                      onChange={(e) => setBayOwnerPhone(e.target.value)}
                      placeholder="+31 6 ..."
                      className="w-full h-11 px-3 font-mono bg-white border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
                  <div className="flex flex-wrap items-center gap-4 text-slate-700">
                    <label className="inline-flex items-center gap-2 min-h-[38px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bayEv}
                        onChange={(e) => setBayEv(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700"
                      />
                      <span>{t(lang, 'دارای شارژر برق EV', 'Has EV Charger')}</span>
                    </label>
                    <label className="inline-flex items-center gap-2 min-h-[38px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bayActiveNow}
                        onChange={(e) => setBayActiveNow(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-700"
                      />
                      <span>{t(lang, 'فعال‌سازی فوری برای رزرو', 'Activate bay immediately')}</span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="h-11 px-5 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800 whitespace-nowrap"
                  >
                    {t(lang, 'ثبت در لیست مجاز', 'Add to Whitelist')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleCsvFileUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 bg-blue-50 border border-blue-200 text-blue-800 font-medium rounded-xl hover:bg-blue-100"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      {t(lang, 'آپلود فایل CSV', 'Upload CSV File')}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleCsv}
                      className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      {t(lang, 'دانلود فایل نمونه', 'Download Sample CSV')}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setBulkText(SAMPLE_CSV)}
                    className="text-blue-700 hover:underline font-medium"
                  >
                    {t(lang, 'درج متن نمونه', 'Insert example rows')}
                  </button>
                </div>

                <textarea
                  dir="ltr"
                  rows={4}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={SAMPLE_CSV}
                  className="w-full p-3.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!bulkText.trim()}
                    onClick={handleBulkImportSubmit}
                    className="h-11 px-5 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-40"
                  >
                    {t(lang, 'افزودن گروهی به لیست مجاز', 'Import All Rows')}
                  </button>
                </div>
              </div>
            )}

            {importFeedback && (
              <div
                className={`px-4 py-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  importFeedback.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                <span>{importFeedback.text}</span>
                <button type="button" onClick={() => setImportFeedback(null)} className="underline font-medium shrink-0">
                  {t(lang, 'بستن', 'Close')}
                </button>
              </div>
            )}
          </section>

          {/* Searchable Roster List */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                <h2>
                  {t(
                    lang,
                    `اعضای لیست مجاز (${filteredRoster.length} از ${buildingRoster.length})`,
                    `Authorized List (${filteredRoster.length} of ${buildingRoster.length})`
                  )}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setMaskPiiOnScreen((v) => !v)}
                className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 text-xs font-medium rounded-xl border self-start sm:self-auto whitespace-nowrap ${
                  maskPiiOnScreen
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {maskPiiOnScreen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {maskPiiOnScreen ? t(lang, 'اطلاعات تماس مخفی است', 'Contacts Masked') : t(lang, 'نمایش موقت تماس', 'Contacts Visible')}
              </button>
            </div>

            {/* Search + Status Filter */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="sm:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-3.5 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder={t(lang, 'جستجو نام، کد پارکینگ، شماره واحد یا ایمیل...', 'Search name, bay, unit or email...')}
                  className="w-full h-11 ps-9 pe-3 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <select
                value={rosterStatusFilter}
                onChange={(e) => setRosterStatusFilter(e.target.value as typeof rosterStatusFilter)}
                className="h-11 px-3 bg-white border border-slate-200 rounded-xl text-slate-800"
              >
                <option value="ALL">{t(lang, 'همه وضعیت‌ها', 'All Statuses')}</option>
                <option value="verified">{t(lang, 'دارای حساب فعال', 'Registered')}</option>
                <option value="invited">{t(lang, 'منتظر ساخت رمز عبور', 'Pending Signup')}</option>
                <option value="revoked">{t(lang, 'مسدود شده', 'Revoked')}</option>
              </select>
            </div>

            {filteredRoster.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                {buildingRoster.length === 0
                  ? t(lang, 'هنوز هیچ ساکن یا پارکینگی در لیست این ساختمان ثبت نشده است.', 'No residents added to this building yet.')
                  : t(lang, 'موردی با این جستجو پیدا نشد.', 'No matching entries found.')}
              </div>
            ) : (
              <>
                {/* Mobile Roster Cards (< md) */}
                <div className="md:hidden divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {filteredRoster.map((entry) => (
                    <div
                      key={entry.id}
                      className={`p-4 space-y-2 ${entry.status === 'revoked' ? 'bg-red-50/30 opacity-75' : 'bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{entry.ownerName}</div>
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            <span className="font-bold text-blue-800">{entry.bayCode}</span> · {entry.floorOrZone} ·{' '}
                            {t(lang, 'واحد', 'Unit')} {entry.unitNumber}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${
                            entry.status === 'verified'
                              ? 'text-emerald-700'
                              : entry.status === 'revoked'
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {entry.status === 'verified'
                            ? t(lang, 'حساب فعال', 'Active')
                            : entry.status === 'revoked'
                              ? t(lang, 'مسدود', 'Revoked')
                              : t(lang, 'منتظر ثبت‌نام', 'Invited')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                        <span className="font-mono text-slate-500 truncate">
                          {maskPiiOnScreen ? maskEmail(entry.email) : entry.email}
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleRosterStatus(entry.id)}
                          className={`min-h-[38px] px-3 rounded-xl border text-xs font-medium shrink-0 ${
                            entry.status === 'revoked'
                              ? 'bg-white border-emerald-200 text-emerald-800'
                              : 'bg-white border-red-200 text-red-700'
                          }`}
                        >
                          {entry.status === 'revoked' ? t(lang, 'بازگردانی', 'Restore') : t(lang, 'لغو دسترسی', 'Revoke')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Roster Table (md+) */}
                <div className="hidden md:block border border-slate-200 rounded-2xl overflow-x-auto">
                  <table className="w-full text-xs text-start border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-medium">
                        <th className="py-3 px-4 text-start">{t(lang, 'پارکینگ / طبقه', 'Bay / Floor')}</th>
                        <th className="py-3 px-4 text-start">{t(lang, 'نام و واحد', 'Owner / Unit')}</th>
                        <th className="py-3 px-4 text-start">{t(lang, 'اطلاعات احراز هویت', 'Verification Contact')}</th>
                        <th className="py-3 px-4 text-start">{t(lang, 'وضعیت', 'Status')}</th>
                        <th className="py-3 px-4 text-end">{t(lang, 'دسترسی', 'Access')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRoster.map((entry) => (
                        <tr key={entry.id} className={entry.status === 'revoked' ? 'bg-red-50/30 text-slate-400' : 'hover:bg-slate-50/70'}>
                          <td className="py-3 px-4 font-mono whitespace-nowrap">
                            <span className="font-semibold text-blue-800 me-1.5">{entry.bayCode}</span>
                            <span className="text-slate-500">{entry.floorOrZone}</span>
                            {entry.evCharging && <span className="ms-1.5 text-emerald-700">· EV</span>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{entry.ownerName}</div>
                            <div className="font-mono text-slate-500">{entry.unitNumber}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            <div>{maskPiiOnScreen ? maskEmail(entry.email) : entry.email}</div>
                            <div className="text-[11px] text-slate-400">
                              {entry.phone ? (maskPiiOnScreen ? maskPhone(entry.phone) : entry.phone) : '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {entry.status === 'verified' ? (
                              <span className="text-emerald-700 font-medium">{t(lang, 'دارای حساب فعال', 'Registered')}</span>
                            ) : entry.status === 'revoked' ? (
                              <span className="text-red-700 font-medium">{t(lang, 'مسدود شده', 'Revoked')}</span>
                            ) : (
                              <span className="text-amber-700 font-medium">{t(lang, 'منتظر ساخت رمز عبور', 'Pending Signup')}</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-end whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onToggleRosterStatus(entry.id)}
                              className={`px-3 py-1.5 rounded-lg border text-[11px] font-medium ${
                                entry.status === 'revoked'
                                  ? 'bg-white border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                                  : 'bg-white border-red-200 text-red-700 hover:bg-red-50'
                              }`}
                            >
                              {entry.status === 'revoked' ? t(lang, 'بازگردانی', 'Restore') : t(lang, 'لغو دسترسی', 'Revoke')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {buildingBlocked.length > 0 && (
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/70 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-red-900">
                  <ShieldAlert className="w-4 h-4 text-red-700" />
                  <span>
                    {t(lang, `تلاش‌های ورود غیرمجاز مسدودشده (${buildingBlocked.length})`, `Blocked Outsiders (${buildingBlocked.length})`)}
                  </span>
                </div>
                {buildingBlocked.slice(0, 5).map((b) => (
                  <div key={b.id} className="flex items-center justify-between gap-2 font-mono text-red-900/90">
                    <span className="truncate">
                      {b.identifierTried} / {b.unitOrBayTried}
                    </span>
                    <span className="text-[11px] text-red-700 shrink-0">{b.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 4: FAIR-USE TEMPORARY PARKING RULES + EXTENDED REQUESTS */}
      {activeSection === 'rules' && (
        <div className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-sm font-bold text-slate-900">
                {t(lang, 'قوانین پارکینگ موقت و جلوگیری از سوءاستفاده', 'Temporary Parking Limits & Fair Use')}
              </h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t(
                  lang,
                  'مشخص کنید هر ساکن تا چه اندازه می‌تواند از پارکینگ موقت استفاده کند تا جای پارک اشتراکی تبدیل به اجاره دائمی یک نفر نشود.',
                  'Set clear limits so shared temporary bays stay fair and do not replace a permanent parking lease.'
                )}
              </p>
            </div>

            {/* One-Click Presets */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-slate-700">
                {t(lang, 'انتخاب سریع الگوی آماده:', 'Quick presets:')}
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  {
                    labelFa: 'متعادل (پیشنهادی)',
                    labelEn: 'Balanced (Recommended)',
                    policy: {
                      maxHoursPerBooking: 12,
                      maxDaysPerMonth: 10,
                      maxConsecutiveDays: 3,
                      cooldownHoursAfterStreak: 12,
                      allowExtendedNegotiation: true,
                    },
                  },
                  {
                    labelFa: 'سخت‌گیرانه (کوتاه‌مدت)',
                    labelEn: 'Strict (Short visits)',
                    policy: {
                      maxHoursPerBooking: 6,
                      maxDaysPerMonth: 5,
                      maxConsecutiveDays: 2,
                      cooldownHoursAfterStreak: 24,
                      allowExtendedNegotiation: true,
                    },
                  },
                  {
                    labelFa: 'منعطف',
                    labelEn: 'Flexible',
                    policy: {
                      maxHoursPerBooking: 18,
                      maxDaysPerMonth: 15,
                      maxConsecutiveDays: 5,
                      cooldownHoursAfterStreak: 6,
                      allowExtendedNegotiation: true,
                    },
                  },
                ].map((preset) => {
                  const cur = activeCommunity.fairUsePolicy;
                  const isSelected =
                    cur.maxHoursPerBooking === preset.policy.maxHoursPerBooking &&
                    cur.maxDaysPerMonth === preset.policy.maxDaysPerMonth &&
                    cur.maxConsecutiveDays === preset.policy.maxConsecutiveDays &&
                    cur.cooldownHoursAfterStreak === preset.policy.cooldownHoursAfterStreak;
                  return (
                    <button
                      key={preset.labelEn}
                      type="button"
                      onClick={() => onUpdateFairUsePolicy(activeCommunity.id, preset.policy)}
                      className={`min-h-[42px] px-4 text-xs font-medium rounded-xl border transition-colors ${
                        isSelected
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {lang === 'fa' ? preset.labelFa : preset.labelEn}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4 Touch-Friendly Stepper Rule Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {[
                {
                  field: 'maxHoursPerBooking' as const,
                  min: 2,
                  max: 24,
                  step: 1,
                  titleFa: 'حداکثر مدت هر بار رزرو',
                  titleEn: 'Max duration per booking',
                  descFa: 'رزرو بیشتر از این مدت دیگر «موقت» حساب نمی‌شود.',
                  descEn: 'Longer bookings require manager coordination.',
                  unitFa: 'ساعت',
                  unitEn: 'hrs',
                },
                {
                  field: 'maxDaysPerMonth' as const,
                  min: 1,
                  max: 25,
                  step: 1,
                  titleFa: 'سقف استفاده ماهانه هر نفر',
                  titleEn: 'Monthly cap per resident',
                  descFa: 'جلوگیری از استفاده دائمی به‌جای اجاره پارکینگ.',
                  descEn: 'Prevents replacing a permanent parking lease.',
                  unitFa: 'روز',
                  unitEn: 'days',
                },
                {
                  field: 'maxConsecutiveDays' as const,
                  min: 1,
                  max: 7,
                  step: 1,
                  titleFa: 'حداکثر روزهای پشت‌سرهم',
                  titleEn: 'Max consecutive days',
                  descFa: 'بیشترین تعداد روزی که یک نفر بدون وقفه رزرو می‌کند.',
                  descEn: 'Maximum back-to-back days per resident.',
                  unitFa: 'روز',
                  unitEn: 'days',
                },
                {
                  field: 'cooldownHoursAfterStreak' as const,
                  min: 0,
                  max: 72,
                  step: 2,
                  titleFa: 'وقفه پس از رزروهای پیاپی',
                  titleEn: 'Cooldown after streak',
                  descFa: 'زمان انتظار بعد از پر شدن سقف روزهای پشت‌سرهم.',
                  descEn: 'Wait time required after reaching consecutive cap.',
                  unitFa: 'ساعت',
                  unitEn: 'hrs',
                },
              ].map((item) => {
                const currentVal = activeCommunity.fairUsePolicy[item.field];
                return (
                  <div
                    key={item.field}
                    className="p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">
                        {lang === 'fa' ? item.titleFa : item.titleEn}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {lang === 'fa' ? item.descFa : item.descEn}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => updateFairUseField(item.field, currentVal - item.step, item.min, item.max)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                        aria-label={t(lang, 'کاهش', 'Decrease')}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <div className="min-w-[68px] text-center">
                        <span className="font-mono tabular-nums text-sm font-bold text-slate-900">{currentVal}</span>
                        <span className="text-[11px] text-slate-500 ms-1">
                          {lang === 'fa' ? item.unitFa : item.unitEn}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateFairUseField(item.field, currentVal + item.step, item.min, item.max)}
                        className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                        aria-label={t(lang, 'افزایش', 'Increase')}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Plain-Language Live Summary */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900">{t(lang, 'خلاصه قانون فعلی:', 'Active rule summary:')}</strong>{' '}
              {lang === 'fa'
                ? `هر ساکن می‌تواند در هر بار حداکثر ${activeCommunity.fairUsePolicy.maxHoursPerBooking} ساعت، نهایتاً ${activeCommunity.fairUsePolicy.maxConsecutiveDays} روز پشت‌سرهم (با ${activeCommunity.fairUsePolicy.cooldownHoursAfterStreak} ساعت وقفه بعد از آن) و جمعاً تا ${activeCommunity.fairUsePolicy.maxDaysPerMonth} روز در ماه پارکینگ موقت رزرو کند.`
                : `Each resident may book up to ${activeCommunity.fairUsePolicy.maxHoursPerBooking}h per session, ${activeCommunity.fairUsePolicy.maxConsecutiveDays} consecutive days (${activeCommunity.fairUsePolicy.cooldownHoursAfterStreak}h cooldown after), and ${activeCommunity.fairUsePolicy.maxDaysPerMonth} days per month.`}
            </div>
          </section>

          {/* Extended Requests Inbox */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {t(lang, 'درخواست‌های استثنا یا اجاره طولانی‌تر از همسایه‌ها', 'Requests for Longer Stays or Permanent Leases')}
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                {t(
                  lang,
                  'وقتی ساکنی نیاز به پارکینگ فراتر از سقف بالا دارد (مثلاً مهمان چندروزه یا اجاره دائمی)، درخواست او اینجا می‌آید.',
                  'Requests exceeding temporary fair-use limits arrive here for manager approval or owner lease referral.'
                )}
              </p>
            </div>

            {buildingExtendedRequests.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">
                  {t(lang, 'فعلاً درخواست جدیدی از طرف همسایه‌ها ثبت نشده است.', 'No extended parking requests right now.')}
                </div>
                <p>
                  {t(
                    lang,
                    'درخواست‌های آینده با گزینه‌های «تأیید موردی»، «ارجاع برای اجاره» و «رد» در این بخش نمایش داده می‌شوند.',
                    'Future requests will show Approve, Refer to Lease, and Decline controls right here.'
                  )}
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {buildingExtendedRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-semibold text-slate-900">
                        {req.requesterAlias} · {req.requestedDays} {t(lang, 'روز', 'days')}
                      </div>
                      <p className="text-slate-600 leading-relaxed">{req.note}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {req.status === 'Pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onDecideExtendedRequest(req.id, 'Approved_Exception')}
                            className="min-h-[40px] px-3.5 bg-emerald-700 text-white rounded-xl font-medium hover:bg-emerald-800"
                          >
                            {t(lang, 'تأیید موردی', 'Approve')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDecideExtendedRequest(req.id, 'Referred_Lease')}
                            className="min-h-[40px] px-3.5 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl font-medium hover:bg-blue-100"
                          >
                            {t(lang, 'ارجاع به اجاره/مالک', 'Refer Lease')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDecideExtendedRequest(req.id, 'Declined')}
                            className="min-h-[40px] px-3.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50"
                          >
                            {t(lang, 'رد', 'Decline')}
                          </button>
                        </>
                      ) : (
                        <span className="font-semibold text-slate-700">
                          {req.status === 'Approved_Exception'
                            ? t(lang, 'تأیید موردی شد', 'Approved')
                            : req.status === 'Referred_Lease'
                              ? t(lang, 'ارجاع به اجاره/مالک', 'Referred')
                              : t(lang, 'رد شد', 'Declined')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: EUROPEAN GDPR-FIRST WHATSAPP 1-ON-1 BOT HUB */}
      {activeSection === 'whatsapp' && (
        <WhatsAppBotPanel
          lang={lang}
          role="manager"
          community={activeCommunity}
          rosterEntries={buildingRoster}
          onSimulateMessage={onSimulateWhatsApp}
          onFetchConfig={onFetchWhatsAppConfig}
        />
      )}
    </div>
  );
};
