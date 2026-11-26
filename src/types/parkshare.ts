export type Language = 'nl' | 'en' | 'fa';

export type ResourceType = 'parking' | 'boat_berth' | 'storage' | 'commercial';

export type DeploymentModel = 'self_hosted' | 'dedicated_cloud' | 'shared_saas';

export type EncryptionLevel = 'encryption_at_rest' | 'customer_managed_keys' | 'local_zero_knowledge';

export type AccessPolicyLevel = 'residents_only' | 'residents_and_guests' | 'network_members' | 'public';

export type PolicyDecision = 'Allowed' | 'Conditional' | 'Rejected';

export type ApprovalMode = 'automatic' | 'manual';

export type ReservationStatus =
  | 'Draft'
  | 'Pending'
  | 'Confirmed'
  | 'Active'
  | 'Completed'
  | 'Cancelled'
  | 'Expired'
  | 'Disputed'
  | 'Relocation Pending';

export type VehicleType = 'car' | 'motorcycle' | 'van';
export type VesselType = 'motorboat' | 'sailboat' | 'yacht';

export interface TimeInterval {
  /** Minutes from midnight in Europe/Amsterdam timezone (0 - 1440) */
  startMin: number;
  endMin: number;
}

export interface MaintenanceBlock extends TimeInterval {
  reason: string;
}

export interface Community {
  id: string;
  managerAccountId?: string;
  name: string;
  nameFa: string;
  organization: string;
  city: string;
  cityFa: string;
  country: string;
  timezone: string;
  floors: string[];
  deploymentModel: DeploymentModel;
  encryptionLevel: EncryptionLevel;
  keyFingerprint: string;
  federationEnabled: boolean;
  connectedCommunityIds: string[];
  allowExternalGuests: boolean;
  consentDemandAnalytics: boolean;
  strictWhitelistOnly: boolean;
  allowedUsagePolicies: AccessPolicyLevel[];
  allowPaidSharing: boolean;
  dataRetentionDays: 0 | 30 | 90;
  dataResidencyRegion: string;
  zeroPiiHashMode: boolean;
  fairUsePolicy: FairUsePolicy;
  enabledModules: ResourceType[];
  coordinates: { lat: number; lng: number };
  /** Optional multi-block complex metadata (e.g., Boston Residence: 6 blocks, 800 total spaces) */
  blocks?: string[];
  capacitySummary?: {
    totalSpaces: number;
    residentialSpaces: number;
    guestSpaces: number;
    sharedPublicSpaces: number;
    specialSpaces: number;
    namingPattern?: string;
    exampleCode?: string;
  };
  /** Per-building GDPR-first WhatsApp Group connection & pinned bot configuration */
  whatsappGroup?: BuildingWhatsAppGroupConfig;
}

export interface BuildingWhatsAppGroupConfig {
  enabled: boolean;
  groupName: string;
  groupInviteUrl?: string;
  botPhoneNumber?: string;
  defaultLanguage: 'fa' | 'en';
  pinnedConfirmed: boolean;
  connectedAt?: string;
}

export interface FairUsePolicy {
  maxHoursPerBooking: number;
  maxDaysPerMonth: number;
  maxConsecutiveDays: number;
  cooldownHoursAfterStreak: number;
  allowExtendedNegotiation: boolean;
}

export interface ExtendedParkingRequest {
  id: string;
  communityId: string;
  requesterId: string;
  requesterAlias: string;
  requestedStartMin: number;
  requestedEndMin: number;
  requestedDays: number;
  routeTo: 'manager' | 'owner_and_manager';
  reasonType: 'extended_guest' | 'temporary_work' | 'permanent_lease_inquiry';
  note: string;
  status: 'Pending' | 'Approved_Exception' | 'Referred_Lease' | 'Declined';
  createdAt: string;
}

export interface ParkingReview {
  id: string;
  reservationId: string;
  resourceId: string;
  communityId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  comment: string;
  anonymous: boolean;
  authorAlias: string;
  createdAt: string;
}

