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
  role?: Role; // Defined below as 'admin' | 'manager' etc.
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
  name: string;
  time: string;
  avatarUrl?: string;
}

/**
 * Trend direction for KPI cards.
 */
export type TrendDirection = "up" | "down" | "neutral";

/**
 * Valid roles for members (Dynamic from DB slugs)
 */
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  COACH: 'coach',
  TRAINER: 'trainer',
  CASHIER: 'cashier',
  MEMBER: 'member',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

export type FrequencyType = 'once' | 'weekly';

/**
 * Interface for a class in the CMS.
 */
export interface ICmsClass {
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
  user?: {
    id: string;
    email: string;
  } | null;
  documentId?: string;
  isActive: boolean;
}

export interface MemberFilter {
  query?: string;
  role?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedMembers {
  data: IMember[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CoachFilter {
  name?: string;
  role?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
}

export interface PaginatedCoaches {
  data: ICoach[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Interface for a Coach (Trainer) in the CMS.
 * This represents a Member with a Coach role and its associated Profile.
 */
export interface ICoach extends IMember {
  // IMember fields are inherited (firstName, lastName, imageUrl, etc.)
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

export type SubscriptionStatus = 'active' | 'canceled' | 'expired';

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
  createdAt?: string;
  
  // Optional joined fields for CMS Table display
  memberName?: string;
  planName?: string;
  price?: number;
  role?: string;
}

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
  paymentMethodDetails?: Record<string, any>;
  
  paymentDate: string;
  createdAt?: string;
}

/* ── API DTOs ── */

export interface CoachesFilter {
  name?: string;
  role?: string;
  isVisible?: boolean;
  page?: number;
  limit?: number;
  requireTotal?: boolean;
}

export interface CreateCoachDTO {
  firstName: string;
  lastName: string;
  email: string;
  documentId?: string | null;
  phoneNumber?: string | null;
  birthday?: string | null;
  imageUrl?: string | null;
  specialities?: string[] | null;
  bio?: string | null;
  isVisible?: boolean;
  displayOrder?: number;
}

export type UpdateCoachDTO = Partial<CreateCoachDTO> & { isActive?: boolean };

/* ── SAAS PLATFORM TYPES ── */

export interface PlanFeatures {
  limits?: {
    members?: number;
    coaches?: number;
  };
  access?: {
    pwa?: boolean;
    blog?: boolean;
    web_commercial?: boolean;
  };
}

export interface IPlatformPlan {
  id: number;
  name: string;
  monthlyPrice: number;
  features: PlanFeatures | null;
  suggestedDurationDays?: number | null;
  isActive: boolean;
  createdAt?: string | Date;
}

export type PlatformSubscriptionStatus = 'active' | 'past_due' | 'read_only' | 'suspended' | 'canceled';

export interface IPlatformSubscription {
  id: number;
  organizationId: string;
  planId: number;
  status: PlatformSubscriptionStatus;
  startDate: string | Date;
  endDate: string | Date;
  isTrial: boolean;
  priceOverride?: number | null;
  createdAt?: string | Date;
}

export interface IPlatformInvoice {
  id: number;
  organizationId: string;
  planId: number;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: 'paid' | 'pending' | 'trial' | 'void';
  dueDate: string | Date;
  paidAt?: string | Date | null;
  createdAt?: string | Date;
}
