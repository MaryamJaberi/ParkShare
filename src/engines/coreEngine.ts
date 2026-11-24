import type {
  CandidateEvaluation,
  CityMapResource,
  Community,
  CompatibilityCheck,
  CompatibilityEvaluation,
  FederationOfferPayload,
  MatchRequest,
  MatchingPipelineResult,
  NotificationEvent,
  NotificationEventType,
  OptimizedScheduleOption,
  PolicyDecision,
  PolicyEvaluation,
  PolicyRuleCheck,
  Reservation,
  ReservationStatus,
  Resource,
  RouteWeights,
  ScheduleSegment,
  TimeInterval,
  UserProfile,
} from '../types/parkshare.ts';
import { formatMinutes } from '../i18n/translations.ts';

const BLOCKING_STATUSES: ReservationStatus[] = ['Confirmed', 'Active', 'Relocation Pending'];

// ============================================================================
// ENGINE 1: POLICY ENGINE
// ============================================================================
export function evaluatePolicy(
  resource: Resource,
  community: Community,
  requester: UserProfile,
  requesterCommunity: Community | undefined,
  networkOffline: boolean
): PolicyEvaluation {
  const checks: PolicyRuleCheck[] = [];
  let rejected = false;
  let conditional = false;

  const isSameCommunity = requester.communityId === resource.communityId;
  const isFederated = !isSameCommunity;

  // 1. Resource active & sharing enabled
  if (!resource.active || !resource.sharingEnabled) {
    checks.push({
      rule: 'Resource Sharing Status',
      passed: false,
      detail: 'Resource is inactive or owner disabled sharing.',
    });
    rejected = true;
  } else {
    checks.push({
      rule: 'Resource Sharing Status',
      passed: true,
      detail: 'Owner enabled sharing and resource is active.',
    });
  }

  // 2. User restriction / suspension
  if (requester.suspended) {
    checks.push({
      rule: 'User Standing',
      passed: false,
      detail: 'User account has an active building restriction.',
    });
    rejected = true;
  } else {
    checks.push({
      rule: 'User Standing',
      passed: true,
      detail: 'User account is in good standing.',
    });
  }

  // 3. Federation connectivity (Graceful Degradation)
  if (isFederated) {
    if (networkOffline) {
      checks.push({
        rule: 'Federation Link',
        passed: false,
        detail: 'Network offline — cross-building reservations paused safely.',
      });
      rejected = true;
    } else {
      const federatedConnected =
        community.federationEnabled &&
        (resource.accessPolicy === 'public' ||
          (requesterCommunity?.federationEnabled &&
            community.connectedCommunityIds.includes(requesterCommunity.id)));
      checks.push({
        rule: 'Federation Link',
        passed: Boolean(federatedConnected),
        detail: federatedConnected
          ? `Federated trust verified with ${community.name}.`
          : 'No active federation trust or public access policy.',
      });
      if (!federatedConnected) rejected = true;
    }
  }

  // 4. Access policy vs requester role
  let accessOk = false;
  if (resource.accessPolicy === 'public') {
    accessOk = true;
  } else if (resource.accessPolicy === 'network_members') {
    accessOk = requester.role === 'resident' || requester.role === 'manager' || isSameCommunity;
  } else if (resource.accessPolicy === 'residents_and_guests') {
    accessOk = isSameCommunity && (requester.role === 'resident' || requester.role === 'guest' || requester.role === 'manager');
    if (accessOk && requester.role === 'guest') {
      conditional = true;
    }
  } else if (resource.accessPolicy === 'residents_only') {
    accessOk = isSameCommunity && (requester.role === 'resident' || requester.role === 'manager');
  }

  checks.push({
    rule: 'Access Policy',
    passed: accessOk,
    detail: accessOk
      ? `Policy (${resource.accessPolicy}) permits ${requester.role}.`
      : `Policy (${resource.accessPolicy}) rejects ${requester.role}.`,
  });
  if (!accessOk) rejected = true;

  // 5. Building floor / zone permission (for local building residents/guests)
  if (isSameCommunity && resource.type === 'parking') {
    const floorOk = requester.allowedFloors.includes(resource.floorOrZone);
    checks.push({
      rule: 'Floor / Zone Access',
      passed: floorOk,
      detail: floorOk
        ? `User badge allows floor ${resource.floorOrZone}.`
        : `Building rules restrict user access to floor ${resource.floorOrZone}.`,
    });
    if (!floorOk) rejected = true;
  }

  // 5b. Special accessible permit restriction (Scenario 5)
  if (!rejected && resource.accessRules?.specialPermitOnly && !requester.vehicle.needsAccessible && requester.role !== 'manager') {
    checks.push({
      rule: 'Special Access Permit',
      passed: false,
      detail: 'Bay is restricted to authorized accessible permit holders only.',
    });
    rejected = true;
  }

  // 6. Owner approval requirement
  if (!rejected && resource.approvalMode === 'manual') {
    conditional = true;
    checks.push({
      rule: 'Owner Approval',
      passed: true,
      detail: 'Requires explicit owner confirmation before locking.',
    });
  } else if (!rejected) {
    checks.push({
      rule: 'Owner Approval',
      passed: true,
      detail: 'Instant automatic approval enabled by owner.',
    });
  }

  const decision: PolicyDecision = rejected ? 'Rejected' : conditional ? 'Conditional' : 'Allowed';
  const summary =
    decision === 'Allowed'
      ? 'Request fully permitted by building and owner policy.'
      : decision === 'Conditional'
        ? 'Permitted subject to owner approval or guest verification.'
        : 'Blocked by mandatory building security or sharing policy.';

  return { decision, checks, summary };
}