export interface PrivacyAuditEvent {
  id: string;
  communityId: string;
  timestamp: string;
  category:
    | 'pii_masked'
    | 'key_rotated'
    | 'gdpr_export'
    | 'gdpr_erasure'
    | 'whitelist_blocked'
    | 'federation_verified';
  summaryFa: string;
  summaryEn: string;
  proofTag: string;
}

export interface BuildingRosterEntry {
  id: string;
  communityId: string;
  bayCode: string;
  floorOrZone: string;
  ownerName: string;
  unitNumber: string;
  email: string;
  phone: string;
  evCharging: boolean;
  heightLimitM: number;
  status: 'invited' | 'verified' | 'revoked';
  addedAt: string;
}

export interface BlockedAccessAttempt {
  id: string;
  communityId: string;
  identifierTried: string;
  unitOrBayTried: string;
  reason: string;
  timestamp: string;
}

export interface BuildingInviteLink {
  id: string;
  token: string;
  communityId: string;
  label: string;
  createdAt: string;
  active: boolean;
  defaultFree: boolean;
  defaultAccessPolicy: AccessPolicyLevel;
  submissionsCount: number;
}

export interface NeighborOptInSubmission {
  id: string;
  inviteToken: string;
  communityId: string;
  neighborName: string;
  unitNumber: string;
  phone: string;
  email: string;
  resourceCode: string;
  floorOrZone: string;
  submittedAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  nameFa: string;
  role: 'resident' | 'guest' | 'external' | 'manager';
  communityId: string | null;
  unitNumber: string | null;
  phone: string;
  email: string;
  suspended: boolean;
  allowedFloors: string[];
  tempUsageThisMonth?: {
    daysUsed: number;
    consecutiveDays: number;
  };
  vehicle: {
    type: VehicleType;
    lengthM: number;
    widthM: number;
    heightM: number;
    needsEv: boolean;
    needsAccessible: boolean;
  };
  vessel?: {
    type: VesselType;
    lengthM: number;
    beamM: number;
    draftM: number;
    needsShorePower: boolean;
  };
}

export interface ResourceDimensions {
  lengthM: number;
  widthM: number;
  /** Height clearance for parking/storage, or water depth (draft) for boat berths */
  heightOrDepthM: number;
  areaSqm?: number;
}

export interface ResourceOwnerPrivate {
  ownerId: string;
  fullName: string;
  phone: string;
  email: string;
  unitNumber: string;
  emergencyContact: string;
}

export type ParkingCategory =
  | 'standard'
  | 'wide'
  | 'compact'
  | 'motorcycle'
  | 'tandem'
  | 'accessible'
  | 'ev'
  | 'guest'
  | 'storage_combo';

export type ParkingLifecycleStatus =
  | 'active'
  | 'inactive'
  | 'pending_approval'
  | 'pending_owner_activation'
  | 'reserved'
  | 'in_use'
  | 'maintenance'
  | 'blocked'
  | 'under_review';

export type ParkingOwnershipType = 'private' | 'shared' | 'building_managed' | 'guest';

export type ParkingEntryMethod = 'app' | 'card' | 'remote' | 'key' | 'pin_code';

export interface ParkingSpaceMeta {
  block: string;
  floor: string;
  bayNumber: string;
  category: ParkingCategory;
  coverage: 'covered' | 'open' | 'semi_covered';
  placement: 'basement' | 'ground' | 'outdoor';
  surface: 'concrete' | 'asphalt' | 'paved';
  adjacentStructure: 'none' | 'wall' | 'pillar';
  maneuverSpace: 'standard' | 'extra' | 'tight';
  locationNoteFa: string;
  locationNoteEn: string;
  suitableForFa: string;
  suitableForEn: string;
}

