import { SubscriptionStatus, PaymentStatus, PlatformSubscriptionStatus } from '@workspace/shared/constants';
import type { PlatformRole } from './access-control';
import type { PlanFeaturesV2 } from './features/catalog';
import type { ReceiptGapItem } from './documents/receipt-gaps';
import type { DurationUnit } from './date';

export type { SubscriptionStatus, PaymentStatus, PlatformSubscriptionStatus, DurationUnit };

/**
 * Standard interface for Better Auth errors.
 */
export interface IAuthError {
  code: string;
  message?: string;
  status?: number;
  statusText?: string;
}

/* ── SHARED TYPES ── */

/**
 * Global User interface (Better Auth + Custom Fields)
 */
export interface IUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  role?: PlatformRole; // Platform role (Better Auth admin plugin): owner | admin | support | user
}

/**
 * Auth member record — represents a user's membership within an organization
 * in the Better Auth context (auth_member table).
 */
export interface IAuthMember {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Global Session interface
 */
export interface ISession {
  user: IUser;
  session: {
    id: string;
    userId: string;
    expiresAt: string | Date;
    token: string;
    createdAt: string | Date;
    updatedAt: string | Date;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: string | null;
  };
}

/**
 * Interface for a class scheduled for today.
 */
export interface IClassToday {
  id?: number;
  name: string;
  startTime: string;    // stored as HH:MM (24 h)
  endTime?: string;     // stored as HH:MM (24 h), optional
  trainerName?: string;
  capacity?: number;
}

export interface IRecentRegistration {
  id: number;
  name: string;
  imageUrl?: string | null;
  createdAt?: string;
  time?: string;
  planName?: string;
  amountPaid?: number;
  currencyPaid?: string;
  endDate?: string;
}

/**
 * Actionable dashboard items (`GET /api/dashboard/action-items`):
 * - kind 'expiring': active subscription expiring in ≤ 7 days.
 * - kind 'recently_expired': subscription expired in the last 7 days and not renewed.
 * `days` is positive for expiring (expires in N) and negative for expired
 * (expired N days ago, in absolute value).
 */
export interface IDashboardActionItem {
  kind: 'expiring' | 'recently_expired';
  memberId: number;
  memberName: string;
  imageUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  planName?: string | null;
  /** End of the latest subscription (ISO). */
  endDate: string;
  /** Expires in N days (positive) or expired N days ago (negative). */
  days: number;
}

/**
 * Trend direction for KPI cards.
 */
export type TrendDirection = "up" | "down" | "neutral";


// Role types live in ./constants.ts (OrgRole) and ./access-control.ts (PlatformRole, OrganizationRole)

export type FrequencyType = 'once' | 'weekly';

/**
 * Interface for a class in the CMS.
 */
export interface IGymClass {
  id?: number;
  name: string;
  description?: string;
  trainerName?: string;
  isVisible: boolean;

  // Schedule
  startTime: string;       // "HH:MM"
  endTime?: string;        // "HH:MM" optional

  // Frequency
  frequencyType: FrequencyType;
  scheduledDate?: string;  // ISO date, only for 'once'
  daysOfWeek?: number[];   // [0-6], only for 'weekly'