// ============================================================================
// ENGINE 2: AVAILABILITY ENGINE
// ============================================================================
export function subtractInterval(slots: TimeInterval[], block: TimeInterval): TimeInterval[] {
  const result: TimeInterval[] = [];
  for (const slot of slots) {
    if (block.endMin <= slot.startMin || block.startMin >= slot.endMin) {
      result.push(slot);
    } else {
      if (block.startMin > slot.startMin) {
        result.push({ startMin: slot.startMin, endMin: block.startMin });
      }
      if (block.endMin < slot.endMin) {
        result.push({ startMin: block.endMin, endMin: slot.endMin });
      }
    }
  }
  return result.filter((s) => s.endMin - s.startMin >= 15);
}

export function computeAvailableIntervals(
  resource: Resource,
  reservations: Reservation[]
): TimeInterval[] {
  if (!resource.active || !resource.sharingEnabled) return [];

  let free: TimeInterval[] = resource.declaredAvailability.map((s) => ({ ...s }));

  // Subtract maintenance blocks
  for (const m of resource.maintenanceBlocks) {
    free = subtractInterval(free, { startMin: m.startMin, endMin: m.endMin });
  }

  // Subtract confirmed/active reservations + required buffer minutes
  const blocking = reservations.filter(
    (r) => r.resourceId === resource.id && BLOCKING_STATUSES.includes(r.status)
  );
  for (const r of blocking) {
    const paddedStart = Math.max(0, r.startMin - resource.bufferMinutes);
    const paddedEnd = Math.min(1440, r.endMin + resource.bufferMinutes);
    free = subtractInterval(free, { startMin: paddedStart, endMin: paddedEnd });
  }

  return free.sort((a, b) => a.startMin - b.startMin);
}

export function getMaxContinuousOverlap(
  availableSlots: TimeInterval[],
  reqStart: number,
  reqEnd: number
): { coversFull: boolean; maxOverlapMin: number; clippedSlots: TimeInterval[] } {
  const clippedSlots: TimeInterval[] = [];
  let maxOverlapMin = 0;

  for (const slot of availableSlots) {
    const s = Math.max(slot.startMin, reqStart);
    const e = Math.min(slot.endMin, reqEnd);
    if (e > s) {
      clippedSlots.push({ startMin: s, endMin: e });
      if (e - s > maxOverlapMin) {
        maxOverlapMin = e - s;
      }
    }
  }

  const coversFull = maxOverlapMin >= reqEnd - reqStart;
  return { coversFull, maxOverlapMin, clippedSlots };
}