export interface ParkingOwnershipMeta {
  ownershipType: ParkingOwnershipType;
  ownerVerified: boolean;
  registeredByManager: boolean;
  preloadedBySystem: boolean;
  ownerActivated: boolean;
  sharingAllowed: boolean;
  managerCanEdit: boolean;
  specialBuildingRules: boolean;
}

export interface ParkingFeaturesMeta {
  evCharging: boolean;
  evPowerKw?: number;
  evConnector?: string;
  separateMeter?: boolean;
  separateEvFee?: boolean;
  cctvNearby?: boolean;
  goodLighting?: boolean;
  powerOutlet?: boolean;
  nearElevator?: boolean;
  nearStairs?: boolean;
  nearEntrance?: boolean;
  nearExit?: boolean;
  nearRamp?: boolean;
  stepFreeAccess?: boolean;
  storageSpace?: boolean;
  bikeStorage?: boolean;
  quietZone?: boolean;
}

export interface ParkingAccessRulesMeta {
  approvalBy: 'automatic' | 'owner' | 'manager';
  entryMethods: ParkingEntryMethod[];
  requiresLicensePlate: boolean;
  requiresGuestRegistration: boolean;
  specialPermitOnly: boolean;
  timeLimitedGuest?: boolean;
  ruleNoteFa?: string;
  ruleNoteEn?: string;
}

export interface Resource {
  id: string;
  networkAliasId: string;
  communityId: string;
  code: string;
  title: string;
  titleFa: string;
  type: ResourceType;
  sharingEnabled: boolean;
  active: boolean;
  floorOrZone: string;
  nearElevatorOrDock: boolean;
  dimensions: ResourceDimensions;
  allowedVehicleTypes?: VehicleType[];
  allowedVesselTypes?: VesselType[];
  evCharging?: boolean;
  accessible?: boolean;
  shorePower?: boolean;
  climateControlled?: boolean;
  pricing: {
    isFree: boolean;
    hourlyEur: number;
    dailyEur?: number;
    separateEvFeeEur?: number;
  };
  approvalMode: ApprovalMode;
  accessPolicy: AccessPolicyLevel;
  bufferMinutes: number;
  /** 0 (very low) to 1 (high) probability of sudden owner recall */
  recallRiskScore: number;
  hideRecallRiskFromPublic: boolean;
  graceNoticeMinutes: number;
  declaredAvailability: TimeInterval[];
  maintenanceBlocks: MaintenanceBlock[];
  /** Strictly stays in Building Private Environment; never sent over Federation */
  ownerPrivate: ResourceOwnerPrivate;
  /** Normalized modular metadata (Categories A–I: Identity, Physical, Ownership, Lifecycle, Features, Access) */
  lifecycleStatus?: ParkingLifecycleStatus;
  spaceMeta?: ParkingSpaceMeta;
  ownership?: ParkingOwnershipMeta;
  features?: ParkingFeaturesMeta;
  accessRules?: ParkingAccessRulesMeta;
  scenarioTag?: string;
}

export interface Reservation {
  id: string;
  resourceId: string;
  communityId: string;
  requesterId: string;
  requesterName: string;
  startMin: number;
  endMin: number;
  status: ReservationStatus;
  isFederated: boolean;
  originCommunityId: string | null;
  isChainedSegment?: boolean;
  chainGroupId?: string;
  recallRequestedAt?: string;
  recallGraceMinutes?: number;
  suggestedAlternativeResourceId?: string;
  createdAt: string;
  notes?: string;
}

export interface RankingWeights {
  continuousDuration: number; // default 25
  freePricing: number; // default 20
  instantApproval: number; // default 15
  preferredFloor: number; // default 15
  elevatorProximity: number; // default 10
  lowRecallRisk: number; // default 15
}

export interface MatchRequest {
  requester: UserProfile;
  resourceType: ResourceType;
  startMin: number;
  endMin: number;
  includeFederated: boolean;
  freeOnly: boolean;
  instantApprovalOnly: boolean;
  preferredFloor: string;
  requireEvOrPower: boolean;
  requireAccessible: boolean;
  minAreaSqm?: number;
  weights: RankingWeights;
  networkOffline: boolean;
}