  // Capacity
  capacity?: number;
}

/** @deprecated Use IGymClass */
export type ICmsClass = IGymClass;

/**
 * Interface for a gym member.
 */
export interface IMember {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  birthday?: string;
  imageUrl?: string | null;
  role?: string;
  userId?: string | null;
  user?: {
    id: string;
    email: string;
  } | null;
  documentId?: string;
  address?: string | null;
  isActive: boolean;
  /** Soft-delete marker. Non-null means removed from active views (history preserved). */
  deletedAt?: Date | null;
  latestSubscription?: (ISubscription & { planName?: string }) | null;
}

export interface MemberFilter {
  query?: string;
  role?: string;
  isActive?: boolean;
  /** Only members WITH (true) or WITHOUT (false) active gym subscription. */
  hasActiveSubscription?: boolean;
  page?: number;
  limit?: number;
  includeLatestSubscription?: boolean;
}

/**
 * Generic paginated response wrapper.
 */
export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type PaginatedMembers = IPaginatedResult<IMember>;

/**
 * Gym client KPIs (`GET /api/members/stats`).
 *
 * Population: `gym_member` with `role = 'member'` of active org.
 * - `active`/`inactive`: profile `isActive` flag.
 * - `newThisMonth`: `createdAt` within the org local month.
 * - `withoutActiveSubscription`: without active gym subscription, i.e., no
 *   row satisfying `getSubscriptionIsActiveSql` (valid `endDate`, not cancelled,
 *   payment NOT `voided`/`invalid` — `processing` DOES count as active because access
 *   has not yet been revoked).
 * - `withPortal`: exact mirror of `countActivePortalUsers`
 *   (`userId NOT NULL + isActive + role member`).
 */
export interface IMemberStats {
  total: number;
  active: number;
  inactive: number;
  newThisMonth: number;
  withoutActiveSubscription: number;
  withPortal: number;
  /** Signups per local month ('YYYY-MM'), last 6 active months. */
  growth: IMemberGrowthPoint[];
  /** Upcoming birthdays (top 5, sorted by MM-DD with year wrap-around). */
  upcomingBirthdays: IMemberBirthday[];
}

/** Monthly signup bucket. */
export interface IMemberGrowthPoint {
  month: string;
  count: number;
}

/** Upcoming birthday member (member domain, non-financial). */
export interface IMemberBirthday {
  id: number;
  firstName: string;
  lastName: string;
  /** 'YYYY-MM-DD' (date column without tz). */
  birthday: string;
}

export interface SubscriptionsFilter {
  query?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export type PaginatedSubscriptions = IPaginatedResult<ISubscription>;

export interface TrainerFilter {
  name?: string;
  role?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
}

export type PaginatedTrainers = IPaginatedResult<ITrainer>;

/**
 * Interface for a Trainer in the CMS.
 * This represents a Member with a Coach role and its associated Profile.
 */
export interface ITrainer extends IMember {
  specialities: string[] | null;
  bio?: string | null;
  isVisible: boolean;
  displayOrder: number;
}

export interface IMembershipPlan {
  id?: number;
  name: string;
  price: number; // in cents
  currency: string;
  durationValue: number;
  durationUnit: DurationUnit;
  features: string[] | null;
  isPopular: boolean;
  isActive: boolean;
  isVisibleOnSite: boolean;
  /** Soft-delete marker. Non-null means removed from active views (history preserved). */
  deletedAt?: Date | null;
  createdAt?: string;
  activeMembersCount?: number;
}

export interface IMembershipsSummary {
  totalActiveSubscriptions: number;
  monthlyRevenue: Record<string, number>;
}


/**
 * Interface for a Member's Subscription.
 */
export interface ISubscription {
  id?: number;
  memberId: number;
  planId: number;
  startDate: string;
  endDate: string;
  status: SubscriptionStatus;
  cancelledAt?: string;
  createdAt?: string;

  // Optional joined fields for CMS Table display
  memberName?: string;
  memberLastName?: string;
  memberEmail?: string;
  memberDocumentId?: string;
  memberAddress?: string | null;
  memberImage?: string | null;
  planName?: string;
  planSnapshotName?: string;
  planSnapshotPrice?: number;
  planSnapshotCurrency?: string;
  price?: number;
  role?: string;
  isActive?: boolean;

  // Payment Data (From Join) — amounts in integer cents (Money convention)
  paymentId?: number;
  amountPaid?: number;
  currencyPaid?: string;
  paymentMethod?: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any>;
  exchangeRateApplied?: string;
  paymentStatus?: PaymentStatus;
  paymentDate?: string;

