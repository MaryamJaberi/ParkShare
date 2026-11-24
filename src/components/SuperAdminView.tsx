import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarClock,
  Car,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  AdminManagerSummary,
  AdminOverviewPayload,
  Language,
} from '../types/parkshare';
import { formatMinutes, t } from '../i18n/translations';

export type AdminSection = 'overview' | 'managers' | 'buildings' | 'activity';

interface Props {
  lang: Language;
  activeSection: AdminSection;
  onSelectSection: (section: AdminSection) => void;
  overview: AdminOverviewPayload | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onCreateManager: (payload: {
    displayName: string;
    username: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onToggleManagerSuspend: (managerId: string) => Promise<void>;
  onResetManagerPassword: (
    managerId: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteManager: (managerId: string) => Promise<void>;
  onToggleResidentSuspend: (residentAccountId: string) => Promise<void>;
  onToggleBuildingFederation: (communityId: string) => Promise<void>;
}

function formatIsoShort(iso?: string, lang: Language = 'fa'): string {
  if (!iso) return lang === 'fa' ? 'هنوز وارد نشده' : 'Never';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(lang === 'fa' ? 'fa-IR' : 'en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export const SuperAdminView: React.FC<Props> = ({
  lang,
  activeSection,
  onSelectSection,
  overview,
  loading,
  onRefresh,
  onCreateManager,
  onToggleManagerSuspend,
  onResetManagerPassword,
  onDeleteManager,
  onToggleResidentSuspend,
  onToggleBuildingFederation,
}) => {
  // Manager filters & modals
  const [mgrQuery, setMgrQuery] = useState('');
  const [mgrStatusFilter, setMgrStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [inspectedManagerId, setInspectedManagerId] = useState<string | null>(null);

  // Create Manager Form
  const [newMgrName, setNewMgrName] = useState('');
  const [newMgrUser, setNewMgrUser] = useState('');
  const [newMgrPass, setNewMgrPass] = useState('');
  const [newMgrPassConfirm, setNewMgrPassConfirm] = useState('');
  const [showNewMgrPass, setShowNewMgrPass] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  // Manager Inspector inline states
  const [resetPassValue, setResetPassValue] = useState('');
  const [showResetPass, setShowResetPass] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDeleteMgr, setConfirmDeleteMgr] = useState(false);

  // Buildings & Bays sub-tab
  const [buildingsSubTab, setBuildingsSubTab] = useState<'buildings' | 'bays'>('buildings');
  const [bldQuery, setBldQuery] = useState('');
  const [bayQuery, setBayQuery] = useState('');
  const [bayStatusFilter, setBayStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [bayEvOnly, setBayEvOnly] = useState(false);
  const [bayFreeOnly, setBayFreeOnly] = useState(false);
  const [showAllBays, setShowAllBays] = useState(false);

  // Activity sub-tab
  const [activitySubTab, setActivitySubTab] = useState<'residents' | 'bookings' | 'security'>('residents');
  const [resQuery, setResQuery] = useState('');

  const stats = overview?.stats;
  const managers = overview?.managers ?? [];
  const residents = overview?.residents ?? [];
  const buildings = overview?.buildings ?? [];
  const resources = overview?.resources ?? [];
  const reservations = overview?.reservations ?? [];
  const extendedRequests = overview?.extendedRequests ?? [];
  const blockedAttempts = overview?.blockedAttempts ?? [];
  const privacyAudits = overview?.privacyAudits ?? [];

  const inspectedManager: AdminManagerSummary | null = useMemo(
    () => managers.find((m) => m.id === inspectedManagerId) ?? null,
    [managers, inspectedManagerId]
  );

  const filteredManagers = useMemo(() => {
    const q = mgrQuery.trim().toLowerCase();
    return managers.filter((m) => {
      if (mgrStatusFilter === 'active' && m.suspended) return false;
      if (mgrStatusFilter === 'suspended' && !m.suspended) return false;
      if (!q) return true;
      const bldMatch = m.buildings.some(
        (b) => b.name.toLowerCase().includes(q) || b.nameFa.toLowerCase().includes(q)
      );
      return (
        m.displayName.toLowerCase().includes(q) ||
        m.username.toLowerCase().includes(q) ||
        bldMatch
      );
    });
  }, [managers, mgrQuery, mgrStatusFilter]);

  const filteredBuildings = useMemo(() => {
    const q = bldQuery.trim().toLowerCase();
    if (!q) return buildings;
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.nameFa.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.cityFa.toLowerCase().includes(q) ||
        b.managerName.toLowerCase().includes(q) ||
        b.managerUsername.toLowerCase().includes(q)
    );
  }, [buildings, bldQuery]);

  const filteredBays = useMemo(() => {
    const q = bayQuery.trim().toLowerCase();
    return resources.filter((r) => {
      const isLive = r.active && r.sharingEnabled;
      if (bayStatusFilter === 'active' && !isLive) return false;
      if (bayStatusFilter === 'inactive' && isLive) return false;
      if (bayEvOnly && !r.evCharging) return false;
      if (bayFreeOnly && !r.isFree) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.communityName.toLowerCase().includes(q) ||
        r.communityNameFa.toLowerCase().includes(q) ||
        r.managerName.toLowerCase().includes(q) ||
        r.floorOrZone.toLowerCase().includes(q)
      );
    });
  }, [resources, bayQuery, bayStatusFilter, bayEvOnly, bayFreeOnly]);

  const filteredResidents = useMemo(() => {
    const q = resQuery.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.username.toLowerCase().includes(q) ||
        r.communityName.toLowerCase().includes(q) ||
        r.communityNameFa.toLowerCase().includes(q) ||
        r.unitNumber.toLowerCase().includes(q)
    );
  }, [residents, resQuery]);

  const handleExportReport = () => {
    if (!overview) return;
    const blob = new Blob([JSON.stringify(overview, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parkshare-platform-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (newMgrPass !== newMgrPassConfirm) {
      setCreateError(t(lang, 'رمز عبور و تکرار آن یکسان نیستند.', 'Passwords do not match.'));
      return;
    }
    setBusyAction(true);
    try {
      const res = await onCreateManager({
        displayName: newMgrName.trim(),
        username: newMgrUser.trim(),
        password: newMgrPass,
      });
      if (!res.ok) {
        setCreateError(res.error || t(lang, 'خطا در ایجاد حساب مدیر.', 'Failed to create manager account.'));
        return;
      }
      setNewMgrName('');
      setNewMgrUser('');
      setNewMgrPass('');
      setNewMgrPassConfirm('');
      setShowCreateModal(false);
    } finally {
      setBusyAction(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedManager) return;
    setResetFeedback(null);
    setBusyAction(true);
    try {
      const res = await onResetManagerPassword(inspectedManager.id, resetPassValue);
      if (!res.ok) {
        setResetFeedback({
          type: 'err',
          text: res.error || t(lang, 'خطا در تغییر رمز عبور.', 'Password reset failed.'),
        });
        return;
      }
      setResetPassValue('');
      setResetFeedback({
        type: 'ok',
        text: t(
          lang,
          'رمز عبور جدید ثبت شد و نشست‌های قبلی این مدیر بسته شدند.',
          'New password saved and previous sessions revoked.'
        ),
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmDeleteManager = async () => {
    if (!inspectedManager) return;
    setBusyAction(true);
    try {
      await onDeleteManager(inspectedManager.id);
      setConfirmDeleteMgr(false);
      setInspectedManagerId(null);
    } finally {
      setBusyAction(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="space-y-4 py-4 animate-pulse">
        <div className="h-9 w-64 bg-slate-200 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-2xl" />
          ))}
        </div>
        <div className="h-72 bg-white border border-slate-200 rounded-2xl" />
      </div>
    );
  }

  const visibleBays = showAllBays ? filteredBays : filteredBays.slice(0, 20);
  const activeBayRatio =
    stats && stats.totalBays > 0 ? Math.round((stats.activeBays / stats.totalBays) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {activeSection === 'overview' && t(lang, 'داشبورد مدیریت کل ParkShare', 'ParkShare Platform Console')}
            {activeSection === 'managers' && t(lang, 'حساب‌های مدیران ساختمان', 'Building Manager Accounts')}
            {activeSection === 'buildings' && t(lang, 'ساختمان‌ها و بانک کل پارکینگ‌ها', 'Buildings & Master Bay Directory')}
            {activeSection === 'activity' && t(lang, 'ساکنان، رزروها و گزارش امنیت', 'Residents, Bookings & Security')}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {t(
              lang,
              'نظارت متمرکز بر مدیران ساختمان، مجتمع‌ها، ظرفیت پارکینگ‌ها و امنیت کل سامانه',
              'Centralized oversight of all building managers, communities, parking inventory, and platform security'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{t(lang, 'بروزرسانی', 'Refresh')}</span>
          </button>

          <button
            type="button"
            onClick={handleExportReport}
            disabled={!overview}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t(lang, 'خروجی گزارش', 'Export JSON')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-xl hover:bg-blue-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t(lang, 'مدیر ساختمان جدید', 'New Manager')}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: PLATFORM OVERVIEW DASHBOARD */}
      {activeSection === 'overview' && stats && (
        <div className="space-y-6">
          {/* 6 Clickable KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <button
              type="button"
              onClick={() => onSelectSection('managers')}
              className="text-start bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">{t(lang, 'مدیران ساختمان', 'Managers')}</span>
                <Users className="w-4 h-4 text-blue-700" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalManagers}
              </div>
              <div className="text-[11px] text-slate-500">
                {stats.activeManagers} {t(lang, 'فعال', 'active')}
                {stats.suspendedManagers > 0 ? ` · ${stats.suspendedManagers} ${t(lang, 'معلق', 'paused')}` : ''}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setBuildingsSubTab('buildings');
                onSelectSection('buildings');
              }}
              className="text-start bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">{t(lang, 'ساختمان‌ها', 'Buildings')}</span>
                <Building2 className="w-4 h-4 text-slate-700" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalBuildings}
              </div>
              <div className="text-[11px] text-slate-500">
                {stats.federatedBuildings} {t(lang, 'متصل به شبکه', 'federated')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setBuildingsSubTab('bays');
                onSelectSection('buildings');
              }}
              className="text-start bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">{t(lang, 'کل پارکینگ‌ها', 'Total Bays')}</span>
                <Car className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalBays}
              </div>
              <div className="text-[11px] text-emerald-700 font-medium">
                {stats.activeBays} {t(lang, 'فعال', 'active')} ({activeBayRatio}%)
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setActivitySubTab('residents');
                onSelectSection('activity');
              }}
              className="text-start bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">{t(lang, 'ساکنان', 'Residents')}</span>
                <UserCheck className="w-4 h-4 text-indigo-700" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalResidentAccounts}
              </div>
              <div className="text-[11px] text-slate-500">
                {stats.totalRosterEntries} {t(lang, 'در لیست مجاز', 'whitelisted')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setActivitySubTab('bookings');
                onSelectSection('activity');
              }}
              className="text-start bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">{t(lang, 'رزروها', 'Bookings')}</span>
                <CalendarClock className="w-4 h-4 text-blue-700" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.totalReservations}
              </div>
              <div className="text-[11px] text-slate-500">
                {stats.activeReservations} {t(lang, 'جاری', 'active')}
                {stats.totalReviews > 0 ? ` · ★ ${stats.averageRating}` : ''}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setActivitySubTab('security');
                onSelectSection('activity');
              }}
              className="text-start bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-colors space-y-2"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">{t(lang, 'امنیت و درخواست', 'Security & Req')}</span>
                <ShieldAlert className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                {stats.blockedAttemptsCount}
              </div>
              <div className="text-[11px] text-slate-500">
                {t(lang, 'مسدودشده', 'blocked')} · {stats.pendingExtendedRequests} {t(lang, 'درخواست باز', 'pending')}
              </div>
            </button>
          </div>

          {/* Active Capacity Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {t(lang, 'نرخ فعال‌سازی پارکینگ‌ها در کل سامانه', 'Platform-Wide Parking Activation Rate')}
                </h2>
                <p className="text-xs text-slate-500">
                  {t(
                    lang,
                    `${stats.activeBays} جایگاه فعال از مجموع ${stats.totalBays} پارکینگ ثبت‌شده در ${stats.totalBuildings} ساختمان`,
                    `${stats.activeBays} active bays out of ${stats.totalBays} registered spaces across ${stats.totalBuildings} buildings`
                  )}
                </p>
              </div>
              <span className="text-lg font-bold font-mono tabular-nums text-blue-700">
                {activeBayRatio}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-700 rounded-full transition-all duration-500"
                style={{ width: `${activeBayRatio}%` }}
              />
            </div>
          </div>

          {/* 2-Column Overview Grid: Managers Snapshot + Security/Audit Feed */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Managers Summary */}
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {t(lang, 'حساب‌های مدیران ساختمان', 'Building Manager Accounts')}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {t(lang, 'برای بررسی ساختمان‌ها، تغییر رمز یا تعلیق روی هر مدیر کلیک کنید.', 'Click any manager to inspect buildings, reset password, or suspend.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectSection('managers')}
                  className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                >
                  {t(lang, 'مشاهده همه', 'View all')} ({managers.length})
                </button>
              </div>

              {managers.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {t(lang, 'هنوز هیچ مدیر ساختمانی ثبت نشده است', 'No building managers registered yet')}
                    </div>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {t(
                        lang,
                        'می‌توانید همین‌جا برای مدیران ساختمان حساب کاربری بسازید یا اجازه دهید خودشان از صفحه ثبت‌نام اقدام کنند.',
                        'Provision building manager accounts directly here or let managers sign up on their own.'
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800"
                  >
                    <Plus className="w-4 h-4" />
                    {t(lang, 'ساخت اولین حساب مدیر ساختمان', 'Create First Manager Account')}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {managers.slice(0, 6).map((mgr) => (
                    <button
                      key={mgr.id}
                      type="button"
                      onClick={() => {
                        setResetFeedback(null);
                        setConfirmDeleteMgr(false);
                        setInspectedManagerId(mgr.id);
                      }}
                      className="w-full text-start px-5 py-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                            mgr.suspended
                              ? 'bg-red-50 text-red-700'
                              : 'bg-slate-900 text-white'
                          }`}
                        >
                          {mgr.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {mgr.displayName}
                            </span>
                            <span
                              className={`text-[11px] font-medium ${
                                mgr.suspended ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              · {mgr.suspended ? t(lang, 'معلق', 'Suspended') : t(lang, 'فعال', 'Active')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">
                            @{mgr.username}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-600 shrink-0 ps-12 sm:ps-0">
                        <div>
                          <span className="font-mono font-semibold text-slate-900">{mgr.buildingsCount}</span>{' '}
                          {t(lang, 'ساختمان', 'bldg')}
                        </div>
                        <div>
                          <span className="font-mono font-semibold text-slate-900">{mgr.activeBaysCount}/{mgr.baysCount}</span>{' '}
                          {t(lang, 'پارکینگ', 'bays')}
                        </div>
                        <div>
                          <span className="font-mono font-semibold text-slate-900">{mgr.residentAccountsCount}</span>{' '}
                          {t(lang, 'ساکن', 'users')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Recent Security & Audit Log */}
            <section className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-700" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {t(lang, 'رویدادهای اخیر سامانه', 'Recent Platform Audit')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActivitySubTab('security');
                    onSelectSection('activity');
                  }}
                  className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                >
                  {t(lang, 'گزارش کامل', 'Full log')}
                </button>
              </div>

              {privacyAudits.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {t(lang, 'هنوز رویدادی ثبت نشده است.', 'No audit events logged yet.')}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                  {privacyAudits.slice(0, 8).map((ev) => (
                    <div key={ev.id} className="px-5 py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                        <span className="font-medium text-slate-700 truncate">
                          {lang === 'fa' ? ev.communityNameFa : ev.communityName}
                        </span>
                        <span className="font-mono shrink-0">{ev.timestamp}</span>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed">
                        {lang === 'fa' ? ev.summaryFa : ev.summaryEn}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* SECTION 2: BUILDING MANAGER ACCOUNTS DIRECTORY */}
      {activeSection === 'managers' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
              <input
                type="text"
                value={mgrQuery}
                onChange={(e) => setMgrQuery(e.target.value)}
                placeholder={t(
                  lang,
                  'جستجوی مدیر بر اساس نام، نام کاربری یا نام ساختمان...',
                  'Search by manager name, username, or building...'
                )}
                className="w-full h-11 ps-10 pe-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
              {(
                [
                  ['all', t(lang, 'همه', 'All')],
                  ['active', t(lang, 'فعال', 'Active')],
                  ['suspended', t(lang, 'معلق', 'Paused')],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMgrStatusFilter(val)}
                  className={`min-h-[38px] px-3 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    mgrStatusFilter === val ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredManagers.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">
                {managers.length === 0
                  ? t(lang, 'هنوز حساب مدیر ساختمانی در سامانه ثبت نشده است.', 'No building manager accounts exist yet.')
                  : t(lang, 'مدیری با این جستجو یا فیلتر پیدا نشد.', 'No managers match your search or filter.')}
              </p>
              {managers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  className="min-h-[42px] inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800"
                >
                  <Plus className="w-4 h-4" />
                  {t(lang, 'ایجاد حساب مدیر جدید', 'Create Manager Account')}
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Manager Cards (< md) */}
              <div className="md:hidden space-y-3">
                {filteredManagers.map((mgr) => (
                  <div
                    key={mgr.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">{mgr.displayName}</div>
                        <div className="text-xs font-mono text-slate-500">@{mgr.username}</div>
                      </div>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          mgr.suspended ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {mgr.suspended ? t(lang, 'معلق', 'Suspended') : t(lang, 'فعال', 'Active')}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-slate-100 text-center text-xs">
                      <div>
                        <div className="font-mono font-bold text-slate-900">{mgr.buildingsCount}</div>
                        <div className="text-[11px] text-slate-500">{t(lang, 'ساختمان', 'Buildings')}</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-slate-900">
                          {mgr.activeBaysCount}/{mgr.baysCount}
                        </div>
                        <div className="text-[11px] text-slate-500">{t(lang, 'پارکینگ', 'Bays')}</div>
                      </div>
                      <div>
                        <div className="font-mono font-bold text-slate-900">{mgr.residentAccountsCount}</div>
                        <div className="text-[11px] text-slate-500">{t(lang, 'ساکن', 'Residents')}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setResetFeedback(null);
                          setConfirmDeleteMgr(false);
                          setInspectedManagerId(mgr.id);
                        }}
                        className="min-h-[42px] px-3 text-xs font-semibold text-white bg-slate-900 rounded-xl hover:bg-slate-800"
                      >
                        {t(lang, 'جزئیات و مدیریت', 'Manage Account')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleManagerSuspend(mgr.id)}
                        className={`min-h-[42px] px-3 text-xs font-semibold rounded-xl border ${
                          mgr.suspended
                            ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                            : 'text-amber-800 bg-amber-50 border-amber-200'
                        }`}
                      >
                        {mgr.suspended ? t(lang, 'فعال‌سازی', 'Activate') : t(lang, 'تعلیق حساب', 'Suspend')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Manager Table (md+) */}
              <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                      <tr>
                        <th className="py-3.5 px-4 text-start">{t(lang, 'مدیر ساختمان', 'Manager')}</th>
                        <th className="py-3.5 px-3 text-start">{t(lang, 'وضعیت', 'Status')}</th>
                        <th className="py-3.5 px-3 text-start">{t(lang, 'ساختمان‌ها', 'Buildings')}</th>
                        <th className="py-3.5 px-3 text-start">{t(lang, 'پارکینگ فعال/کل', 'Active / Bays')}</th>
                        <th className="py-3.5 px-3 text-start">{t(lang, 'ساکنان / مجاز', 'Users / Roster')}</th>
                        <th className="py-3.5 px-3 text-start">{t(lang, 'رزروها', 'Bookings')}</th>
                        <th className="py-3.5 px-3 text-start">{t(lang, 'آخرین ورود', 'Last Login')}</th>
                        <th className="py-3.5 px-4 text-end">{t(lang, 'اقدامات', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredManagers.map((mgr) => (
                        <tr
                          key={mgr.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{mgr.displayName}</div>
                            <div className="font-mono text-[11px] text-slate-500">@{mgr.username}</div>
                          </td>
                          <td className="py-3.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1.5 font-semibold ${
                                mgr.suspended ? 'text-red-700' : 'text-emerald-700'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  mgr.suspended ? 'bg-red-600' : 'bg-emerald-600'
                                }`}
                              />
                              {mgr.suspended ? t(lang, 'معلق', 'Suspended') : t(lang, 'فعال', 'Active')}
                            </span>
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="font-mono font-semibold text-slate-900">{mgr.buildingsCount}</div>
                            {mgr.buildings.length > 0 && (
                              <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                                {mgr.buildings.map((b) => (lang === 'fa' ? b.nameFa : b.name)).join('، ')}
                              </div>
                            )}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-800">
                            <span className="font-semibold text-emerald-700">{mgr.activeBaysCount}</span> / {mgr.baysCount}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-800">
                            {mgr.residentAccountsCount} / {mgr.rosterCount}
                          </td>
                          <td className="py-3.5 px-3 font-mono tabular-nums text-slate-800">
                            {mgr.reservationsCount}
                          </td>
                          <td className="py-3.5 px-3 text-slate-600 whitespace-nowrap">
                            {formatIsoShort(mgr.lastLoginAt, lang)}
                          </td>
                          <td className="py-3.5 px-4 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setResetFeedback(null);
                                  setConfirmDeleteMgr(false);
                                  setInspectedManagerId(mgr.id);
                                }}
                                className="min-h-[34px] px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                              >
                                {t(lang, 'مدیریت', 'Manage')}
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleManagerSuspend(mgr.id)}
                                className={`min-h-[34px] px-2.5 py-1.5 text-xs font-medium rounded-lg border ${
                                  mgr.suspended
                                    ? 'text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                                    : 'text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                }`}
                              >
                                {mgr.suspended ? t(lang, 'فعال‌سازی', 'Activate') : t(lang, 'تعلیق', 'Suspend')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* SECTION 3: BUILDINGS & MASTER PARKING CATALOG */}
      {activeSection === 'buildings' && (
        <div className="space-y-4">
          <div className="inline-grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => setBuildingsSubTab('buildings')}
              className={`min-h-[40px] px-4 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                buildingsSubTab === 'buildings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t(lang, 'لیست ساختمان‌ها', 'Buildings')} ({buildings.length})
            </button>
            <button
              type="button"
              onClick={() => setBuildingsSubTab('bays')}
              className={`min-h-[40px] px-4 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                buildingsSubTab === 'bays' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t(lang, 'بانک کل پارکینگ‌ها', 'All Parking Bays')} ({resources.length})
            </button>
          </div>

          {buildingsSubTab === 'buildings' ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                <input
                  type="text"
                  value={bldQuery}
                  onChange={(e) => setBldQuery(e.target.value)}
                  placeholder={t(
                    lang,
                    'جستجوی ساختمان بر اساس نام، شهر یا مدیر...',
                    'Search buildings by name, city, or manager...'
                  )}
                  className="w-full h-11 ps-10 pe-3.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                />
              </div>

              {filteredBuildings.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  {t(lang, 'ساختمانی برای نمایش وجود ندارد.', 'No buildings registered yet.')}
                </div>
              ) : (
                <>
                  {/* Mobile Building Cards */}
                  <div className="md:hidden space-y-3">
                    {filteredBuildings.map((b) => (
                      <div key={b.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">
                              {lang === 'fa' ? b.nameFa : b.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {lang === 'fa' ? b.cityFa : b.city} · {t(lang, 'مدیر:', 'Mgr:')} {b.managerName}
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-500 shrink-0">
                            {b.dataRetentionDays === 0 ? t(lang, 'حذف فوری', '0d') : `${b.dataRetentionDays}d`}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-100 text-center text-xs">
                          <div>
                            <div className="font-mono font-bold text-slate-900">
                              {b.activeBaysCount}/{b.baysCount}
                            </div>
                            <div className="text-[11px] text-slate-500">{t(lang, 'پارکینگ', 'Bays')}</div>
                          </div>
                          <div>
                            <div className="font-mono font-bold text-slate-900">{b.rosterCount}</div>
                            <div className="text-[11px] text-slate-500">{t(lang, 'لیست مجاز', 'Roster')}</div>
                          </div>
                          <div>
                            <div className="font-mono font-bold text-slate-900">{b.reservationsCount}</div>
                            <div className="text-[11px] text-slate-500">{t(lang, 'رزرو', 'Bookings')}</div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleBuildingFederation(b.id)}
                          className={`w-full min-h-[40px] text-xs font-semibold rounded-xl border ${
                            b.federationEnabled
                              ? 'text-blue-800 bg-blue-50 border-blue-200'
                              : 'text-slate-700 bg-slate-50 border-slate-200'
                          }`}
                        >
                          {b.federationEnabled
                            ? t(lang, 'اشتراک با ساختمان‌های همکار: فعال', 'Sister-Building Network: On')
                            : t(lang, 'اشتراک با ساختمان‌های همکار: غیرفعال', 'Sister-Building Network: Off')}
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Buildings Table */}
                  <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-start">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <tr>
                            <th className="py-3.5 px-4 text-start">{t(lang, 'ساختمان / مجتمع', 'Building')}</th>
                            <th className="py-3.5 px-3 text-start">{t(lang, 'مدیر مسئول', 'Manager')}</th>
                            <th className="py-3.5 px-3 text-start">{t(lang, 'پارکینگ فعال/کل', 'Active / Bays')}</th>
                            <th className="py-3.5 px-3 text-start">{t(lang, 'ساکن / مجاز', 'Users / Roster')}</th>
                            <th className="py-3.5 px-3 text-start">{t(lang, 'رزرو', 'Bookings')}</th>
                            <th className="py-3.5 px-3 text-start">{t(lang, 'حفظ داده', 'Retention')}</th>
                            <th className="py-3.5 px-4 text-end">{t(lang, 'اتصال شبکه', 'Federation')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredBuildings.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50/80">
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-slate-900">
                                  {lang === 'fa' ? b.nameFa : b.name}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {lang === 'fa' ? b.cityFa : b.city} · {b.organization}
                                </div>
                              </td>
                              <td className="py-3.5 px-3">
                                <div className="font-medium text-slate-800">{b.managerName}</div>
                                <div className="text-[11px] font-mono text-slate-500">@{b.managerUsername}</div>
                              </td>
                              <td className="py-3.5 px-3 font-mono tabular-nums">
                                <span className="font-semibold text-emerald-700">{b.activeBaysCount}</span> / {b.baysCount}
                              </td>
                              <td className="py-3.5 px-3 font-mono tabular-nums text-slate-700">
                                {b.residentAccountsCount} / {b.rosterCount}
                              </td>
                              <td className="py-3.5 px-3 font-mono tabular-nums text-slate-700">
                                {b.reservationsCount}
                              </td>
                              <td className="py-3.5 px-3 text-slate-600">
                                {b.dataRetentionDays === 0
                                  ? t(lang, 'حذف فوری', 'Instant purge')
                                  : `${b.dataRetentionDays} ${t(lang, 'روز', 'days')}`}
                              </td>
                              <td className="py-3.5 px-4 text-end">
                                <button
                                  type="button"
                                  onClick={() => onToggleBuildingFederation(b.id)}
                                  className={`min-h-[32px] px-3 py-1 text-xs font-semibold rounded-lg border ${
                                    b.federationEnabled
                                      ? 'text-blue-800 bg-blue-50 border-blue-200 hover:bg-blue-100'
                                      : 'text-slate-600 bg-slate-50 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {b.federationEnabled ? t(lang, 'متصل', 'Connected') : t(lang, 'مستقل', 'Isolated')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Master Parking Bays Catalog */
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                    <input
                      type="text"
                      value={bayQuery}
                      onChange={(e) => setBayQuery(e.target.value)}
                      placeholder={t(
                        lang,
                        'جستجوی کد پارکینگ، ساختمان، طبقه یا مدیر...',
                        'Search by bay code, building, floor, or manager...'
                      )}
                      className="w-full h-11 ps-10 pe-3.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-600"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0 hidden sm:block" />
                    {(
                      [
                        ['all', t(lang, 'همه', 'All')],
                        ['active', t(lang, 'فعال', 'Active')],
                        ['inactive', t(lang, 'غیرفعال', 'Inactive')],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setBayStatusFilter(v)}
                        className={`min-h-[38px] px-3 text-xs font-medium rounded-xl border whitespace-nowrap ${
                          bayStatusFilter === v
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setBayFreeOnly((x) => !x)}
                      className={`min-h-[38px] px-3 text-xs font-medium rounded-xl border whitespace-nowrap ${
                        bayFreeOnly
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      {t(lang, 'رایگان', 'Free')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBayEvOnly((x) => !x)}
                      className={`min-h-[38px] inline-flex items-center gap-1 px-3 text-xs font-medium rounded-xl border whitespace-nowrap ${
                        bayEvOnly
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-slate-700 border-slate-200'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      EV
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-500">
                  {t(
                    lang,
                    `نمایش ${visibleBays.length} از ${filteredBays.length} پارکینگ`,
                    `Showing ${visibleBays.length} of ${filteredBays.length} bays`
                  )}
                </div>
              </div>

              {filteredBays.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  {t(lang, 'پارکینگی با این فیلتر یافت نشد.', 'No parking spaces match these filters.')}
                </div>
              ) : (
                <>
                  {/* Mobile Bay Cards */}
                  <div className="md:hidden space-y-2.5">
                    {visibleBays.map((r) => {
                      const live = r.active && r.sharingEnabled;
                      return (
                        <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-bold text-slate-900">{r.code}</span>
                            <span className={`text-xs font-semibold ${live ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {live ? t(lang, 'فعال', 'Active') : t(lang, 'غیرفعال', 'Inactive')}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600">
                            {lang === 'fa' ? r.communityNameFa : r.communityName} · {r.floorOrZone}
                            {r.block ? ` · ${t(lang, 'بلوک', 'Block')} ${r.block}` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                            <span>{r.isFree ? t(lang, 'رایگان', 'Free') : `€${r.hourlyEur}/h`}</span>
                            <span>·</span>
                            <span>
                              {r.approvalMode === 'automatic'
                                ? t(lang, 'تأیید خودکار', 'Auto')
                                : t(lang, 'نیازمند تأیید', 'Manual')}
                            </span>
                            {r.evCharging && (
                              <>
                                <span>·</span>
                                <span className="text-blue-700 font-semibold">EV</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Bays Table */}
                  <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-start">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                          <tr>
                            <th className="py-3 px-4 text-start">{t(lang, 'کد جایگاه', 'Bay Code')}</th>
                            <th className="py-3 px-3 text-start">{t(lang, 'ساختمان', 'Building')}</th>
                            <th className="py-3 px-3 text-start">{t(lang, 'طبقه / بلوک', 'Floor / Block')}</th>
                            <th className="py-3 px-3 text-start">{t(lang, 'تعرفه', 'Pricing')}</th>
                            <th className="py-3 px-3 text-start">{t(lang, 'تأیید', 'Approval')}</th>
                            <th className="py-3 px-3 text-start">EV</th>
                            <th className="py-3 px-4 text-end">{t(lang, 'وضعیت', 'Status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visibleBays.map((r) => {
                            const live = r.active && r.sharingEnabled;
                            return (
                              <tr key={r.id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.code}</td>
                                <td className="py-3 px-3 text-slate-800">
                                  {lang === 'fa' ? r.communityNameFa : r.communityName}
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  {r.floorOrZone}
                                  {r.block ? ` (${r.block})` : ''}
                                </td>
                                <td className="py-3 px-3 font-mono text-slate-700">
                                  {r.isFree ? t(lang, 'رایگان', 'Free') : `€${r.hourlyEur}/h`}
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  {r.approvalMode === 'automatic'
                                    ? t(lang, 'خودکار', 'Auto')
                                    : t(lang, 'تأیید دستی', 'Manual')}
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  {r.evCharging ? <span className="text-blue-700 font-semibold">EV</span> : '—'}
                                </td>
                                <td className="py-3 px-4 text-end">
                                  <span
                                    className={`font-semibold ${live ? 'text-emerald-700' : 'text-slate-500'}`}
                                  >
                                    {live ? t(lang, 'فعال', 'Active') : t(lang, 'غیرفعال', 'Inactive')}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {filteredBays.length > 20 && (
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setShowAllBays((v) => !v)}
                        className="min-h-[40px] px-4 py-2 text-xs font-semibold text-blue-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50"
                      >
                        {showAllBays
                          ? t(lang, 'نمایش ۲۰ مورد اول', 'Show first 20')
                          : t(lang, `نمایش همه (${filteredBays.length} پارکینگ)`, `Show all (${filteredBays.length} bays)`)}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: RESIDENTS, BOOKINGS & SECURITY AUDIT */}
      {activeSection === 'activity' && (
        <div className="space-y-4">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActivitySubTab('residents')}
              className={`min-h-[40px] px-3.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-1 ${
                activitySubTab === 'residents' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t(lang, 'حساب‌های ساکنان', 'Resident Accounts')} ({residents.length})
            </button>
            <button
              type="button"
              onClick={() => setActivitySubTab('bookings')}
              className={`min-h-[40px] px-3.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-1 ${
                activitySubTab === 'bookings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t(lang, 'رزروها و درخواست‌ها', 'Bookings & Requests')} ({reservations.length})
            </button>
            <button
              type="button"
              onClick={() => setActivitySubTab('security')}
              className={`min-h-[40px] px-3.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex-1 ${
                activitySubTab === 'security' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              {t(lang, 'امنیت و لاگ‌ها', 'Security & Audits')} ({blockedAttempts.length})
            </button>
          </div>

          {activitySubTab === 'residents' && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3.5" />
                <input
                  type="text"
                  value={resQuery}
                  onChange={(e) => setResQuery(e.target.value)}
                  placeholder={t(
                    lang,
                    'جستجوی ساکن بر اساس نام، نام کاربری، ساختمان یا واحد...',
                    'Search residents by name, username, building, or unit...'
                  )}
                  className="w-full h-11 ps-10 pe-3.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                />
              </div>

              {filteredResidents.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
                  {t(lang, 'هنوز حساب ساکنی فعال نشده است.', 'No resident accounts activated yet.')}
                </div>
              ) : (
                <>
                  <div className="md:hidden space-y-2.5">
                    {filteredResidents.map((r) => (
                      <div key={r.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">{r.displayName}</div>
                            <div className="text-xs font-mono text-slate-500">@{r.username}</div>
                          </div>
                          <span className={`text-xs font-semibold ${r.suspended ? 'text-red-700' : 'text-emerald-700'}`}>
                            {r.suspended ? t(lang, 'معلق', 'Suspended') : t(lang, 'فعال', 'Active')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600">
                          {lang === 'fa' ? r.communityNameFa : r.communityName} · {t(lang, 'واحد', 'Unit')} {r.unitNumber} · {r.reservationsCount} {t(lang, 'رزرو', 'bookings')}
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleResidentSuspend(r.id)}
                          className={`w-full min-h-[40px] text-xs font-semibold rounded-xl border ${
                            r.suspended
                              ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                              : 'text-amber-800 bg-amber-50 border-amber-200'
                          }`}
                        >
                          {r.suspended ? t(lang, 'رفع تعلیق ساکن', 'Reactivate Resident') : t(lang, 'تعلیق حساب ساکن', 'Suspend Resident')}
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-xs text-start">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                        <tr>
                          <th className="py-3 px-4 text-start">{t(lang, 'ساکن', 'Resident')}</th>
                          <th className="py-3 px-3 text-start">{t(lang, 'ساختمان و واحد', 'Building & Unit')}</th>
                          <th className="py-3 px-3 text-start">{t(lang, 'رزروها', 'Bookings')}</th>
                          <th className="py-3 px-3 text-start">{t(lang, 'آخرین ورود', 'Last Login')}</th>
                          <th className="py-3 px-3 text-start">{t(lang, 'وضعیت', 'Status')}</th>
                          <th className="py-3 px-4 text-end">{t(lang, 'اقدام', 'Action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredResidents.map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-slate-900">{r.displayName}</div>
                              <div className="font-mono text-[11px] text-slate-500">@{r.username}</div>
                            </td>
                            <td className="py-3 px-3 text-slate-700">
                              {lang === 'fa' ? r.communityNameFa : r.communityName} · {t(lang, 'واحد', 'Unit')} {r.unitNumber}
                            </td>
                            <td className="py-3 px-3 font-mono text-slate-700">{r.reservationsCount}</td>
                            <td className="py-3 px-3 text-slate-600">{formatIsoShort(r.lastLoginAt, lang)}</td>
                            <td className="py-3 px-3">
                              <span className={`font-semibold ${r.suspended ? 'text-red-700' : 'text-emerald-700'}`}>
                                {r.suspended ? t(lang, 'معلق', 'Suspended') : t(lang, 'فعال', 'Active')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-end">
                              <button
                                type="button"
                                onClick={() => onToggleResidentSuspend(r.id)}
                                className={`min-h-[32px] px-3 py-1 text-xs font-medium rounded-lg border ${
                                  r.suspended
                                    ? 'text-emerald-800 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                                    : 'text-amber-800 border-amber-200 bg-amber-50 hover:bg-amber-100'
                                }`}
                              >
                                {r.suspended ? t(lang, 'فعال‌سازی', 'Activate') : t(lang, 'تعلیق', 'Suspend')}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {activitySubTab === 'bookings' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-sm text-slate-900">
                  {t(lang, 'رزروهای ثبت‌شده در کل سامانه', 'Platform Reservations')} ({reservations.length})
                </div>
                {reservations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {t(lang, 'هنوز رزروی ثبت نشده است.', 'No reservations yet.')}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {reservations.slice(0, 30).map((rv) => (
                      <div key={rv.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-semibold text-slate-900">
                            <span className="font-mono text-blue-700">{rv.resourceCode}</span> ·{' '}
                            {lang === 'fa' ? rv.communityNameFa : rv.communityName}
                          </div>
                          <div className="text-slate-500">
                            {rv.requesterName} · <span className="font-mono">{formatMinutes(rv.startMin)}–{formatMinutes(rv.endMin)}</span>
                          </div>
                        </div>
                        <span className="font-semibold text-slate-700 shrink-0">{rv.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 font-bold text-sm text-slate-900">
                  {t(lang, 'درخواست‌های فراتر از پارکینگ موقت', 'Extended Requests')} ({extendedRequests.length})
                </div>
                {extendedRequests.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {t(lang, 'درخواست ویژه‌ای ثبت نشده است.', 'No extended requests submitted.')}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {extendedRequests.map((ex) => (
                      <div key={ex.id} className="px-5 py-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {lang === 'fa' ? ex.communityNameFa : ex.communityName}
                          </span>
                          <span className="font-mono text-[11px] text-amber-700 font-semibold">{ex.status}</span>
                        </div>
                        <div className="text-slate-600">
                          {ex.requesterAlias} · {ex.requestedDays} {t(lang, 'روز', 'days')}
                        </div>
                        {ex.note && <p className="text-slate-500 leading-relaxed">{ex.note}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activitySubTab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 font-bold text-sm text-slate-900">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  {t(lang, 'ورودهای غیرمجاز مسدودشده', 'Blocked Unauthorized Attempts')} ({blockedAttempts.length})
                </div>
                {blockedAttempts.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {t(lang, 'مورد مسدودشده‌ای ثبت نشده است.', 'No blocked unauthorized attempts.')}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[440px] overflow-y-auto">
                    {blockedAttempts.map((b) => (
                      <div key={b.id} className="px-5 py-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">
                            {lang === 'fa' ? b.communityNameFa : b.communityName}
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">{b.timestamp}</span>
                        </div>
                        <div className="font-mono text-[11px] text-red-700">
                          {b.identifierTried || '—'} · {b.unitOrBayTried || '—'}
                        </div>
                        <div className="text-slate-500">{b.reason}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2 font-bold text-sm text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  {t(lang, 'گزارش حریم خصوصی و عملیات مدیر کل', 'Privacy & Admin Audit Trail')} ({privacyAudits.length})
                </div>
                {privacyAudits.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    {t(lang, 'رویدادی ثبت نشده است.', 'No audit events recorded.')}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[440px] overflow-y-auto">
                    {privacyAudits.map((a) => (
                      <div key={a.id} className="px-5 py-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-slate-700">
                            {lang === 'fa' ? a.communityNameFa : a.communityName}
                          </span>
                          <span className="font-mono text-slate-500">{a.timestamp} · {a.proofTag}</span>
                        </div>
                        <p className="text-slate-800 leading-relaxed">
                          {lang === 'fa' ? a.summaryFa : a.summaryEn}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CREATE NEW BUILDING MANAGER */}
      {showCreateModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setShowCreateModal(false)}
          />
          <form
            onSubmit={handleCreateSubmit}
            className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe space-y-4 z-10 border border-slate-200 max-h-[90vh] overflow-y-auto"
          >
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto sm:hidden" />
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {t(lang, 'ایجاد حساب مدیر ساختمان جدید', 'Create Building Manager Account')}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl"
                aria-label={t(lang, 'بستن', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900">
                {createError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'نام و نام خانوادگی مدیر', 'Manager Full Name')}
                </label>
                <input
                  type="text"
                  required
                  value={newMgrName}
                  onChange={(e) => setNewMgrName(e.target.value)}
                  placeholder={t(lang, 'مثلاً: سارا محمدی', 'e.g. Sarah Miller')}
                  className="w-full h-11 px-3.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'نام کاربری (حداقل ۳ کاراکتر)', 'Username (min 3 chars)')}
                </label>
                <input
                  type="text"
                  required
                  minLength={3}
                  dir="ltr"
                  value={newMgrUser}
                  onChange={(e) => setNewMgrUser(e.target.value)}
                  placeholder="manager_tower1"
                  className="w-full h-11 px-3.5 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'رمز عبور موقت (حداقل ۶ کاراکتر)', 'Initial Password (min 6 chars)')}
                </label>
                <div className="relative">
                  <input
                    type={showNewMgrPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={newMgrPass}
                    onChange={(e) => setNewMgrPass(e.target.value)}
                    className="w-full h-11 px-3.5 pe-11 text-sm font-mono bg-white border border-slate-200 rounded-xl focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewMgrPass((v) => !v)}
                    className="absolute inset-y-0 end-0 w-11 flex items-center justify-center text-slate-400 hover:text-slate-700"
                    aria-label={t(lang, 'نمایش رمز', 'Toggle password')}
                  >
                    {showNewMgrPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  {t(lang, 'تکرار رمز عبور', 'Confirm Password')}
                </label>
                <input
                  type={showNewMgrPass ? 'text' : 'password'}
                  required
                  minLength={6}
                  dir="ltr"
                  value={newMgrPassConfirm}
                  onChange={(e) => setNewMgrPassConfirm(e.target.value)}
                  className={`w-full h-11 px-3.5 text-sm font-mono bg-white border rounded-xl ${
                    newMgrPassConfirm && newMgrPass !== newMgrPassConfirm
                      ? 'border-red-400 bg-red-50/30'
                      : 'border-slate-200 focus:border-blue-600'
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={busyAction || (newMgrPassConfirm.length > 0 && newMgrPass !== newMgrPassConfirm)}
                className="flex-1 h-11 text-xs font-semibold bg-blue-700 text-white rounded-xl hover:bg-blue-800 disabled:opacity-50"
              >
                {busyAction
                  ? t(lang, 'در حال ثبت...', 'Creating...')
                  : t(lang, 'ایجاد حساب مدیر', 'Create Account')}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="h-11 px-4 text-xs font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                {t(lang, 'انصراف', 'Cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 2: MANAGER ACCOUNT INSPECTOR & CONTROLS (Bottom Sheet on mobile / Centered Modal on desktop) */}
      {inspectedManager && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setInspectedManagerId(null)}
          />
          <div className="relative w-full sm:max-w-xl bg-white rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 pb-safe space-y-5 z-10 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto sm:hidden" />

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {inspectedManager.displayName}
                  </h2>
                  <span
                    className={`text-xs font-semibold ${
                      inspectedManager.suspended ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    · {inspectedManager.suspended ? t(lang, 'معلق', 'Suspended') : t(lang, 'فعال', 'Active')}
                  </span>
                </div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">
                  @{inspectedManager.username} · {t(lang, 'عضویت:', 'Joined:')} {formatIsoShort(inspectedManager.createdAt, lang)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedManagerId(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl"
                aria-label={t(lang, 'بستن', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* KPI Mini Strip */}
            <div className="grid grid-cols-4 gap-2 text-center bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
              <div>
                <div className="font-mono font-bold text-slate-900">{inspectedManager.buildingsCount}</div>
                <div className="text-[11px] text-slate-500">{t(lang, 'ساختمان', 'Bldgs')}</div>
              </div>
              <div>
                <div className="font-mono font-bold text-slate-900">
                  {inspectedManager.activeBaysCount}/{inspectedManager.baysCount}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'پارکینگ', 'Bays')}</div>
              </div>
              <div>
                <div className="font-mono font-bold text-slate-900">{inspectedManager.residentAccountsCount}</div>
                <div className="text-[11px] text-slate-500">{t(lang, 'ساکن', 'Users')}</div>
              </div>
              <div>
                <div className="font-mono font-bold text-slate-900">{inspectedManager.reservationsCount}</div>
                <div className="text-[11px] text-slate-500">{t(lang, 'رزرو', 'Bookings')}</div>
              </div>
            </div>

            {/* Owned Buildings List */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-slate-700">
                {t(lang, 'ساختمان‌های تحت مدیریت این حساب', 'Buildings Managed by This Account')}
              </h3>
              {inspectedManager.buildings.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  {t(lang, 'این مدیر هنوز ساختمانی ثبت نکرده است.', 'This manager has not created any buildings yet.')}
                </div>
              ) : (
                <div className="space-y-2">
                  {inspectedManager.buildings.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {lang === 'fa' ? b.nameFa : b.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {lang === 'fa' ? b.cityFa : b.city} · {b.rosterCount} {t(lang, 'مجاز', 'whitelisted')}
                        </div>
                      </div>
                      <div className="font-mono text-slate-700 shrink-0">
                        {b.activeBaysCount}/{b.baysCount} {t(lang, 'پارکینگ', 'bays')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Reset Password Section */}
            <form onSubmit={handleResetPasswordSubmit} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <KeyRound className="w-4 h-4 text-blue-700" />
                {t(lang, 'بازنشانی رمز عبور مدیر', 'Reset Manager Password')}
              </div>
              {resetFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-1.5 ${
                    resetFeedback.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-red-50 text-red-900 border border-red-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{resetFeedback.text}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type={showResetPass ? 'text' : 'password'}
                    required
                    minLength={6}
                    dir="ltr"
                    value={resetPassValue}
                    onChange={(e) => setResetPassValue(e.target.value)}
                    placeholder={t(lang, 'رمز عبور جدید (حداقل ۶ کاراکتر)', 'New password (min 6 chars)')}
                    className="w-full h-10 px-3 pe-10 text-xs font-mono bg-white border border-slate-200 rounded-xl"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass((v) => !v)}
                    className="absolute inset-y-0 end-0 w-10 flex items-center justify-center text-slate-400 hover:text-slate-700"
                    aria-label={t(lang, 'نمایش رمز', 'Toggle password')}
                  >
                    {showResetPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={busyAction || resetPassValue.length < 6}
                  className="h-10 px-4 text-xs font-semibold bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {t(lang, 'ذخیره رمز جدید', 'Update Password')}
                </button>
              </div>
            </form>

            {/* Account Status & Safe Delete */}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => onToggleManagerSuspend(inspectedManager.id)}
                  className={`min-h-[42px] inline-flex items-center justify-center gap-2 px-4 text-xs font-semibold rounded-xl border ${
                    inspectedManager.suspended
                      ? 'text-emerald-800 bg-emerald-50 border-emerald-200 hover:bg-emerald-100'
                      : 'text-amber-900 bg-amber-50 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {inspectedManager.suspended ? <Lock className="w-4 h-4" /> : <UserMinus className="w-4 h-4" />}
                  {inspectedManager.suspended
                    ? t(lang, 'رفع تعلیق و فعال‌سازی حساب', 'Reactivate Account')
                    : t(lang, 'تعلیق موقت حساب مدیر', 'Suspend Manager Account')}
                </button>

                {!confirmDeleteMgr ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMgr(true)}
                    className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100"
                  >
                    <Trash2 className="w-4 h-4" />
                    {t(lang, 'حذف کامل حساب', 'Delete Account')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMgr(false)}
                    className="min-h-[42px] px-4 text-xs font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200"
                  >
                    {t(lang, 'انصراف از حذف', 'Cancel Delete')}
                  </button>
                )}
              </div>

              {confirmDeleteMgr && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-2.5 text-xs text-red-950">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                      {t(
                        lang,
                        `آیا از حذف دائمی حساب @${inspectedManager.username} همراه با ${inspectedManager.buildingsCount} ساختمان و تمام داده‌های مرتبط مطمئن هستید؟ این عملیات قابل بازگشت نیست.`,
                        `Permanently delete @${inspectedManager.username} along with ${inspectedManager.buildingsCount} building(s) and all associated data? This cannot be undone.`
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleConfirmDeleteManager}
                    className="w-full min-h-[40px] text-xs font-semibold bg-red-700 text-white rounded-xl hover:bg-red-800 disabled:opacity-50"
                  >
                    {busyAction
                      ? t(lang, 'در حال حذف...', 'Deleting...')
                      : t(lang, 'تأیید و حذف نهایی حساب مدیر', 'Confirm Permanent Deletion')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