// ============================================================================
// ENGINE 3: COMPATIBILITY ENGINE (Universal Resource Extensible)
// ============================================================================
export function evaluateCompatibility(
  resource: Resource,
  req: MatchRequest
): CompatibilityEvaluation {
  const checks: CompatibilityCheck[] = [];

  if (resource.type === 'parking') {
    const v = req.requester.vehicle;
    const typeOk = !resource.allowedVehicleTypes || resource.allowedVehicleTypes.includes(v.type);
    checks.push({
      criterion: 'Vehicle Type',
      passed: typeOk,
      required: v.type,
      actual: resource.allowedVehicleTypes?.join(', ') || 'any',
    });

    const heightOk = resource.dimensions.heightOrDepthM >= v.heightM;
    checks.push({
      criterion: 'Height Clearance',
      passed: heightOk,
      required: `>= ${v.heightM.toFixed(2)}m`,
      actual: `${resource.dimensions.heightOrDepthM.toFixed(2)}m`,
    });

    const widthOk = resource.dimensions.widthM >= v.widthM + 0.2;
    checks.push({
      criterion: 'Width Fit',
      passed: widthOk,
      required: `>= ${(v.widthM + 0.2).toFixed(2)}m`,
      actual: `${resource.dimensions.widthM.toFixed(2)}m`,
    });

    const lengthOk = resource.dimensions.lengthM >= v.lengthM;
    checks.push({
      criterion: 'Length Fit',
      passed: lengthOk,
      required: `>= ${v.lengthM.toFixed(2)}m`,
      actual: `${resource.dimensions.lengthM.toFixed(2)}m`,
    });

    if (req.requireEvOrPower || v.needsEv) {
      checks.push({
        criterion: 'EV Charging',
        passed: Boolean(resource.evCharging),
        required: 'Required',
        actual: resource.evCharging ? 'Available' : 'None',
      });
    }

    if (req.requireAccessible || v.needsAccessible) {
      checks.push({
        criterion: 'Accessibility',
        passed: Boolean(resource.accessible),
        required: 'Accessible Bay',
        actual: resource.accessible ? 'Accessible' : 'Standard',
      });
    }
  } else if (resource.type === 'boat_berth') {
    const vessel = req.requester.vessel ?? {
      type: 'motorboat',
      lengthM: 9.0,
      beamM: 3.0,
      draftM: 1.5,
      needsShorePower: false,
    };

    const typeOk = !resource.allowedVesselTypes || resource.allowedVesselTypes.includes(vessel.type);
    checks.push({
      criterion: 'Vessel Type',
      passed: typeOk,
      required: vessel.type,
      actual: resource.allowedVesselTypes?.join(', ') || 'any',
    });

    checks.push({
      criterion: 'Berth Length',
      passed: resource.dimensions.lengthM >= vessel.lengthM,
      required: `>= ${vessel.lengthM.toFixed(1)}m`,
      actual: `${resource.dimensions.lengthM.toFixed(1)}m`,
    });

    checks.push({
      criterion: 'Beam Width',
      passed: resource.dimensions.widthM >= vessel.beamM,
      required: `>= ${vessel.beamM.toFixed(1)}m`,
      actual: `${resource.dimensions.widthM.toFixed(1)}m`,
    });

    checks.push({
      criterion: 'Water Depth (Draft)',
      passed: resource.dimensions.heightOrDepthM >= vessel.draftM + 0.2,
      required: `>= ${(vessel.draftM + 0.2).toFixed(1)}m`,
      actual: `${resource.dimensions.heightOrDepthM.toFixed(1)}m`,
    });

    if (req.requireEvOrPower || vessel.needsShorePower) {
      checks.push({
        criterion: 'Shore Power',
        passed: Boolean(resource.shorePower),
        required: 'Required',
        actual: resource.shorePower ? 'Connected' : 'None',
      });
    }
  } else {
    const minArea = req.minAreaSqm ?? 10;
    const area = resource.dimensions.areaSqm ?? resource.dimensions.lengthM * resource.dimensions.widthM;
    checks.push({
      criterion: 'Floor Area',
      passed: area >= minArea,
      required: `>= ${minArea} m²`,
      actual: `${area.toFixed(1)} m²`,
    });
    if (req.requireEvOrPower && resource.type === 'storage') {
      checks.push({
        criterion: 'Climate Control',
        passed: Boolean(resource.climateControlled),
        required: 'Required',
        actual: resource.climateControlled ? 'Controlled' : 'Standard',
      });
    }
  }

  return {
    compatible: checks.every((c) => c.passed),
    checks,
  };
}