  // Correlative receipt (real columns; see IPayment)
  receiptNumber?: string | null;
  receiptIssuedAt?: string | null;
  documentType?: 'receipt' | 'invoice';
  receiptVoided?: boolean;
}

export interface IPaymentMethodDetail {
  label: string;
  value: string;
  type?: 'text' | 'file' | 'number';
}
/**
 * Canonical contract for `paymentMethodDetails` (panel + console + API).
 * Forms send an array of self-describing items; the API validates it
 * via `paymentMethodDetailsSchema` (api-worker/src/lib/schemas.ts).
 * Read side retains tolerance for legacy object-shaped rows.
 */
export type IPaymentMethodDetails = IPaymentMethodDetail[];

export interface IPaymentMethodField {
  id: string;
  label: string;
  type: 'text' | 'file' | 'number' | 'visual';
  required: boolean;
  /** Instruction content for 'visual' type — rendered as informational card, not input. */
  value?: string;
}

export interface IPaymentMethodConfig {
  id: string;
  name: string;
  fields: IPaymentMethodField[];
  icon?: string;
  currency: string | null; // null = any currency
}

/**
 * Sorts payment method fields: `visual` (instructional) first, then the rest.
 * Applied in payment forms (panel + console) at render time.
 */
export function sortPaymentMethodFields(fields: IPaymentMethodField[]): IPaymentMethodField[] {
  const rank = (t: IPaymentMethodField['type']) => (t === 'visual' ? 0 : 1);
  return [...fields].sort((a, b) => rank(a.type) - rank(b.type));
}

export interface ITaxDetail {
  name: string;
  rate: number;
  amount: number;
}

/**
 * Contracts from the `documents/` module. Re-exported here so
 * consumers importing from `@workspace/shared` (types) find them without
 * deep path imports. Canonical implementation lives in `src/documents/` — never duplicate.
 */
export type { FiscalConfig } from './documents/fiscal-profile';
export type {
  ReceiptData,
  ReceiptChecklist,
  ReceiptDocumentType,
  ReceiptEmitter,
  ReceiptRecipient,
  ReceiptDocument,
  ReceiptSale,
  ReceiptAmounts,
  ReceiptMethod,
  ReceiptFooter,
} from './documents/receipt-data';
export type {
  ReceiptGapItem,
  ReceiptGapKind,
  ReceiptGapEntry,
  ComputeReceiptGapsInput,
} from './documents/receipt-gaps';

/**
 * Interface for a Payment record.
 * Amounts (planSnapshotPrice, amountPaid, subtotal, taxTotal) in integer
 * cents (Money convention). Display only via `formatCents`.
 */
export interface IPayment {
  id?: number;
  memberId: number;
  subscriptionId?: number;

  // Snapshots
  planSnapshotName: string;
  planSnapshotPrice: number;
  planSnapshotCurrency: string;

  // Payment Data
  amountPaid: number;
  currencyPaid: string;
  exchangeRateApplied?: string;

  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any>;

  /** Payment status (aligned with `IPlatformSubscriptionPayment.status`). */
  status: PaymentStatus;

  // Invoice Details (Optional/Internal)
  subtotal?: number;
  taxTotal?: number;
  taxDetails?: ITaxDetail[] | null;

  // Correlative receipt (real DB columns)
  receiptNumber?: string | null;
  receiptIssuedAt?: string | null;
  receiptPdfKey?: string | null;
  documentType?: 'receipt' | 'invoice';
  receiptVoided?: boolean;
  taxOverrideReason?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;

  paymentDate: string;
  createdAt?: string;
}

/* ── Receipts report ── */

/** Audit state of a report row (never confuses voided with gap). */
export type ReceiptReportState = 'issued' | 'pending' | 'voided' | 'pre_system';

export type ReceiptReportStatusFilter =
  | 'all'
  | ReceiptReportState
  | 'gaps';

export interface IReceiptReportRow {
  /** @internal Technical UUID: only for dialog fetching, NEVER render. */
  paymentId: number;
  /** Human receipt number; `null` = prior to system introduction (pre_system). */
  receiptNumber: string | null;
  state: ReceiptReportState;
  /** `ready` | `pending` | `null` (pre_system has no PDF). */
  pdfStatus: 'ready' | 'pending' | null;
  /**
   * Receipt recipient: member (Panel) or paying organization (Console, where emitter is FitStack).
   */
  memberName: string;
  /** Panel only; `null` in Console (recipient is an organization). */
  memberEmail?: string | null;
  planName: string;
  /** Integer cents (Money convention). */
  subtotal: number | null;
  taxTotal: number | null;
  taxDetails: ITaxDetail[];
  amountPaid: number;
  currencyPaid: string;
  paymentMethod: string;
  paymentStatus?: string;
  paymentDate: string;
  receiptIssuedAt: string | null;
  voided: boolean;
  taxOverrideReason?: string | null;
  voidedBy?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  /** Actor that issued (`issued_by`); `null` on historical records or sweep. */
  issuedBy?: string | null;
  /** Emitter frozen in snapshot (`emitter.name`); `null` on records issued before snapshots. */
  emitterName?: string | null;
}

export interface IReceiptTaxTotal {
  name: string;
  /** Integer cents. */
  amount: number;
}

/** Currency totals (never mixed sums). */
export interface IReceiptCurrencyTotal {
  currency: string;
  /** Integer cents. */
  subtotal: number;
  taxTotal: number;
  amount: number;
  byTax: IReceiptTaxTotal[];
}

export interface IReceiptReportSummary {
  issued: number;
  pending: number;
  voided: number;
  preSystem: number;
}

export interface IReceiptsReportFilters {
  from?: string;
  to?: string;
  status?: ReceiptReportStatusFilter;
  method?: string;
  year?: number;
  page?: number;
  limit?: number;
}

export interface IReceiptsReportResult {
  rows: IReceiptReportRow[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  summary: IReceiptReportSummary;
  totals: IReceiptCurrencyTotal[];
  gaps: ReceiptGapItem[];
}

/* ── API DTOs ── */

export interface TrainersFilter {
  name?: string;
  role?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
}

export interface CreateTrainerDTO {
  firstName: string;
  lastName: string;
  email: string;
  documentId?: string | null;
  phoneNumber?: string | null;
  birthday?: string | null;
  imageUrl?: string | null;
  address?: string | null;
  specialities?: string[] | null;
  bio?: string | null;
  isVisible?: boolean;
  displayOrder?: number;
}

export type UpdateTrainerDTO = Partial<CreateTrainerDTO> & { isActive?: boolean };

/* ── SAAS PLATFORM TYPES ── */

export interface IPlatformPlan {
  id: number;
  name: string;
  price: number; // in cents
  currency: string;
  durationValue: number;
  durationUnit: DurationUnit;
  features: PlanFeaturesV2 | null;
  isActive: boolean;
  trialDays: number; // 0 = no trial
  createdAt?: string | Date;
  organizationCount?: number;
}

export interface IPlatformSubscription {
  id: number;
  organizationId: string;
  organizationSlug?: string | null;
  planId: number;
  /** Computed status (not stored in DB) */
  status: PlatformSubscriptionStatus;
  startDate: string | Date;
  currentPeriodEnd: string | Date;
  isTrial: boolean;
  /** Price override (in integer cents). null = use plan price */
  priceOverride?: number | null;
  cancelledAt?: string | Date | null;
  cancellationReason?: string | null;
  createdAt?: string | Date;

