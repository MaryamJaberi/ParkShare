import type {
  BlockedAccessAttempt,
  BuildingRosterEntry,
  Community,
  Language,
  NotificationEvent,
  OptimizedScheduleOption,
  PrivacyAuditEvent,
  Reservation,
  Resource,
  UserProfile,
} from '../types/parkshare.ts';
import {
  createAtomicBooking,
  createNotificationEvent,
  runSmartMatchingPipeline,
} from './coreEngine.ts';
import { DEFAULT_RANKING_WEIGHTS } from '../data/seedData.ts';
import { formatMinutes } from '../i18n/translations.ts';

export interface WhatsAppQuickReplyButton {
  id: string;
  title: string;
}

export interface WhatsAppBotReply {
  replyText: string;
  buttons: WhatsAppQuickReplyButton[];
  privacyBadgeFa: string;
  privacyBadgeEn: string;
  matchedCommunityId?: string;
  matchedCommunityNameFa?: string;
  matchedCommunityNameEn?: string;
  authorized: boolean;
  mutatedState: boolean;
}

export interface WhatsAppBotStoreContext {
  communities: Community[];
  users: UserProfile[];
  resources: Resource[];
  reservations: Reservation[];
  rosterEntries: BuildingRosterEntry[];
  blockedAttempts: BlockedAccessAttempt[];
  privacyAudits: PrivacyAuditEvent[];
  notifications: NotificationEvent[];
}

function normalizeDigits(input: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return input
    .replace(/[۰-۹]/g, (d) => String(persian.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(arabic.indexOf(d)));
}

export function normalizePhoneDigits(phone: string): string {
  return normalizeDigits(phone).replace(/[^\d+]/g, '').replace(/^00/, '+');
}

function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhoneDigits(a).replace(/^\+/, '');
  const nb = normalizePhoneDigits(b).replace(/^\+/, '');
  if (na.length < 7 || nb.length < 7) return false;
  if (na === nb) return true;
  // Match last 9 digits (handles local 06... vs +316... or 09... vs +989...)
  return na.slice(-9) === nb.slice(-9);
}

function parseTimeRange(raw: string): { startMin: number; endMin: number } | null {
  const text = normalizeDigits(raw);
  // Matches patterns like: "09:00 - 17:00", "9 تا 17", "10 to 18", "9:30 تا 14:30", "10-16"
  const m = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(?:تا|الی|to|-|–|—|~)\s*(\d{1,2})(?::(\d{2}))?\b/i
  );
  if (!m) return null;
  const sh = Math.min(23, Math.max(0, Number(m[1])));
  const sm = Math.min(59, Math.max(0, Number(m[2] ?? 0)));
  const eh = Math.min(24, Math.max(1, Number(m[3])));
  const em = eh === 24 ? 0 : Math.min(59, Math.max(0, Number(m[4] ?? 0)));
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

function nowTimeTag(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' CET';
}

function pseudonymousTag(userId: string, lang: Language): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  const code = (hash % 9000 + 1000).toString();
  return lang === 'fa' ? `ساکن تأییدشده #${code}` : `Verified Neighbor #${code}`;
}

function detectLanguage(text: string, fallback: Language): Language {
  if (/[\u0600-\u06FF]/.test(text)) return 'fa';
  if (/[a-zA-Z]{2,}/.test(text)) return 'en';
  return fallback;
}