export interface PolicyRuleCheck {
  rule: string;
  passed: boolean;
  detail: string;
}

export interface PolicyEvaluation {
  decision: PolicyDecision;
  checks: PolicyRuleCheck[];
  summary: string;
}

export interface CompatibilityCheck {
  criterion: string;
  passed: boolean;
  required: string;
  actual: string;
}

export interface CompatibilityEvaluation {
  compatible: boolean;
  checks: CompatibilityCheck[];
}

export interface ScoreBreakdown {
  continuousDuration: number;
  freePricing: number;
  instantApproval: number;
  preferredFloor: number;
  elevatorProximity: number;
  lowRecallRisk: number;
  recallRiskMasked: boolean;
}

export interface CandidateEvaluation {
  resource: Resource;
  community: Community;
  isFederated: boolean;
  policy: PolicyEvaluation;
  availableSlots: TimeInterval[];
  coversFullWindow: boolean;
  maxContinuousOverlapMin: number;
  compatibility: CompatibilityEvaluation;
  passedHardFilters: boolean;
  hardFilterReason?: string;
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface ScheduleSegment {
  resource: Resource;
  community: Community;
  startMin: number;
  endMin: number;
  isFederated: boolean;
  policyDecision: PolicyDecision;
}

export interface OptimizedScheduleOption {
  id: string;
  type: 'continuous' | 'chained';
  segments: ScheduleSegment[];
  totalCoverageMin: number;
  coverageRatio: number;
  longestContinuousMin: number;
  relocationCount: number;
  averageRisk: number;
  objectiveScore: number;
  totalEstimatedEur: number;
  requiresManualApproval: boolean;
}

export interface MatchingPipelineResult {
  candidates: CandidateEvaluation[];
  schedules: OptimizedScheduleOption[];
  filteredSummary: {
    totalScanned: number;
    federatedScanned: number;
    policyAllowedOrConditional: number;
    compatible: number;
    availableForWindow: number;
  };
}

export type NotificationEventType =
  | 'new_booking_request'
  | 'booking_confirmed'
  | 'booking_starts_soon'
  | 'parking_release_requested'
  | 'alternative_parking_found'
  | 'reservation_ending'
  | 'booking_cancelled'
  | 'failed_relocation';

export interface NotificationEvent {
  id: string;
  type: NotificationEventType;
  recipient: 'owner' | 'requester' | 'both' | 'manager';
  timestamp: string;
  titleEn: string;
  titleFa: string;
  detailEn: string;
  detailFa: string;
  resourceCode?: string;
}

export interface FederationOfferPayload {
  protocol_version: string;
  network_resource_id: string;
  origin_node_alias: string;
  resource_type: ResourceType;
  availability: {
    timezone: string;
    from: string;
    until: string;
  };
  pricing: {
    type: 'free' | 'paid';
    hourly_eur?: number;
  };
  approval: ApprovalMode;
  access_policy: AccessPolicyLevel;
  expires_at: string;
  signature: string;
}

export type CityResourceCategory =
  | 'public'
  | 'commercial'
  | 'private'
  | 'residential'
  | 'shared'
  | 'workplace'
  | 'ev'
  | 'marina';

export interface CityMapResource {
  id: string;
  name: string;
  nameFa: string;
  city: string;
  category: CityResourceCategory;
  resourceType: ResourceType;
  /** Normalized SVG map coords 0..1000 x 0..560 */
  x: number;
  y: number;
  detourMinutes: number;
  hourlyEur: number;
  walkMinutesToDest: number;
  /** 0 (guaranteed/reservable) to 1 (high uncertainty) */
  uncertainty: number;
  availableNow: boolean;
  reservable: boolean;
  accessAllowed: boolean;
  source: string;
  freeSpots: number;
  totalSpots: number;
}

export interface RouteWeights {
  detourTime: number; // a
  price: number; // b
  walkDistance: number; // c
  uncertainty: number; // d
}

export interface DemandTimeSlot {
  slot: string;
  requests: number;
  idleCapacity: number;
  shortageIndex: number;
}

export interface AcceptanceTestResult {
  id: string;
  nameFa: string;
  nameEn: string;
  expectedFa: string;
  expectedEn: string;
  passed: boolean;
  actualFa: string;
  actualEn: string;
  durationMs: number;
}

export interface AdminManagerSummary {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
  lastLoginAt?: string;
  suspended: boolean;
  buildingsCount: number;
  baysCount: number;
  activeBaysCount: number;
  rosterCount: number;
  residentAccountsCount: number;
  reservationsCount: number;
  pendingRequestsCount: number;
  buildings: {
    id: string;
    name: string;
    nameFa: string;
    city: string;
    cityFa: string;
    baysCount: number;
    activeBaysCount: number;
    rosterCount: number;
    federationEnabled: boolean;
    deploymentModel: DeploymentModel;
  }[];
}

export interface AdminResidentAccountSummary {
  id: string;
  username: string;
  displayName: string;
  userId?: string;
  communityId?: string;
  communityName: string;
  communityNameFa: string;
  unitNumber: string;
  createdAt: string;
  lastLoginAt?: string;
  suspended: boolean;
  reservationsCount: number;
}

export interface AdminBuildingSummary {
  id: string;
  name: string;
  nameFa: string;
  organization: string;
  city: string;
  cityFa: string;
  managerAccountId?: string;
  managerName: string;
  managerUsername: string;
  floorsCount: number;
  baysCount: number;
  activeBaysCount: number;
  rosterCount: number;
  residentAccountsCount: number;
  reservationsCount: number;
  pendingRequestsCount: number;
  federationEnabled: boolean;
  allowPaidSharing: boolean;
  deploymentModel: DeploymentModel;
  dataRetentionDays: 0 | 30 | 90;
  keyFingerprint: string;
}

export interface AdminResourceSummary {
  id: string;
  code: string;
  title: string;
  titleFa: string;
  communityId: string;
  communityName: string;
  communityNameFa: string;
  managerName: string;
  floorOrZone: string;
  block?: string;
  category?: ParkingCategory;
  active: boolean;
  sharingEnabled: boolean;
  isFree: boolean;
  hourlyEur: number;
  approvalMode: ApprovalMode;
  evCharging: boolean;
  lifecycleStatus?: ParkingLifecycleStatus;
}

export interface AdminReservationSummary {
  id: string;
  resourceCode: string;
  communityId: string;
  communityName: string;
  communityNameFa: string;
  requesterName: string;
  startMin: number;
  endMin: number;
  status: ReservationStatus;
  isFederated: boolean;
  createdAt: string;
}

export interface AdminOverviewPayload {
  stats: {
    totalManagers: number;
    activeManagers: number;
    suspendedManagers: number;
    totalBuildings: number;
    federatedBuildings: number;
    totalBays: number;
    activeBays: number;
    totalRosterEntries: number;
    totalResidentAccounts: number;
    activeResidentAccounts: number;
    totalReservations: number;
    activeReservations: number;
    pendingExtendedRequests: number;
    blockedAttemptsCount: number;
    totalReviews: number;
    averageRating: number;
  };
  managers: AdminManagerSummary[];
  residents: AdminResidentAccountSummary[];
  buildings: AdminBuildingSummary[];
  resources: AdminResourceSummary[];
  reservations: AdminReservationSummary[];
  extendedRequests: (ExtendedParkingRequest & {
    communityName: string;
    communityNameFa: string;
  })[];
  blockedAttempts: (BlockedAccessAttempt & {
    communityName: string;
    communityNameFa: string;
  })[];
  privacyAudits: (PrivacyAuditEvent & {
    communityName: string;
    communityNameFa: string;
  })[];
}