  // Optional joined fields
  planName?: string;
  planPrice?: number;
  planCurrency?: string;
  planDurationValue?: number;
  planDurationUnit?: DurationUnit;
  organizationName?: string;
  latestPaymentStatus?: PaymentStatus;
  paymentsCount?: number;
}

export interface IPlatformSubscriptionPayment {
  id: number;
  subscriptionId?: number | null;
  organizationId: string;
  planId: number;

  // Commercial snapshot
  planSnapshotName: string;
  planSnapshotPrice: number; // integer cents
  planSnapshotCurrency: string;
  planSnapshotDurationValue: number;
  planSnapshotDurationUnit: DurationUnit;
  /** Plan features snapshot at time of payment (to compare against current plan) */
  featuresSnapshot?: PlanFeaturesV2 | null;

  // Payment data
  amountPaid: number; // integer cents
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  baseAmount?: number | null; // integer cents in base currency

  // Method
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;

  // Dates
  paymentDate: string | Date;
  dueDate: string | Date;
  paidAt?: string | Date | null;
  refundedAt?: string | Date | null;
  createdAt?: string | Date;

  // Status
  status: PaymentStatus;

  // SaaS receipt. NULL = prior to system / $0 SKIP.
  receiptNumber?: string | null;
  receiptIssuedAt?: string | Date | null;
  receiptPdfKey?: string | null;
  receiptVoided?: boolean;
}

/** @deprecated use IPlatformSubscriptionPayment */
export type IPlatformPayment = IPlatformSubscriptionPayment;

export interface IOrganization {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  metadata?: Record<string, any> | null;

  // Fiscal/Localization Fields
  // Mandatory: NOT NULL columns in `organization` (single insert upon creation).
  countryCode: string;
  timezone: string;
  primaryCurrency: string;
  currencyFormat: "latam" | "usa";
  taxId?: string | null;
  legalName?: string | null;
  address?: string | null;
  fiscalConfig?: Record<string, any> | null;
  slogan?: string | null;
  status?: string | null;

  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface IPlatformOrganization extends IOrganization {
  latestSubscription?: (IPlatformSubscription & { planName?: string }) | null;
  memberCount?: number;
  userCount?: number;
}

/**
 * System initialization check response DTO.
 */
export interface IInitCheckResponse {
  needsInit: boolean;
  timestamp: string;
}

/**
 * System initialization setup payload DTO.
 */
export interface IInitSystemPayload {
  name?: string;
  email?: string;
  password?: string;
  adminEmail?: string;
  adminName?: string;
  adminPassword?: string;
  organizationName?: string;
  [key: string]: unknown;
}

/**
 * Organization owner provisioning payload DTO.
 */
export interface IProvisionOwnerDTO {
  email: string;
  name?: string;
  role?: string;
  [key: string]: unknown;
}