// ============================================================================
// ENGINE 4: MATCHING & RANKING ENGINE
// ============================================================================
export function runSmartMatchingPipeline(
  req: MatchRequest,
  resources: Resource[],
  communities: Community[],
  reservations: Reservation[]
): MatchingPipelineResult {
  const communityMap = new Map(communities.map((c) => [c.id, c]));
  const requesterCommunity = req.requester.communityId
    ? communityMap.get(req.requester.communityId)
    : undefined;

  const requestedDuration = Math.max(15, req.endMin - req.startMin);
  const typedResources = resources.filter((r) => r.type === req.resourceType);

  let federatedScanned = 0;
  let policyAllowedOrConditional = 0;
  let compatibleCount = 0;
  let availableForWindow = 0;

  const candidates: CandidateEvaluation[] = [];

  for (const resource of typedResources) {
    const community = communityMap.get(resource.communityId);
    if (!community) continue;

    const isFederated = resource.communityId !== req.requester.communityId;
    if (isFederated && !req.includeFederated) continue;
    if (isFederated) federatedScanned++;

    // Engine 1: Policy
    const policy = evaluatePolicy(resource, community, req.requester, requesterCommunity, req.networkOffline);
    if (policy.decision !== 'Rejected') policyAllowedOrConditional++;

    // Engine 2: Availability
    const availableSlots = computeAvailableIntervals(resource, reservations);
    const overlap = getMaxContinuousOverlap(availableSlots, req.startMin, req.endMin);
    if (overlap.maxOverlapMin > 0) availableForWindow++;

    // Engine 3: Compatibility
    const compatibility = evaluateCompatibility(resource, req);
    if (compatibility.compatible) compatibleCount++;

    // Hard preference filters (Section 5: Free Only must remove paid options!)
    let passedHardFilters = true;
    let hardFilterReason: string | undefined;

    if (policy.decision === 'Rejected') {
      passedHardFilters = false;
      hardFilterReason = 'Policy Rejected';
    } else if (!compatibility.compatible) {
      passedHardFilters = false;
      hardFilterReason = 'Incompatible Dimensions/Specs';
    } else if (req.freeOnly && !resource.pricing.isFree) {
      passedHardFilters = false;
      hardFilterReason = 'Paid Resource Excluded (Free-Only Filter)';
    } else if (req.instantApprovalOnly && resource.approvalMode !== 'automatic') {
      passedHardFilters = false;
      hardFilterReason = 'Manual Approval Excluded';
    } else if (overlap.maxOverlapMin === 0) {
      passedHardFilters = false;
      hardFilterReason = 'No Overlap With Requested Time Window';
    }

    // Engine 4: Weighted Score = sum(w_i * s_i) / sum(w_i) * 100
    const w = req.weights;
    const totalWeight =
      Math.max(
        1,
        w.continuousDuration +
          w.freePricing +
          w.instantApproval +
          w.preferredFloor +
          w.elevatorProximity +
          w.lowRecallRisk
      );

    const sContinuous = Math.min(1, overlap.maxOverlapMin / requestedDuration);
    const sFree = resource.pricing.isFree ? 1 : Math.max(0, 1 - resource.pricing.hourlyEur / 8);
    const sInstant = resource.approvalMode === 'automatic' ? 1 : 0.25;
    const sFloor =
      !req.preferredFloor || req.preferredFloor === 'ANY' || resource.floorOrZone === req.preferredFloor
        ? 1
        : 0.35;
    const sElevator = resource.nearElevatorOrDock ? 1 : 0.4;
    const sLowRisk = Math.max(0, 1 - resource.recallRiskScore);

    const rawScore =
      ((w.continuousDuration * sContinuous +
        w.freePricing * sFree +
        w.instantApproval * sInstant +
        w.preferredFloor * sFloor +
        w.elevatorProximity * sElevator +
        w.lowRecallRisk * sLowRisk) /
        totalWeight) *
      100;

    candidates.push({
      resource,
      community,
      isFederated,
      policy,
      availableSlots,
      coversFullWindow: overlap.coversFull,
      maxContinuousOverlapMin: overlap.maxOverlapMin,
      compatibility,
      passedHardFilters,
      hardFilterReason,
      score: Math.round(rawScore * 10) / 10,
      scoreBreakdown: {
        continuousDuration: Math.round(sContinuous * 100),
        freePricing: Math.round(sFree * 100),
        instantApproval: Math.round(sInstant * 100),
        preferredFloor: Math.round(sFloor * 100),
        elevatorProximity: Math.round(sElevator * 100),
        lowRecallRisk: Math.round(sLowRisk * 100),
        recallRiskMasked: resource.hideRecallRiskFromPublic,
      },
    });
  }

  candidates.sort((a, b) => {
    if (a.passedHardFilters !== b.passedHardFilters) return a.passedHardFilters ? -1 : 1;
    return b.score - a.score;
  });

  // Engine 5: Scheduling Optimizer
  const schedules = optimizeSchedules(candidates, req.startMin, req.endMin);

  return {
    candidates,
    schedules,
    filteredSummary: {
      totalScanned: typedResources.length,
      federatedScanned,
      policyAllowedOrConditional,
      compatible: compatibleCount,
      availableForWindow,
    },
  };
}

