import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type {
  AccessPolicyLevel,
  AdminOverviewPayload,
  BlockedAccessAttempt,
  BuildingInviteLink,
  BuildingRosterEntry,
  BuildingWhatsAppGroupConfig,
  Community,
  DirectShareBookingOwnerView,
  DirectShareBookingPublic,
  DirectShareFairUse,
  DirectShareSpotPublic,
  ExtendedParkingRequest,
  FairUsePolicy,
  NeighborOptInSubmission,
  NotificationEvent,
  ParkingReview,
  PrivacyAuditEvent,
  Reservation,
  ReservationStatus,
  Resource,
  UserProfile,
} from './src/types/parkshare.ts';
import {
  createAtomicBooking,
  createNotificationEvent,
  triggerOwnerRecall,
} from './src/engines/coreEngine.ts';
import { formatMinutes } from './src/i18n/translations.ts';
import { buildBostonResidenceSampleBundle } from './src/data/bostonSampleDataset.ts';
import { processWhatsAppMessage } from './src/engines/whatsappBotEngine.ts';
import type { WhatsAppQuickReplyButton } from './src/engines/whatsappBotEngine.ts';

interface StoredAccount {
  id: string;
  username: string;
  passwordHash: string;
  role: 'super_admin' | 'manager' | 'resident';
  displayName: string;
  userId?: string;
  communityId?: string;
  suspended?: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

interface SessionInfo {
  token: string;
  accountId: string;
  username: string;
  displayName: string;
  role: 'super_admin' | 'manager' | 'resident';
  userId?: string;
  communityId?: string;
}

interface StoredDirectSpot {
  id: string;
  slug: string;
  buildingSlug: string;
  buildingName: string;
  bayNumber: string;
  floorOrZone: string;
  ownerDisplayName: string;
  ownerPhone?: string;
  ownerPinHash?: string;
  isFree: boolean;
  availabilityMode?: 'always' | 'one_time';
  availableFromIso?: string;
  availableUntilIso?: string;
  availabilityNote: string;
  active: boolean;
  fairUse: DirectShareFairUse;
  createdAt: string;
}

interface StoredDirectBooking {
  id: string;
  spotId: string;
  buildingSlug: string;
  startIso: string;
  endIso: string;
  status: 'Confirmed' | 'Cancelled';
  purposeTag: 'visite' | 'temporary' | 'delivery';
  guestName: string;
  guestPhone: string;
  guestPhoneNormalized: string;
  guestUnit: string;
  guestUnitNormalized: string;
  guestPlate?: string;
  note?: string;
  cancelCode: string;
  createdAt: string;
}

interface ParkShareStore {
  accounts: StoredAccount[];
  communities: Community[];
  users: UserProfile[];
  resources: Resource[];
  reservations: Reservation[];
  inviteLinks: BuildingInviteLink[];
  rosterEntries: BuildingRosterEntry[];
  blockedAttempts: BlockedAccessAttempt[];
  submissions: NeighborOptInSubmission[];
  reviews: ParkingReview[];
  extendedRequests: ExtendedParkingRequest[];
  privacyAudits: PrivacyAuditEvent[];
  notifications: NotificationEvent[];
  directSpots: StoredDirectSpot[];
  directBookings: StoredDirectBooking[];
}

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.resolve(process.cwd(), 'data'));
const STORE_PATH = path.resolve(DATA_DIR, 'parkshare-store.json');

const DEFAULT_DIRECT_FAIR_USE: DirectShareFairUse = {
  maxHoursPerBooking: 24,
  maxDaysPerMonthPerGuest: 8,
  maxActiveBookingsPerGuest: 2,
  minGapHoursBetweenStays: 24,
};

function createDefaultBoston177Spot(): StoredDirectSpot {
  return {
    id: 'direct-boston-177',
    slug: 'boston-177',
    buildingSlug: 'boston',
    buildingName: 'Boston Residence',
    bayNumber: '177',
    floorOrZone: 'P5',
    ownerDisplayName: 'Maryam (P5 · Plek 177)',
    isFree: true,
    availabilityNote: 'Volledig beschikbaar voor tijdelijk gebruik / visite (gratis voor buren)',
    active: true,
    fairUse: { ...DEFAULT_DIRECT_FAIR_USE },
    createdAt: new Date().toISOString(),
  };
}

function createEmptyStore(): ParkShareStore {
  return {
    accounts: [],
    communities: [],
    users: [],
    resources: [],
    reservations: [],
    inviteLinks: [],
    rosterEntries: [],
    blockedAttempts: [],
    submissions: [],
    reviews: [],
    extendedRequests: [],
    privacyAudits: [],
    notifications: [],
    directSpots: [createDefaultBoston177Spot()],
    directBookings: [],
  };
}

function loadStore(): ParkShareStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const empty = createEmptyStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(empty, null, 2), 'utf8');
      return empty;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ParkShareStore>;
    const merged: ParkShareStore = { ...createEmptyStore(), ...parsed };
    if (!Array.isArray(merged.directSpots) || merged.directSpots.length === 0) {
      merged.directSpots = [createDefaultBoston177Spot()];
    } else {
      const b177 = merged.directSpots.find((s) => s.slug === 'boston-177');
      if (!b177) {
        merged.directSpots.unshift(createDefaultBoston177Spot());
      } else if (b177.floorOrZone === 'P1') {
        b177.floorOrZone = 'P5';
        if (b177.ownerDisplayName === 'Maryam (Plek 177)') {
          b177.ownerDisplayName = 'Maryam (P5 · Plek 177)';
        }
      }
    }
    if (!Array.isArray(merged.directBookings)) {
      merged.directBookings = [];
    }
    return merged;
  } catch {
    return createEmptyStore();
  }
}

let store: ParkShareStore = loadStore();
const sessions = new Map<string, SessionInfo>();

function saveStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // Ignore disk write failure in read-only environments
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function normalizePhone(val: string): string {
  return val.replace(/[\s\-()]/g, '').toLowerCase();
}

function nowCet(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' CET';
}

function createSession(account: StoredAccount): SessionInfo {
  const token = crypto.randomBytes(32).toString('hex');
  const session: SessionInfo = {
    token,
    accountId: account.id,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    userId: account.userId,
    communityId: account.communityId,
  };
  sessions.set(token, session);
  return session;
}

interface AuthedRequest extends Request {
  session?: SessionInfo;
  rawBody?: Buffer;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const session = sessions.get(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }
  req.session = session;
  next();
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function isEnvAdminConfigured(): boolean {
  const envPass = process.env.SUPER_ADMIN_PASSWORD?.trim();
  return Boolean(envPass && envPass.length > 0);
}

function verifyEnvAdminCredentials(username: string, password: string): boolean {
  const envPass = process.env.SUPER_ADMIN_PASSWORD?.trim();
  if (!envPass) return false;
  const envUser = (process.env.SUPER_ADMIN_USERNAME?.trim() || 'admin').toLowerCase();
  const userMatch = constantTimeStringEqual(username.trim().toLowerCase(), envUser);
  const passMatch = constantTimeStringEqual(password, envPass);
  return userMatch && passMatch;
}

function revokeSessionsForAccount(accountId: string): void {
  for (const [token, sess] of sessions.entries()) {
    if (sess.accountId === accountId) {
      sessions.delete(token);
    }
  }
}

function requireManager(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.session || req.session.role !== 'manager') {
    res.status(403).json({ error: 'Building manager privileges required' });
    return;
  }
  next();
}

function requireSuperAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.session || req.session.role !== 'super_admin') {
    res.status(403).json({ error: 'Platform owner privileges required' });
    return;
  }
  next();
}

function resolveScopedCommunities(inviteToken: string): Community[] {
  if (inviteToken.startsWith('org-')) {
    const slug = inviteToken.replace('org-', '');
    return store.communities.filter(
      (c) => c.organization.toLowerCase().replace(/[^a-z0-9]+/g, '-') === slug
    );
  }
  const inv = store.inviteLinks.find((l) => l.token === inviteToken && l.active);
  if (inv) {
    const comm = store.communities.find((c) => c.id === inv.communityId);
    return comm ? [comm] : [];
  }
  const direct = store.communities.find((c) => inviteToken === `join-${c.id}`);
  return direct ? [direct] : [];
}

function matchWhitelistEntry(
  scopedIds: Set<string>,
  identifier: string,
  unitOrBay: string
): BuildingRosterEntry | undefined {
  const idNorm = identifier.trim().toLowerCase();
  const phoneNorm = normalizePhone(identifier);
  const unitOrBayNorm = unitOrBay.trim().toUpperCase();
  if (!idNorm || !unitOrBayNorm) return undefined;

  return store.rosterEntries.find((entry) => {
    if (!scopedIds.has(entry.communityId)) return false;
    const contactMatch =
      (entry.email && entry.email.toLowerCase() === idNorm) ||
      (entry.phone && normalizePhone(entry.phone) === phoneNorm && phoneNorm.length >= 7);
    const unitOrBayMatch =
      entry.unitNumber.toUpperCase() === unitOrBayNorm ||
      entry.bayCode.toUpperCase() === unitOrBayNorm;
    return contactMatch && unitOrBayMatch;
  });
}

function getManagerCommunityIds(accountId: string): Set<string> {
  const firstManagerId = store.accounts.find((a) => a.role === 'manager')?.id;
  return new Set(
    store.communities
      .filter((c) => c.managerAccountId === accountId || (!c.managerAccountId && accountId === firstManagerId))
      .map((c) => c.id)
  );
}

