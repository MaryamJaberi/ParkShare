import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  AccessPolicyLevel,
  BuildingRosterEntry,
  Community,
  Language,
  Resource,
} from '../types/parkshare';
import { formatMinutes, t } from '../i18n/translations';

export interface NeighborSubmitPayload {
  inviteToken: string;
  communityId: string;
  rosterEntryId?: string;
  existingResourceId?: string;
  neighborName: string;
  unitNumber: string;
  phone: string;
  email: string;
  bayCode: string;
  floorOrZone: string;
  evCharging: boolean;
  startMin: number;
  endMin: number;
  isFree: boolean;
  hourlyEur: number;
  autoApproval: boolean;
  accessPolicy: AccessPolicyLevel;
  graceNoticeMinutes: number;
}

interface Props {
  lang: Language;
  inviteToken: string;
  portalLabel: string;
  /** Communities covered by this link (1 for single building, multiple for unified Vesteda org link) */
  scopedCommunities: Community[];
  scopedResources: Resource[];
  scopedRoster: BuildingRosterEntry[];
  onSubmitOptIn: (payload: NeighborSubmitPayload) => void;
  onBlockedAttempt: (communityId: string, identifierTried: string, unitOrBayTried: string, reason: string) => void;
  onBackToManager: () => void;
  onGoToResidentApp: () => void;
}

const HOURS = Array.from({ length: 19 }, (_, i) => (i + 6) * 60);

const POLICY_LABELS: Record<AccessPolicyLevel, { fa: string; en: string }> = {
  residents_only: { fa: 'فقط ساکنان همین ساختمان', en: 'Residents of this building only' },
  residents_and_guests: { fa: 'ساکنان و مهمانان همین ساختمان', en: 'Residents & guests of this building' },
  network_members: { fa: 'ساختمان‌های همکار Vesteda (بوستون + سیاتل)', en: 'Sister Vesteda buildings (Boston + Seattle)' },
  public: { fa: 'کاربران خارجی / عمومی شهر', en: 'External / Public city users' },
};

function normalizePhone(val: string): string {
  return val.replace(/[\s\-()]/g, '').toLowerCase();
}