// ============================================================================
// ENGINE 5: SCHEDULING OPTIMIZER
// Objective: max(alpha * C + beta * D - gamma * M - delta * R)
// ============================================================================
export function optimizeSchedules(
  candidates: CandidateEvaluation[],
  reqStart: number,
  reqEnd: number
): OptimizedScheduleOption[] {
  const valid = candidates.filter((c) => c.passedHardFilters);
  const reqDuration = Math.max(15, reqEnd - reqStart);
  const options: OptimizedScheduleOption[] = [];

  const ALPHA = 55; // Coverage weight
  const BETA = 35; // Continuous duration ratio weight
  const GAMMA = 16; // Penalty per relocation move
  const DELTA = 14; // Penalty for recall risk

  const computeObjective = (
    coverageRatio: number,
    longestContinuousRatio: number,
    relocations: number,
    avgRisk: number
  ) => {
    const val = ALPHA * coverageRatio + BETA * longestContinuousRatio - GAMMA * relocations - DELTA * avgRisk;
    return Math.max(0, Math.round(val * 10) / 10);
  };

  // 1. Single-space continuous options
  for (const c of valid) {
    const overlap = getMaxContinuousOverlap(c.availableSlots, reqStart, reqEnd);
    const bestSlot = overlap.clippedSlots.sort((a, b) => b.endMin - b.startMin - (a.endMin - a.startMin))[0];
    if (!bestSlot) continue;

    const duration = bestSlot.endMin - bestSlot.startMin;
    const coverageRatio = Math.min(1, duration / reqDuration);
    const segment: ScheduleSegment = {
      resource: c.resource,
      community: c.community,
      startMin: bestSlot.startMin,
      endMin: bestSlot.endMin,
      isFederated: c.isFederated,
      policyDecision: c.policy.decision,
    };
    const estEur = c.resource.pricing.isFree
      ? 0
      : Math.round((duration / 60) * c.resource.pricing.hourlyEur * 100) / 100;

    options.push({
      id: `opt-single-${c.resource.id}`,
      type: 'continuous',
      segments: [segment],
      totalCoverageMin: duration,
      coverageRatio,
      longestContinuousMin: duration,
      relocationCount: 0,
      averageRisk: c.resource.recallRiskScore,
      objectiveScore: computeObjective(coverageRatio, coverageRatio, 0, c.resource.recallRiskScore),
      totalEstimatedEur: estEur,
      requiresManualApproval: c.resource.approvalMode === 'manual',
    });
  }

  // 2. Multi-space chained options (Interval Graph Chaining with minimal moves)
  // Collect all clipped slots across valid candidates that start at or near reqStart or cover later segments
  interface AtomicSlot {
    candidate: CandidateEvaluation;
    startMin: number;
    endMin: number;
  }

  const allSlots: AtomicSlot[] = [];
  for (const c of valid) {
    const { clippedSlots } = getMaxContinuousOverlap(c.availableSlots, reqStart, reqEnd);
    for (const s of clippedSlots) {
      if (s.endMin - s.startMin >= 45) {
        allSlots.push({ candidate: c, startMin: s.startMin, endMin: s.endMin });
      }
    }
  }

  // Build optimal 2-segment chains (1 relocation) where neither segment alone covers the full window
  const seenChainPairs = new Set<string>();
  for (const first of allSlots) {
    if (first.startMin > reqStart + 30) continue;
    if (first.endMin >= reqEnd) continue; // Already full coverage on its own

    for (const second of allSlots) {
      if (second.candidate.resource.id === first.candidate.resource.id) continue;
      // Allow seamless handoff: second must start <= first.endMin and extend meaningfully past first.endMin
      if (second.startMin <= first.endMin && second.endMin > first.endMin + 45) {
        const pairKey = `${first.candidate.resource.id}->${second.candidate.resource.id}`;
        if (seenChainPairs.has(pairKey)) continue;
        seenChainPairs.add(pairKey);

        // Handoff point at first.endMin (or aligned cleanly if overlapping)
        const handoffMin = Math.min(first.endMin, Math.max(second.startMin, first.endMin - 10));
        const seg1Dur = handoffMin - first.startMin;
        const seg2Dur = second.endMin - handoffMin;
        if (seg1Dur < 45 || seg2Dur < 45) continue;

        const totalCov = second.endMin - first.startMin;
        const coverageRatio = Math.min(1, totalCov / reqDuration);
        const longestCont = Math.max(seg1Dur, seg2Dur);
        const avgRisk = (first.candidate.resource.recallRiskScore + second.candidate.resource.recallRiskScore) / 2;

        const estEur1 = first.candidate.resource.pricing.isFree
          ? 0
          : (seg1Dur / 60) * first.candidate.resource.pricing.hourlyEur;
        const estEur2 = second.candidate.resource.pricing.isFree
          ? 0
          : (seg2Dur / 60) * second.candidate.resource.pricing.hourlyEur;

        options.push({
          id: `opt-chain-${pairKey}`,
          type: 'chained',
          segments: [
            {
              resource: first.candidate.resource,
              community: first.candidate.community,
              startMin: first.startMin,
              endMin: handoffMin,
              isFederated: first.candidate.isFederated,
              policyDecision: first.candidate.policy.decision,
            },
            {
              resource: second.candidate.resource,
              community: second.candidate.community,
              startMin: handoffMin,
              endMin: second.endMin,
              isFederated: second.candidate.isFederated,
              policyDecision: second.candidate.policy.decision,
            },
          ],
          totalCoverageMin: totalCov,
          coverageRatio,
          longestContinuousMin: longestCont,
          relocationCount: 1,
          averageRisk: Math.round(avgRisk * 100) / 100,
          objectiveScore: computeObjective(coverageRatio, longestCont / reqDuration, 1, avgRisk),
          totalEstimatedEur: Math.round((estEur1 + estEur2) * 100) / 100,
          requiresManualApproval:
            first.candidate.resource.approvalMode === 'manual' ||
            second.candidate.resource.approvalMode === 'manual',
        });
      }
    }
  }

  options.sort((a, b) => b.objectiveScore - a.objectiveScore);
  return options;
}

