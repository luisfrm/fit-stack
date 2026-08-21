import { SubscriptionStatus, PaymentStatus, PlatformSubscriptionStatus } from '@workspace/shared/constants';
import type { PlatformRole } from './access-control';
import type { PlanFeaturesV2 } from './features/catalog';

export type { SubscriptionStatus, PaymentStatus, PlatformSubscriptionStatus };

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

  // Horario
  startTime: string;       // "HH:MM"
  endTime?: string;        // "HH:MM" opcional

  // Frecuencia
  frequencyType: FrequencyType;
  scheduledDate?: string;  // ISO date, solo para 'once'
  daysOfWeek?: number[];   // [0-6], solo para 'weekly'

  // Capacidad
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
  latestSubscription?: (ISubscription & { planName?: string }) | null;
}

export interface MemberFilter {
  query?: string;
  role?: string;
  isActive?: boolean;
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
  durationUnit: 'day' | 'week' | 'month' | 'year';
  features: string[] | null;
  isPopular: boolean;
  isActive: boolean;
  isVisibleOnSite: boolean;
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

  // Payment Data (From Join)
  paymentId?: number;
  amountPaid?: number;
  currencyPaid?: string;
  paymentMethod?: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any>;
  exchangeRateApplied?: string;
  paymentStatus?: PaymentStatus;
  paymentDate?: string;
}

export interface IPaymentMethodDetail {
  label: string;
  value: string;
  type?: 'text' | 'file' | 'number';
}

/**
 * Contracto canónico de `paymentMethodDetails` (panel + console + API).
 * Los forms envían un array de items auto-descriptivos; el API lo valida
 * con `paymentMethodDetailsSchema` (api-worker/src/lib/schemas.ts).
 * El lado de lectura mantiene tolerancia a filas legacy con forma de objeto.
 */
export type IPaymentMethodDetails = IPaymentMethodDetail[];

export interface IPaymentMethodField {
  id: string;
  label: string;
  type: 'text' | 'file' | 'number';
  required: boolean;
}

export interface IPaymentMethodConfig {
  id: string;
  name: string;
  fields: IPaymentMethodField[];
  icon?: string;
  currency: string | null; // null = any currency
}

export interface ITaxDetail {
  name: string;
  rate: number;
  amount: number;
}

/**
 * Interface for a Payment record.
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

  // Invoice Details (Optional/Internal)
  subtotal?: number;
  taxTotal?: number;
  taxDetails?: ITaxDetail[] | null;

  paymentDate: string;
  createdAt?: string;
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
  durationUnit: 'day' | 'week' | 'month' | 'year';
  features: PlanFeaturesV2 | null;
  isActive: boolean;
  trialDays: number; // 0 = sin trial
  createdAt?: string | Date;
  organizationCount?: number;
}

export interface IPlatformSubscription {
  id: number;
  organizationId: string;
  planId: number;
  /** Status computado (no se guarda en DB) */
  status: PlatformSubscriptionStatus;
  startDate: string | Date;
  currentPeriodEnd: string | Date;
  isTrial: boolean;
  /** Override del precio (en centavos). null = usar precio del plan */
  priceOverride?: number | null;
  cancelledAt?: string | Date | null;
  cancellationReason?: string | null;
  createdAt?: string | Date;

  // Optional joined fields
  planName?: string;
  planPrice?: number;
  planCurrency?: string;
  planDurationValue?: number;
  planDurationUnit?: 'day' | 'week' | 'month' | 'year';
  organizationName?: string;
  latestPaymentStatus?: PaymentStatus;
  paymentsCount?: number;
}

export interface IPlatformSubscriptionPayment {
  id: number;
  subscriptionId?: number | null;
  organizationId: string;
  planId: number;

  // Snapshot comercial
  planSnapshotName: string;
  planSnapshotPrice: number; // centavos
  planSnapshotCurrency: string;
  planSnapshotDurationValue: number;
  planSnapshotDurationUnit: 'day' | 'week' | 'month' | 'year';
  /** Snapshot de las features del plan al momento del pago (para comparar vs el plan hoy) */
  featuresSnapshot?: PlanFeaturesV2 | null;

  // Datos del pago
  amountPaid: number; // centavos
  currencyPaid: string;
  exchangeRateApplied?: string | null;
  baseAmount?: number | null; // centavos en moneda base

  // Método
  paymentMethod: string;
  paymentMethodDetails?: IPaymentMethodDetails | Record<string, any> | null;

  // Fechas
  paymentDate: string | Date;
  dueDate: string | Date;
  paidAt?: string | Date | null;
  refundedAt?: string | Date | null;
  createdAt?: string | Date;

  // Estado
  status: PaymentStatus;
}

/** @deprecated usar IPlatformSubscriptionPayment */
export type IPlatformPayment = IPlatformSubscriptionPayment;

export interface IOrganization {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  metadata?: Record<string, any> | null;

  // Fiscal/Localization Fields
  countryCode?: string;
  taxId?: string | null;
  legalName?: string | null;
  address?: string | null;
  fiscalConfig?: Record<string, any> | null;
  slogan?: string | null;
  timezone?: string | null;
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

