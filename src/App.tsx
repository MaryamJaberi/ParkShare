import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarClock,
  Car,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AccessPolicyLevel,
  AdminOverviewPayload,
  BlockedAccessAttempt,
  BuildingInviteLink,
  BuildingRosterEntry,
  BuildingWhatsAppGroupConfig,
  Community,
  ExtendedParkingRequest,
  FairUsePolicy,
  Language,
  NotificationEvent,
  OptimizedScheduleOption,
  ParkingReview,
  PrivacyAuditEvent,
  Reservation,
  ReservationStatus,
  Resource,
  UserProfile,
} from './types/parkshare';
import { createAtomicBooking } from './engines/coreEngine';
import { t } from './i18n/translations';
import { pseudonymizeUser } from './utils/privacy';
import { AuthAccount, AuthView } from './components/AuthView';
import { ResidentAppView } from './components/ResidentAppView';
import { BuildingManagerView } from './components/BuildingManagerView';
import { AvailabilityBookingsView } from './components/AvailabilityBookingsView';
import { FederationPrivacyView } from './components/FederationPrivacyView';
import { AdminSection, SuperAdminView } from './components/SuperAdminView';
import { WhatsAppBotPanel } from './components/WhatsAppBotPanel';
import { WhatsAppBotReply } from './engines/whatsappBotEngine';

type ActiveTab =
  | 'resident'
  | 'whatsapp'
  | 'manager'
  | 'bookings'
  | 'federation'
  | 'admin_overview'
  | 'admin_managers'
  | 'admin_buildings'
  | 'admin_activity';

interface ServerStatePayload {
  communities: Community[];
  users: UserProfile[];
  resources: Resource[];
  reservations: Reservation[];
  inviteLinks: BuildingInviteLink[];
  rosterEntries: BuildingRosterEntry[];
  blockedAttempts: BlockedAccessAttempt[];
  reviews: ParkingReview[];
  extendedRequests: ExtendedParkingRequest[];
  privacyAudits: PrivacyAuditEvent[];
  notifications: NotificationEvent[];
}