// ============================================================================
// ENGINE 6: BOOKING & CONFLICT ENGINE (Atomic Concurrency Guard)
// ============================================================================
export interface AtomicBookingOutcome {
  ok: boolean;
  errorCode?: 'CONFLICT_OVERLAP' | 'OUTSIDE_AVAILABILITY' | 'POLICY_REJECTED' | 'OFFLINE_FEDERATION';
  errorMessageEn?: string;
  errorMessageFa?: string;
  reservationsCreated?: Reservation[];
  notifications?: NotificationEvent[];
}

export function createAtomicBooking(
  option: OptimizedScheduleOption,
  requester: UserProfile,
  existingReservations: Reservation[],
  communities: Community[],
  networkOffline: boolean
): AtomicBookingOutcome {
  const communityMap = new Map(communities.map((c) => [c.id, c]));
  const reqCommunity = requester.communityId ? communityMap.get(requester.communityId) : undefined;
  const created: Reservation[] = [];
  const notifications: NotificationEvent[] = [];
  const chainGroupId = option.segments.length > 1 ? `chain-${Date.now()}` : undefined;
  const nowStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' CET';

  // Phase 1: Atomic re-validation of every segment before committing any
  for (const seg of option.segments) {
    const policy = evaluatePolicy(seg.resource, seg.community, requester, reqCommunity, networkOffline);
    if (policy.decision === 'Rejected') {
      return {
        ok: false,
        errorCode: networkOffline && seg.isFederated ? 'OFFLINE_FEDERATION' : 'POLICY_REJECTED',
        errorMessageEn: `Booking rejected by Policy Engine on ${seg.resource.code}.`,
        errorMessageFa: `رزرو روی ${seg.resource.code} توسط موتور سیاست‌گذاری رد شد.`,
      };
    }

    // Check overlap with all existing blocking reservations (including buffer)
    const conflicts = existingReservations.filter(
      (r) =>
        r.resourceId === seg.resource.id &&
        BLOCKING_STATUSES.includes(r.status) &&
        !(seg.endMin <= r.startMin - seg.resource.bufferMinutes || seg.startMin >= r.endMin + seg.resource.bufferMinutes)
    );

    if (conflicts.length > 0) {
      return {
        ok: false,
        errorCode: 'CONFLICT_OVERLAP',
        errorMessageEn: `Atomic conflict lock prevented double-booking on ${seg.resource.code} (${formatMinutes(seg.startMin)}–${formatMinutes(seg.endMin)}).`,
        errorMessageFa: `قفل اتمیک دیتابیس از تداخل و رزرو هم‌زمان روی ${seg.resource.code} (${formatMinutes(seg.startMin)}–${formatMinutes(seg.endMin)}) جلوگیری کرد.`,
      };
    }

    const freeSlots = computeAvailableIntervals(seg.resource, existingReservations);
    const { coversFull } = getMaxContinuousOverlap(freeSlots, seg.startMin, seg.endMin);
    if (!coversFull) {
      return {
        ok: false,
        errorCode: 'OUTSIDE_AVAILABILITY',
        errorMessageEn: `Requested interval is no longer within ${seg.resource.code} declared availability.`,
        errorMessageFa: `بازه درخواستی دیگر در زمان آزاد اعلام‌شده ${seg.resource.code} قرار ندارد.`,
      };
    }
  }

  // Phase 2: Commit atomically
  for (let i = 0; i < option.segments.length; i++) {
    const seg = option.segments[i];
    const status: ReservationStatus = seg.resource.approvalMode === 'automatic' && seg.policyDecision === 'Allowed'
      ? 'Confirmed'
      : 'Pending';

    const rsv: Reservation = {
      id: `rsv-${Date.now()}-${i}`,
      resourceId: seg.resource.id,
      communityId: seg.community.id,
      requesterId: requester.id,
      requesterName: seg.isFederated ? `Anonymous Network Member (#${requester.id.slice(-3)})` : requester.name,
      startMin: seg.startMin,
      endMin: seg.endMin,
      status,
      isFederated: seg.isFederated,
      originCommunityId: requester.communityId,
      isChainedSegment: option.segments.length > 1,
      chainGroupId,
      createdAt: `2026-11-22 ${nowStr}`,
      notes: seg.isFederated
        ? `Federated booking via ${seg.community.name} Gateway`
        : option.segments.length > 1
          ? `Chained itinerary segment ${i + 1}/${option.segments.length}`
          : 'Direct continuous reservation',
    };
    created.push(rsv);

    notifications.push(
      createNotificationEvent(
        status === 'Confirmed' ? 'booking_confirmed' : 'new_booking_request',
        seg.resource.code,
        formatMinutes(seg.startMin),
        formatMinutes(seg.endMin),
        nowStr
      )
    );
  }

  return { ok: true, reservationsCreated: created, notifications };
}