export const NeighborInviteView: React.FC<Props> = ({
  lang,
  inviteToken,
  portalLabel,
  scopedCommunities,
  scopedResources,
  scopedRoster,
  onSubmitOptIn,
  onBlockedAttempt,
  onBackToManager,
  onGoToResidentApp,
}) => {
  const isPortfolioLink = scopedCommunities.length > 1;
  const fallbackCommunity = scopedCommunities[0];

  // Step 1: Whitelist Verification Gate state
  const [authIdentifier, setAuthIdentifier] = useState('');
  const [authUnitOrBay, setAuthUnitOrBay] = useState('');
  const [verifiedEntry, setVerifiedEntry] = useState<BuildingRosterEntry | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  // Resolved community for verified user (auto-detected across Boston / Seattle when using unified link!)
  const activeCommunity = useMemo(() => {
    if (verifiedEntry) {
      return scopedCommunities.find((c) => c.id === verifiedEntry.communityId) ?? fallbackCommunity;
    }
    return fallbackCommunity;
  }, [verifiedEntry, scopedCommunities, fallbackCommunity]);

  const managerAllowedPolicies: AccessPolicyLevel[] = useMemo(() => {
    const list = activeCommunity.allowedUsagePolicies;
    return list && list.length > 0 ? list : ['residents_only'];
  }, [activeCommunity]);

  // Step 2: Sharing Settings Form state
  const [neighborName, setNeighborName] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [phone, setPhone] = useState('+31 6 ');
  const [email, setEmail] = useState('');
  const [bayCode, setBayCode] = useState('');
  const [floorOrZone, setFloorOrZone] = useState(fallbackCommunity.floors[0] ?? 'B1');
  const [evCharging, setEvCharging] = useState(false);
  const [startMin, setStartMin] = useState(480); // 08:00
  const [endMin, setEndMin] = useState(1140); // 19:00
  const [isFree, setIsFree] = useState(true);
  const [hourlyEur, setHourlyEur] = useState(1.5);
  const [autoApproval, setAutoApproval] = useState(true);
  const [accessPolicy, setAccessPolicy] = useState<AccessPolicyLevel>(managerAllowedPolicies[0]);
  const [graceNoticeMinutes, setGraceNoticeMinutes] = useState(30);
  const [consentChecked, setConsentChecked] = useState(true);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);

  const sampleInvitedEntries = useMemo(() => {
    const active = scopedRoster.filter((r) => r.status !== 'revoked');
    // Pick up to 1 per building for easy quick-testing
    const picked: BuildingRosterEntry[] = [];
    for (const c of scopedCommunities) {
      const candidate =
        active.find((r) => r.communityId === c.id && r.status === 'invited') ??
        active.find((r) => r.communityId === c.id);
      if (candidate) picked.push(candidate);
    }
    return picked.slice(0, 2);
  }, [scopedRoster, scopedCommunities]);

  const needsWhitelistGate = (isPortfolioLink || activeCommunity.strictWhitelistOnly) && !verifiedEntry;

  const handleVerifyIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    setGateError(null);

    const idNorm = authIdentifier.trim().toLowerCase();
    const idPhoneNorm = normalizePhone(authIdentifier);
    const unitOrBayNorm = authUnitOrBay.trim().toUpperCase();

    if (!idNorm || !unitOrBayNorm) {
      setGateError(
        t(
          lang,
          'لطفاً ایمیل یا تلفن و شماره واحد یا کد پارکینگ خود را وارد کنید.',
          'Please enter both your email/phone and your unit or bay code.'
        )
      );
      return;
    }

    const match = scopedRoster.find((entry) => {
      const contactMatch =
        (entry.email && entry.email.toLowerCase() === idNorm) ||
        (entry.phone && normalizePhone(entry.phone) === idPhoneNorm && idPhoneNorm.length >= 7);
      const unitOrBayMatch =
        entry.unitNumber.toUpperCase() === unitOrBayNorm ||
        entry.bayCode.toUpperCase() === unitOrBayNorm;
      return contactMatch && unitOrBayMatch;
    });

    if (!match) {
      const reason = t(
        lang,
        'مشخصات در لیست مجاز مدیر ساختمان یافت نشد',
        'Identity not found in building manager whitelist'
      );
      onBlockedAttempt(fallbackCommunity.id, authIdentifier.trim(), authUnitOrBay.trim(), reason);
      setGateError(
        t(
          lang,
          'دسترسی مسدود شد: مشخصات شما در لیست رسمی صاحبان پارکینگ ثبت نشده است. کسی خارج از لیست مدیر ساختمان نمی‌تواند وارد پنل شود.',
          'Access Denied: Your details do not match any authorized parking owner in the manager whitelist. Outsiders cannot enter this panel.'
        )
      );
      return;
    }

    if (match.status === 'revoked') {
      const reason = t(lang, 'دسترسی توسط مدیر ساختمان لغو شده است', 'Access revoked by building manager');
      onBlockedAttempt(match.communityId, authIdentifier.trim(), authUnitOrBay.trim(), reason);
      setGateError(
        t(
          lang,
          'دسترسی شما توسط مدیر ساختمان لغو شده است. لطفاً با مدیریت ساختمان تماس بگیرید.',
          'Your access has been revoked by the building manager. Please contact building administration.'
        )
      );
      return;
    }

    const matchedComm = scopedCommunities.find((c) => c.id === match.communityId) ?? fallbackCommunity;
    const allowedPols = matchedComm.allowedUsagePolicies?.length
      ? matchedComm.allowedUsagePolicies
      : (['residents_only'] as AccessPolicyLevel[]);

    setVerifiedEntry(match);
    setNeighborName(match.ownerName);
    setUnitNumber(match.unitNumber);
    setEmail(match.email);
    setPhone(match.phone);
    setBayCode(match.bayCode);
    setFloorOrZone(match.floorOrZone);
    setEvCharging(match.evCharging);
    setAccessPolicy(allowedPols[allowedPols.length - 1] ?? 'residents_only');
    if (!matchedComm.allowPaidSharing) {
      setIsFree(true);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!neighborName.trim() || !unitNumber.trim() || !bayCode.trim() || !consentChecked) return;

    const existingRes = scopedResources.find(
      (r) => r.communityId === activeCommunity.id && r.code.toUpperCase() === bayCode.trim().toUpperCase()
    );
    const finalEnd = endMin > startMin ? endMin : Math.min(1440, startMin + 120);
    const enforcedPolicy = managerAllowedPolicies.includes(accessPolicy)
      ? accessPolicy
      : managerAllowedPolicies[0];
    const enforcedFree = activeCommunity.allowPaidSharing ? isFree : true;

    onSubmitOptIn({
      inviteToken,
      communityId: activeCommunity.id,
      rosterEntryId: verifiedEntry?.id,
      existingResourceId: existingRes?.id,
      neighborName: neighborName.trim(),
      unitNumber: unitNumber.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      bayCode: bayCode.trim().toUpperCase(),
      floorOrZone,
      evCharging,
      startMin,
      endMin: finalEnd,
      isFree: enforcedFree,
      hourlyEur: enforcedFree ? 0 : Number(hourlyEur),
      autoApproval,
      accessPolicy: enforcedPolicy,
      graceNoticeMinutes,
    });
    setSubmittedCode(bayCode.trim().toUpperCase());
  };

  if (submittedCode) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-5">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-slate-900">
              {t(
                lang,
                `احراز هویت و مشارکت انجام شد — پارکینگ ${submittedCode} فعال گردید`,
                `Verified & Live — Bay ${submittedCode} Is Now Active`
              )}
            </h1>
            <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              {t(
                lang,
                `پارکینگ ${submittedCode} در ${activeCommunity.nameFa} مطابق قوانین مدیر ساختمان فعال شد و اکنون برای افراد مجاز قابل مشاهده و رزرو است.`,
                `Bay ${submittedCode} in ${activeCommunity.name} is now published under building manager policies and immediately available to permitted users.`
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={onGoToResidentApp}
              className="px-5 py-2.5 text-xs font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800"
            >
              {t(lang, 'ورود به اپلیکیشن ساکنان', 'Open Resident App')}
            </button>
            <button
              type="button"
              onClick={onBackToManager}
              className="px-4 py-2.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
            >
              {t(lang, 'بازگشت به پنل مدیر ساختمان', 'Back to Manager Panel')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBackToManager}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className={`w-3.5 h-3.5 ${lang === 'fa' ? 'rotate-180' : ''}`} />
          {t(lang, 'بازگشت به پنل مدیر ساختمان', 'Back to Building Manager')}
        </button>
        <span className="text-xs font-mono text-slate-400">?invite={inviteToken}</span>
      </div>

      {/* Building / Portfolio Invitation Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-blue-800">
          <Building2 className="w-4 h-4" />
          <span>
            {activeCommunity.organization}
            <span className="mx-1.5">·</span>
            {isPortfolioLink && !verifiedEntry
              ? scopedCommunities.map((c) => (lang === 'fa' ? c.nameFa : c.name)).join(' + ')
              : lang === 'fa'
                ? activeCommunity.cityFa
                : activeCommunity.city}
          </span>
        </div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {verifiedEntry
            ? t(lang, `تنظیمات اشتراک‌گذاری — ${activeCommunity.nameFa}`, `Sharing Setup — ${activeCommunity.name}`)
            : portalLabel}
        </h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          {needsWhitelistGate
            ? t(
                lang,
                'ورود به این فرم فقط برای صاحبان پارکینگی مجاز است که مشخصاتشان توسط مدیر ساختمان در لیست مجاز ثبت شده باشد.',
                'Only verified parking owners included in the building manager’s official whitelist can authenticate and enter.'
              )
            : t(
                lang,
                'گزینه‌های دسترسی و قیمت‌گذاری زیر دقیقاً مطابق قوانینی هستند که مدیر ساختمان برای این برج تعیین کرده است.',
                'The access and pricing choices below reflect the exact rules configured by your building manager.'
              )}
        </p>
      </div>

      {/* STEP 1: STRICT WHITELIST VERIFICATION GATE */}
      {needsWhitelistGate ? (
        <form onSubmit={handleVerifyIdentity} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <KeyRound className="w-4 h-4 text-blue-700" />
            <h2 className="text-base font-semibold text-slate-900">
              {t(lang, 'مرحله ۱ — احراز هویت در لیست مجاز مدیر ساختمان', 'Step 1 — Verify Against Manager Whitelist')}
            </h2>
          </div>

          {gateError && (
            <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-red-900 text-xs flex items-start gap-2.5 leading-relaxed">
              <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <span>{gateError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'ایمیل یا شماره تلفن ثبت‌شده نزد مدیر', 'Registered Email or Phone')}
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={authIdentifier}
                onChange={(e) => setAuthIdentifier(e.target.value)}
                placeholder="eva.bakker@boston-vesteda.nl"
                className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {t(lang, 'شماره واحد یا کد پارکینگ', 'Unit Number or Bay Code')}
              </label>
              <input
                type="text"
                required
                dir="ltr"
                value={authUnitOrBay}
                onChange={(e) => setAuthUnitOrBay(e.target.value)}
                placeholder="B-1604 or P107"
                className="w-full px-3 py-2.5 text-sm font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {sampleInvitedEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setAuthIdentifier(entry.email);
                    setAuthUnitOrBay(entry.bayCode);
                    setGateError(null);
                  }}
                  className="text-blue-700 hover:underline font-medium"
                >
                  {t(lang, `تست مالک مجاز (${entry.bayCode})`, `Test valid (${entry.bayCode})`)}
                </button>
              ))}
              <span aria-hidden="true" className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => {
                  setAuthIdentifier('outsider@unknown.com');
                  setAuthUnitOrBay('P999');
                  setGateError(null);
                }}
                className="text-red-700 hover:underline font-medium"
              >
                {t(lang, 'تست فرد خارج از لیست (مسدود)', 'Test outsider (block)')}
              </button>
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5" />
              {t(lang, 'بررسی لیست و ورود به فرم', 'Verify & Enter')}
            </button>
          </div>
        </form>
      ) : (
        /* STEP 2: VERIFIED OWNER SHARING CONFIGURATION (Constrained by Manager Policies!) */
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          {verifiedEntry && (
            <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  {t(
                    lang,
                    `احراز هویت موفق در ${activeCommunity.nameFa}: ${verifiedEntry.ownerName} · واحد ${verifiedEntry.unitNumber} · پارکینگ ${verifiedEntry.bayCode}`,
                    `Verified in ${activeCommunity.name}: ${verifiedEntry.ownerName} · Unit ${verifiedEntry.unitNumber} · Bay ${verifiedEntry.bayCode}`
                  )}
                </span>
              </div>
              <span className="font-mono text-emerald-800 shrink-0">{t(lang, 'قفل‌شده به مالک', 'Owner Locked')}</span>
            </div>
          )}

          {/* Verified Owner & Bay Info */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
              {t(lang, '۱. مشخصات احرازشده مالک و پارکینگ', '1. Verified Owner & Assigned Parking Bay')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t(lang, 'نام صاحب پارکینگ', 'Owner Name')}
                </label>
                <input
                  type="text"
                  required
                  readOnly={Boolean(verifiedEntry)}
                  value={neighborName}
                  onChange={(e) => setNeighborName(e.target.value)}
                  className={`w-full px-3 py-2 text-sm border border-slate-200 rounded-lg ${
                    verifiedEntry ? 'bg-slate-50 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t(lang, 'شماره واحد', 'Unit Number')}
                </label>
                <input
                  type="text"
                  required
                  readOnly={Boolean(verifiedEntry)}
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg ${
                    verifiedEntry ? 'bg-slate-50 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t(lang, 'کد پارکینگ اختصاصی', 'Assigned Bay Code')}
                </label>
                <input
                  type="text"
                  required
                  readOnly={Boolean(verifiedEntry)}
                  value={bayCode}
                  onChange={(e) => setBayCode(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg ${
                    verifiedEntry ? 'bg-slate-50 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t(lang, 'طبقه پارکینگ', 'Floor')}
                </label>
                <input
                  type="text"
                  readOnly={Boolean(verifiedEntry)}
                  value={floorOrZone}
                  onChange={(e) => setFloorOrZone(e.target.value)}
                  className={`w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg ${
                    verifiedEntry ? 'bg-slate-50 text-slate-600' : 'bg-white'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Sharing Rules — Strictly Filtered by Building Manager's Policy! */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
              {t(lang, '۲. انتخاب ساعات آزاد و گزینه‌های مجاز ساختمان', '2. Availability & Manager-Permitted Options')}
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'آزاد از ساعت', 'Available From')}
                </label>
                <select
                  value={startMin}
                  onChange={(e) => setStartMin(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                >
                  {HOURS.slice(0, -1).map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'آزاد تا ساعت', 'Available Until')}
                </label>
                <select
                  value={endMin}
                  onChange={(e) => setEndMin(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                >
                  {HOURS.filter((m) => m > startMin).map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'مهلت تخلیه در نیاز فوری', 'Recall Grace Notice')}
                </label>
                <select
                  value={graceNoticeMinutes}
                  onChange={(e) => setGraceNoticeMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'چه کسانی مجاز به رزرو باشند؟ (طبق مجوز مدیر ساختمان)', 'Who Can Reserve? (Permitted by Manager)')}
                </label>
                <select
                  value={managerAllowedPolicies.includes(accessPolicy) ? accessPolicy : managerAllowedPolicies[0]}
                  onChange={(e) => setAccessPolicy(e.target.value as AccessPolicyLevel)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  {managerAllowedPolicies.map((pol) => (
                    <option key={pol} value={pol}>
                      {t(lang, POLICY_LABELS[pol].fa, POLICY_LABELS[pol].en)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-500">
                  {t(
                    lang,
                    `مدیر ${activeCommunity.nameFa} فقط ${managerAllowedPolicies.length} سطح دسترسی فوق را برای این ساختمان مجاز کرده است.`,
                    `Building manager enabled ${managerAllowedPolicies.length} permitted access tier(s) for ${activeCommunity.name}.`
                  )}
                </p>
              </div>

              <div className="space-y-2.5 pt-1 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApproval}
                    onChange={(e) => setAutoApproval(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span>{t(lang, 'تأیید خودکار رزرو', 'Automatic instant approval')}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={evCharging}
                    onChange={(e) => setEvCharging(e.target.checked)}
                    className="rounded border-slate-300 text-blue-700"
                  />
                  <span>{t(lang, 'دارای شارژر برق EV', 'Equipped with EV Charger')}</span>
                </label>

                {activeCommunity.allowPaidSharing ? (
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isFree}
                        onChange={(e) => setIsFree(e.target.checked)}
                        className="rounded border-slate-300 text-blue-700"
                      />
                      <span>{t(lang, 'رایگان برای همسایه‌ها', 'Share for free')}</span>
                    </label>

                    {!isFree && (
                      <label className="inline-flex items-center gap-1.5 font-mono">
                        <span>€/h:</span>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={hourlyEur}
                          onChange={(e) => setHourlyEur(Number(e.target.value))}
                          className="w-20 px-2 py-1 border border-slate-200 rounded"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-emerald-800 font-medium">
                    {t(
                      lang,
                      'قانون این ساختمان: اشتراک‌گذاری صرفاً به‌صورت رایگان مجاز است.',
                      'Building rule: Sharing in this building is strictly Free-Only.'
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Verifiable Privacy Promise & Live Preview of What Neighbors Actually See */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-emerald-950">
              <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                {t(
                  lang,
                  'تضمین حریم خصوصی شما — همسایه‌ها دقیقاً چه چیزی می‌بینند؟',
                  'Your Privacy Guarantee — Exactly What Neighbors See'
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-white border border-emerald-100 space-y-1">
                <div className="font-semibold text-slate-900">
                  {t(lang, 'کاملاً مخفی می‌ماند (هرگز نمایش داده نمی‌شود):', 'Stays strictly private (never shown):')}
                </div>
                <div className="text-slate-600 leading-relaxed">
                  {t(
                    lang,
                    'نام کامل شما · شماره واحد · ایمیل · شماره تلفن · اطلاعات تماس اضطراری',
                    'Your full name · Unit number · Email · Phone number · Emergency contact'
                  )}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-1">
                <div className="text-[11px] text-slate-500">
                  {t(lang, 'پیش‌نمایش زنده کارت ناشناس شما در اپ:', 'Live preview of your anonymous bay card:')}
                </div>
                <div className="font-mono text-sm font-semibold text-blue-800">
                  {bayCode || 'P107'} <span className="text-xs font-sans font-normal text-slate-500">· {floorOrZone}</span>
                </div>
                <div className="text-[11px] text-slate-600 font-mono tabular-nums">
                  {formatMinutes(startMin)}–{formatMinutes(endMin > startMin ? endMin : startMin + 120)} ·{' '}
                  <span className="font-sans">
                    {(activeCommunity.allowPaidSharing ? isFree : true)
                      ? t(lang, 'رایگان', 'Free')
                      : `€${hourlyEur}/h`}
                    {evCharging ? ' · EV' : ''}
                    {' · '}
                    {autoApproval ? t(lang, 'فوری', 'Instant') : t(lang, 'با تأیید شما', 'Owner approval')}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-[11px] text-emerald-900/90">
              {t(
                lang,
                `داده‌ها در ${activeCommunity.dataResidencyRegion} نگهداری می‌شوند و هر زمان با یک کلیک می‌توانید اشتراک‌گذاری را متوقف یا داده‌تان را حذف کنید.`,
                `Stored in ${activeCommunity.dataResidencyRegion}. You can pause sharing or erase your data anytime in one click.`
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <label className="inline-flex items-start gap-2 text-xs text-slate-600 cursor-pointer max-w-md">
              <input
                type="checkbox"
                required
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="rounded border-slate-300 text-blue-700 mt-0.5"
              />
              <span>
                {t(
                  lang,
                  'رضایت دارم پارکینگ من طبق زمان‌های بالا و بدون نمایش اطلاعات شخصی‌ام با افراد مجاز به اشتراک گذاشته شود.',
                  'I consent to share my assigned bay under these rules with my personal identity hidden.'
                )}
              </span>
            </label>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              {t(lang, 'تأیید و فعال‌سازی پارکینگ من', 'Confirm & Publish My Bay')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