function buildAdminOverview(): AdminOverviewPayload {
  const managerAccounts = store.accounts.filter((a) => a.role === 'manager');
  const residentAccounts = store.accounts.filter((a) => a.role === 'resident');
  const managerById = new Map(managerAccounts.map((m) => [m.id, m]));
  const firstManager = managerAccounts[0];
  const commById = new Map(store.communities.map((c) => [c.id, c]));
  const resById = new Map(store.resources.map((r) => [r.id, r]));
  const userById = new Map(store.users.map((u) => [u.id, u]));

  const managers = managerAccounts.map((acc) => {
    const ownedIds = getManagerCommunityIds(acc.id);
    const ownedComms = store.communities.filter((c) => ownedIds.has(c.id));
    const ownedResources = store.resources.filter((r) => ownedIds.has(r.communityId));
    const ownedRoster = store.rosterEntries.filter((e) => ownedIds.has(e.communityId));
    const ownedResidentAccounts = residentAccounts.filter((r) => r.communityId && ownedIds.has(r.communityId));
    const ownedReservations = store.reservations.filter((r) => ownedIds.has(r.communityId));
    const ownedPendingExt = store.extendedRequests.filter(
      (ex) => ownedIds.has(ex.communityId) && ex.status === 'Pending'
    );

    return {
      id: acc.id,
      username: acc.username,
      displayName: acc.displayName,
      createdAt: acc.createdAt,
      lastLoginAt: acc.lastLoginAt,
      suspended: Boolean(acc.suspended),
      buildingsCount: ownedComms.length,
      baysCount: ownedResources.length,
      activeBaysCount: ownedResources.filter((r) => r.active && r.sharingEnabled).length,
      rosterCount: ownedRoster.filter((e) => e.status !== 'revoked').length,
      residentAccountsCount: ownedResidentAccounts.length,
      reservationsCount: ownedReservations.length,
      pendingRequestsCount: ownedPendingExt.length,
      buildings: ownedComms.map((c) => {
        const cBays = ownedResources.filter((r) => r.communityId === c.id);
        return {
          id: c.id,
          name: c.name,
          nameFa: c.nameFa,
          city: c.city,
          cityFa: c.cityFa,
          baysCount: cBays.length,
          activeBaysCount: cBays.filter((r) => r.active && r.sharingEnabled).length,
          rosterCount: ownedRoster.filter((e) => e.communityId === c.id && e.status !== 'revoked').length,
          federationEnabled: c.federationEnabled,
          deploymentModel: c.deploymentModel,
        };
      }),
    };
  });

  const residents = residentAccounts.map((acc) => {
    const comm = acc.communityId ? commById.get(acc.communityId) : undefined;
    const profile = acc.userId ? userById.get(acc.userId) : undefined;
    const resCount = acc.userId
      ? store.reservations.filter((r) => r.requesterId === acc.userId).length
      : 0;
    return {
      id: acc.id,
      username: acc.username,
      displayName: acc.displayName,
      userId: acc.userId,
      communityId: acc.communityId,
      communityName: comm?.name ?? '—',
      communityNameFa: comm?.nameFa ?? '—',
      unitNumber: profile?.unitNumber ?? '—',
      createdAt: acc.createdAt,
      lastLoginAt: acc.lastLoginAt,
      suspended: Boolean(acc.suspended),
      reservationsCount: resCount,
    };
  });

  const buildings = store.communities.map((c) => {
    const ownerMgr = (c.managerAccountId ? managerById.get(c.managerAccountId) : undefined) ?? firstManager;
    const cResources = store.resources.filter((r) => r.communityId === c.id);
    const cRoster = store.rosterEntries.filter((e) => e.communityId === c.id && e.status !== 'revoked');
    const cResAccounts = residentAccounts.filter((a) => a.communityId === c.id);
    const cReservations = store.reservations.filter((r) => r.communityId === c.id);
    const cPending = store.extendedRequests.filter((ex) => ex.communityId === c.id && ex.status === 'Pending');
    return {
      id: c.id,
      name: c.name,
      nameFa: c.nameFa,
      organization: c.organization,
      city: c.city,
      cityFa: c.cityFa,
      managerAccountId: ownerMgr?.id,
      managerName: ownerMgr?.displayName ?? '—',
      managerUsername: ownerMgr?.username ?? '—',
      floorsCount: c.floors.length,
      baysCount: cResources.length,
      activeBaysCount: cResources.filter((r) => r.active && r.sharingEnabled).length,
      rosterCount: cRoster.length,
      residentAccountsCount: cResAccounts.length,
      reservationsCount: cReservations.length,
      pendingRequestsCount: cPending.length,
      federationEnabled: c.federationEnabled,
      allowPaidSharing: c.allowPaidSharing,
      deploymentModel: c.deploymentModel,
      dataRetentionDays: c.dataRetentionDays,
      keyFingerprint: c.keyFingerprint,
    };
  });

  const resources = store.resources.map((r) => {
    const comm = commById.get(r.communityId);
    const ownerMgr = (comm?.managerAccountId ? managerById.get(comm.managerAccountId) : undefined) ?? firstManager;
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      titleFa: r.titleFa,
      communityId: r.communityId,
      communityName: comm?.name ?? '—',
      communityNameFa: comm?.nameFa ?? '—',
      managerName: ownerMgr?.displayName ?? '—',
      floorOrZone: r.floorOrZone,
      block: r.spaceMeta?.block,
      category: r.spaceMeta?.category,
      active: r.active,
      sharingEnabled: r.sharingEnabled,
      isFree: r.pricing.isFree,
      hourlyEur: r.pricing.hourlyEur,
      approvalMode: r.approvalMode,
      evCharging: Boolean(r.evCharging),
      lifecycleStatus: r.lifecycleStatus,
    };
  });

  const reservations = store.reservations.map((rv) => {
    const comm = commById.get(rv.communityId);
    const bay = resById.get(rv.resourceId);
    return {
      id: rv.id,
      resourceCode: bay?.code ?? rv.resourceId,
      communityId: rv.communityId,
      communityName: comm?.name ?? '—',
      communityNameFa: comm?.nameFa ?? '—',
      requesterName: rv.requesterName,
      startMin: rv.startMin,
      endMin: rv.endMin,
      status: rv.status,
      isFederated: rv.isFederated,
      createdAt: rv.createdAt,
    };
  });

  const extendedRequests = store.extendedRequests.map((ex) => {
    const comm = commById.get(ex.communityId);
    return {
      ...ex,
      communityName: comm?.name ?? '—',
      communityNameFa: comm?.nameFa ?? '—',
    };
  });

  const blockedAttempts = store.blockedAttempts.slice(0, 100).map((b) => {
    const comm = commById.get(b.communityId);
    return {
      ...b,
      communityName: comm?.name ?? '—',
      communityNameFa: comm?.nameFa ?? '—',
    };
  });

  const privacyAudits = store.privacyAudits.slice(0, 100).map((a) => {
    const comm = commById.get(a.communityId);
    return {
      ...a,
      communityName: comm?.name ?? 'System',
      communityNameFa: comm?.nameFa ?? 'سیستم',
    };
  });

  const activeManagers = managerAccounts.filter((m) => !m.suspended).length;
  const activeBays = store.resources.filter((r) => r.active && r.sharingEnabled).length;
  const activeReservations = store.reservations.filter(
    (r) => r.status === 'Confirmed' || r.status === 'Active' || r.status === 'Pending'
  ).length;
  const totalReviews = store.reviews.length;
  const averageRating =
    totalReviews > 0
      ? Number((store.reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
      : 0;

  return {
    stats: {
      totalManagers: managerAccounts.length,
      activeManagers,
      suspendedManagers: managerAccounts.length - activeManagers,
      totalBuildings: store.communities.length,
      federatedBuildings: store.communities.filter((c) => c.federationEnabled).length,
      totalBays: store.resources.length,
      activeBays,
      totalRosterEntries: store.rosterEntries.filter((e) => e.status !== 'revoked').length,
      totalResidentAccounts: residentAccounts.length,
      activeResidentAccounts: residentAccounts.filter((r) => !r.suspended).length,
      totalReservations: store.reservations.length,
      activeReservations,
      pendingExtendedRequests: store.extendedRequests.filter((e) => e.status === 'Pending').length,
      blockedAttemptsCount: store.blockedAttempts.length,
      totalReviews,
      averageRating,
    },
    managers,
    residents,
    buildings,
    resources,
    reservations,
    extendedRequests,
    blockedAttempts,
    privacyAudits,
  };
}

function buildScopedStateForSession(session: SessionInfo) {
  if (session.role === 'super_admin') {
    return {
      communities: store.communities,
      users: store.users,
      resources: store.resources,
      reservations: store.reservations,
      inviteLinks: store.inviteLinks,
      rosterEntries: store.rosterEntries,
      blockedAttempts: store.blockedAttempts,
      submissions: store.submissions,
      reviews: store.reviews,
      extendedRequests: store.extendedRequests,
      privacyAudits: store.privacyAudits,
      notifications: store.notifications,
    };
  }
  if (session.role === 'manager') {
    const ownedIds = getManagerCommunityIds(session.accountId);
    const ownedResources = store.resources.filter((r) => ownedIds.has(r.communityId));
    const ownedResourceCodes = new Set(ownedResources.map((r) => r.code));
    return {
      communities: store.communities.filter((c) => ownedIds.has(c.id)),
      users: store.users.filter((u) => u.communityId && ownedIds.has(u.communityId)),
      resources: ownedResources,
      reservations: store.reservations.filter((r) => ownedIds.has(r.communityId)),
      inviteLinks: store.inviteLinks.filter((i) => ownedIds.has(i.communityId)),
      rosterEntries: store.rosterEntries.filter((e) => ownedIds.has(e.communityId)),
      blockedAttempts: store.blockedAttempts.filter((b) => ownedIds.has(b.communityId)),
      submissions: store.submissions.filter((s) => ownedIds.has(s.communityId)),
      reviews: store.reviews.filter((rv) => ownedIds.has(rv.communityId)),
      extendedRequests: store.extendedRequests.filter((ex) => ownedIds.has(ex.communityId)),
      privacyAudits: store.privacyAudits.filter((a) => ownedIds.has(a.communityId)),
      notifications: store.notifications.filter(
        (n) => !n.resourceCode || ownedResourceCodes.has(n.resourceCode)
      ),
    };
  }

  // Resident view: strict Privacy-by-Design — redact ALL other residents' PII on the server
  // and scope strictly to the resident's own building + reciprocally connected buildings!
  const ownUser = store.users.filter((u) => u.id === session.userId);
  const homeComm = store.communities.find((c) => c.id === session.communityId);
  const visibleCommIds = new Set<string>(
    homeComm ? [homeComm.id, ...(homeComm.federationEnabled ? homeComm.connectedCommunityIds : [])] : []
  );
  const visibleCommunities = store.communities.filter((c) => visibleCommIds.has(c.id));
  const redactedResources: Resource[] = store.resources
    .filter((r) => visibleCommIds.has(r.communityId))
    .map((r) => ({
      ...r,
      ownerPrivate: {
        ownerId: r.ownerPrivate.ownerId,
        fullName: 'محرمانه',
        phone: 'محرمانه',
        email: 'محرمانه',
        unitNumber: 'محرمانه',
        emergencyContact: 'محرمانه',
      },
    }));
  const redactedReservations: Reservation[] = store.reservations
    .filter((r) => visibleCommIds.has(r.communityId) || r.requesterId === session.userId)
    .map((r) =>
      r.requesterId === session.userId
        ? r
        : {
            ...r,
            requesterName: 'ساکن احرازشده',
            notes: undefined,
          }
    );
  const ownExtended = store.extendedRequests.filter((r) => r.requesterId === session.userId);

  return {
    communities: visibleCommunities,
    users: ownUser,
    resources: redactedResources,
    reservations: redactedReservations,
    inviteLinks: [],
    rosterEntries: [],
    blockedAttempts: [],
    submissions: [],
    reviews: store.reviews.filter((rv) => visibleCommIds.has(rv.communityId)),
    extendedRequests: ownExtended,
    privacyAudits: store.privacyAudits.filter(
      (a) => visibleCommIds.has(a.communityId) && a.category !== 'whitelist_blocked'
    ),
    notifications: store.notifications.filter((n) => n.recipient !== 'manager'),
  };
}

function verifyMetaWebhookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret || !rawBody || !signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return constantTimeStringEqual(signatureHeader.trim(), expected);
}

async function sendMetaWhatsAppReply(
  toPhone: string,
  replyText: string,
  buttons: WhatsAppQuickReplyButton[]
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId || !/^\d+$/.test(phoneNumberId)) {
    return;
  }

  const endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  const payload =
    buttons.length > 0
      ? {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: replyText.slice(0, 1024) },
            action: {
              buttons: buttons.slice(0, 3).map((b) => ({
                type: 'reply',
                reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
              })),
            },
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'text',
          text: { preview_url: false, body: replyText.slice(0, 4096) },
        };

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Outbound network errors are non-fatal for webhook acknowledgement
  }
}