export function triggerOwnerRecall(
  reservation: Reservation,
  resources: Resource[],
  communities: Community[],
  allReservations: Reservation[],
  users: UserProfile[],
  networkOffline: boolean
): {
  updatedReservation: Reservation;
  suggestedAlternative?: Resource;
  notifications: NotificationEvent[];
} {
  const resource = resources.find((r) => r.id === reservation.resourceId);
  const requester = users.find((u) => u.id === reservation.requesterId) ?? users[0];
  const nowStr = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' CET';

  // Ask Smart Matching Engine for an immediate alternative for the same window
  const pipeline = runSmartMatchingPipeline(
    {
      requester,
      resourceType: resource?.type ?? 'parking',
      startMin: reservation.startMin,
      endMin: reservation.endMin,
      includeFederated: !networkOffline,
      freeOnly: false,
      instantApprovalOnly: false,
      preferredFloor: 'ANY',
      requireEvOrPower: false,
      requireAccessible: false,
      weights: {
        continuousDuration: 35,
        freePricing: 15,
        instantApproval: 25,
        preferredFloor: 5,
        elevatorProximity: 5,
        lowRecallRisk: 15,
      },
      networkOffline,
    },
    resources.filter((r) => r.id !== reservation.resourceId),
    communities,
    allReservations
  );

  const alt = pipeline.schedules.find((s) => s.type === 'continuous' && s.coverageRatio >= 0.9)?.segments[0]?.resource;

  const updatedReservation: Reservation = {
    ...reservation,
    status: 'Relocation Pending',
    recallRequestedAt: nowStr,
    recallGraceMinutes: resource?.graceNoticeMinutes ?? 30,
    suggestedAlternativeResourceId: alt?.id,
  };

  const notifications: NotificationEvent[] = [
    createNotificationEvent(
      'parking_release_requested',
      resource?.code ?? reservation.resourceId,
      formatMinutes(reservation.startMin),
      formatMinutes(reservation.endMin),
      nowStr,
      resource?.graceNoticeMinutes ?? 30
    ),
  ];

  if (alt) {
    notifications.push(
      createNotificationEvent(
        'alternative_parking_found',
        alt.code,
        formatMinutes(reservation.startMin),
        formatMinutes(reservation.endMin),
        nowStr
      )
    );
  } else {
    notifications.push(
      createNotificationEvent(
        'failed_relocation',
        resource?.code ?? reservation.resourceId,
        formatMinutes(reservation.startMin),
        formatMinutes(reservation.endMin),
        nowStr
      )
    );
  }

  return { updatedReservation, suggestedAlternative: alt, notifications };
}

// ============================================================================
// ENGINE 7: NOTIFICATION & COORDINATION ENGINE (Event-Driven)
// ============================================================================
export function createNotificationEvent(
  type: NotificationEventType,
  resourceCode: string,
  fromStr: string,
  untilStr: string,
  timestamp: string,
  graceMin?: number
): NotificationEvent {
  const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  switch (type) {
    case 'new_booking_request':
      return {
        id,
        type,
        recipient: 'owner',
        timestamp,
        resourceCode,
        titleEn: `New approval request for ${resourceCode}`,
        titleFa: `درخواست تأیید جدید برای ${resourceCode}`,
        detailEn: `A user requested ${resourceCode} (${fromStr}–${untilStr}). Owner confirmation required.`,
        detailFa: `درخواستی برای ${resourceCode} در بازه ${fromStr}–${untilStr} ثبت شد. نیازمند تأیید صاحب منبع.`,
      };
    case 'booking_confirmed':
      return {
        id,
        type,
        recipient: 'both',
        timestamp,
        resourceCode,
        titleEn: `Reservation confirmed on ${resourceCode}`,
        titleFa: `رزرو روی ${resourceCode} قطعی شد`,
        detailEn: `Atomically locked for ${fromStr}–${untilStr}. Gate credentials issued.`,
        detailFa: `به‌صورت اتمیک برای بازه ${fromStr}–${untilStr} ثبت شد و مجوز دسترسی صادر گردید.`,
      };
    case 'parking_release_requested':
      return {
        id,
        type,
        recipient: 'requester',
        timestamp,
        resourceCode,
        titleEn: `Urgent release requested on ${resourceCode}`,
        titleFa: `درخواست تخلیه فوری برای ${resourceCode}`,
        detailEn: `Owner requested recall with agreed ${graceMin ?? 30}-min grace window.`,
        detailFa: `صاحب منبع درخواست تخلیه ثبت کرد. مهلت توافق‌شده: ${graceMin ?? 30} دقیقه.`,
      };
    case 'alternative_parking_found':
      return {
        id,
        type,
        recipient: 'both',
        timestamp,
        resourceCode,
        titleEn: `Alternative resource matched: ${resourceCode}`,
        titleFa: `منبع جایگزین پیدا شد: ${resourceCode}`,
        detailEn: `Matching Engine found ${resourceCode} for ${fromStr}–${untilStr}. Ready for 1-click relocation.`,
        detailFa: `موتور تطبیق منبع ${resourceCode} را برای بازه ${fromStr}–${untilStr} آماده جابه‌جایی کرد.`,
      };
    case 'booking_cancelled':
      return {
        id,
        type,
        recipient: 'both',
        timestamp,
        resourceCode,
        titleEn: `Booking cancelled on ${resourceCode}`,
        titleFa: `رزرو روی ${resourceCode} لغو شد`,
        detailEn: `Time window ${fromStr}–${untilStr} immediately released back to Availability Engine.`,
        detailFa: `بازه ${fromStr}–${untilStr} فوراً به موتور دسترس‌پذیری بازگردانده شد.`,
      };
    case 'failed_relocation':
      return {
        id,
        type,
        recipient: 'manager',
        timestamp,
        resourceCode,
        titleEn: `Escalation: No automatic alternative for ${resourceCode}`,
        titleFa: `ارجاع به مدیر ساختمان: جایگزینی برای ${resourceCode} یافت نشد`,
        detailEn: `Building manager notified to coordinate owner recall within contract rules.`,
        detailFa: `مدیر ساختمان جهت هماهنگی طبق قرارداد رزرو مطلع شد.`,
      };
    default:
      return {
        id,
        type,
        recipient: 'both',
        timestamp,
        resourceCode,
        titleEn: `Coordination update for ${resourceCode}`,
        titleFa: `به‌روزرسانی هماهنگی برای ${resourceCode}`,
        detailEn: `Window ${fromStr}–${untilStr}`,
        detailFa: `بازه ${fromStr}–${untilStr}`,
      };
  }
}