function ensureUserForRosterEntry(
  entry: BuildingRosterEntry,
  community: Community,
  ctx: WhatsAppBotStoreContext
): { user: UserProfile; created: boolean } {
  const existing = ctx.users.find(
    (u) =>
      u.communityId === community.id &&
      (phonesMatch(u.phone, entry.phone) ||
        (entry.email && u.email.toLowerCase() === entry.email.toLowerCase()))
  );
  if (existing) {
    return { user: existing, created: false };
  }
  const newUser: UserProfile = {
    id: `u-wa-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    name: `${entry.ownerName} (${community.name} · ${entry.unitNumber})`,
    nameFa: `${entry.ownerName} (${community.nameFa} · واحد ${entry.unitNumber})`,
    role: 'resident',
    communityId: community.id,
    unitNumber: entry.unitNumber,
    phone: entry.phone,
    email: entry.email,
    suspended: false,
    allowedFloors: community.floors.length ? community.floors : ['B1'],
    tempUsageThisMonth: { daysUsed: 0, consecutiveDays: 0 },
    vehicle: {
      type: 'car',
      lengthM: 4.5,
      widthM: 1.85,
      heightM: 1.6,
      needsEv: Boolean(entry.evCharging),
      needsAccessible: false,
    },
  };
  ctx.users.unshift(newUser);
  return { user: newUser, created: true };
}

/**
 * European GDPR-First Private 1-on-1 WhatsApp Bot Engine.
 * Works identically for live Meta Cloud API webhooks and the built-in interactive simulator.
 */
export function processWhatsAppMessage(params: {
  senderPhone: string;
  messageText?: string;
  buttonId?: string;
  preferredLang?: Language;
  allowedCommunityIds?: Set<string>;
  ctx: WhatsAppBotStoreContext;
}): WhatsAppBotReply {
  const { senderPhone, messageText = '', buttonId, preferredLang = 'fa', allowedCommunityIds, ctx } =
    params;

  const trimmed = messageText.trim();
  const lang = buttonId ? preferredLang : detectLanguage(trimmed, preferredLang);
  const ts = nowTimeTag();

  // 1. Strict Whitelist Verification by Phone Number (GDPR Privacy Gate)
  const scopedRoster = allowedCommunityIds
    ? ctx.rosterEntries.filter((e) => allowedCommunityIds.has(e.communityId))
    : ctx.rosterEntries;

  const rosterMatch = scopedRoster.find((e) => phonesMatch(e.phone, senderPhone));
  const community = rosterMatch
    ? ctx.communities.find((c) => c.id === rosterMatch.communityId)
    : undefined;

  if (!rosterMatch || !community || rosterMatch.status === 'revoked') {
    const auditCommId = allowedCommunityIds
      ? Array.from(allowedCommunityIds)[0] ?? 'system'
      : ctx.communities[0]?.id ?? 'system';
    const maskedSender = normalizePhoneDigits(senderPhone).slice(-4);

    ctx.blockedAttempts.unshift({
      id: `blk-wa-${Date.now()}`,
      communityId: auditCommId,
      identifierTried: `WhatsApp ***${maskedSender || '????'}`,
      unitOrBayTried: 'WhatsApp Bot',
      reason:
        rosterMatch?.status === 'revoked'
          ? 'دسترسی ساکن توسط مدیر ساختمان غیرفعال شده است'
          : 'شماره واتساپ در لیست مجاز مدیر ساختمان ثبت نشده است',
      timestamp: ts,
    });
    ctx.privacyAudits.unshift({
      id: `aud-wa-blk-${Date.now()}`,
      communityId: auditCommId,
      timestamp: ts,
      category: 'whitelist_blocked',
      summaryFa: `درخواست واتساپ از شماره ناشناس (***${maskedSender || '????'}) بدون افشای اطلاعات ساختمان مسدود شد.`,
      summaryEn: `Blocked unrecognized WhatsApp sender (***${maskedSender || '????'}) with zero building disclosure.`,
      proofTag: 'WA-WHITELIST-BLOCK',
    });

    return {
      authorized: false,
      mutatedState: true,
      privacyBadgeFa: 'مسدودشده · شماره خارج از لیست رسمی ساختمان',
      privacyBadgeEn: 'Blocked · Phone not on building whitelist',
      replyText:
        lang === 'fa'
          ? '🔒 شماره واتساپ شما در لیست رسمی ساکنان ساختمان ثبت نشده (یا غیرفعال است).\n\nبرای حفظ حریم خصوصی ساکنان، ظرفیت پارکینگ فقط به شماره‌های تأییدشده توسط مدیر ساختمان نمایش داده می‌شود. لطفاً از مدیر ساختمان بخواهید شماره شما را به لیست مجاز اضافه کند.'
          : '🔒 Your WhatsApp number is not on an active building resident whitelist.\n\nTo protect resident privacy (GDPR), availability is never shown to unverified numbers. Please ask your building manager to whitelist your number.',
      buttons: [],
    };
  }

  const { user: requester, created: userCreated } = ensureUserForRosterEntry(
    rosterMatch,
    community,
    ctx
  );
  let mutated = userCreated;
  const commLabel = lang === 'fa' ? community.nameFa : community.name;
  const action = (buttonId || '').trim();
  const lower = normalizeDigits(trimmed).toLowerCase();

  // 2. HANDLE INTERACTIVE BUTTON: DIRECT ATOMIC BOOKING ("book:<resourceId>:<startMin>:<endMin>")
  if (action.startsWith('book:')) {
    const [, resourceId, sStr, eStr] = action.split(':');
    const startMin = Number(sStr);
    const endMin = Number(eStr);
    const targetRes = ctx.resources.find((r) => r.id === resourceId);
    const targetComm = targetRes
      ? ctx.communities.find((c) => c.id === targetRes.communityId)
      : undefined;

    if (!targetRes || !targetComm || Number.isNaN(startMin) || Number.isNaN(endMin)) {
      return {
        authorized: true,
        mutatedState: mutated,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'چت خصوصی ۱ به ۱ · هویت مخفی',
        privacyBadgeEn: 'Private 1-on-1 · Pseudonymous',
        replyText:
          lang === 'fa'
            ? 'این گزینه دیگر در دسترس نیست. لطفاً دوباره ساعت مورد نظر را ارسال کنید.'
            : 'That option is no longer available. Please send your desired time window again.',
        buttons: [
          { id: 'cmd:book_today', title: lang === 'fa' ? 'جستجوی دوباره' : 'Search Again' },
          { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' },
        ],
      };
    }

    const option: OptimizedScheduleOption = {
      id: `wa-opt-${targetRes.id}-${startMin}-${endMin}`,
      type: 'continuous',
      segments: [
        {
          resource: targetRes,
          community: targetComm,
          startMin,
          endMin,
          isFederated: targetComm.id !== community.id,
          policyDecision: 'Allowed',
        },
      ],
      totalCoverageMin: endMin - startMin,
      coverageRatio: 1,
      longestContinuousMin: endMin - startMin,
      relocationCount: 0,
      averageRisk: targetRes.recallRiskScore,
      objectiveScore: 95,
      totalEstimatedEur: targetRes.pricing.isFree
        ? 0
        : Number((((endMin - startMin) / 60) * targetRes.pricing.hourlyEur).toFixed(2)),
      requiresManualApproval: targetRes.approvalMode === 'manual',
    };

    const outcome = createAtomicBooking(option, requester, ctx.reservations, ctx.communities, false);
    if (!outcome.ok || !outcome.reservationsCreated) {
      return {
        authorized: true,
        mutatedState: mutated,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'قانون منصفانه / ضد تداخل',
        privacyBadgeEn: 'Fair-Use / Conflict Guard',
        replyText:
          lang === 'fa'
            ? `⚠️ امکان ثبت رزرو وجود ندارد:\n${outcome.errorMessageFa ?? 'این بازه زمانی هم‌اکنون پر شده یا خارج از سقف پارکینگ موقت است.'}`
            : `⚠️ Could not complete booking:\n${outcome.errorMessageEn ?? 'Slot unavailable or exceeds temporary Fair-Use limits.'}`,
        buttons: [
          { id: 'cmd:book_today', title: lang === 'fa' ? 'جستجوی جایگاه دیگر' : 'Find Another Bay' },
          { id: 'cmd:quota_privacy', title: lang === 'fa' ? 'سهمیه ماهانه من' : 'My Quota' },
        ],
      };
    }

    const pseudoName = pseudonymousTag(requester.id, lang);
    const created = outcome.reservationsCreated.map((r) => ({
      ...r,
      requesterName: pseudoName,
      notes: 'WhatsApp 1-on-1 Private Booking',
    }));
    ctx.reservations = [...created, ...ctx.reservations];
    ctx.users = ctx.users.map((u) =>
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
      ctx.notifications = [...outcome.notifications, ...ctx.notifications];
    }
    ctx.privacyAudits.unshift({
      id: `aud-wa-bk-${Date.now()}`,
      communityId: targetComm.id,
      timestamp: ts,
      category: 'pii_masked',
      summaryFa: `رزرو خصوصی واتساپ روی جایگاه ${targetRes.code} (${formatMinutes(startMin)}–${formatMinutes(endMin)}) بدون افشای شماره یا نام ثبت شد.`,
      summaryEn: `Private WhatsApp booking on bay ${targetRes.code} (${formatMinutes(startMin)}–${formatMinutes(endMin)}) logged pseudonymously.`,
      proofTag: 'WA-PRIVATE-BOOK',
    });

    const priceLabel = targetRes.pricing.isFree
      ? lang === 'fa'
        ? 'رایگان'
        : 'Free'
      : `€${option.totalEstimatedEur}`;
    const bookingId = created[0].id;

    return {
      authorized: true,
      mutatedState: true,
      matchedCommunityId: community.id,
      matchedCommunityNameFa: community.nameFa,
      matchedCommunityNameEn: community.name,
      privacyBadgeFa: 'رزرو قطعی با هویت مخفی · بدون پیام در گروه',
      privacyBadgeEn: 'Confirmed Pseudonymously · Zero Group Leak',
      replyText:
        lang === 'fa'
          ? `✅ ${option.requiresManualApproval ? 'درخواست رزرو ثبت شد (در انتظار تأیید مالک)' : 'رزرو پارکینگ شما قطعی شد!'}\n\n🅿️ جایگاه: ${targetRes.code} (طبقه ${targetRes.floorOrZone})\n🏢 ساختمان: ${targetComm.nameFa}\n🕒 ساعت: ${formatMinutes(startMin)} تا ${formatMinutes(endMin)}\n💳 هزینه: ${priceLabel}\n🔐 حریم خصوصی: هویت شما فقط به صورت «${pseudoName}» ثبت شد و هیچ پیامی در گروه ساختمان ارسال نشد.`
          : `✅ ${option.requiresManualApproval ? 'Booking request sent (awaiting owner approval)' : 'Your parking spot is confirmed!'}\n\n🅿️ Bay: ${targetRes.code} (${targetRes.floorOrZone})\n🏢 Building: ${targetComm.name}\n🕒 Window: ${formatMinutes(startMin)} – ${formatMinutes(endMin)}\n💳 Cost: ${priceLabel}\n🔐 Privacy: Stored as "${pseudoName}" — nothing was posted to the building group.`,
      buttons: [
        { id: `cancel:${bookingId}`, title: lang === 'fa' ? 'لغو این رزرو' : 'Cancel Booking' },
        { id: 'cmd:my_bookings', title: lang === 'fa' ? 'رزروهای من' : 'My Bookings' },
        { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Menu' },
      ],
    };
  }

  // 3. HANDLE CANCEL BOOKING ("cancel:<reservationId>" or text "لغو" / "cancel")
  if (action.startsWith('cancel:') || /^(لغو|کنسل|cancel)\b/i.test(lower)) {
    const requestedId = action.startsWith('cancel:') ? action.slice(7) : null;
    const myActive = ctx.reservations.filter(
      (r) =>
        r.requesterId === requester.id &&
        (r.status === 'Confirmed' || r.status === 'Pending' || r.status === 'Active')
    );
    const target = requestedId
      ? myActive.find((r) => r.id === requestedId)
      : myActive[0];

    if (!target) {
      return {
        authorized: true,
        mutatedState: mutated,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'چت خصوصی ۱ به ۱',
        privacyBadgeEn: 'Private 1-on-1 Chat',
        replyText:
          lang === 'fa'
            ? 'شما در حال حاضر رزرو فعالی برای لغو ندارید.'
            : 'You do not have any active bookings to cancel.',
        buttons: [
          { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو پارکینگ' : 'Book Parking' },
          { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' },
        ],
      };
    }

    ctx.reservations = ctx.reservations.map((r) =>
      r.id === target.id ? { ...r, status: 'Cancelled' } : r
    );
    const bay = ctx.resources.find((r) => r.id === target.resourceId);
    ctx.notifications.unshift(
      createNotificationEvent(
        'booking_cancelled',
        bay?.code ?? target.resourceId,
        formatMinutes(target.startMin),
        formatMinutes(target.endMin),
        ts
      )
    );

    return {
      authorized: true,
      mutatedState: true,
      matchedCommunityId: community.id,
      matchedCommunityNameFa: community.nameFa,
      matchedCommunityNameEn: community.name,
      privacyBadgeFa: 'لغو آنی و همگام با پنل',
      privacyBadgeEn: 'Cancelled & Synced Live',
      replyText:
        lang === 'fa'
          ? `🗑️ رزرو جایگاه ${bay?.code ?? ''} (${formatMinutes(target.startMin)} تا ${formatMinutes(target.endMin)}) با موفقیت لغو شد و جایگاه دوباره برای همسایه‌ها آزاد شد.`
          : `🗑️ Booking on bay ${bay?.code ?? ''} (${formatMinutes(target.startMin)}–${formatMinutes(target.endMin)}) has been cancelled and released back to neighbors.`,
      buttons: [
        { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو جدید' : 'New Booking' },
        { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' },
      ],
    };
  }

  // 4. HANDLE SHARE MY OWN BAY ("cmd:share_my_bay", "آزاد 8 تا 18", "share 09-17", "توقف اشتراک")
  if (
    action === 'cmd:share_my_bay' ||
    action === 'cmd:pause_my_bay' ||
    /(آزاد|اشتراک|خالیه|خالی است|share|offer|توقف)/i.test(lower)
  ) {
    const isPause = action === 'cmd:pause_my_bay' || /(توقف|غیرفعال|pause|stop)/i.test(lower);
    const ownBay = ctx.resources.find(
      (r) =>
        r.communityId === community.id &&
        r.code.toUpperCase() === rosterMatch.bayCode.toUpperCase()
    );

    if (!ownBay) {
      return {
        authorized: true,
        mutatedState: mutated,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'چت خصوصی ۱ به ۱',
        privacyBadgeEn: 'Private 1-on-1 Chat',
        replyText:
          lang === 'fa'
            ? `جایگاه اختصاصی شما (${rosterMatch.bayCode}) هنوز در بانک پارکینگ‌های ساختمان فعال نشده است.`
            : `Your assigned bay (${rosterMatch.bayCode}) is not listed in the building catalog yet.`,
        buttons: [{ id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' }],
      };
    }

    if (isPause) {
      ctx.resources = ctx.resources.map((r) =>
        r.id === ownBay.id
          ? { ...r, active: false, sharingEnabled: false, lifecycleStatus: 'inactive' }
          : r
      );
      return {
        authorized: true,
        mutatedState: true,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'اشتراک‌گذاری متوقف شد',
        privacyBadgeEn: 'Sharing Paused',
        replyText:
          lang === 'fa'
            ? `⏸️ اشتراک‌گذاری جایگاه ${ownBay.code} بلافاصله متوقف شد. هیچ همسایه‌ای دیگر نمی‌تواند آن را رزرو کند.`
            : `⏸️ Sharing for your bay ${ownBay.code} is now paused. It is hidden from new bookings immediately.`,
        buttons: [
          { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'فعال‌سازی مجدد' : 'Resume Sharing' },
          { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' },
        ],
      };
    }

    const parsedWindow = parseTimeRange(trimmed) ?? { startMin: 480, endMin: 1080 };
    ctx.resources = ctx.resources.map((r) =>
      r.id === ownBay.id
        ? {
            ...r,
            active: true,
            sharingEnabled: true,
            lifecycleStatus: 'active',
            declaredAvailability: [parsedWindow],
          }
        : r
    );
    ctx.privacyAudits.unshift({
      id: `aud-wa-shr-${Date.now()}`,
      communityId: community.id,
      timestamp: ts,
      category: 'pii_masked',
      summaryFa: `اشتراک خصوصی جایگاه ${ownBay.code} از طریق واتساپ (${formatMinutes(parsedWindow.startMin)}–${formatMinutes(parsedWindow.endMin)}) فعال شد؛ بدون اعلام غیبت مالک در گروه.`,
      summaryEn: `Private bay share activated via WhatsApp for ${ownBay.code} (${formatMinutes(parsedWindow.startMin)}–${formatMinutes(parsedWindow.endMin)}) with zero group absence notice.`,
      proofTag: 'WA-PRIVATE-SHARE',
    });

    return {
      authorized: true,
      mutatedState: true,
      matchedCommunityId: community.id,
      matchedCommunityNameFa: community.nameFa,
      matchedCommunityNameEn: community.name,
      privacyBadgeFa: 'ثبت خصوصی · غیبت شما در گروه اعلام نشد',
      privacyBadgeEn: 'Private Share · Absence Never Posted',
      replyText:
        lang === 'fa'
          ? `✅ جایگاه ${ownBay.code} شما برای امروز از ساعت ${formatMinutes(parsedWindow.startMin)} تا ${formatMinutes(parsedWindow.endMin)} در دسترس همسایه‌های تأییدشده قرار گرفت.\n\n🛡️ اطمینان حریم خصوصی: این زمان فقط به صورت ناشناس در موتور رزرو قرار گرفت و هیچ اعلانی از نبودن شما در گروه واتساپ ساختمان فرستاده نشد.`
          : `✅ Your bay ${ownBay.code} is now available to verified neighbors today from ${formatMinutes(parsedWindow.startMin)} to ${formatMinutes(parsedWindow.endMin)}.\n\n🛡️ GDPR Privacy: Listed pseudonymously only — your absence is never broadcast in the building group.`,
      buttons: [
        { id: 'cmd:pause_my_bay', title: lang === 'fa' ? 'توقف اشتراک' : 'Pause Sharing' },
        { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' },
      ],
    };
  }

  // 5. HANDLE MY BOOKINGS ("cmd:my_bookings" or "رزروهای من" / "bookings")
  if (action === 'cmd:my_bookings' || /(رزروهای من|رزرو من|my booking|bookings)/i.test(lower)) {
    const myActive = ctx.reservations.filter(
      (r) =>
        r.requesterId === requester.id &&
        (r.status === 'Confirmed' || r.status === 'Pending' || r.status === 'Active')
    );

    if (myActive.length === 0) {
      return {
        authorized: true,
        mutatedState: mutated,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'چت خصوصی ۱ به ۱',
        privacyBadgeEn: 'Private 1-on-1 Chat',
        replyText:
          lang === 'fa'
            ? `📋 شما در حال حاضر رزرو فعالی در ${commLabel} ندارید.\nبرای پیدا کردن جای پارک، مثلاً بنویسید: «رزرو 9 تا 17»`
            : `📋 You have no active bookings in ${commLabel}.\nTo find a bay, just reply e.g. "book 09:00-17:00".`,
        buttons: [
          { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو ۹ تا ۱۷' : 'Book 09:00–17:00' },
          { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'اشتراک جای پارک من' : 'Share My Bay' },
        ],
      };
    }

    const lines = myActive.slice(0, 3).map((r, i) => {
      const bay = ctx.resources.find((res) => res.id === r.resourceId);
      return `${i + 1}. 🅿️ ${bay?.code ?? r.resourceId} (${bay?.floorOrZone ?? ''}) · ${formatMinutes(r.startMin)}–${formatMinutes(r.endMin)} · ${r.status}`;
    });

    return {
      authorized: true,
      mutatedState: mutated,
      matchedCommunityId: community.id,
      matchedCommunityNameFa: community.nameFa,
      matchedCommunityNameEn: community.name,
      privacyBadgeFa: 'چت خصوصی ۱ به ۱',
      privacyBadgeEn: 'Private 1-on-1 Chat',
      replyText:
        lang === 'fa'
          ? `📋 رزروهای فعال شما:\n\n${lines.join('\n')}`
          : `📋 Your active bookings:\n\n${lines.join('\n')}`,
      buttons: [
        {
          id: `cancel:${myActive[0].id}`,
          title: lang === 'fa' ? 'لغو رزرو اول' : 'Cancel Top Booking',
        },
        { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو جدید' : 'New Booking' },
        { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Menu' },
      ],
    };
  }

  // 6. HANDLE QUOTA & GDPR PRIVACY ("cmd:quota_privacy" or "سهمیه" / "حریم" / "privacy" / "quota")
  if (
    action === 'cmd:quota_privacy' ||
    /(سهمیه|قانون|حریم|خصوصی|quota|privacy|gdpr)/i.test(lower)
  ) {
    const fu = community.fairUsePolicy;
    const used = requester.tempUsageThisMonth?.daysUsed ?? 0;
    const remaining = Math.max(0, fu.maxDaysPerMonth - used);

    return {
      authorized: true,
      mutatedState: mutated,
      matchedCommunityId: community.id,
      matchedCommunityNameFa: community.nameFa,
      matchedCommunityNameEn: community.name,
      privacyBadgeFa: 'تضمین GDPR · داده فقط در ساختمان',
      privacyBadgeEn: 'GDPR Guaranteed · Tenant Isolated',
      replyText:
        lang === 'fa'
          ? `⚖️ سهمیه منصفانه پارکینگ موقت (${commLabel}):\n• مصرف این ماه: ${used} از ${fu.maxDaysPerMonth} روز (باقیمانده: ${remaining} روز)\n• سقف هر رزرو: حداکثر ${fu.maxHoursPerBooking} ساعت\n• حداکثر روزهای پیاپی: ${fu.maxConsecutiveDays} روز\n\n🛡️ حریم خصوصی GDPR:\n• تمام رزروها در چت خصوصی ۱ به ۱ انجام می‌شود و هیچ پیامی در گروه واتساپ ساختمان ارسال نمی‌شود.\n• نام، واحد و شماره شما هرگز برای سایر همسایه‌ها نمایش داده نمی‌شود.`
          : `⚖️ Fair-Use Temporary Parking Quota (${commLabel}):\n• Monthly usage: ${used} / ${fu.maxDaysPerMonth} days (${remaining} remaining)\n• Max per booking: ${fu.maxHoursPerBooking} hours\n• Max consecutive days: ${fu.maxConsecutiveDays} days\n\n🛡️ European GDPR Privacy:\n• All requests happen privately 1-on-1 — nothing is posted to your building WhatsApp group.\n• Your name, unit, and phone are never disclosed to other neighbors.`,
      buttons: [
        { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو پارکینگ' : 'Find Parking' },
        { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'اشتراک جای پارک من' : 'Share My Bay' },
      ],
    };
  }

  // 7. HANDLE SEARCH / BOOKING REQUEST ("cmd:book_today", "cmd:book_evening", or natural time range / "رزرو" / "book")
  const explicitRange = parseTimeRange(trimmed);
  if (
    action === 'cmd:book_today' ||
    action === 'cmd:book_evening' ||
    explicitRange !== null ||
    /(رزرو|جای پارک|پارکینگ|جستجو|می‌خوام|میخوام|لازم دارم|book|park|spot|bay|find|free|ev)/i.test(lower)
  ) {
    const window =
      action === 'cmd:book_evening'
        ? { startMin: 1020, endMin: 1320 }
        : explicitRange ?? { startMin: 540, endMin: 1020 };

    const freeOnly = /(رایگان|مجانی|free)/i.test(lower);
    const requireEv = /(برقی|شارژ|شارژر|\bev\b)/i.test(lower);

    const pipeline = runSmartMatchingPipeline(
      {
        requester,
        resourceType: 'parking',
        startMin: window.startMin,
        endMin: window.endMin,
        includeFederated: community.federationEnabled,
        freeOnly,
        instantApprovalOnly: false,
        preferredFloor: 'ANY',
        requireEvOrPower: requireEv,
        requireAccessible: false,
        weights: DEFAULT_RANKING_WEIGHTS,
        networkOffline: false,
      },
      ctx.resources,
      ctx.communities,
      ctx.reservations
    );

    const topContinuous = pipeline.schedules.filter((s) => s.type === 'continuous').slice(0, 3);

    if (topContinuous.length === 0) {
      return {
        authorized: true,
        mutatedState: mutated,
        matchedCommunityId: community.id,
        matchedCommunityNameFa: community.nameFa,
        matchedCommunityNameEn: community.name,
        privacyBadgeFa: 'چت خصوصی ۱ به ۱',
        privacyBadgeEn: 'Private 1-on-1 Chat',
        replyText:
          lang === 'fa'
            ? `😕 برای بازه ${formatMinutes(window.startMin)} تا ${formatMinutes(window.endMin)} در ${commLabel} جای پارک خالی مطابق فیلتر شما پیدا نشد.\n\nمی‌توانید بازه زمانی دیگری بفرستید (مثلاً «رزرو 14 تا 20») یا گزینه عصر را امتحان کنید.`
            : `😕 No available bays matched ${formatMinutes(window.startMin)}–${formatMinutes(window.endMin)} in ${commLabel}.\n\nTry another window (e.g. "book 14:00-20:00") or check evening slots.`,
        buttons: [
          { id: 'cmd:book_evening', title: lang === 'fa' ? 'بررسی ۱۷ تا ۲۲' : 'Check 17:00–22:00' },
          { id: 'cmd:menu', title: lang === 'fa' ? 'منوی اصلی' : 'Main Menu' },
        ],
      };
    }

    const lines = topContinuous.map((opt, idx) => {
      const seg = opt.segments[0];
      const r = seg.resource;
      const priceStr = r.pricing.isFree
        ? lang === 'fa'
          ? 'رایگان'
          : 'Free'
        : `€${opt.totalEstimatedEur}`;
      const apprStr =
        r.approvalMode === 'automatic'
          ? lang === 'fa'
            ? 'تأیید فوری'
            : 'Instant'
          : lang === 'fa'
            ? 'تأیید مالک'
            : 'Owner approval';
      const evStr = r.evCharging ? ' · ⚡EV' : '';
      return `${idx + 1}. 🅿️ ${r.code} (${r.floorOrZone}) · ${priceStr} · ${apprStr}${evStr}`;
    });

    const quickButtons: WhatsAppQuickReplyButton[] = topContinuous.slice(0, 3).map((opt) => {
      const seg = opt.segments[0];
      return {
        id: `book:${seg.resource.id}:${window.startMin}:${window.endMin}`,
        title:
          lang === 'fa'
            ? `رزرو ${seg.resource.code}`
            : `Book ${seg.resource.code}`,
      };
    });

    return {
      authorized: true,
      mutatedState: mutated,
      matchedCommunityId: community.id,
      matchedCommunityNameFa: community.nameFa,
      matchedCommunityNameEn: community.name,
      privacyBadgeFa: 'نتایج ناشناس · بدون نمایش مشخصات مالک',
      privacyBadgeEn: 'Anonymized Matches · Zero Owner PII',
      replyText:
        lang === 'fa'
          ? `🔎 بهترین جایگاه‌های آزاد برای ${formatMinutes(window.startMin)} تا ${formatMinutes(window.endMin)} در ${commLabel}:\n\n${lines.join('\n')}\n\nبرای رزرو فوری با هویت مخفی، روی دکمه جایگاه دلخواه بزنید:`
          : `🔎 Best available bays for ${formatMinutes(window.startMin)}–${formatMinutes(window.endMin)} in ${commLabel}:\n\n${lines.join('\n')}\n\nTap a bay below to confirm pseudonymously:`,
      buttons: quickButtons,
    };
  }

  // 8. DEFAULT WELCOME / MAIN MENU
  return {
    authorized: true,
    mutatedState: mutated,
    matchedCommunityId: community.id,
    matchedCommunityNameFa: community.nameFa,
    matchedCommunityNameEn: community.name,
    privacyBadgeFa: 'احرازشده با لیست مدیر · چت خصوصی GDPR',
    privacyBadgeEn: 'Whitelist Verified · Private GDPR Chat',
    replyText:
      lang === 'fa'
        ? `👋 سلام! به دستیار خصوصی واتساپ ParkShare برای «${commLabel}» خوش آمدید.\n\n🔐 این گفتگو کاملاً خصوصی (۱ به ۱) است؛ شماره، واحد و زمان رفت‌وآمد شما هرگز در گروه ساختمان نمایش داده نمی‌شود.\n\nمی‌توانید مستقیم بنویسید (مثلاً «رزرو 9 تا 17» یا «آزاد 8 تا 18») یا یکی از گزینه‌های زیر را بزنید:`
        : `👋 Welcome to the private ParkShare WhatsApp assistant for "${commLabel}".\n\n🔐 This chat is 1-on-1 & GDPR-private — your phone, unit, and schedule are never posted in the building group.\n\nType a time like "book 09:00-17:00" or "share 08:00-18:00", or tap an option:`,
    buttons: [
      { id: 'cmd:book_today', title: lang === 'fa' ? 'رزرو ۹ تا ۱۷' : 'Book 09:00–17:00' },
      { id: 'cmd:share_my_bay', title: lang === 'fa' ? 'اشتراک جای پارک من' : 'Share My Bay' },
      { id: 'cmd:my_bookings', title: lang === 'fa' ? 'رزروهای من' : 'My Bookings' },
    ],
  };
}
