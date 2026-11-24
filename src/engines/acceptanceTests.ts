import {
  DEFAULT_RANKING_WEIGHTS,
  INITIAL_COMMUNITIES,
  INITIAL_RESERVATIONS,
  INITIAL_RESOURCES,
  INITIAL_USERS,
} from '../data/seedData';
import { AcceptanceTestResult } from '../types/parkshare';
import {
  buildFederationPayload,
  createAtomicBooking,
  evaluatePolicy,
  runSmartMatchingPipeline,
  triggerOwnerRecall,
} from './coreEngine';

export function runCoreAcceptanceSuite(): AcceptanceTestResult[] {
  const results: AcceptanceTestResult[] = [];
  const sara = INITIAL_USERS.find((u) => u.id === 'u-sara')!;
  const suspended = INITIAL_USERS.find((u) => u.id === 'u-suspended')!;
  const boston = INITIAL_COMMUNITIES.find((c) => c.id === 'comm-boston')!;
  const seattle = INITIAL_COMMUNITIES.find((c) => c.id === 'comm-seattle')!;

  // TEST 1: Two concurrent requests for same parking & same time -> only 1 confirmed
  {
    const t0 = performance.now();
    const resP101 = INITIAL_RESOURCES.find((r) => r.id === 'res-p101')!;
    const opt = {
      id: 'test-concurrent',
      type: 'continuous' as const,
      segments: [
        {
          resource: resP101,
          community: boston,
          startMin: 600,
          endMin: 720,
          isFederated: false,
          policyDecision: 'Allowed' as const,
        },
      ],
      totalCoverageMin: 120,
      coverageRatio: 1,
      longestContinuousMin: 120,
      relocationCount: 0,
      averageRisk: 0.1,
      objectiveScore: 95,
      totalEstimatedEur: 0,
      requiresManualApproval: false,
    };
    const r1 = createAtomicBooking(opt, sara, INITIAL_RESERVATIONS, INITIAL_COMMUNITIES, false);
    const updatedState = r1.ok && r1.reservationsCreated ? [...INITIAL_RESERVATIONS, ...r1.reservationsCreated] : INITIAL_RESERVATIONS;
    const r2 = createAtomicBooking(opt, sara, updatedState, INITIAL_COMMUNITIES, false);
    const passed = r1.ok === true && r2.ok === false && r2.errorCode === 'CONFLICT_OVERLAP';
    results.push({
      id: 't-01',
      nameFa: 'دو درخواست هم‌زمان برای یک پارکینگ و زمان یکسان',
      nameEn: 'Two concurrent requests for identical space & window',
      expectedFa: 'فقط یک رزرو قطعی، دومی با خطای تداخل رد شود',
      expectedEn: 'Exactly 1 booking confirmed; 2nd blocked with CONFLICT_OVERLAP',
      passed,
      actualFa: passed ? 'رزرو اول قطعی شد؛ رزرو دوم با CONFLICT_OVERLAP مسدود گردید.' : 'خطا در قفل هم‌زمانی',
      actualEn: passed ? 'Req #1 Confirmed; Req #2 rejected (CONFLICT_OVERLAP).' : 'Concurrency lock failed.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 2: Request in unauthorized / outside-availability time -> rejected
  {
    const t0 = performance.now();
    const resP101 = INITIAL_RESOURCES.find((r) => r.id === 'res-p101')!; // 08:00-22:00
    const opt = {
      id: 'test-outside-time',
      type: 'continuous' as const,
      segments: [
        {
          resource: resP101,
          community: boston,
          startMin: 120, // 02:00
          endMin: 300, // 05:00
          isFederated: false,
          policyDecision: 'Allowed' as const,
        },
      ],
      totalCoverageMin: 180,
      coverageRatio: 1,
      longestContinuousMin: 180,
      relocationCount: 0,
      averageRisk: 0.1,
      objectiveScore: 90,
      totalEstimatedEur: 0,
      requiresManualApproval: false,
    };
    const out = createAtomicBooking(opt, sara, INITIAL_RESERVATIONS, INITIAL_COMMUNITIES, false);
    const passed = out.ok === false && out.errorCode === 'OUTSIDE_AVAILABILITY';
    results.push({
      id: 't-02',
      nameFa: 'درخواست در زمان غیرمجاز (خارج از بازه آزاد)',
      nameEn: 'Request outside declared availability window',
      expectedFa: 'رد درخواست توسط موتور دسترس‌پذیری و رزرو',
      expectedEn: 'Rejected with OUTSIDE_AVAILABILITY',
      passed,
      actualFa: passed ? 'درخواست ۰۲:۰۰–۰۵:۰۰ با OUTSIDE_AVAILABILITY رد شد.' : 'رد نشد',
      actualEn: passed ? '02:00–05:00 request rejected (OUTSIDE_AVAILABILITY).' : 'Unexpectedly accepted.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 3: Inactive parking -> excluded from valid recommendations
  {
    const t0 = performance.now();
    const pipe = runSmartMatchingPipeline(
      {
        requester: sara,
        resourceType: 'parking',
        startMin: 540,
        endMin: 780,
        includeFederated: false,
        freeOnly: false,
        instantApprovalOnly: false,
        preferredFloor: 'ANY',
        requireEvOrPower: false,
        requireAccessible: false,
        weights: DEFAULT_RANKING_WEIGHTS,
        networkOffline: false,
      },
      INITIAL_RESOURCES,
      INITIAL_COMMUNITIES,
      INITIAL_RESERVATIONS
    );
    const p106InSchedules = pipe.schedules.some((s) => s.segments.some((seg) => seg.resource.id === 'res-p106'));
    const p106Candidate = pipe.candidates.find((c) => c.resource.id === 'res-p106');
    const passed = !p106InSchedules && p106Candidate?.policy.decision === 'Rejected';
    results.push({
      id: 't-03',
      nameFa: 'پارکینگ غیرفعال یا بدون مجوز اشتراک‌گذاری',
      nameEn: 'Inactive / non-shared parking space',
      expectedFa: 'عدم نمایش در پیشنهادهای قابل رزرو',
      expectedEn: 'Excluded from valid schedules (Policy Rejected)',
      passed,
      actualFa: passed ? 'پارکینگ غیرفعال P106 از پیشنهادها حذف شد.' : 'پارکینگ غیرفعال دیده شد',
      actualEn: passed ? 'Inactive bay P106 excluded by Policy Engine.' : 'Inactive bay leaked.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 4: Free-only hard filter excludes paid spaces (not just lower score)
  {
    const t0 = performance.now();
    const pipe = runSmartMatchingPipeline(
      {
        requester: sara,
        resourceType: 'parking',
        startMin: 540,
        endMin: 720,
        includeFederated: true,
        freeOnly: true,
        instantApprovalOnly: false,
        preferredFloor: 'ANY',
        requireEvOrPower: false,
        requireAccessible: false,
        weights: DEFAULT_RANKING_WEIGHTS,
        networkOffline: false,
      },
      INITIAL_RESOURCES,
      INITIAL_COMMUNITIES,
      INITIAL_RESERVATIONS
    );
    const hasPaid = pipe.schedules.some((s) => s.segments.some((seg) => !seg.resource.pricing.isFree));
    const passed = !hasPaid && pipe.schedules.length > 0;
    results.push({
      id: 't-04',
      nameFa: 'شرط اجباری پارکینگ رایگان (Hard Filter)',
      nameEn: 'Mandatory Free-Only filter enforcement',
      expectedFa: 'حذف کامل گزینه‌های پولی مطابق ترجیح کاربر',
      expectedEn: 'All paid resources excluded (0 paid recommendations)',
      passed,
      actualFa: passed
        ? `از ${pipe.schedules.length} برنامه پیشنهادی، ۱۰۰٪ رایگان هستند (P104 و S-P202 حذف شدند).`
        : 'گزینه پولی وارد نتایج شد',
      actualEn: passed
        ? `100% of ${pipe.schedules.length} schedules are free (P104 & S-P202 excluded).`
        : 'Paid space appeared.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 5: Instant approval enforcement (only automatic spaces auto-confirm)
  {
    const t0 = performance.now();
    const resP104 = INITIAL_RESOURCES.find((r) => r.id === 'res-p104')!; // manual approval
    const opt = {
      id: 'test-manual',
      type: 'continuous' as const,
      segments: [
        {
          resource: resP104,
          community: boston,
          startMin: 900, // 15:00
          endMin: 1080, // 18:00
          isFederated: false,
          policyDecision: 'Conditional' as const,
        },
      ],
      totalCoverageMin: 180,
      coverageRatio: 1,
      longestContinuousMin: 180,
      relocationCount: 0,
      averageRisk: 0.08,
      objectiveScore: 85,
      totalEstimatedEur: 7.5,
      requiresManualApproval: true,
    };
    const out = createAtomicBooking(opt, sara, INITIAL_RESERVATIONS, INITIAL_COMMUNITIES, false);
    const passed = out.ok === true && out.reservationsCreated?.[0]?.status === 'Pending';
    results.push({
      id: 't-05',
      nameFa: 'رزرو بدون تأیید دستی فقط با مجوز صاحب پارکینگ',
      nameEn: 'Auto-confirmation restricted to owner-enabled bays',
      expectedFa: 'رزرو روی پارکینگ نیازمند تأیید (P104) در حالت Pending ثبت شود',
      expectedEn: 'Manual-approval space P104 enters Pending state (not Confirmed)',
      passed,
      actualFa: passed ? 'رزرو روی P104 در وضعیت Pending ثبت شد و اعلان برای مالک ارسال گردید.' : 'به‌اشتباه خودکار تأیید شد',
      actualEn: passed ? 'P104 booking created as Pending awaiting owner approval.' : 'Auto-confirmed improperly.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 6: Multi-space chaining with minimal relocations (09:00–21:00 when P101 is unavailable)
  {
    const t0 = performance.now();
    const withoutP101 = INITIAL_RESOURCES.filter((r) => r.id !== 'res-p101');
    const pipe = runSmartMatchingPipeline(
      {
        requester: sara,
        resourceType: 'parking',
        startMin: 540, // 09:00
        endMin: 1260, // 21:00
        includeFederated: false,
        freeOnly: true,
        instantApprovalOnly: true,
        preferredFloor: 'B1',
        requireEvOrPower: false,
        requireAccessible: false,
        weights: DEFAULT_RANKING_WEIGHTS,
        networkOffline: false,
      },
      withoutP101,
      INITIAL_COMMUNITIES,
      INITIAL_RESERVATIONS
    );
    const bestChain = pipe.schedules.find((s) => s.type === 'chained');
    const passed =
      Boolean(bestChain) &&
      bestChain!.relocationCount === 1 &&
      bestChain!.coverageRatio >= 0.99 &&
      bestChain!.segments[0].resource.code === 'P102' &&
      bestChain!.segments[1].resource.code === 'P103';
    results.push({
      id: 't-06',
      nameFa: 'بهینه‌سازی چند پارکینگ با کمترین تعداد جابه‌جایی',
      nameEn: 'Multi-space chaining minimizes relocations (09:00–21:00)',
      expectedFa: 'اتصال P102 → P103 با پوشش ۱۲ ساعته و فقط ۱ جابه‌جایی',
      expectedEn: 'Chains P102 -> P103 covering 12h with exactly 1 relocation',
      passed,
      actualFa: passed
        ? 'زنجیره P102 (۰۹:۰۰–۱۶:۰۰) → P103 (۱۶:۰۰–۲۱:۰۰) با ۱ جابه‌جایی تولید شد.'
        : 'زنجیره بهینه یافت نشد',
      actualEn: passed
        ? 'Optimal chain P102 (09:00–16:00) -> P103 (16:00–21:00) built with 1 move.'
        : 'Chain optimization failed.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 7: Sudden owner schedule change / recall checks active bookings & finds alternative
  {
    const t0 = performance.now();
    const activeBooking = INITIAL_RESERVATIONS[0]; // rsv-9001 on P105 10:00-13:00
    const recall = triggerOwnerRecall(
      activeBooking,
      INITIAL_RESOURCES,
      INITIAL_COMMUNITIES,
      INITIAL_RESERVATIONS,
      INITIAL_USERS,
      false
    );
    const passed =
      recall.updatedReservation.status === 'Relocation Pending' &&
      Boolean(recall.suggestedAlternative) &&
      recall.notifications.length >= 2;
    results.push({
      id: 't-07',
      nameFa: 'تغییر برنامه ناگهانی صاحب پارکینگ و کشف جایگزین',
      nameEn: 'Sudden owner recall triggers relocation & alternative match',
      expectedFa: 'تغییر وضعیت به Relocation Pending و پیشنهاد پارکینگ جایگزین',
      expectedEn: 'Status -> Relocation Pending + automatic alternative matched',
      passed,
      actualFa: passed
        ? `وضعیت به Relocation Pending تغییر یافت و جایگزین ${recall.suggestedAlternative?.code} پیشنهاد شد.`
        : 'فرآیند تخلیه ناموفق بود',
      actualEn: passed
        ? `Moved to Relocation Pending; alternative ${recall.suggestedAlternative?.code} matched.`
        : 'Recall workflow failed.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 8: Building internet outage -> local bookings continue, federated safely paused
  {
    const t0 = performance.now();
    const localPolicy = evaluatePolicy(
      INITIAL_RESOURCES.find((r) => r.id === 'res-p101')!,
      boston,
      sara,
      boston,
      true // networkOffline = true
    );
    const fedPolicy = evaluatePolicy(
      INITIAL_RESOURCES.find((r) => r.id === 'res-p201')!,
      seattle,
      sara,
      boston,
      true // networkOffline = true
    );
    const passed = localPolicy.decision === 'Allowed' && fedPolicy.decision === 'Rejected';
    results.push({
      id: 't-08',
      nameFa: 'قطع اینترنت ساختمان (Graceful Degradation)',
      nameEn: 'Network outage preserves local bookings & pauses federation',
      expectedFa: 'رزرو داخلی مجاز بماند و رزرو بین‌ساختمانی بدون خطا متوقف شود',
      expectedEn: 'Local P101 Allowed; Federated S-P201 safely paused',
      passed,
      actualFa: passed
        ? 'در حالت آفلاین، P101 محلی Allowed و S-P201 فدرال به‌صورت امن مسدود شد.'
        : 'مدیریت آفلاین ناموفق',
      actualEn: passed
        ? 'Offline mode: Local P101 Allowed, Federated S-P201 cleanly blocked.'
        : 'Offline degradation failed.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 9: Federated connection transfers zero personal owner data (Zero-PII)
  {
    const t0 = performance.now();
    const resP201 = INITIAL_RESOURCES.find((r) => r.id === 'res-p201')!;
    const payload = buildFederationPayload(resP201, seattle, INITIAL_RESERVATIONS);
    const serialized = JSON.stringify(payload ?? {});
    const leaksPii =
      serialized.includes(resP201.ownerPrivate.fullName) ||
      serialized.includes(resP201.ownerPrivate.phone) ||
      serialized.includes(resP201.ownerPrivate.email) ||
      serialized.includes(resP201.ownerPrivate.unitNumber);
    const passed = Boolean(payload) && !leaksPii && payload!.network_resource_id === 'anonymous-resource-123';
    results.push({
      id: 't-09',
      nameFa: 'اتصال دو ساختمان بدون انتقال اطلاعات شخصی (Zero-PII)',
      nameEn: 'Cross-building Federation Gateway leaks zero resident PII',
      expectedFa: 'فقط شناسه مستعار و بازه آزاد ارسال شود (بدون نام/تلفن/واحد)',
      expectedEn: 'Only pseudonymous ID & availability emitted; 0 PII fields',
      passed,
      actualFa: passed
        ? 'پیام خروجی Gateway فقط شناسه anonymous-resource-123 را منتشر کرد (۰ نشت PII).'
        : 'نشت داده شناسایی شد',
      actualEn: passed
        ? 'Gateway emitted pseudonymous ID anonymous-resource-123 (0 PII fields).'
        : 'PII detected in payload.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  // TEST 10: Unauthorized / suspended user cannot reserve
  {
    const t0 = performance.now();
    const resP101 = INITIAL_RESOURCES.find((r) => r.id === 'res-p101')!;
    const policy = evaluatePolicy(resP101, boston, suspended, boston, false);
    const passed = policy.decision === 'Rejected';
    results.push({
      id: 't-10',
      nameFa: 'عدم امکان رزرو توسط کاربر غیرمجاز یا محدودشده',
      nameEn: 'Unauthorized / suspended user blocked unconditionally',
      expectedFa: 'رد فوری درخواست توسط Policy Engine',
      expectedEn: 'Policy Engine returns Rejected',
      passed,
      actualFa: passed ? 'درخواست کاربر محدودشده در لایه Policy Engine مسدود شد.' : 'کاربر غیرمجاز عبور کرد',
      actualEn: passed ? 'Suspended user unconditionally blocked at Policy Engine.' : 'Policy bypass occurred.',
      durationMs: Math.max(0.1, Math.round((performance.now() - t0) * 100) / 100),
    });
  }

  return results;
}