async function startServer() {
  const app = express();
  app.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as AuthedRequest).rawBody = buf;
      },
    })
  );

  // 1. Public Auth Status (Zero PII)
  app.get('/api/auth/status', (_req, res) => {
    const hasManager = store.accounts.some((a) => a.role === 'manager');
    const hasResidents = store.accounts.some((a) => a.role === 'resident');
    const hasBuildings = store.communities.length > 0;
    const envAdminConfigured = isEnvAdminConfigured();
    const hasSuperAdmin = envAdminConfigured || store.accounts.some((a) => a.role === 'super_admin');
    res.json({ hasManager, hasResidents, hasBuildings, hasSuperAdmin, envAdminConfigured });
  });

  // 1b. One-Time First-Run Platform Owner (Super Admin) Bootstrap
  app.post('/api/auth/setup-admin', (req, res) => {
    if (isEnvAdminConfigured()) {
      res.status(403).json({
        errorFa: 'حساب مدیریت کل از طریق تنظیمات سرور پیکربندی شده است؛ لطفاً مستقیماً وارد شوید.',
        errorEn: 'Platform admin credentials are managed via server environment variables. Please sign in directly.',
      });
      return;
    }
    if (store.accounts.some((a) => a.role === 'super_admin')) {
      res.status(409).json({
        errorFa: 'حساب مدیریت کل قبلاً ثبت شده است. لطفاً با نام کاربری و رمز عبور وارد شوید.',
        errorEn: 'Platform admin account is already claimed. Please sign in.',
      });
      return;
    }

    const { username, password, displayName } = req.body ?? {};
    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(password ?? '');
    const cleanName = String(displayName ?? '').trim() || 'مالک سامانه ParkShare';

    if (cleanUser.length < 3 || cleanPass.length < 8) {
      res.status(400).json({
        errorFa: 'نام کاربری حداقل ۳ کاراکتر و رمز عبور مدیریت کل حداقل ۸ کاراکتر باشد.',
        errorEn: 'Username must be at least 3 chars and admin password at least 8 chars.',
      });
      return;
    }

    if (store.accounts.some((a) => a.username === cleanUser)) {
      res.status(409).json({
        errorFa: 'این نام کاربری قبلاً استفاده شده است.',
        errorEn: 'Username already taken.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const account: StoredAccount = {
      id: `acc-super-${Date.now()}`,
      username: cleanUser,
      passwordHash: hashPassword(cleanPass),
      role: 'super_admin',
      displayName: cleanName,
      lastLoginAt: nowIso,
      createdAt: nowIso,
    };
    store.accounts.push(account);
    saveStore();

    const session = createSession(account);
    res.status(201).json({
      token: session.token,
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
      },
    });
  });

  // 2. Building Manager Account Registration (isolated tenant per manager)
  const handleRegisterManager = (req: Request, res: Response) => {
    const { username, password, displayName } = req.body ?? {};
    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(password ?? '');
    const cleanName = String(displayName ?? '').trim() || cleanUser;

    if (cleanUser.length < 3 || cleanPass.length < 6) {
      res.status(400).json({
        errorFa: 'نام کاربری حداقل ۳ کاراکتر و رمز عبور حداقل ۶ کاراکتر باشد.',
        errorEn: 'Username must be at least 3 characters and password at least 6 characters.',
      });
      return;
    }

    if (store.accounts.some((a) => a.username === cleanUser)) {
      res.status(409).json({
        errorFa: 'این نام کاربری قبلاً ثبت شده است. لطفاً نام کاربری دیگری انتخاب کنید.',
        errorEn: 'Username already exists. Please choose another username.',
      });
      return;
    }

    const account: StoredAccount = {
      id: `acc-mgr-${Date.now()}`,
      username: cleanUser,
      passwordHash: hashPassword(cleanPass),
      role: 'manager',
      displayName: cleanName,
      createdAt: new Date().toISOString(),
    };
    store.accounts.push(account);
    saveStore();

    const session = createSession(account);
    res.status(201).json({
      token: session.token,
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
      },
    });
  };

  app.post('/api/auth/setup-manager', handleRegisterManager);
  app.post('/api/auth/register-manager', handleRegisterManager);

  // 3. Username & Password Login (Super Admin, Manager & Resident)
  app.post('/api/auth/login', (req, res) => {
    const { username, password, role } = req.body ?? {};
    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(password ?? '');

    if (!cleanUser || !cleanPass) {
      res.status(400).json({
        errorFa: 'نام کاربری و رمز عبور الزامی است.',
        errorEn: 'Username and password are required.',
      });
      return;
    }

    // Configured SUPER_ADMIN_PASSWORD in process.env always takes precedence for admin login
    if ((role === 'super_admin' || role === 'manager') && isEnvAdminConfigured()) {
      if (verifyEnvAdminCredentials(cleanUser, cleanPass)) {
        const envAccount: StoredAccount = {
          id: 'acc-super-env',
          username: (process.env.SUPER_ADMIN_USERNAME?.trim() || 'admin').toLowerCase(),
          passwordHash: '',
          role: 'super_admin',
          displayName: 'ادمین سامانه ParkShare',
          createdAt: new Date().toISOString(),
        };
        const session = createSession(envAccount);
        res.json({
          token: session.token,
          account: {
            id: envAccount.id,
            username: envAccount.username,
            displayName: envAccount.displayName,
            role: envAccount.role,
          },
        });
        return;
      }
      if (role === 'super_admin') {
        res.status(401).json({
          errorFa: 'نام کاربری یا رمز عبور ادمین اشتباه است.',
          errorEn: 'Invalid admin credentials.',
        });
        return;
      }
    }

    const account = store.accounts.find((a) => {
      if (a.username !== cleanUser) return false;
      if (!role) return true;
      if (role === 'manager') {
        // Allow admin to sign in seamlessly via the regular Manager login tab
        return a.role === 'manager' || (a.role === 'super_admin' && !isEnvAdminConfigured());
      }
      return a.role === role;
    });
    if (!account || !verifyPassword(cleanPass, account.passwordHash)) {
      res.status(401).json({
        errorFa: 'نام کاربری یا رمز عبور اشتباه است.',
        errorEn: 'Invalid username or password.',
      });
      return;
    }

    if (account.suspended) {
      res.status(403).json({
        errorFa: 'این حساب کاربری توسط مدیریت کل سامانه معلق شده است.',
        errorEn: 'This account has been suspended by the platform administrator.',
      });
      return;
    }

    account.lastLoginAt = new Date().toISOString();
    saveStore();

    const session = createSession(account);
    res.json({
      token: session.token,
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        userId: account.userId,
        communityId: account.communityId,
      },
    });
  });

  // 4. Logout & Current Session
  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    if (req.session) {
      sessions.delete(req.session.token);
    }
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const s = req.session!;
    res.json({
      account: {
        id: s.accountId,
        username: s.username,
        displayName: s.displayName,
        role: s.role,
        userId: s.userId,
        communityId: s.communityId,
      },
    });
  });

  // 5. Public Invite Link Metadata (Zero PII)
  app.get('/api/invite/:token', (req, res) => {
    const token = String(req.params.token || '');
    const scoped = resolveScopedCommunities(token);
    if (scoped.length === 0) {
      res.status(404).json({
        errorFa: 'لینک دعوت معتبر نیست یا توسط مدیر ساختمان متوقف شده است.',
        errorEn: 'Invite link is invalid or paused by the building manager.',
      });
      return;
    }
    res.json({
      inviteToken: token,
      communities: scoped.map((c) => ({
        id: c.id,
        name: c.name,
        nameFa: c.nameFa,
        organization: c.organization,
        city: c.city,
        cityFa: c.cityFa,
        floors: c.floors,
        allowedUsagePolicies: c.allowedUsagePolicies,
        allowPaidSharing: c.allowPaidSharing,
        dataResidencyRegion: c.dataResidencyRegion,
      })),
    });
  });

  // 6. Server-Side Whitelist Verification (for Neighbor Invite Link OR Direct Resident Signup)
  app.post('/api/invite/verify', (req, res) => {
    const { inviteToken, identifier, unitOrBay } = req.body ?? {};
    const scoped = inviteToken
      ? resolveScopedCommunities(String(inviteToken))
      : store.communities;

    if (scoped.length === 0) {
      res.status(404).json({
        errorFa: 'هنوز ساختمانی ثبت نشده یا لینک نامعتبر است.',
        errorEn: 'No building configured or invalid link.',
      });
      return;
    }

    const scopedIds = new Set(scoped.map((c) => c.id));
    const match = matchWhitelistEntry(scopedIds, String(identifier ?? ''), String(unitOrBay ?? ''));

    if (!match) {
      const targetCommId = scoped[0].id;
      const ts = nowCet();
      store.blockedAttempts.unshift({
        id: `blk-${Date.now()}`,
        communityId: targetCommId,
        identifierTried: String(identifier ?? '').trim().slice(0, 60),
        unitOrBayTried: String(unitOrBay ?? '').trim().slice(0, 30),
        reason: 'مشخصات در لیست مجاز مدیر ساختمان یافت نشد',
        timestamp: ts,
      });
      store.privacyAudits.unshift({
        id: `aud-blk-${Date.now()}`,
        communityId: targetCommId,
        timestamp: ts,
        category: 'whitelist_blocked',
        summaryFa: `ورود غیرمجاز خارج از لیست مدیر مسدود شد (${String(unitOrBay ?? '').trim().slice(0, 20)}).`,
        summaryEn: `Blocked unauthorized signup outside manager whitelist.`,
        proofTag: 'WHITELIST-BLOCKED',
      });
      saveStore();
      res.status(403).json({
        errorFa: 'مشخصات شما در لیست رسمی مدیر ساختمان ثبت نشده است. فقط ساکنان لیست مجاز می‌توانند ثبت‌نام کنند.',
        errorEn: 'Your details are not on the building manager whitelist.',
      });
      return;
    }

    if (match.status === 'revoked') {
      res.status(403).json({
        errorFa: 'دسترسی شما توسط مدیر ساختمان غیرفعال شده است.',
        errorEn: 'Your access has been revoked by the building manager.',
      });
      return;
    }

    const comm = store.communities.find((c) => c.id === match.communityId)!;
    res.json({
      verified: true,
      entry: {
        id: match.id,
        communityId: match.communityId,
        ownerName: match.ownerName,
        unitNumber: match.unitNumber,
        bayCode: match.bayCode,
        floorOrZone: match.floorOrZone,
        evCharging: match.evCharging,
      },
      community: {
        id: comm.id,
        name: comm.name,
        nameFa: comm.nameFa,
        organization: comm.organization,
        allowedUsagePolicies: comm.allowedUsagePolicies,
        allowPaidSharing: comm.allowPaidSharing,
        dataResidencyRegion: comm.dataResidencyRegion,
      },
    });
  });

  // 7. Resident Registration (Whitelist-Verified + Sets Username & Password + Optional Bay Sharing)
  app.post('/api/auth/register-resident', (req, res) => {
    const {
      inviteToken,
      identifier,
      unitOrBay,
      username,
      password,
      shareMyBay,
      startMin,
      endMin,
      isFree,
      hourlyEur,
      autoApproval,
      accessPolicy,
      evCharging,
      graceNoticeMinutes,
    } = req.body ?? {};

    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(password ?? '');
    if (cleanUser.length < 3 || cleanPass.length < 6) {
      res.status(400).json({
        errorFa: 'نام کاربری حداقل ۳ کاراکتر و رمز عبور حداقل ۶ کاراکتر باشد.',
        errorEn: 'Username must be at least 3 chars and password at least 6 chars.',
      });
      return;
    }

    if (store.accounts.some((a) => a.username === cleanUser)) {
      res.status(409).json({
        errorFa: 'این نام کاربری قبلاً انتخاب شده است. نام دیگری وارد کنید.',
        errorEn: 'Username already taken.',
      });
      return;
    }

    const scoped = inviteToken
      ? resolveScopedCommunities(String(inviteToken))
      : store.communities;
    const scopedIds = new Set(scoped.map((c) => c.id));
    const match = matchWhitelistEntry(scopedIds, String(identifier ?? ''), String(unitOrBay ?? ''));

    if (!match || match.status === 'revoked') {
      res.status(403).json({
        errorFa: 'احراز هویت در لیست مجاز مدیر ساختمان ناموفق بود.',
        errorEn: 'Whitelist verification failed.',
      });
      return;
    }

    const comm = store.communities.find((c) => c.id === match.communityId)!;
    const userId = `u-res-${Date.now()}`;
    const newUser: UserProfile = {
      id: userId,
      name: `${match.ownerName} (${comm.name} · ${match.unitNumber})`,
      nameFa: `${match.ownerName} (${comm.nameFa} · واحد ${match.unitNumber})`,
      role: 'resident',
      communityId: comm.id,
      unitNumber: match.unitNumber,
      phone: match.phone,
      email: match.email,
      suspended: false,
      allowedFloors: comm.floors.length ? comm.floors : ['B1'],
      tempUsageThisMonth: { daysUsed: 0, consecutiveDays: 0 },
      vehicle: {
        type: 'car',
        lengthM: 4.5,
        widthM: 1.85,
        heightM: 1.6,
        needsEv: Boolean(evCharging ?? match.evCharging),
        needsAccessible: false,
      },
    };
    store.users.unshift(newUser);

    const account: StoredAccount = {
      id: `acc-res-${Date.now()}`,
      username: cleanUser,
      passwordHash: hashPassword(cleanPass),
      role: 'resident',
      displayName: match.ownerName,
      userId,
      communityId: comm.id,
      createdAt: new Date().toISOString(),
    };
    store.accounts.push(account);

    // Mark roster verified
    store.rosterEntries = store.rosterEntries.map((e) =>
      e.id === match.id ? { ...e, status: 'verified' } : e
    );

    // Activate or update parking bay if neighbor opted in to share
    if (shareMyBay !== false && match.bayCode) {
      const sMin = Number(startMin ?? 480);
      const eMin = Number(endMin ?? 1140) > sMin ? Number(endMin ?? 1140) : Math.min(1440, sMin + 120);
      const allowedPolicies = comm.allowedUsagePolicies.length
        ? comm.allowedUsagePolicies
        : (['residents_only'] as AccessPolicyLevel[]);
      const safePolicy: AccessPolicyLevel = allowedPolicies.includes(accessPolicy)
        ? accessPolicy
        : allowedPolicies[0];
      const safeFree = comm.allowPaidSharing ? Boolean(isFree ?? true) : true;
      const safePrice = safeFree ? 0 : Math.max(0.5, Number(hourlyEur ?? 1.5));

      const existingRes = store.resources.find(
        (r) => r.communityId === comm.id && r.code.toUpperCase() === match.bayCode.toUpperCase()
      );
      if (existingRes) {
        store.resources = store.resources.map((r) =>
          r.id === existingRes.id
            ? {
                ...r,
                sharingEnabled: true,
                active: true,
                evCharging: Boolean(evCharging ?? match.evCharging),
                pricing: { isFree: safeFree, hourlyEur: safePrice },
                approvalMode: autoApproval === false ? 'manual' : 'automatic',
                accessPolicy: safePolicy,
                graceNoticeMinutes: Number(graceNoticeMinutes ?? 30),
                declaredAvailability: [{ startMin: sMin, endMin: eMin }],
              }
            : r
        );
      } else {
        store.resources.unshift({
          id: `res-opt-${Date.now()}`,
          networkAliasId: `anon-${crypto.randomBytes(4).toString('hex')}`,
          communityId: comm.id,
          code: match.bayCode,
          title: `${comm.name} · ${match.floorOrZone} Bay ${match.bayCode}`,
          titleFa: `پارکینگ ${match.bayCode} · ${match.floorOrZone}`,
          type: 'parking',
          sharingEnabled: true,
          active: true,
          floorOrZone: match.floorOrZone,
          nearElevatorOrDock: true,
          dimensions: { lengthM: 5.2, widthM: 2.5, heightOrDepthM: match.heightLimitM || 2.15 },
          allowedVehicleTypes: ['car', 'motorcycle', 'van'],
          evCharging: Boolean(evCharging ?? match.evCharging),
          accessible: false,
          pricing: { isFree: safeFree, hourlyEur: safePrice },
          approvalMode: autoApproval === false ? 'manual' : 'automatic',
          accessPolicy: safePolicy,
          bufferMinutes: 15,
          recallRiskScore: 0.1,
          hideRecallRiskFromPublic: false,
          graceNoticeMinutes: Number(graceNoticeMinutes ?? 30),
          declaredAvailability: [{ startMin: sMin, endMin: eMin }],
          maintenanceBlocks: [],
          ownerPrivate: {
            ownerId: userId,
            fullName: match.ownerName,
            phone: match.phone,
            email: match.email,
            unitNumber: match.unitNumber,
            emergencyContact: match.phone,
          },
        });
      }

      store.inviteLinks = store.inviteLinks.map((inv) =>
        inv.communityId === comm.id ? { ...inv, submissionsCount: inv.submissionsCount + 1 } : inv
      );
    }

    saveStore();
    const session = createSession(account);
    res.status(201).json({
      token: session.token,
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        role: account.role,
        userId: account.userId,
        communityId: account.communityId,
      },
    });
  });

  // 8. Authenticated State Fetch (Role-Scoped!)
  app.get('/api/state', requireAuth, (req: AuthedRequest, res) => {
    res.json(buildScopedStateForSession(req.session!));
  });

  // 9. Manager: Create Building (scoped strictly to creating manager)
  app.post('/api/manager/buildings', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const { community, initialInvite } = req.body as {
      community: Community;
      initialInvite: BuildingInviteLink;
    };
    if (!community?.id || !community?.name) {
      res.status(400).json({ error: 'Invalid building payload' });
      return;
    }

    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    const allowedConnectedIds = (community.connectedCommunityIds ?? []).filter((cid) => ownedIds.has(cid));
    const ownedCommunity: Community = {
      ...community,
      managerAccountId: req.session!.accountId,
      connectedCommunityIds: allowedConnectedIds,
      federationEnabled: allowedConnectedIds.length > 0,
    };

    // Link reciprocally ONLY with sister buildings owned by this same manager
    store.communities = store.communities.map((c) =>
      allowedConnectedIds.includes(c.id)
        ? {
            ...c,
            federationEnabled: true,
            connectedCommunityIds: Array.from(new Set([...c.connectedCommunityIds, ownedCommunity.id])),
          }
        : c
    );
    store.communities.push(ownedCommunity);
    if (initialInvite) {
      store.inviteLinks.unshift({ ...initialInvite, communityId: ownedCommunity.id });
    }
    store.privacyAudits.unshift({
      id: `aud-bld-${Date.now()}`,
      communityId: ownedCommunity.id,
      timestamp: nowCet(),
      category: 'pii_masked',
      summaryFa: `محیط امن و رمزگذاری‌شده ساختمان «${ownedCommunity.nameFa}» ایجاد شد.`,
      summaryEn: `Encrypted private tenant created for "${ownedCommunity.name}".`,
      proofTag: 'TENANT-ISOLATED',
    });
    saveStore();
    res.status(201).json(buildScopedStateForSession(req.session!));
  });

  // 10. Manager: Update Building Policies / Fair-Use / Retention / Federation
  app.patch('/api/manager/buildings/:id', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const id = req.params.id;
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    if (!ownedIds.has(id)) {
      res.status(403).json({ error: 'Forbidden: building belongs to another manager' });
      return;
    }
    const patch = (req.body ?? {}) as Partial<Community>;
    store.communities = store.communities.map((c) => {
      if (c.id !== id) return c;
      const nextPolicies = Array.isArray(patch.allowedUsagePolicies)
        ? patch.allowedUsagePolicies.includes('residents_only')
          ? patch.allowedUsagePolicies
          : (['residents_only', ...patch.allowedUsagePolicies] as AccessPolicyLevel[])
        : c.allowedUsagePolicies;
      const nextRetention =
        patch.dataRetentionDays === 0 || patch.dataRetentionDays === 30 || patch.dataRetentionDays === 90
          ? patch.dataRetentionDays
          : c.dataRetentionDays;
      return {
        ...c,
        ...(typeof patch.allowPaidSharing === 'boolean' ? { allowPaidSharing: patch.allowPaidSharing } : {}),
        ...(typeof patch.federationEnabled === 'boolean' ? { federationEnabled: patch.federationEnabled } : {}),
        ...(typeof patch.consentDemandAnalytics === 'boolean'
          ? { consentDemandAnalytics: patch.consentDemandAnalytics }
          : {}),
        ...(patch.fairUsePolicy ? { fairUsePolicy: patch.fairUsePolicy } : {}),
        dataRetentionDays: nextRetention,
        allowedUsagePolicies: nextPolicies,
        allowExternalGuests: nextPolicies.includes('residents_and_guests'),
      };
    });
    if (patch.dataRetentionDays !== undefined) {
      store.privacyAudits.unshift({
        id: `aud-ret-${Date.now()}`,
        communityId: id,
        timestamp: nowCet(),
        category: 'pii_masked',
        summaryFa:
          patch.dataRetentionDays === 0
            ? 'حذف خودکار فوری سوابق پس از پایان رزرو فعال شد.'
            : `دوره نگهداری سوابق روی ${patch.dataRetentionDays} روز تنظیم شد.`,
        summaryEn: `Retention policy updated to ${patch.dataRetentionDays} days.`,
        proofTag: `RETENTION-${patch.dataRetentionDays}D`,
      });
    }
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 10b. Manager: Connect & Save Building WhatsApp Group Settings
  app.patch('/api/manager/buildings/:id/whatsapp-group', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const id = req.params.id;
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    if (!ownedIds.has(id)) {
      res.status(403).json({
        errorFa: 'شما مجاز به ویرایش تنظیمات این ساختمان نیستید.',
        errorEn: 'Forbidden: building belongs to another manager.',
      });
      return;
    }

    const comm = store.communities.find((c) => c.id === id);
    if (!comm) {
      res.status(404).json({ errorFa: 'ساختمان یافت نشد.', errorEn: 'Building not found.' });
      return;
    }

    const body = (req.body ?? {}) as Partial<BuildingWhatsAppGroupConfig>;
    const rawGroupName = String(body.groupName ?? '').trim().slice(0, 80);
    const groupName = rawGroupName || comm.nameFa || comm.name;

    const rawInviteUrl = String(body.groupInviteUrl ?? '').trim();
    let safeInviteUrl: string | undefined;
    if (rawInviteUrl) {
      try {
        const parsed = new URL(rawInviteUrl);
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'chat.whatsapp.com' || parsed.pathname.length < 4) {
          res.status(400).json({
            errorFa: 'لینک دعوت گروه باید یک آدرس معتبر https://chat.whatsapp.com/... باشد.',
            errorEn: 'Group invite link must be a valid https://chat.whatsapp.com/... URL.',
          });
          return;
        }
        safeInviteUrl = parsed.toString();
      } catch {
        res.status(400).json({
          errorFa: 'فرمت لینک دعوت گروه واتساپ معتبر نیست.',
          errorEn: 'Invalid WhatsApp group invite URL format.',
        });
        return;
      }
    }

    const rawBotPhone = String(body.botPhoneNumber ?? '').trim();
    let safeBotPhone: string | undefined;
    if (rawBotPhone) {
      const cleaned = rawBotPhone.replace(/[\s\-()]/g, '');
      const digitsOnly = cleaned.replace(/^\+/, '');
      if (!/^\d{7,15}$/.test(digitsOnly)) {
        res.status(400).json({
          errorFa: 'شماره واتساپ باید بین ۷ تا ۱۵ رقم همراه با کد کشور باشد (مثلاً +31612345678).',
          errorEn: 'WhatsApp number must be 7–15 digits including country code (e.g. +31612345678).',
        });
        return;
      }
      safeBotPhone = cleaned.startsWith('+') ? cleaned : `+${digitsOnly}`;
    }

    const nextConfig: BuildingWhatsAppGroupConfig = {
      enabled: body.enabled !== false,
      groupName,
      groupInviteUrl: safeInviteUrl,
      botPhoneNumber: safeBotPhone,
      defaultLanguage:
        body.defaultLanguage === 'en' ? 'en' : body.defaultLanguage === 'nl' ? 'nl' : 'fa',
      pinnedConfirmed: Boolean(body.pinnedConfirmed),
      connectedAt: comm.whatsappGroup?.connectedAt || new Date().toISOString(),
    };

    store.communities = store.communities.map((c) =>
      c.id === id ? { ...c, whatsappGroup: nextConfig } : c
    );

    store.privacyAudits.unshift({
      id: `aud-wa-grp-${Date.now()}`,
      communityId: id,
      timestamp: nowCet(),
      category: 'federation_verified',
      summaryFa: nextConfig.pinnedConfirmed
        ? `اتصال گروه واتساپ «${groupName}» به بات خصوصی ۱ به ۱ تأیید و فعال شد.`
        : `تنظیمات اتصال گروه واتساپ «${groupName}» در پنل مدیر ذخیره شد.`,
      summaryEn: nextConfig.pinnedConfirmed
        ? `WhatsApp group "${groupName}" confirmed and linked to private 1-on-1 bot.`
        : `WhatsApp group "${groupName}" settings saved by manager.`,
      proofTag: 'WHATSAPP-GROUP-LINKED',
    });

    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 11. Manager: Rotate Encryption Key (CMK)
  app.post('/api/manager/buildings/:id/rotate-key', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const id = req.params.id;
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    if (!ownedIds.has(id)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const suffix = crypto.randomBytes(4).toString('hex');
    store.communities = store.communities.map((c) =>
      c.id === id
        ? {
            ...c,
            keyFingerprint: `${c.deploymentModel === 'self_hosted' ? 'local-key' : 'cmk-key'}-${suffix}`,
          }
        : c
    );
    store.privacyAudits.unshift({
      id: `aud-key-${Date.now()}`,
      communityId: id,
      timestamp: nowCet(),
      category: 'key_rotated',
      summaryFa: `کلید رمزگذاری ساختمان با موفقیت تعویض شد (${suffix}).`,
      summaryEn: `Building encryption key rotated (${suffix}).`,
      proofTag: 'KEY-ROTATED',
    });
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 12. Manager: Import Whitelist Entries (+ pre-register bays)
  app.post('/api/manager/buildings/:id/roster', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const communityId = req.params.id;
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    if (!ownedIds.has(communityId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const comm = store.communities.find((c) => c.id === communityId);
    if (!comm) {
      res.status(404).json({ error: 'Building not found' });
      return;
    }

    const { entries, activateImmediately } = req.body as {
      entries: BuildingRosterEntry[];
      activateImmediately?: boolean;
    };
    const validEntries = Array.isArray(entries) ? entries : [];

    const existingKeys = new Set(
      store.rosterEntries.map((e) => `${e.communityId}:${e.bayCode.toUpperCase()}`)
    );
    const uniqueNew = validEntries.filter(
      (e) => e.bayCode && !existingKeys.has(`${communityId}:${e.bayCode.toUpperCase()}`)
    );
    store.rosterEntries = [...uniqueNew, ...store.rosterEntries];

    const existingResCodes = new Set(
      store.resources.filter((r) => r.communityId === communityId).map((r) => r.code.toUpperCase())
    );
    const newResources: Resource[] = uniqueNew
      .filter((e) => !existingResCodes.has(e.bayCode.toUpperCase()))
      .map((e) => ({
        id: `res-ros-${e.id}`,
        networkAliasId: `anon-${crypto.randomBytes(4).toString('hex')}`,
        communityId,
        code: e.bayCode.toUpperCase(),
        title: `${comm.name} · ${e.floorOrZone} Bay ${e.bayCode.toUpperCase()}`,
        titleFa: `پارکینگ ${e.bayCode.toUpperCase()} · ${e.floorOrZone}`,
        type: 'parking',
        sharingEnabled: Boolean(activateImmediately),
        active: Boolean(activateImmediately),
        floorOrZone: e.floorOrZone,
        nearElevatorOrDock: true,
        dimensions: { lengthM: 5.2, widthM: 2.5, heightOrDepthM: e.heightLimitM || 2.15 },
        allowedVehicleTypes: ['car', 'motorcycle', 'van'],
        evCharging: Boolean(e.evCharging),
        accessible: false,
        pricing: { isFree: true, hourlyEur: 0 },
        approvalMode: 'automatic',
        accessPolicy: comm.allowedUsagePolicies[0] ?? 'residents_only',
        bufferMinutes: 15,
        recallRiskScore: 0.1,
        hideRecallRiskFromPublic: false,
        graceNoticeMinutes: 30,
        declaredAvailability: [{ startMin: 480, endMin: 1320 }],
        maintenanceBlocks: [],
        ownerPrivate: {
          ownerId: `own-${e.id}`,
          fullName: e.ownerName,
          phone: e.phone,
          email: e.email,
          unitNumber: e.unitNumber,
          emergencyContact: e.phone,
        },
      }));
    store.resources = [...newResources, ...store.resources];
    saveStore();
    res.json({ addedCount: uniqueNew.length, state: buildScopedStateForSession(req.session!) });
  });

  // 13. Manager: Revoke / Restore Roster Entry
  app.patch('/api/manager/roster/:id/toggle', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    const entry = store.rosterEntries.find((e) => e.id === req.params.id);
    if (!entry || !ownedIds.has(entry.communityId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    store.rosterEntries = store.rosterEntries.map((e) =>
      e.id === req.params.id
        ? { ...e, status: e.status === 'revoked' ? 'invited' : 'revoked' }
        : e
    );
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 14. Manager: Toggle Invite Active
  app.patch('/api/manager/invites/:id/toggle', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    const inv = store.inviteLinks.find((i) => i.id === req.params.id);
    if (!inv || !ownedIds.has(inv.communityId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    store.inviteLinks = store.inviteLinks.map((item) =>
      item.id === req.params.id ? { ...item, active: !item.active } : item
    );
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 14b. Manager: Load Boston Residence 40-Bay Test Dataset (opt-in, tenant-scoped)
  app.post('/api/manager/seed-boston-sample', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    const existing = store.communities.find(
      (c) => ownedIds.has(c.id) && c.name === 'Boston Residence'
    );
    if (existing) {
      res.json({
        communityId: existing.id,
        alreadyLoaded: true,
        state: buildScopedStateForSession(req.session!),
      });
      return;
    }

    const bundle = buildBostonResidenceSampleBundle(req.session!.accountId);
    store.communities.push(bundle.community);
    store.inviteLinks.unshift(bundle.inviteLink);
    store.resources = [...bundle.resources, ...store.resources];
    store.rosterEntries = [...bundle.rosterEntries, ...store.rosterEntries];
    store.users.unshift(bundle.previewResident);
    store.privacyAudits.unshift({
      id: `aud-boston-${Date.now()}`,
      communityId: bundle.community.id,
      timestamp: nowCet(),
      category: 'pii_masked',
      summaryFa: 'دیتاست نمونه Boston Residence (۴۰ پارکینگ متنوع و ۶ بلوک) برای تست بارگذاری شد.',
      summaryEn: 'Boston Residence 40-bay test dataset (6 blocks, B1–B4) loaded for testing.',
      proofTag: 'TEST-DATASET-40',
    });
    saveStore();
    res.status(201).json({
      communityId: bundle.community.id,
      alreadyLoaded: false,
      state: buildScopedStateForSession(req.session!),
    });
  });

  // 14c. Manager: Toggle Parking Space Activation / Sharing Status
  app.patch('/api/manager/resources/:id/toggle', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    const target = store.resources.find((r) => r.id === req.params.id);
    if (!target || !ownedIds.has(target.communityId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const nextActive = !(target.active && target.sharingEnabled);
    store.resources = store.resources.map((r) =>
      r.id === target.id
        ? {
            ...r,
            active: nextActive,
            sharingEnabled: nextActive,
            lifecycleStatus: nextActive ? 'active' : 'inactive',
            ownership: r.ownership
              ? { ...r.ownership, ownerActivated: nextActive, ownerVerified: nextActive || r.ownership.ownerVerified }
              : undefined,
          }
        : r
    );
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 15. Authenticated: Create Atomic Booking
  app.post('/api/bookings', requireAuth, (req: AuthedRequest, res) => {
    const { option, requesterId, anonymousBooking, networkOffline, pseudonymousLabel } = req.body ?? {};
    const targetUserId = req.session!.role === 'resident' ? req.session!.userId : requesterId;
    const requester = store.users.find((u) => u.id === targetUserId);
    if (!requester || !option || !Array.isArray(option.segments) || option.segments.length === 0) {
      res.status(400).json({ ok: false, messageFa: 'پروفایل کاربر یا گزینه رزرو یافت نشد.', messageEn: 'Invalid booking request.' });
      return;
    }

    const ownedIds = req.session!.role === 'manager' ? getManagerCommunityIds(req.session!.accountId) : null;
    if (ownedIds && (!requester.communityId || !ownedIds.has(requester.communityId))) {
      res.status(403).json({ ok: false, messageFa: 'دسترسی غیرمجاز به این ساختمان.', messageEn: 'Forbidden.' });
      return;
    }

    // Never trust client-supplied resource/community objects: always hydrate authoritative records from store
    const hydratedSegments = [];
    for (const seg of option.segments) {
      const resourceId = typeof seg?.resource?.id === 'string' ? seg.resource.id : '';
      const startMin = Number(seg?.startMin);
      const endMin = Number(seg?.endMin);
      if (
        !resourceId ||
        !Number.isFinite(startMin) ||
        !Number.isFinite(endMin) ||
        startMin < 0 ||
        endMin > 1440 ||
        startMin >= endMin
      ) {
        res.status(400).json({ ok: false, messageFa: 'بازه زمانی یا شناسه پارکینگ نامعتبر است.', messageEn: 'Invalid segment resource or time range.' });
        return;
      }

      const authResource = store.resources.find((r) => r.id === resourceId);
      if (!authResource) {
        res.status(404).json({ ok: false, messageFa: 'پارکینگ انتخاب‌شده در سامانه یافت نشد.', messageEn: 'Requested parking resource not found.' });
        return;
      }

      const authCommunity = store.communities.find((c) => c.id === authResource.communityId);
      if (!authCommunity) {
        res.status(404).json({ ok: false, messageFa: 'ساختمان مرتبط با پارکینگ یافت نشد.', messageEn: 'Associated building not found.' });
        return;
      }

      if (ownedIds && !ownedIds.has(authCommunity.id)) {
        const requesterHome = store.communities.find((c) => c.id === requester.communityId);
        const isAllowedFederated =
          Boolean(requesterHome?.federationEnabled) &&
          Boolean(authCommunity.federationEnabled) &&
          Boolean(requesterHome?.connectedCommunityIds.includes(authCommunity.id));
        if (!isAllowedFederated) {
          res.status(403).json({ ok: false, messageFa: 'دسترسی غیرمجاز به پارکینگ ساختمان دیگر.', messageEn: 'Forbidden: resource belongs to another building.' });
          return;
        }
      }

      hydratedSegments.push({
        resource: authResource,
        community: authCommunity,
        startMin,
        endMin,
        isFederated: authCommunity.id !== requester.communityId,
        policyDecision: 'Allowed' as const,
      });
    }

    const sanitizedOption = {
      ...option,
      segments: hydratedSegments,
      requiresManualApproval: hydratedSegments.some((s) => s.resource.approvalMode === 'manual'),
    };

    const outcome = createAtomicBooking(
      sanitizedOption,
      requester,
      store.reservations,
      store.communities,
      Boolean(networkOffline)
    );
    if (!outcome.ok || !outcome.reservationsCreated) {
      res.status(409).json({
        ok: false,
        messageFa: outcome.errorMessageFa ?? 'خطا در ثبت رزرو',
        messageEn: outcome.errorMessageEn ?? 'Booking conflict',
      });
      return;
    }

    const created = outcome.reservationsCreated.map((r) => ({
      ...r,
      requesterName: anonymousBooking !== false ? String(pseudonymousLabel || 'ساکن احرازشده') : r.requesterName,
    }));
    store.reservations = [...created, ...store.reservations];
    store.users = store.users.map((u) =>
      u.id === requester.id
        ? {
            ...u,
            tempUsageThisMonth: {
              daysUsed: (u.tempUsageThisMonth?.daysUsed ?? 0) + 1,
              consecutiveDays: (u.tempUsageThisMonth?.consecutiveDays ?? 0) + 1,
            },
          }
        : u
    );
    if (outcome.notifications?.length) {
      store.notifications = [...outcome.notifications, ...store.notifications];
    }
    saveStore();
    res.status(201).json({ ok: true, state: buildScopedStateForSession(req.session!) });
  });

  // 16. Authenticated: Transition Reservation Status
  const VALID_RESERVATION_STATUSES = new Set<ReservationStatus>([
    'Draft',
    'Pending',
    'Confirmed',
    'Active',
    'Completed',
    'Cancelled',
    'Expired',
    'Disputed',
    'Relocation Pending',
  ]);

  app.patch('/api/bookings/:id/status', requireAuth, (req: AuthedRequest, res) => {
    const target = store.reservations.find((r) => r.id === req.params.id);
    if (!target) {
      res.status(404).json({ error: 'Reservation not found' });
      return;
    }

    const nextStatus = req.body?.status as ReservationStatus;
    if (!VALID_RESERVATION_STATUSES.has(nextStatus)) {
      res.status(400).json({
        errorFa: 'وضعیت رزرو نامعتبر است.',
        errorEn: 'Invalid reservation status.',
      });
      return;
    }

    if (req.session!.role === 'manager') {
      const ownedIds = getManagerCommunityIds(req.session!.accountId);
      if (!ownedIds.has(target.communityId)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
    } else if (req.session!.role === 'resident') {
      if (target.requesterId !== req.session!.userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      if (nextStatus !== 'Cancelled') {
        res.status(403).json({
          errorFa: 'ساکنین فقط مجاز به لغو رزرو خود هستند؛ تأیید رزرو صرفاً توسط مالک یا مدیر انجام می‌شود.',
          errorEn: 'Residents may only cancel their own reservations; confirmation requires owner or manager approval.',
        });
        return;
      }
    } else if (req.session!.role !== 'super_admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    store.reservations = store.reservations.map((r) =>
      r.id === target.id ? { ...r, status: nextStatus } : r
    );
    const resObj = store.resources.find((r) => r.id === target.resourceId);
    if (nextStatus === 'Confirmed' || nextStatus === 'Cancelled') {
      store.notifications.unshift(
        createNotificationEvent(
          nextStatus === 'Confirmed' ? 'booking_confirmed' : 'booking_cancelled',
          resObj?.code ?? target.resourceId,
          formatMinutes(target.startMin),
          formatMinutes(target.endMin),
          nowCet()
        )
      );
    }
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 17. Manager: Owner Recall & Auto-Relocation
  app.post('/api/bookings/:id/recall', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const target = store.reservations.find((r) => r.id === req.params.id);
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    if (!target || !ownedIds.has(target.communityId)) {
      res.status(403).json({ error: 'Forbidden or not found' });
      return;
    }
    const recall = triggerOwnerRecall(
      target,
      store.resources,
      store.communities,
      store.reservations,
      store.users,
      Boolean(req.body?.networkOffline)
    );
    store.reservations = store.reservations.map((r) =>
      r.id === target.id ? recall.updatedReservation : r
    );
    store.notifications = [...recall.notifications, ...store.notifications];
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 17b. Manager: Accept Auto-Relocation
  app.post('/api/bookings/:id/relocate', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const target = store.reservations.find((r) => r.id === req.params.id);
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    if (!target || !ownedIds.has(target.communityId) || !target.suggestedAlternativeResourceId) {
      res.status(403).json({ error: 'Relocation target not found or forbidden' });
      return;
    }
    const altRes = store.resources.find((r) => r.id === target.suggestedAlternativeResourceId);
    if (!altRes) {
      res.status(404).json({ error: 'Alternative bay not found' });
      return;
    }
    const ts = nowCet();
    const newRelocated: Reservation = {
      id: `rsv-reloc-${Date.now()}`,
      resourceId: altRes.id,
      communityId: altRes.communityId,
      requesterId: target.requesterId,
      requesterName: target.requesterName,
      startMin: target.startMin,
      endMin: target.endMin,
      status: 'Confirmed',
      isFederated: altRes.communityId !== target.originCommunityId,
      originCommunityId: target.originCommunityId,
      createdAt: `${new Date().toISOString().slice(0, 10)} ${ts}`,
      notes: `Auto-relocated from ${target.resourceId} due to owner recall`,
    };
    store.reservations = [
      newRelocated,
      ...store.reservations.map((r) =>
        r.id === target.id ? { ...r, status: 'Completed' as ReservationStatus } : r
      ),
    ];
    store.notifications.unshift(
      createNotificationEvent(
        'booking_confirmed',
        altRes.code,
        formatMinutes(target.startMin),
        formatMinutes(target.endMin),
        ts
      )
    );
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 18. Authenticated: Optional Review
  app.post('/api/reviews', requireAuth, (req: AuthedRequest, res) => {
    const body = (req.body ?? {}) as Partial<ParkingReview>;
    const clamped = Math.min(5, Math.max(1, Math.round(Number(body.rating ?? 5)))) as 1 | 2 | 3 | 4 | 5;
    if (!body.resourceId || !body.communityId) {
      res.status(400).json({ error: 'Missing resourceId or communityId' });
      return;
    }
    store.reviews.unshift({
      id: `rev-${Date.now()}`,
      reservationId: String(body.reservationId ?? ''),
      resourceId: String(body.resourceId),
      communityId: String(body.communityId),
      rating: clamped,
      tags: Array.isArray(body.tags) ? body.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 6) : [],
      comment: String(body.comment ?? '').trim().slice(0, 500),
      anonymous: body.anonymous !== false,
      authorAlias: String(body.authorAlias ?? 'ساکن احرازشده').slice(0, 80),
      createdAt: new Date().toISOString().slice(0, 10),
    });
    saveStore();
    res.status(201).json(buildScopedStateForSession(req.session!));
  });

  // 19. Authenticated: Extended Coordination Request
  app.post('/api/extended-requests', requireAuth, (req: AuthedRequest, res) => {
    const body = req.body as Omit<ExtendedParkingRequest, 'id' | 'status' | 'createdAt'>;
    const reqUserId = req.session!.role === 'resident' ? req.session!.userId! : body.requesterId;
    store.extendedRequests.unshift({
      ...body,
      requesterId: reqUserId,
      id: `ext-${Date.now()}`,
      status: 'Pending',
      createdAt: `${new Date().toISOString().slice(0, 10)} ${nowCet()}`,
    });
    saveStore();
    res.status(201).json(buildScopedStateForSession(req.session!));
  });

  // 20. Manager: Decide Extended Request
  app.patch('/api/extended-requests/:id', requireAuth, requireManager, (req: AuthedRequest, res) => {
    const ownedIds = getManagerCommunityIds(req.session!.accountId);
    const target = store.extendedRequests.find((r) => r.id === req.params.id);
    if (!target || !ownedIds.has(target.communityId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const nextStatus = req.body.status as ExtendedParkingRequest['status'];
    store.extendedRequests = store.extendedRequests.map((r) =>
      r.id === req.params.id ? { ...r, status: nextStatus } : r
    );
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // 21. Authenticated: GDPR Right to Erasure (Delete own reservation history)
  app.delete('/api/privacy/my-reservations', requireAuth, (req: AuthedRequest, res) => {
    const uid = req.session!.userId;
    if (uid) {
      store.reservations = store.reservations.filter((r) => r.requesterId !== uid);
      store.privacyAudits.unshift({
        id: `aud-er-${Date.now()}`,
        communityId: req.session!.communityId ?? 'system',
        timestamp: nowCet(),
        category: 'gdpr_erasure',
        summaryFa: 'سابقه رزروهای کاربر مطابق حق فراموش‌شدن (GDPR) حذف شد.',
        summaryEn: 'User reservation history erased under GDPR Art. 17.',
        proofTag: 'GDPR-ERASURE',
      });
      saveStore();
    }
    res.json(buildScopedStateForSession(req.session!));
  });

  // 22. Authenticated: Log Privacy Export
  app.post('/api/privacy/log-export', requireAuth, (req: AuthedRequest, res) => {
    const { communityId, actorLabel } = req.body ?? {};
    store.privacyAudits.unshift({
      id: `aud-ex-${Date.now()}`,
      communityId: String(communityId || 'system'),
      timestamp: nowCet(),
      category: 'gdpr_export',
      summaryFa: `خروجی داده‌ها (GDPR) توسط ${String(actorLabel || req.session!.displayName)} دریافت شد.`,
      summaryEn: `GDPR data export downloaded by ${String(actorLabel || req.session!.displayName)}.`,
      proofTag: 'GDPR-EXPORT',
    });
    saveStore();
    res.json(buildScopedStateForSession(req.session!));
  });

  // ============================================================
  // 23. PLATFORM OWNER (SUPER ADMIN) CONSOLE APIs
  // ============================================================

  app.get('/api/admin/overview', requireAuth, requireSuperAdmin, (_req: AuthedRequest, res) => {
    res.json(buildAdminOverview());
  });

  app.post('/api/admin/managers', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const { username, password, displayName } = req.body ?? {};
    const cleanUser = String(username ?? '').trim().toLowerCase();
    const cleanPass = String(password ?? '');
    const cleanName = String(displayName ?? '').trim() || cleanUser;

    if (cleanUser.length < 3 || cleanPass.length < 6) {
      res.status(400).json({
        errorFa: 'نام کاربری حداقل ۳ کاراکتر و رمز عبور حداقل ۶ کاراکتر باشد.',
        errorEn: 'Username must be at least 3 chars and password at least 6 chars.',
      });
      return;
    }

    if (store.accounts.some((a) => a.username === cleanUser)) {
      res.status(409).json({
        errorFa: 'این نام کاربری قبلاً در سامانه ثبت شده است.',
        errorEn: 'Username already exists.',
      });
      return;
    }

    const account: StoredAccount = {
      id: `acc-mgr-${Date.now()}`,
      username: cleanUser,
      passwordHash: hashPassword(cleanPass),
      role: 'manager',
      displayName: cleanName,
      suspended: false,
      createdAt: new Date().toISOString(),
    };
    store.accounts.push(account);
    store.privacyAudits.unshift({
      id: `aud-adm-mgr-${Date.now()}`,
      communityId: 'system',
      timestamp: nowCet(),
      category: 'pii_masked',
      summaryFa: `حساب مدیر ساختمان جدید (@${cleanUser}) توسط مدیریت کل ایجاد شد.`,
      summaryEn: `Building manager account (@${cleanUser}) provisioned by platform owner.`,
      proofTag: 'ADMIN-PROVISION',
    });
    saveStore();
    res.status(201).json(buildAdminOverview());
  });

  app.patch('/api/admin/managers/:id/toggle-suspend', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const target = store.accounts.find((a) => a.id === req.params.id && a.role === 'manager');
    if (!target) {
      res.status(404).json({ errorFa: 'حساب مدیر یافت نشد.', errorEn: 'Manager account not found.' });
      return;
    }
    target.suspended = !target.suspended;
    if (target.suspended) {
      revokeSessionsForAccount(target.id);
    }
    store.privacyAudits.unshift({
      id: `aud-adm-sus-${Date.now()}`,
      communityId: 'system',
      timestamp: nowCet(),
      category: 'pii_masked',
      summaryFa: target.suspended
        ? `حساب مدیر ساختمان @${target.username} معلق و نشست‌های فعال آن بسته شد.`
        : `حساب مدیر ساختمان @${target.username} مجدداً فعال شد.`,
      summaryEn: target.suspended
        ? `Manager account @${target.username} suspended and active sessions revoked.`
        : `Manager account @${target.username} reactivated.`,
      proofTag: target.suspended ? 'ADMIN-SUSPEND' : 'ADMIN-ACTIVATE',
    });
    saveStore();
    res.json(buildAdminOverview());
  });

  app.post('/api/admin/managers/:id/reset-password', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const target = store.accounts.find((a) => a.id === req.params.id && a.role === 'manager');
    if (!target) {
      res.status(404).json({ errorFa: 'حساب مدیر یافت نشد.', errorEn: 'Manager account not found.' });
      return;
    }
    const newPassword = String(req.body?.password ?? '');
    if (newPassword.length < 6) {
      res.status(400).json({
        errorFa: 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.',
        errorEn: 'New password must be at least 6 characters.',
      });
      return;
    }
    target.passwordHash = hashPassword(newPassword);
    revokeSessionsForAccount(target.id);
    store.privacyAudits.unshift({
      id: `aud-adm-pwd-${Date.now()}`,
      communityId: 'system',
      timestamp: nowCet(),
      category: 'key_rotated',
      summaryFa: `رمز عبور مدیر ساختمان @${target.username} توسط مدیریت کل بازنشانی شد.`,
      summaryEn: `Password reset for building manager @${target.username} by platform owner.`,
      proofTag: 'ADMIN-PWD-RESET',
    });
    saveStore();
    res.json(buildAdminOverview());
  });

  app.delete('/api/admin/managers/:id', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const target = store.accounts.find((a) => a.id === req.params.id && a.role === 'manager');
    if (!target) {
      res.status(404).json({ errorFa: 'حساب مدیر یافت نشد.', errorEn: 'Manager account not found.' });
      return;
    }

    const ownedIds = new Set(
      store.communities.filter((c) => c.managerAccountId === target.id).map((c) => c.id)
    );

    revokeSessionsForAccount(target.id);
    // Also revoke resident sessions belonging to deleted buildings
    for (const acc of store.accounts) {
      if (acc.role === 'resident' && acc.communityId && ownedIds.has(acc.communityId)) {
        revokeSessionsForAccount(acc.id);
      }
    }

    store.accounts = store.accounts.filter(
      (a) => a.id !== target.id && !(a.role === 'resident' && a.communityId && ownedIds.has(a.communityId))
    );
    store.communities = store.communities
      .filter((c) => !ownedIds.has(c.id))
      .map((c) => ({
        ...c,
        connectedCommunityIds: c.connectedCommunityIds.filter((cid) => !ownedIds.has(cid)),
      }));
    store.resources = store.resources.filter((r) => !ownedIds.has(r.communityId));
    store.rosterEntries = store.rosterEntries.filter((e) => !ownedIds.has(e.communityId));
    store.inviteLinks = store.inviteLinks.filter((i) => !ownedIds.has(i.communityId));
    store.reservations = store.reservations.filter((r) => !ownedIds.has(r.communityId));
    store.users = store.users.filter((u) => !u.communityId || !ownedIds.has(u.communityId));
    store.extendedRequests = store.extendedRequests.filter((ex) => !ownedIds.has(ex.communityId));
    store.reviews = store.reviews.filter((rv) => !ownedIds.has(rv.communityId));
    store.blockedAttempts = store.blockedAttempts.filter((b) => !ownedIds.has(b.communityId));

    store.privacyAudits.unshift({
      id: `aud-adm-del-${Date.now()}`,
      communityId: 'system',
      timestamp: nowCet(),
      category: 'gdpr_erasure',
      summaryFa: `حساب مدیر @${target.username} و داده‌های مرتبط (${ownedIds.size} ساختمان) حذف شد.`,
      summaryEn: `Manager @${target.username} and ${ownedIds.size} associated building(s) removed.`,
      proofTag: 'ADMIN-DELETE',
    });
    saveStore();
    res.json(buildAdminOverview());
  });

  app.patch('/api/admin/residents/:id/toggle-suspend', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const target = store.accounts.find((a) => a.id === req.params.id && a.role === 'resident');
    if (!target) {
      res.status(404).json({ errorFa: 'حساب ساکن یافت نشد.', errorEn: 'Resident account not found.' });
      return;
    }
    target.suspended = !target.suspended;
    if (target.suspended) {
      revokeSessionsForAccount(target.id);
    }
    if (target.userId) {
      store.users = store.users.map((u) =>
        u.id === target.userId ? { ...u, suspended: Boolean(target.suspended) } : u
      );
    }
    saveStore();
    res.json(buildAdminOverview());
  });

  app.patch('/api/admin/buildings/:id/toggle-federation', requireAuth, requireSuperAdmin, (req: AuthedRequest, res) => {
    const comm = store.communities.find((c) => c.id === req.params.id);
    if (!comm) {
      res.status(404).json({ errorFa: 'ساختمان یافت نشد.', errorEn: 'Building not found.' });
      return;
    }
    store.communities = store.communities.map((c) =>
      c.id === comm.id ? { ...c, federationEnabled: !c.federationEnabled } : c
    );
    saveStore();
    res.json(buildAdminOverview());
  });

  // ============================================================
  // 24. EUROPEAN GDPR-FIRST WHATSAPP 1-ON-1 BOT (META CLOUD API + LIVE SIMULATOR)
  // ============================================================

  app.get('/api/whatsapp/config', requireAuth, (_req: AuthedRequest, res) => {
    const liveConnected = Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
        process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() &&
        process.env.WHATSAPP_APP_SECRET?.trim() &&
        process.env.WHATSAPP_VERIFY_TOKEN?.trim()
    );
    const displayNumber = process.env.WHATSAPP_DISPLAY_NUMBER?.trim() || '';
    res.json({
      liveConnected,
      displayNumber,
      privacyMode: 'private_1on1_gdpr',
      webhookPath: '/api/whatsapp/webhook',
    });
  });

  // Official Meta WhatsApp Cloud API Verification Handshake
  app.get('/api/whatsapp/webhook', (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
    const mode = String(req.query['hub.mode'] ?? '');
    const token = String(req.query['hub.verify_token'] ?? '');
    const challenge = String(req.query['hub.challenge'] ?? '');

    if (!verifyToken) {
      res.status(503).send('WhatsApp webhook not configured');
      return;
    }
    if (mode === 'subscribe' && constantTimeStringEqual(token, verifyToken)) {
      res.status(200).type('text/plain').send(challenge);
      return;
    }
    res.sendStatus(403);
  });

  // Official Meta WhatsApp Cloud API Signed Inbound Webhook
  app.post('/api/whatsapp/webhook', async (req: AuthedRequest, res) => {
    if (!process.env.WHATSAPP_APP_SECRET?.trim()) {
      res.status(503).json({ error: 'WhatsApp webhook signing secret not configured' });
      return;
    }
    const sig = req.header('x-hub-signature-256');
    if (!verifyMetaWebhookSignature(req.rawBody, sig)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    let anyMutated = false;

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
        for (const msg of messages) {
          const fromPhone = String(msg?.from ?? '').trim();
          if (!fromPhone) continue;
          const messageText =
            msg?.type === 'text'
              ? String(msg?.text?.body ?? '')
              : msg?.type === 'interactive'
                ? String(msg?.interactive?.button_reply?.title ?? '')
                : '';
          const buttonId =
            msg?.type === 'interactive'
              ? String(msg?.interactive?.button_reply?.id ?? '')
              : undefined;

          const reply = processWhatsAppMessage({
            senderPhone: fromPhone,
            messageText,
            buttonId,
            preferredLang: 'en',
            ctx: store,
          });
          if (reply.mutatedState) anyMutated = true;
          await sendMetaWhatsAppReply(fromPhone, reply.replyText, reply.buttons);
        }
      }
    }

    if (anyMutated) saveStore();
    res.status(200).json({ status: 'ok' });
  });

  // Authenticated Live WhatsApp Bot Simulator (runs exact same engine on real store!)
  app.post('/api/whatsapp/simulate', requireAuth, (req: AuthedRequest, res) => {
    const session = req.session!;
    const { senderPhone, messageText, buttonId, lang } = req.body ?? {};
    const preferredLang = lang === 'fa' ? 'fa' : lang === 'nl' ? 'nl' : 'en';

    let effectivePhone = String(senderPhone ?? '').trim();
    let allowedCommunityIds: Set<string> | undefined;

    if (session.role === 'resident') {
      // Residents can strictly only simulate with their own verified phone number
      const ownProfile = store.users.find((u) => u.id === session.userId);
      effectivePhone = ownProfile?.phone ?? '';
      allowedCommunityIds = session.communityId ? new Set([session.communityId]) : new Set();
    } else if (session.role === 'manager') {
      allowedCommunityIds = getManagerCommunityIds(session.accountId);
    }

    if (!effectivePhone) {
      res.status(400).json({
        errorFa: 'شماره واتساپ فرستنده مشخص نشده است.',
        errorEn: 'Sender WhatsApp phone number is required.',
      });
      return;
    }

    const reply = processWhatsAppMessage({
      senderPhone: effectivePhone,
      messageText: String(messageText ?? ''),
      buttonId: buttonId ? String(buttonId) : undefined,
      preferredLang,
      allowedCommunityIds,
      ctx: store,
    });

    if (reply.mutatedState) {
      saveStore();
    }

    res.json({
      reply,
      state: buildScopedStateForSession(session),
    });
  });

  // ============================================================================
  // Direct Neighbor Share (Managerless Peer-to-Peer Community Sharing)
  // ============================================================================
  const toPublicDirectSpot = (s: StoredDirectSpot): DirectShareSpotPublic => ({
    id: s.id,
    slug: s.slug,
    buildingSlug: s.buildingSlug,
    buildingName: s.buildingName,
    bayNumber: s.bayNumber,
    floorOrZone: s.floorOrZone,
    ownerDisplayName: s.ownerDisplayName,
    hasOwnerWhatsApp: Boolean(s.ownerPhone),
    ownerPinClaimed: Boolean(s.ownerPinHash),
    isFree: s.isFree,
    availabilityMode: s.availabilityMode === 'one_time' ? 'one_time' : 'always',
    availableFromIso: s.availableFromIso,
    availableUntilIso: s.availableUntilIso,
    availabilityNote: s.availabilityNote,
    active: s.active,
    fairUse: s.fairUse,
    createdAt: s.createdAt,
  });

  const toPublicDirectBooking = (b: StoredDirectBooking): DirectShareBookingPublic => ({
    id: b.id,
    spotId: b.spotId,
    startIso: b.startIso,
    endIso: b.endIso,
    status: b.status,
    purposeTag: b.purposeTag,
    createdAt: b.createdAt,
  });

  const toOwnerDirectBooking = (b: StoredDirectBooking): DirectShareBookingOwnerView => ({
    ...toPublicDirectBooking(b),
    guestName: b.guestName,
    guestPhone: b.guestPhone,
    guestUnit: b.guestUnit,
    guestPlate: b.guestPlate,
    note: b.note,
  });

  const slugifyText = (raw: string): string =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

  const normalizeDirectPhone = (phone: string): string => {
    const digits = phone.replace(/[^\d]/g, '');
    return digits.length >= 9 ? digits.slice(-9) : digits;
  };

  // D1. Public: List Direct Neighbor Spots + Anonymized Bookings (Zero PII)
  app.get('/api/direct/spots', (req, res) => {
    const buildingFilter = String(req.query.building ?? '').trim().toLowerCase();
    const spotFilter = String(req.query.spot ?? '').trim().toLowerCase();

    let spots = store.directSpots;
    if (buildingFilter) {
      spots = spots.filter((s) => s.buildingSlug === buildingFilter);
    }
    if (spotFilter) {
      const exact = store.directSpots.find((s) => s.slug === spotFilter);
      if (exact && !buildingFilter) {
        spots = store.directSpots.filter((s) => s.buildingSlug === exact.buildingSlug);
      }
    }

    const spotIds = new Set(spots.map((s) => s.id));
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    const bookings = store.directBookings
      .filter((b) => spotIds.has(b.spotId) && b.status === 'Confirmed' && Date.parse(b.endIso) >= cutoffMs)
      .sort((a, b) => Date.parse(a.startIso) - Date.parse(b.startIso))
      .map(toPublicDirectBooking);

    res.json({
      spots: spots.map(toPublicDirectSpot),
      bookings,
    });
  });

  // D2. Public: Any Neighbor Can Add Their Own Spot to Share (No Manager Needed!)
  app.post('/api/direct/spots', (req, res) => {
    const {
      buildingName,
      bayNumber,
      floorOrZone,
      ownerDisplayName,
      ownerPhone,
      ownerPin,
      availabilityMode,
      availableFromIso,
      availableUntilIso,
      availabilityNote,
      maxHoursPerBooking,
      maxDaysPerMonthPerGuest,
    } = req.body ?? {};

    const cleanBuilding = String(buildingName ?? 'Boston Residence').trim().slice(0, 60) || 'Boston Residence';
    const cleanBay = String(bayNumber ?? '').trim().toUpperCase().slice(0, 20);
    const cleanFloor = String(floorOrZone ?? 'P1').trim().slice(0, 20) || 'P1';
    const cleanOwner = String(ownerDisplayName ?? '').trim().slice(0, 50);
    const cleanPin = String(ownerPin ?? '').trim();
    const cleanNote = String(availabilityNote ?? '').trim().slice(0, 200);
    const rawPhone = String(ownerPhone ?? '').trim();

    if (!cleanBay || cleanOwner.length < 2) {
      res.status(400).json({
        errorNl: 'Vul uw parkeerpleknummer en naam in.',
        errorEn: 'Please enter your parking bay number and name.',
        errorFa: 'لطفاً شماره پارکینگ و نام خود را وارد کنید.',
      });
      return;
    }

    if (cleanPin.length < 4) {
      res.status(400).json({
        errorNl: 'Kies een pincode van minimaal 4 tekens om reserveringen te beheren.',
        errorEn: 'Please choose an owner PIN of at least 4 characters to manage bookings.',
        errorFa: 'لطفاً یک پین حداقل ۴ کاراکتری برای مدیریت رزروهای پارکینگ خود انتخاب کنید.',
      });
      return;
    }

    let safeOwnerPhone: string | undefined;
    if (rawPhone) {
      const cleaned = rawPhone.replace(/[\s\-()]/g, '');
      const digitsOnly = cleaned.replace(/^\+/, '');
      if (!/^\d{7,15}$/.test(digitsOnly)) {
        res.status(400).json({
          errorNl: 'Voer een geldig telefoon-/WhatsApp-nummer in (7–15 cijfers).',
          errorEn: 'Please enter a valid phone/WhatsApp number (7–15 digits).',
          errorFa: 'شماره تماس/واتساپ معتبر (۷ تا ۱۵ رقم) وارد کنید.',
        });
        return;
      }
      safeOwnerPhone = cleaned.startsWith('+') ? cleaned : `+${digitsOnly}`;
    }

    const buildingSlug = slugifyText(cleanBuilding.split(/\s+/)[0] || cleanBuilding) || 'boston';
    const baseSlug = `${buildingSlug}-${slugifyText(cleanBay)}`;
    if (store.directSpots.some((s) => s.slug === baseSlug)) {
      res.status(409).json({
        errorNl: `Parkeerplek ${cleanBay} bestaat al in ${cleanBuilding}.`,
        errorEn: `Parking bay ${cleanBay} already exists in ${cleanBuilding}.`,
        errorFa: `پارکینگ ${cleanBay} قبلاً در ${cleanBuilding} ثبت شده است.`,
      });
      return;
    }

    const mode: 'always' | 'one_time' = availabilityMode === 'one_time' ? 'one_time' : 'always';
    let safeFromIso: string | undefined;
    let safeUntilIso: string | undefined;
    if (mode === 'one_time') {
      const fMs = Date.parse(String(availableFromIso ?? ''));
      const uMs = Date.parse(String(availableUntilIso ?? ''));
      if (!Number.isFinite(fMs) || !Number.isFinite(uMs) || uMs <= fMs) {
        res.status(400).json({
          errorNl: 'Kies voor een eenmalige aanbieding een geldige begin- en einddatum/tijd.',
          errorEn: 'For a one-time offer, please choose a valid start and end date/time.',
          errorFa: 'برای اشتراک‌گذاری یک‌باره، تاریخ و ساعت شروع و پایان معتبر انتخاب کنید.',
        });
        return;
      }
      safeFromIso = new Date(fMs).toISOString();
      safeUntilIso = new Date(uMs).toISOString();
    }

    const clampedMaxHours = Math.min(72, Math.max(2, Number(maxHoursPerBooking) || 24));
    const clampedMaxDays = Math.min(15, Math.max(2, Number(maxDaysPerMonthPerGuest) || 8));

    const newSpot: StoredDirectSpot = {
      id: `direct-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      slug: baseSlug,
      buildingSlug,
      buildingName: cleanBuilding,
      bayNumber: cleanBay,
      floorOrZone: cleanFloor,
      ownerDisplayName: cleanOwner,
      ownerPhone: safeOwnerPhone,
      ownerPinHash: hashPassword(cleanPin),
      isFree: true,
      availabilityMode: mode,
      availableFromIso: safeFromIso,
      availableUntilIso: safeUntilIso,
      availabilityNote:
        cleanNote ||
        (mode === 'one_time'
          ? 'Eenmalig beschikbaar binnen het aangegeven tijdvak (gratis voor buren)'
          : 'Doorlopend beschikbaar voor tijdelijk gebruik / visite (gratis voor buren)'),
      active: true,
      fairUse: {
        maxHoursPerBooking: clampedMaxHours,
        maxDaysPerMonthPerGuest: clampedMaxDays,
        maxActiveBookingsPerGuest: 2,
        minGapHoursBetweenStays: 24,
      },
      createdAt: new Date().toISOString(),
    };

    store.directSpots.push(newSpot);
    saveStore();
    res.status(201).json({ spot: toPublicDirectSpot(newSpot) });
  });

  // D3. One-Time Owner Claim for Pre-Seeded Spot (e.g. Boston 177)
  app.post('/api/direct/spots/:slug/claim-owner', (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase();
    const spot = store.directSpots.find((s) => s.slug === slug);
    if (!spot) {
      res.status(404).json({ errorEn: 'Spot not found.', errorNl: 'Plek niet gevonden.', errorFa: 'پارکینگ یافت نشد.' });
      return;
    }
    if (spot.ownerPinHash) {
      res.status(409).json({
        errorNl: 'Deze parkeerplek is al geclaimd door de eigenaar.',
        errorEn: 'This spot is already claimed by its owner.',
        errorFa: 'پین مالک این پارکینگ قبلاً تنظیم شده است.',
      });
      return;
    }

    const { ownerPin, ownerDisplayName, ownerPhone, availabilityNote } = req.body ?? {};
    const cleanPin = String(ownerPin ?? '').trim();
    if (cleanPin.length < 4) {
      res.status(400).json({
        errorNl: 'Kies een pincode van minimaal 4 tekens.',
        errorEn: 'PIN must be at least 4 characters.',
        errorFa: 'پین مالک باید حداقل ۴ کاراکتر باشد.',
      });
      return;
    }

    const rawPhone = String(ownerPhone ?? '').trim();
    let safeOwnerPhone: string | undefined;
    if (rawPhone) {
      const cleaned = rawPhone.replace(/[\s\-()]/g, '');
      const digitsOnly = cleaned.replace(/^\+/, '');
      if (!/^\d{7,15}$/.test(digitsOnly)) {
        res.status(400).json({
          errorNl: 'Voer een geldig WhatsApp-nummer in (7–15 cijfers).',
          errorEn: 'Invalid WhatsApp phone number.',
          errorFa: 'شماره واتساپ معتبر نیست.',
        });
        return;
      }
      safeOwnerPhone = cleaned.startsWith('+') ? cleaned : `+${digitsOnly}`;
    }

    spot.ownerPinHash = hashPassword(cleanPin);
    if (String(ownerDisplayName ?? '').trim().length >= 2) {
      spot.ownerDisplayName = String(ownerDisplayName).trim().slice(0, 50);
    }
    if (safeOwnerPhone) {
      spot.ownerPhone = safeOwnerPhone;
    }
    if (String(availabilityNote ?? '').trim()) {
      spot.availabilityNote = String(availabilityNote).trim().slice(0, 200);
    }
    saveStore();
    res.json({ ok: true, spot: toPublicDirectSpot(spot) });
  });

  // D4. Public: Book a Direct Spot (Atomic Conflict Lock + Anti-Permanent Fair-Use + Mandatory Owner-Only Contact)
  app.post('/api/direct/spots/:slug/book', (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase();
    const spot = store.directSpots.find((s) => s.slug === slug);
    if (!spot) {
      res.status(404).json({ errorNl: 'Parkeerplek niet gevonden.', errorEn: 'Spot not found.', errorFa: 'پارکینگ یافت نشد.' });
      return;
    }
    if (!spot.active) {
      res.status(409).json({
        errorNl: 'Deze parkeerplek is momenteel tijdelijk gepauzeerd door de eigenaar.',
        errorEn: 'This parking spot is currently paused by the owner.',
        errorFa: 'این پارکینگ موقتاً توسط مالک غیرفعال شده است.',
      });
      return;
    }

    const { startIso, endIso, guestName, guestPhone, guestUnit, guestPlate, purposeTag, note } = req.body ?? {};
    const startMs = Date.parse(String(startIso ?? ''));
    const endMs = Date.parse(String(endIso ?? ''));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      res.status(400).json({
        errorNl: 'Kies een geldige begin- en einddatum/tijd.',
        errorEn: 'Please choose a valid start and end date/time.',
        errorFa: 'لطفاً تاریخ و ساعت شروع و پایان معتبر انتخاب کنید.',
      });
      return;
    }
    if (startMs < Date.now() - 15 * 60 * 1000) {
      res.status(400).json({
        errorNl: 'De begintijd mag niet in het verleden liggen.',
        errorEn: 'Start time cannot be in the past.',
        errorFa: 'زمان شروع نمی‌تواند در گذشته باشد.',
      });
      return;
    }

    // 0. One-Time Window Enforcement (if owner offered spot only for a specific date/time)
    if (spot.availabilityMode === 'one_time' && spot.availableFromIso && spot.availableUntilIso) {
      const winStart = Date.parse(spot.availableFromIso);
      const winEnd = Date.parse(spot.availableUntilIso);
      if (startMs < winStart || endMs > winEnd) {
        res.status(403).json({
          code: 'OUTSIDE_ONE_TIME_WINDOW',
          errorNl: 'Deze plek is eenmalig aangeboden voor een specifiek tijdvak. Kies een tijd binnen het aangegeven venster.',
          errorEn: 'This spot is offered one-time for a specific window. Please choose a time inside the declared window.',
          errorFa: 'این پارکینگ فقط برای یک بازه زمانی مشخص (یک‌باره) ارائه شده است. لطفاً زمانی داخل همان بازه انتخاب کنید.',
        });
        return;
      }
    }

    const cleanName = String(guestName ?? '').trim().slice(0, 60);
    const cleanPhoneRaw = String(guestPhone ?? '').trim();
    const cleanPhoneDigits = cleanPhoneRaw.replace(/[^\d]/g, '');
    const cleanUnit = String(guestUnit ?? '').trim().slice(0, 30);
    const cleanPlate = String(guestPlate ?? '').trim().toUpperCase().slice(0, 20);
    const cleanNote = String(note ?? '').trim().slice(0, 180);
    const safePurpose: 'visite' | 'temporary' | 'delivery' =
      purposeTag === 'delivery' ? 'delivery' : purposeTag === 'temporary' ? 'temporary' : 'visite';

    if (cleanName.length < 2 || cleanPhoneDigits.length < 7 || cleanPhoneDigits.length > 15 || cleanUnit.length < 1) {
      res.status(400).json({
        errorNl: 'Naam, telefoon-/WhatsApp-nummer en woningnummer zijn verplicht (alleen zichtbaar voor de eigenaar).',
        errorEn: 'Name, phone/WhatsApp number, and apartment/unit number are required (shared privately with the spot owner only).',
        errorFa: 'وارد کردن نام، شماره تماس/واتساپ و شماره واحد الزامی است (فقط برای مالک پارکینگ نمایش داده می‌شود).',
      });
      return;
    }

    // 1. Fair-Use Guard #1: Max hours per single stay (default 24h — longer requires owner coordination)
    const durationHours = (endMs - startMs) / (1000 * 60 * 60);
    if (durationHours > spot.fairUse.maxHoursPerBooking) {
      res.status(403).json({
        code: 'FAIR_USE_MAX_HOURS',
        errorNl: `Direct boeken kan tot maximaal ${spot.fairUse.maxHoursPerBooking} uur. Langer nodig (bijv. 2 dagen achter elkaar)? Neem dan eerst even contact op met de eigenaar om af te stemmen.`,
        errorEn: `Instant booking is limited to ${spot.fairUse.maxHoursPerBooking} hours. Need longer (e.g. 2 consecutive days)? Please coordinate directly with the owner first.`,
        errorFa: `رزرو مستقیم تا حداکثر ${spot.fairUse.maxHoursPerBooking} ساعت مجاز است. اگر بیشتر نیاز دارید (مثلاً ۲ روز پشت سر هم)، لطفاً ابتدا با مالک پارکینگ هماهنگ کنید.`,
      });
      return;
    }

    const normPhone = normalizeDirectPhone(cleanPhoneRaw);
    const normUnit = cleanUnit.toLowerCase().replace(/\s+/g, '');

    // 2. Atomic Conflict Check on this spot
    const overlapping = store.directBookings.find(
      (b) =>
        b.spotId === spot.id &&
        b.status === 'Confirmed' &&
        startMs < Date.parse(b.endIso) &&
        endMs > Date.parse(b.startIso)
    );
    if (overlapping) {
      res.status(409).json({
        code: 'CONFLICT_OVERLAP',
        errorNl: 'Deze plek is op het gekozen tijdstip al gereserveerd. Kies een ander tijdstip of een andere beschikbare plek.',
        errorEn: 'This spot is already booked during the selected window. Please pick another time or spot.',
        errorFa: 'این پارکینگ در بازه انتخابی قبلاً رزرو شده است. لطفاً زمان یا جایگاه دیگری انتخاب کنید.',
      });
      return;
    }

    // 3. Fair-Use Guard #2, #3, #4 (per neighbor phone OR apartment unit in the same building)
    const nowMs = Date.now();
    const reqMonthKey = new Date(startMs).toISOString().slice(0, 7);
    const sameGuestBookings = store.directBookings.filter(
      (b) =>
        b.buildingSlug === spot.buildingSlug &&
        b.status === 'Confirmed' &&
        (b.guestPhoneNormalized === normPhone || b.guestUnitNormalized === normUnit)
    );

    const activeUpcoming = sameGuestBookings.filter((b) => Date.parse(b.endIso) > nowMs);
    if (activeUpcoming.length >= spot.fairUse.maxActiveBookingsPerGuest) {
      res.status(403).json({
        code: 'FAIR_USE_MAX_ACTIVE',
        errorNl: `Maximaal ${spot.fairUse.maxActiveBookingsPerGuest} actieve reserveringen tegelijk per bewoner (om eerlijk tijdelijk gebruik te garanderen).`,
        errorEn: `Maximum ${spot.fairUse.maxActiveBookingsPerGuest} active upcoming bookings at a time per neighbor.`,
        errorFa: `حداکثر ${spot.fairUse.maxActiveBookingsPerGuest} رزرو فعال هم‌زمان برای هر همسایه مجاز است (برای حفظ عدالت در استفاده موقت).`,
      });
      return;
    }

    const minGapMs = spot.fairUse.minGapHoursBetweenStays * 60 * 60 * 1000;
    const tooClose = sameGuestBookings.find((b) => {
      const bStart = Date.parse(b.startIso);
      const bEnd = Date.parse(b.endIso);
      const gapAfter = startMs - bEnd;
      const gapBefore = bStart - endMs;
      return (gapAfter >= 0 && gapAfter < minGapMs) || (gapBefore >= 0 && gapBefore < minGapMs);
    });
    if (tooClose) {
      res.status(403).json({
        code: 'FAIR_USE_COOLDOWN',
        errorNl: `Twee reserveringen direct achter elkaar (binnen ${spot.fairUse.minGapHoursBetweenStays} uur) kunnen niet automatisch — stem dit eerst even af met de eigenaar.`,
        errorEn: `Back-to-back bookings (within ${spot.fairUse.minGapHoursBetweenStays}h) cannot be booked automatically — please coordinate with the spot owner first.`,
        errorFa: `رزرو دو بازه پشت سر هم (با فاصله کمتر از ${spot.fairUse.minGapHoursBetweenStays} ساعت) به‌صورت خودکار مجاز نیست — لطفاً برای تمدید با مالک هماهنگ کنید.`,
      });
      return;
    }

    const monthBookings = sameGuestBookings.filter((b) => b.startIso.slice(0, 7) === reqMonthKey);
    const usedDaysThisMonth = monthBookings.reduce((sum, b) => {
      const hrs = Math.max(1, (Date.parse(b.endIso) - Date.parse(b.startIso)) / (1000 * 60 * 60));
      return sum + Math.max(1, Math.ceil(hrs / 24));
    }, 0);
    const requestedDays = Math.max(1, Math.ceil(durationHours / 24));
    if (usedDaysThisMonth + requestedDays > spot.fairUse.maxDaysPerMonthPerGuest) {
      res.status(403).json({
        code: 'FAIR_USE_MONTHLY_CAP',
        errorNl: `Maandlimiet bereikt: maximaal ${spot.fairUse.maxDaysPerMonthPerGuest} dagen per maand per bewoner voor tijdelijk parkeren.`,
        errorEn: `Monthly fair-use cap reached: maximum ${spot.fairUse.maxDaysPerMonthPerGuest} temporary days per month per neighbor.`,
        errorFa: `سقف ماهانه استفاده موقت تکمیل شده است (حداکثر ${spot.fairUse.maxDaysPerMonthPerGuest} روز در ماه برای هر همسایه).`,
      });
      return;
    }

    const cancelCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const created: StoredDirectBooking = {
      id: `dbk-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      spotId: spot.id,
      buildingSlug: spot.buildingSlug,
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
      status: 'Confirmed',
      purposeTag: safePurpose,
      guestName: cleanName,
      guestPhone: cleanPhoneRaw,
      guestPhoneNormalized: normPhone,
      guestUnit: cleanUnit,
      guestUnitNormalized: normUnit,
      guestPlate: cleanPlate || undefined,
      note: cleanNote || undefined,
      cancelCode,
      createdAt: new Date().toISOString(),
    };

    store.directBookings.unshift(created);
    saveStore();

    const ownerWaDigits = spot.ownerPhone ? spot.ownerPhone.replace(/[^\d]/g, '') : '';
    const waSummary = encodeURIComponent(
      `Hoi ${spot.ownerDisplayName}, ik heb zojuist plek ${spot.bayNumber} (${spot.buildingName}) gereserveerd via ParkShare.\n` +
        `Naam: ${cleanName} (Woning ${cleanUnit})\n` +
        `Tel: ${cleanPhoneRaw}\n` +
        `Van: ${new Date(startMs).toLocaleString('nl-NL')}\n` +
        `Tot: ${new Date(endMs).toLocaleString('nl-NL')}` +
        (cleanNote ? `\nNotitie: ${cleanNote}` : '')
    );

    res.status(201).json({
      ok: true,
      booking: toPublicDirectBooking(created),
      cancelCode,
      ownerWhatsAppUrl: ownerWaDigits ? `https://wa.me/${ownerWaDigits}?text=${waSummary}` : null,
    });
  });

  // D5. Owner-Only: Unlock & View Full Guest Contact Details for Their Spot
  app.post('/api/direct/spots/:slug/owner-panel', (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase();
    const spot = store.directSpots.find((s) => s.slug === slug);
    if (!spot) {
      res.status(404).json({ errorNl: 'Plek niet gevonden.', errorEn: 'Spot not found.', errorFa: 'پارکینگ یافت نشد.' });
      return;
    }
    if (!spot.ownerPinHash) {
      res.status(403).json({
        needsClaim: true,
        errorNl: 'Stel eerst uw eigenaar-pincode in.',
        errorEn: 'Please claim this spot and set your owner PIN first.',
        errorFa: 'ابتدا پین مالک این پارکینگ را تنظیم کنید.',
      });
      return;
    }

    const pin = String(req.body?.ownerPin ?? '').trim();
    if (!verifyPassword(pin, spot.ownerPinHash)) {
      res.status(401).json({
        errorNl: 'Onjuiste pincode.',
        errorEn: 'Incorrect owner PIN.',
        errorFa: 'پین مالک اشتباه است.',
      });
      return;
    }

    const bookings = store.directBookings
      .filter((b) => b.spotId === spot.id)
      .sort((a, b) => Date.parse(b.startIso) - Date.parse(a.startIso))
      .map(toOwnerDirectBooking);

    res.json({
      spot: { ...toPublicDirectSpot(spot), ownerPhone: spot.ownerPhone || '' },
      bookings,
    });
  });

  // D6. Owner-Only: Update Spot Status / Fair-Use / Availability Note / WhatsApp Number
  app.patch('/api/direct/spots/:slug/owner-settings', (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase();
    const spot = store.directSpots.find((s) => s.slug === slug);
    if (!spot || !spot.ownerPinHash) {
      res.status(404).json({ errorEn: 'Spot not found or unclaimed.' });
      return;
    }
    const pin = String(req.body?.ownerPin ?? '').trim();
    if (!verifyPassword(pin, spot.ownerPinHash)) {
      res.status(401).json({ errorNl: 'Onjuiste pincode.', errorEn: 'Incorrect owner PIN.', errorFa: 'پین اشتباه است.' });
      return;
    }

    if (typeof req.body?.active === 'boolean') spot.active = req.body.active;
    if (req.body?.availabilityMode === 'one_time' || req.body?.availabilityMode === 'always') {
      spot.availabilityMode = req.body.availabilityMode;
      if (spot.availabilityMode === 'always') {
        spot.availableFromIso = undefined;
        spot.availableUntilIso = undefined;
      } else {
        const fMs = Date.parse(String(req.body?.availableFromIso ?? ''));
        const uMs = Date.parse(String(req.body?.availableUntilIso ?? ''));
        if (Number.isFinite(fMs) && Number.isFinite(uMs) && uMs > fMs) {
          spot.availableFromIso = new Date(fMs).toISOString();
          spot.availableUntilIso = new Date(uMs).toISOString();
        }
      }
    }
    if (typeof req.body?.availabilityNote === 'string') {
      spot.availabilityNote = req.body.availabilityNote.trim().slice(0, 200);
    }
    if (typeof req.body?.ownerPhone === 'string') {
      const cleaned = req.body.ownerPhone.trim().replace(/[\s\-()]/g, '');
      const digitsOnly = cleaned.replace(/^\+/, '');
      if (!cleaned) {
        spot.ownerPhone = undefined;
      } else if (/^\d{7,15}$/.test(digitsOnly)) {
        spot.ownerPhone = cleaned.startsWith('+') ? cleaned : `+${digitsOnly}`;
      }
    }
    if (req.body?.fairUse) {
      const fu = req.body.fairUse;
      if (Number.isFinite(Number(fu.maxHoursPerBooking))) {
        spot.fairUse.maxHoursPerBooking = Math.min(72, Math.max(2, Number(fu.maxHoursPerBooking)));
      }
      if (Number.isFinite(Number(fu.maxDaysPerMonthPerGuest))) {
        spot.fairUse.maxDaysPerMonthPerGuest = Math.min(15, Math.max(2, Number(fu.maxDaysPerMonthPerGuest)));
      }
    }
    saveStore();
    res.json({ spot: toPublicDirectSpot(spot) });
  });

  // D6b. Owner-Only: Permanently Delete / Remove Their Spot
  app.post('/api/direct/spots/:slug/delete', (req, res) => {
    const slug = String(req.params.slug ?? '').toLowerCase();
    const spot = store.directSpots.find((s) => s.slug === slug);
    if (!spot || !spot.ownerPinHash) {
      res.status(404).json({
        errorNl: 'Plek niet gevonden of nog niet geclaimd.',
        errorEn: 'Spot not found or unclaimed.',
        errorFa: 'پارکینگ یافت نشد.',
      });
      return;
    }
    const pin = String(req.body?.ownerPin ?? '').trim();
    if (!verifyPassword(pin, spot.ownerPinHash)) {
      res.status(401).json({
        errorNl: 'Onjuiste pincode.',
        errorEn: 'Incorrect owner PIN.',
        errorFa: 'پین مالک اشتباه است.',
      });
      return;
    }

    store.directSpots = store.directSpots.filter((s) => s.id !== spot.id);
    store.directBookings = store.directBookings.filter((b) => b.spotId !== spot.id);
    saveStore();
    res.json({ ok: true });
  });

  // D7. Cancel Direct Booking (Guest via cancelCode OR Owner via ownerPin)
  app.post('/api/direct/bookings/:id/cancel', (req, res) => {
    const booking = store.directBookings.find((b) => b.id === req.params.id);
    if (!booking) {
      res.status(404).json({ errorEn: 'Booking not found.' });
      return;
    }
    const spot = store.directSpots.find((s) => s.id === booking.spotId);
    const cancelCode = String(req.body?.cancelCode ?? '').trim().toUpperCase();
    const ownerPin = String(req.body?.ownerPin ?? '').trim();

    const validGuest = Boolean(cancelCode && cancelCode === booking.cancelCode);
    const validOwner = Boolean(ownerPin && spot?.ownerPinHash && verifyPassword(ownerPin, spot.ownerPinHash));
    if (!validGuest && !validOwner) {
      res.status(403).json({
        errorNl: 'Ongeldige annuleringscode of pincode.',
        errorEn: 'Invalid cancellation code or owner PIN.',
        errorFa: 'کد لغو یا پین مالک نامعتبر است.',
      });
      return;
    }

    booking.status = 'Cancelled';
    saveStore();
    res.json({ ok: true });
  });

  // Mount Vite middleware in dev or serve static dist in prod
  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndex = path.join(distDir, 'index.html');
  const isProd =
    (process.env.NODE_ENV === 'production' || process.env.npm_lifecycle_event === 'start') &&
    fs.existsSync(distIndex);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(distIndex);
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`ParkShare server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ParkShare server:', err);
  process.exit(1);
});