// ============================================================================
// FEDERATION GATEWAY PAYLOAD BUILDER (Strict Zero-PII Anonymization)
// ============================================================================
export function buildFederationPayload(
  resource: Resource,
  community: Community,
  reservations: Reservation[]
): FederationOfferPayload | null {
  if (!community.federationEnabled || !resource.active || !resource.sharingEnabled) return null;
  if (resource.accessPolicy === 'residents_only' || resource.accessPolicy === 'residents_and_guests') return null;

  const freeSlots = computeAvailableIntervals(resource, reservations);
  const nextSlot = freeSlots[0];
  if (!nextSlot) return null;

  const fromIso = `2026-11-24T${formatMinutes(nextSlot.startMin)}:00+01:00`;
  const untilIso = `2026-11-24T${formatMinutes(nextSlot.endMin)}:00+01:00`;
  const expMin = Math.max(0, nextSlot.startMin - 5);
  const expiresIso = `2026-11-24T${formatMinutes(expMin)}:00+01:00`;

  return {
    protocol_version: 'parkshare-fed/v1',
    network_resource_id: resource.networkAliasId,
    origin_node_alias: `node-${community.id.replace('comm-', '')}-nl`,
    resource_type: resource.type,
    availability: {
      timezone: community.timezone,
      from: fromIso,
      until: untilIso,
    },
    pricing: resource.pricing.isFree
      ? { type: 'free' }
      : { type: 'paid', hourly_eur: resource.pricing.hourlyEur },
    approval: resource.approvalMode,
    access_policy: resource.accessPolicy,
    expires_at: expiresIso,
    signature: `ed25519:${community.keyFingerprint.slice(-8)}...f92a`,
  };
}

// ============================================================================
// LEVEL 3: ROUTE-AWARE COST OPTIMIZER: Cost = aT + bP + cW + dU
// ============================================================================
export interface RankedCityResource {
  resource: CityMapResource;
  totalCostScore: number;
  estimated8hEur: number;
  eligible: boolean;
}

export function evaluateRouteMatching(
  cityResources: CityMapResource[],
  weights: RouteWeights,
  parkHours: number
): RankedCityResource[] {
  return cityResources
    .map((r) => {
      const eligible = r.availableNow && r.accessAllowed;
      const estimated8hEur = Math.round(r.hourlyEur * parkHours * 100) / 100;
      // Normalized cost factors (lower is better)
      const normT = r.detourMinutes / 15;
      const normP = estimated8hEur / 60;
      const normW = r.walkMinutesToDest / 20;
      const normU = r.uncertainty;

      const sumW = Math.max(1, weights.detourTime + weights.price + weights.walkDistance + weights.uncertainty);
      const cost =
        ((weights.detourTime * normT +
          weights.price * normP +
          weights.walkDistance * normW +
          weights.uncertainty * normU) /
          sumW) *
        100;

      return {
        resource: r,
        totalCostScore: Math.round(cost * 10) / 10,
        estimated8hEur,
        eligible,
      };
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      return a.totalCostScore - b.totalCostScore;
    });
}