export default function App() {
  const [lang, setLang] = useState<Language>('nl');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Auth state kept strictly in JS memory (never localStorage/sessionStorage)
  const [authReady, setAuthReady] = useState(false);
  const [hasManager, setHasManager] = useState(false);
  const [hasSuperAdmin, setHasSuperAdmin] = useState(false);
  const [envAdminConfigured, setEnvAdminConfigured] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authAccount, setAuthAccount] = useState<AuthAccount | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('manager');
  const [loadingState, setLoadingState] = useState(false);
  const [adminOverview, setAdminOverview] = useState<AdminOverviewPayload | null>(null);

  // Private admin route detection (/admin or ?admin=1) — completely invisible on normal /
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const p = window.location.pathname.replace(/\/+$/, '');
    const params = new URLSearchParams(window.location.search);
    return p === '/admin' || params.get('admin') === '1';
  });

  // Invite token from URL (?invite=...) or when manager previews the neighbor signup link
  const [inviteToken, setInviteToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('invite');
  });
  const [previewInviteToken, setPreviewInviteToken] = useState<string | null>(null);

  // Clean-slate state hydrated exclusively from authenticated backend API
  const [communities, setCommunities] = useState<Community[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inviteLinks, setInviteLinks] = useState<BuildingInviteLink[]>([]);
  const [rosterEntries, setRosterEntries] = useState<BuildingRosterEntry[]>([]);
  const [blockedAttempts, setBlockedAttempts] = useState<BlockedAccessAttempt[]>([]);
  const [reviews, setReviews] = useState<ParkingReview[]>([]);
  const [extendedRequests, setExtendedRequests] = useState<ExtendedParkingRequest[]>([]);
  const [privacyAudits, setPrivacyAudits] = useState<PrivacyAuditEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationEvent[]>([]);
  const [networkOffline, setNetworkOffline] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  }, [lang]);

  // Check initial bootstrap status on mount
  const refreshAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status');
      if (res.ok) {
        const data = await res.json();
        setHasManager(Boolean(data.hasManager));
        setHasSuperAdmin(Boolean(data.hasSuperAdmin));
        setEnvAdminConfigured(Boolean(data.envAdminConfigured));
      }
    } catch {
      // Network error handled gracefully
    } finally {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    refreshAuthStatus();
  }, [refreshAuthStatus]);

  const applyServerState = useCallback((data: ServerStatePayload) => {
    setCommunities(data.communities ?? []);
    setUsers(data.users ?? []);
    setResources(data.resources ?? []);
    setReservations(data.reservations ?? []);
    setInviteLinks(data.inviteLinks ?? []);
    setRosterEntries(data.rosterEntries ?? []);
    setBlockedAttempts(data.blockedAttempts ?? []);
    setReviews(data.reviews ?? []);
    setExtendedRequests(data.extendedRequests ?? []);
    setPrivacyAudits(data.privacyAudits ?? []);
    setNotifications(data.notifications ?? []);
  }, []);

  const clearSessionState = useCallback(() => {
    setAuthToken(null);
    setAuthAccount(null);
    setAdminOverview(null);
    setPreviewInviteToken(null);
    setCommunities([]);
    setUsers([]);
    setResources([]);
    setReservations([]);
    setInviteLinks([]);
    setRosterEntries([]);
    setBlockedAttempts([]);
    setReviews([]);
    setExtendedRequests([]);
    setPrivacyAudits([]);
    setNotifications([]);
  }, []);

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      };
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        clearSessionState();
        refreshAuthStatus();
        throw new Error('Unauthorized');
      }
      return res;
    },
    [authToken, clearSessionState, refreshAuthStatus]
  );

  const loadAdminOverview = useCallback(async () => {
    if (!authToken || authAccount?.role !== 'super_admin') return;
    setLoadingState(true);
    try {
      const res = await apiFetch('/api/admin/overview');
      if (res.ok) {
        setAdminOverview((await res.json()) as AdminOverviewPayload);
      }
    } catch {
      // Handled by apiFetch
    } finally {
      setLoadingState(false);
    }
  }, [authToken, authAccount?.role, apiFetch]);

  // Load role-scoped data after authentication
  useEffect(() => {
    if (!authToken || !authAccount) return;
    if (authAccount.role === 'super_admin') {
      loadAdminOverview();
      return;
    }
    let cancelled = false;
    setLoadingState(true);
    apiFetch('/api/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ServerStatePayload | null) => {
        if (!cancelled && data) {
          applyServerState(data);
        }
      })
      .catch(() => {
        // Handled by apiFetch
      })
      .finally(() => {
        if (!cancelled) setLoadingState(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken, authAccount, apiFetch, applyServerState, loadAdminOverview]);

  const clearUrlInviteParam = () => {
    setInviteToken(null);
    setPreviewInviteToken(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleExitAdminRoute = () => {
    setIsAdminRoute(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.pathname = '/';
      url.searchParams.delete('admin');
      window.history.replaceState({}, '', url.toString());
    }
  };

  const handleAuthenticated = (token: string, account: AuthAccount) => {
    setAuthToken(token);
    setAuthAccount(account);
    if (account.role === 'manager') setHasManager(true);
    if (account.role === 'super_admin') setHasSuperAdmin(true);
    setActiveTab(
      account.role === 'super_admin'
        ? 'admin_overview'
        : account.role === 'manager'
          ? 'manager'
          : 'resident'
    );
    clearUrlInviteParam();
  };

  const handleLogout = async () => {
    try {
      if (authToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
        });
      }
    } catch {
      // Ignore network errors on logout
    }
    clearSessionState();
    refreshAuthStatus();
  };

  const handleOpenInvitePreview = (token: string) => {
    setPreviewInviteToken(token);
  };

  // --- Platform Owner (Super Admin) API Handlers ---
  const handleAdminCreateManager = async (payload: {
    displayName: string;
    username: string;
    password: string;
  }): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiFetch('/api/admin/managers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error,
      };
    }
    setAdminOverview(data as AdminOverviewPayload);
    setHasManager(true);
    return { ok: true };
  };

  const handleAdminToggleManagerSuspend = async (managerId: string) => {
    const res = await apiFetch(`/api/admin/managers/${encodeURIComponent(managerId)}/toggle-suspend`, {
      method: 'PATCH',
    });
    if (res.ok) {
      setAdminOverview((await res.json()) as AdminOverviewPayload);
    }
  };

  const handleAdminResetManagerPassword = async (
    managerId: string,
    password: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const res = await apiFetch(`/api/admin/managers/${encodeURIComponent(managerId)}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false,
        error: lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error,
      };
    }
    setAdminOverview(data as AdminOverviewPayload);
    return { ok: true };
  };

  const handleAdminDeleteManager = async (managerId: string) => {
    const res = await apiFetch(`/api/admin/managers/${encodeURIComponent(managerId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setAdminOverview((await res.json()) as AdminOverviewPayload);
    }
  };

  const handleAdminToggleResidentSuspend = async (residentAccountId: string) => {
    const res = await apiFetch(
      `/api/admin/residents/${encodeURIComponent(residentAccountId)}/toggle-suspend`,
      { method: 'PATCH' }
    );
    if (res.ok) {
      setAdminOverview((await res.json()) as AdminOverviewPayload);
    }
  };

  const handleAdminToggleBuildingFederation = async (communityId: string) => {
    const res = await apiFetch(
      `/api/admin/buildings/${encodeURIComponent(communityId)}/toggle-federation`,
      { method: 'PATCH' }
    );
    if (res.ok) {
      setAdminOverview((await res.json()) as AdminOverviewPayload);
    }
  };

  // --- Building Manager API Handlers ---
  const handleCreateBuilding = async (community: Community, initialInvite: BuildingInviteLink) => {
    const res = await apiFetch('/api/manager/buildings', {
      method: 'POST',
      body: JSON.stringify({ community, initialInvite }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleLoadBostonSample = async (): Promise<string | null> => {
    const res = await apiFetch('/api/manager/seed-boston-sample', { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.state) applyServerState(data.state);
    return typeof data.communityId === 'string' ? data.communityId : null;
  };

  const handleToggleResourceActive = async (resourceId: string) => {
    const res = await apiFetch(`/api/manager/resources/${encodeURIComponent(resourceId)}/toggle`, {
      method: 'PATCH',
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleImportRosterEntries = async (
    communityId: string,
    entries: BuildingRosterEntry[],
    activateImmediately = false
  ): Promise<number> => {
    const res = await apiFetch(`/api/manager/buildings/${encodeURIComponent(communityId)}/roster`, {
      method: 'POST',
      body: JSON.stringify({ entries, activateImmediately }),
    });
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.state) applyServerState(data.state);
    return Number(data.addedCount ?? entries.length);
  };

  const handleToggleRosterStatus = async (entryId: string) => {
    const res = await apiFetch(`/api/manager/roster/${encodeURIComponent(entryId)}/toggle`, {
      method: 'PATCH',
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleUpdateCommunityPolicies = async (
    communityId: string,
    allowedUsagePolicies: AccessPolicyLevel[],
    allowPaidSharing: boolean
  ) => {
    const res = await apiFetch(`/api/manager/buildings/${encodeURIComponent(communityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ allowedUsagePolicies, allowPaidSharing }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleUpdateFairUsePolicy = async (communityId: string, fairUsePolicy: FairUsePolicy) => {
    const res = await apiFetch(`/api/manager/buildings/${encodeURIComponent(communityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ fairUsePolicy }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleToggleInviteActive = async (inviteId: string) => {
    const res = await apiFetch(`/api/manager/invites/${encodeURIComponent(inviteId)}/toggle`, {
      method: 'PATCH',
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleDecideExtendedRequest = async (
    requestId: string,
    status: ExtendedParkingRequest['status']
  ) => {
    const res = await apiFetch(`/api/extended-requests/${encodeURIComponent(requestId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      applyServerState(await res.json());
    }
  };

  const handleToggleCommunityFederation = async (communityId: string) => {
    const target = communities.find((c) => c.id === communityId);
    if (!target) return;
    const res = await apiFetch(`/api/manager/buildings/${encodeURIComponent(communityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ federationEnabled: !target.federationEnabled }),
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleToggleCommunityAnalyticsConsent = async (communityId: string) => {
    const target = communities.find((c) => c.id === communityId);
    if (!target) return;
    const res = await apiFetch(`/api/manager/buildings/${encodeURIComponent(communityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ consentDemandAnalytics: !target.consentDemandAnalytics }),
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleRotateCommunityKey = async (communityId: string) => {
    const res = await apiFetch(
      `/api/manager/buildings/${encodeURIComponent(communityId)}/rotate-key`,
      { method: 'POST' }
    );
    if (res.ok) applyServerState(await res.json());
  };

  const handleUpdateRetentionDays = async (communityId: string, days: 0 | 30 | 90) => {
    const res = await apiFetch(`/api/manager/buildings/${encodeURIComponent(communityId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ dataRetentionDays: days }),
    });
    if (res.ok) applyServerState(await res.json());
  };

  // --- Booking, Review, Extended Request & Privacy Handlers ---
  const handleBookOption = async (
    option: OptimizedScheduleOption,
    requester: UserProfile,
    anonymousBooking = true
  ): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await apiFetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify({
          option,
          requesterId: requester.id,
          anonymousBooking,
          networkOffline,
          pseudonymousLabel: pseudonymizeUser(requester.id, lang),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        return {
          ok: false,
          message:
            lang === 'fa'
              ? data.messageFa || 'خطا در ثبت رزرو'
              : data.messageEn || 'Booking failed',
        };
      }
      if (data.state) applyServerState(data.state);
      const codes = option.segments.map((s) => s.resource.code).join(' → ');
      return {
        ok: true,
        message:
          lang === 'fa'
            ? option.requiresManualApproval
              ? `درخواست رزرو روی ${codes} با هویت مخفی در انتظار تأیید مالک ثبت شد.`
              : `رزرو روی ${codes} با هویت مخفی قطعی شد.`
            : option.requiresManualApproval
              ? `Pseudonymous request on ${codes} submitted for owner approval.`
              : `Pseudonymous booking confirmed on ${codes}.`,
      };
    } catch {
      return {
        ok: false,
        message: t(lang, 'خطای ارتباط با سرور در ثبت رزرو.', 'Server error while creating booking.'),
      };
    }
  };

  const handleTransitionStatus = async (reservationId: string, nextStatus: ReservationStatus) => {
    const res = await apiFetch(`/api/bookings/${encodeURIComponent(reservationId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleTriggerOwnerRecall = async (reservationId: string) => {
    const res = await apiFetch(`/api/bookings/${encodeURIComponent(reservationId)}/recall`, {
      method: 'POST',
      body: JSON.stringify({ networkOffline }),
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleAcceptRelocation = async (reservationId: string) => {
    const res = await apiFetch(`/api/bookings/${encodeURIComponent(reservationId)}/relocate`, {
      method: 'POST',
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleSimulateDoubleBooking = (reservationId: string) => {
    const target = reservations.find((r) => r.id === reservationId);
    const resObj = resources.find((r) => r.id === target?.resourceId);
    const comm = communities.find((c) => c.id === resObj?.communityId);
    const sampleUser = users[0];
    if (!target || !resObj || !comm || !sampleUser) {
      return { ok: false, message: t(lang, 'رزرو یا کاربر یافت نشد.', 'Reservation or user not found.') };
    }
    const duplicateOption: OptimizedScheduleOption = {
      id: 'dup-check',
      type: 'continuous',
      segments: [
        {
          resource: resObj,
          community: comm,
          startMin: target.startMin,
          endMin: target.endMin,
          isFederated: false,
          policyDecision: 'Allowed',
        },
      ],
      totalCoverageMin: target.endMin - target.startMin,
      coverageRatio: 1,
      longestContinuousMin: target.endMin - target.startMin,
      relocationCount: 0,
      averageRisk: resObj.recallRiskScore,
      objectiveScore: 90,
      totalEstimatedEur: 0,
      requiresManualApproval: false,
    };
    const outcome = createAtomicBooking(
      duplicateOption,
      sampleUser,
      reservations,
      communities,
      networkOffline
    );
    return {
      ok: outcome.ok,
      message:
        lang === 'fa'
          ? outcome.errorMessageFa ?? 'درخواست تکراری مسدود شد.'
          : outcome.errorMessageEn ?? 'Duplicate booking blocked.',
    };
  };

  const handleSubmitReview = async (review: Omit<ParkingReview, 'id' | 'createdAt'>) => {
    const res = await apiFetch('/api/reviews', {
      method: 'POST',
      body: JSON.stringify(review),
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleSubmitExtendedRequest = async (
    req: Omit<ExtendedParkingRequest, 'id' | 'status' | 'createdAt'>
  ) => {
    const res = await apiFetch('/api/extended-requests', {
      method: 'POST',
      body: JSON.stringify(req),
    });
    if (res.ok) applyServerState(await res.json());
  };

  const handleEraseUserReservations = async () => {
    const res = await apiFetch('/api/privacy/my-reservations', { method: 'DELETE' });
    if (res.ok) applyServerState(await res.json());
  };

  const handleLogPrivacyExport = async (communityId: string, actorLabel: string) => {
    const res = await apiFetch('/api/privacy/log-export', {
      method: 'POST',
      body: JSON.stringify({ communityId, actorLabel }),
    });
    if (res.ok) applyServerState(await res.json());
  };

  // --- WhatsApp 1-on-1 GDPR Bot Handlers ---
  const handleSimulateWhatsApp = useCallback(
    async (payload: {
      senderPhone: string;
      messageText?: string;
      buttonId?: string;
    }): Promise<WhatsAppBotReply | null> => {
      try {
        const res = await apiFetch('/api/whatsapp/simulate', {
          method: 'POST',
          body: JSON.stringify({ ...payload, lang }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (data.state) applyServerState(data.state);
        return (data.reply as WhatsAppBotReply) ?? null;
      } catch {
        return null;
      }
    },
    [apiFetch, applyServerState, lang]
  );

  const handleFetchWhatsAppConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/api/whatsapp/config');
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [apiFetch]);

  const handleUpdateWhatsAppGroup = useCallback(
    async (
      communityId: string,
      config: BuildingWhatsAppGroupConfig
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await apiFetch(`/api/manager/buildings/${communityId}/whatsapp-group`, {
          method: 'PATCH',
          body: JSON.stringify(config),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            ok: false,
            error: lang === 'fa' ? data.errorFa || data.error : data.errorEn || data.error,
          };
        }
        applyServerState(data);
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: lang === 'fa' ? 'خطا در ارتباط با سرور.' : 'Server connection error.',
        };
      }
    },
    [apiFetch, applyServerState, lang]
  );

  // Loading bootstrap state
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 p-6">
        <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="text-sm font-medium text-slate-600">
          {t(lang, 'در حال آماده‌سازی ParkShare...', 'Preparing ParkShare...')}
        </div>
      </div>
    );
  }

  // Unauthenticated OR Manager previewing the neighbor invite link
  if (!authToken || !authAccount || previewInviteToken) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        <header className="h-14 sm:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
              ParkShare
            </span>
            {previewInviteToken && authAccount?.role === 'manager' && (
              <button
                type="button"
                onClick={() => setPreviewInviteToken(null)}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
              >
                <ArrowRight className={`w-3.5 h-3.5 ${lang !== 'fa' ? 'rotate-180' : ''}`} />
                {t(lang, 'بازگشت به پنل مدیر', 'Back to Manager')}
              </button>
            )}
          </div>
          <div
            role="group"
            aria-label={t(lang, 'انتخاب زبان', 'Language selector', 'Taalkeuze')}
            className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg shrink-0"
          >
            {(['nl', 'en', 'fa'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  lang === code
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {code === 'nl' ? 'NL' : code === 'en' ? 'EN' : 'فارسی'}
              </button>
            ))}
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
          <AuthView
            lang={lang}
            hasManager={hasManager}
            hasSuperAdmin={hasSuperAdmin}
            envAdminConfigured={envAdminConfigured}
            isAdminRoute={isAdminRoute}
            initialInviteToken={previewInviteToken ?? inviteToken}
            onAuthenticated={handleAuthenticated}
            onClearInviteToken={clearUrlInviteParam}
            onExitAdminRoute={handleExitAdminRoute}
          />
        </main>
      </div>
    );
  }

  const isSuperAdmin = authAccount.role === 'super_admin';
  const isManager = authAccount.role === 'manager';

  const navItems: {
    id: ActiveTab;
    labelFa: string;
    labelEn: string;
    shortFa: string;
    shortEn: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = isSuperAdmin
    ? [
        {
          id: 'admin_overview',
          labelFa: 'داشبورد کل سامانه',
          labelEn: 'Platform Overview',
          shortFa: 'داشبورد',
          shortEn: 'Overview',
          icon: LayoutDashboard,
        },
        {
          id: 'admin_managers',
          labelFa: 'مدیران ساختمان',
          labelEn: 'Manager Accounts',
          shortFa: 'مدیران',
          shortEn: 'Managers',
          icon: Users,
        },
        {
          id: 'admin_buildings',
          labelFa: 'ساختمان‌ها و پارکینگ‌ها',
          labelEn: 'Buildings & Bays',
          shortFa: 'ساختمان‌ها',
          shortEn: 'Buildings',
          icon: Building2,
        },
        {
          id: 'admin_activity',
          labelFa: 'ساکنان، رزروها و امنیت',
          labelEn: 'Users & Security',
          shortFa: 'فعالیت‌ها',
          shortEn: 'Activity',
          icon: Activity,
        },
      ]
    : isManager
      ? [
          {
            id: 'manager',
            labelFa: 'پنل مدیر ساختمان',
            labelEn: 'Building Manager',
            shortFa: 'ساختمان',
            shortEn: 'Building',
            icon: Building2,
          },
          {
            id: 'bookings',
            labelFa: 'تقویم و رزروها',
            labelEn: 'Bookings & Schedule',
            shortFa: 'رزروها',
            shortEn: 'Bookings',
            icon: CalendarClock,
          },
          {
            id: 'resident',
            labelFa: 'نمای اپ ساکنان',
            labelEn: 'Resident App',
            shortFa: 'ساکنان',
            shortEn: 'Resident',
            icon: Car,
          },
          {
            id: 'federation',
            labelFa: 'اعتماد و حریم خصوصی',
            labelEn: 'Trust & Privacy',
            shortFa: 'اعتماد',
            shortEn: 'Privacy',
            icon: ShieldCheck,
          },
        ]
      : [
          {
            id: 'resident',
            labelFa: 'رزرو پارکینگ',
            labelEn: 'Find & Book',
            shortFa: 'پارکینگ',
            shortEn: 'Parking',
            icon: Car,
          },
          {
            id: 'whatsapp',
            labelFa: 'بات واتساپ خصوصی',
            labelEn: 'WhatsApp Bot',
            shortFa: 'واتساپ',
            shortEn: 'WhatsApp',
            icon: MessageCircle,
          },
          {
            id: 'federation',
            labelFa: 'اعتماد و حریم خصوصی',
            labelEn: 'Trust & Privacy',
            shortFa: 'اعتماد',
            shortEn: 'Privacy',
            icon: ShieldCheck,
          },
        ];

  const activeNavMeta = navItems.find((n) => n.id === activeTab) ?? navItems[0];
  const pendingExtendedCount = extendedRequests.filter((r) => r.status === 'Pending').length;
  const roleLabel = isSuperAdmin
    ? t(lang, 'مدیریت کل', 'Owner')
    : isManager
      ? t(lang, 'پنل مدیر', 'Manager')
      : t(lang, 'ساکن', 'Resident');

  const adminSectionFromTab = (tab: ActiveTab): AdminSection => {
    if (tab === 'admin_managers') return 'managers';
    if (tab === 'admin_buildings') return 'buildings';
    if (tab === 'admin_activity') return 'activity';
    return 'overview';
  };

  const tabFromAdminSection = (section: AdminSection): ActiveTab => {
    if (section === 'managers') return 'admin_managers';
    if (section === 'buildings') return 'admin_buildings';
    if (section === 'activity') return 'admin_activity';
    return 'admin_overview';
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-e border-slate-200 z-30">
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-200">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            ParkShare
          </span>
          <span className="text-xs font-semibold text-blue-700">
            {roleLabel}
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[42px] flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium rounded-xl transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{t(lang, item.labelFa, item.labelEn)}</span>
                </span>
                {item.id === 'manager' && pendingExtendedCount > 0 && (
                  <span
                    className={`text-[11px] font-mono tabular-nums font-semibold ${
                      active ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  >
                    {pendingExtendedCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3.5 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-900 truncate">{authAccount.displayName}</div>
              <div className="text-[11px] text-slate-500 font-mono truncate">@{authAccount.username}</div>
            </div>
          </div>

          {isSuperAdmin && adminOverview && (
            <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                  {adminOverview.stats.totalManagers}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'مدیر', 'Mgrs')}</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                  {adminOverview.stats.totalBuildings}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'ساختمان', 'Bldgs')}</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                  {adminOverview.stats.totalBays}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'پارکینگ', 'Bays')}</div>
              </div>
            </div>
          )}

          {isManager && (
            <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                  {communities.length}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'ساختمان', 'Bldgs')}</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                  {rosterEntries.filter((e) => e.status !== 'revoked').length}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'مجاز', 'Roster')}</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-sm font-semibold text-slate-900">
                  {resources.length}
                </div>
                <div className="text-[11px] text-slate-500">{t(lang, 'پارکینگ', 'Bays')}</div>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t(lang, 'خروج از حساب', 'Sign Out')}
          </button>
        </div>
      </aside>

      {/* Mobile Account Sheet (Triggered only from mobile header profile/account button) */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end justify-center">
          <div
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-safe space-y-4 z-10 border-t border-slate-200">
            <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center shrink-0">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {authAccount.displayName}
                  </div>
                  <div className="text-xs text-slate-500 font-mono truncate">
                    @{authAccount.username} · {roleLabel}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-xl"
                aria-label={t(lang, 'بستن', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              <div
                role="group"
                aria-label={t(lang, 'انتخاب زبان', 'Language selector', 'Taalkeuze')}
                className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl"
              >
                {(['nl', 'en', 'fa'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setLang(code);
                      setMobileNavOpen(false);
                    }}
                    className={`min-h-[40px] text-xs font-medium rounded-lg transition-colors ${
                      lang === code
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {code === 'nl' ? 'Nederlands' : code === 'en' ? 'English' : 'فارسی'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  handleLogout();
                }}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100"
              >
                <LogOut className="w-4 h-4" />
                {t(lang, 'خروج از حساب', 'Sign Out')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:ps-64 flex flex-col min-w-0 pb-20 lg:pb-0">
        {/* Compact Top Bar (52px mobile, 64px desktop — single language switch on desktop, no duplicate Sign Out) */}
        <header className="h-[52px] lg:h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="font-bold text-slate-900 whitespace-nowrap lg:hidden">ParkShare</span>
            <span aria-hidden="true" className="lg:hidden text-slate-300">/</span>
            <span className="font-semibold text-slate-900 lg:text-base truncate">
              {t(lang, activeNavMeta.labelFa, activeNavMeta.labelEn)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div
              role="group"
              aria-label={t(lang, 'انتخاب زبان', 'Language selector', 'Taalkeuze')}
              className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-lg"
            >
              {(['nl', 'en', 'fa'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`min-h-[34px] px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    lang === code
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {code === 'nl' ? 'NL' : code === 'en' ? 'EN' : 'فارسی'}
                </button>
              ))}
            </div>

            {/* Mobile Account / Sign-out Sheet Trigger */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              aria-label={t(lang, 'حساب کاربری و خروج', 'Account and sign out')}
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-4 sm:p-6 lg:p-8 max-w-[1280px] w-full mx-auto scroll-mt-20">
          {loadingState && !isSuperAdmin ? (
            <div className="space-y-4 py-4 animate-pulse">
              <div className="h-8 w-56 bg-slate-200 rounded-lg" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="h-24 bg-white border border-slate-200 rounded-2xl" />
                <div className="h-24 bg-white border border-slate-200 rounded-2xl" />
                <div className="h-24 bg-white border border-slate-200 rounded-2xl" />
                <div className="h-24 bg-white border border-slate-200 rounded-2xl" />
              </div>
              <div className="h-64 bg-white border border-slate-200 rounded-2xl" />
            </div>
          ) : (
            <>
              {isSuperAdmin && (
                <SuperAdminView
                  lang={lang}
                  activeSection={adminSectionFromTab(activeTab)}
                  onSelectSection={(sec) => setActiveTab(tabFromAdminSection(sec))}
                  overview={adminOverview}
                  loading={loadingState}
                  onRefresh={loadAdminOverview}
                  onCreateManager={handleAdminCreateManager}
                  onToggleManagerSuspend={handleAdminToggleManagerSuspend}
                  onResetManagerPassword={handleAdminResetManagerPassword}
                  onDeleteManager={handleAdminDeleteManager}
                  onToggleResidentSuspend={handleAdminToggleResidentSuspend}
                  onToggleBuildingFederation={handleAdminToggleBuildingFederation}
                />
              )}

              {activeTab === 'manager' && isManager && (
                <BuildingManagerView
                  lang={lang}
                  communities={communities}
                  resources={resources}
                  inviteLinks={inviteLinks}
                  rosterEntries={rosterEntries}
                  blockedAttempts={blockedAttempts}
                  extendedRequests={extendedRequests}
                  reviews={reviews}
                  onCreateBuilding={handleCreateBuilding}
                  onLoadBostonSample={handleLoadBostonSample}
                  onToggleResourceActive={handleToggleResourceActive}
                  onImportRosterEntries={handleImportRosterEntries}
                  onToggleRosterStatus={handleToggleRosterStatus}
                  onUpdateCommunityPolicies={handleUpdateCommunityPolicies}
                  onUpdateFairUsePolicy={handleUpdateFairUsePolicy}
                  onDecideExtendedRequest={handleDecideExtendedRequest}
                  onToggleInviteActive={handleToggleInviteActive}
                  onOpenInviteForm={handleOpenInvitePreview}
                  onOpenTrustCenter={() => setActiveTab('federation')}
                  onLogBuildingExport={(commId) =>
                    handleLogPrivacyExport(commId, authAccount.displayName)
                  }
                  onSimulateWhatsApp={handleSimulateWhatsApp}
                  onFetchWhatsAppConfig={handleFetchWhatsAppConfig}
                  onUpdateWhatsAppGroup={handleUpdateWhatsAppGroup}
                />
              )}

              {activeTab === 'whatsapp' && !isSuperAdmin && !isManager && (
                <WhatsAppBotPanel
                  lang={lang}
                  role="resident"
                  community={communities.find((c) => c.id === authAccount.communityId) ?? communities[0] ?? null}
                  rosterEntries={[]}
                  residentOwnPhone={users.find((u) => u.id === authAccount.userId)?.phone}
                  residentOwnName={authAccount.displayName}
                  onSimulateMessage={handleSimulateWhatsApp}
                  onFetchConfig={handleFetchWhatsAppConfig}
                />
              )}

              {activeTab === 'resident' && !isSuperAdmin && (
                <ResidentAppView
                  lang={lang}
                  currentUserRole={authAccount.role === 'manager' ? 'manager' : 'resident'}
                  currentUserId={authAccount.userId}
                  users={users}
                  communities={communities}
                  resources={resources}
                  reservations={reservations}
                  reviews={reviews}
                  extendedRequests={extendedRequests}
                  networkOffline={networkOffline}
                  onBookOption={handleBookOption}
                  onCancelReservation={(id) => handleTransitionStatus(id, 'Cancelled')}
                  onSubmitReview={handleSubmitReview}
                  onSubmitExtendedRequest={handleSubmitExtendedRequest}
                  onEraseUserReservations={handleEraseUserReservations}
                  onLogPrivacyExport={handleLogPrivacyExport}
                  onOpenTrustCenter={() => setActiveTab('federation')}
                  onOpenManagerPanel={isManager ? () => setActiveTab('manager') : undefined}
                />
              )}

              {activeTab === 'bookings' && isManager && (
                <AvailabilityBookingsView
                  lang={lang}
                  communities={communities}
                  resources={resources}
                  reservations={reservations}
                  notifications={notifications}
                  onTransitionStatus={handleTransitionStatus}
                  onTriggerOwnerRecall={handleTriggerOwnerRecall}
                  onAcceptRelocation={handleAcceptRelocation}
                  onSimulateDoubleBooking={handleSimulateDoubleBooking}
                />
              )}

              {activeTab === 'federation' && (
                <FederationPrivacyView
                  lang={lang}
                  isManager={isManager}
                  communities={communities}
                  resources={resources}
                  reservations={reservations}
                  privacyAudits={privacyAudits}
                  networkOffline={networkOffline}
                  onToggleOffline={() => setNetworkOffline((prev) => !prev)}
                  onToggleCommunityFederation={handleToggleCommunityFederation}
                  onToggleCommunityAnalyticsConsent={handleToggleCommunityAnalyticsConsent}
                  onRotateCommunityKey={handleRotateCommunityKey}
                  onUpdateRetentionDays={handleUpdateRetentionDays}
                  onLogBuildingExport={(commId) =>
                    handleLogPrivacyExport(commId, authAccount.displayName)
                  }
                />
              )}
            </>
          )}
        </main>

        {/* Mobile Bottom Tab Bar (Compact 58px frosted bar — total mobile sticky height <= 110px) */}
        <nav
          aria-label="Mobile navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1.5 py-1 pb-safe z-30"
        >
          <div
            className="grid items-center gap-1"
            style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative min-h-[48px] flex flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-colors ${
                    active ? 'text-blue-700 bg-blue-50/70' : 'text-slate-500 active:bg-slate-100'
                  }`}
                >
                  <Icon className="w-[19px] h-[19px]" />
                  <span className="truncate max-w-full px-1">
                    {t(lang, item.shortFa, item.shortEn)}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
