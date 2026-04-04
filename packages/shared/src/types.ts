/* ── SHARED TYPES ── */

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
export type Role = 'admin' | 'manager' | 'trainer' | 'client';

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
  roleId: number;
  role?: {
    id: number;
    name: string;
  };
  user?: {
    id: string;
    email: string;
  } | null;
  documentId?: string;
  isActive: boolean;
}

export interface MemberFilter {
  query?: string;
  roleId?: number;
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

export type Currency = 'USD' | 'VES' | 'EUR';

/**
 * Interface for a Membership Plan.
 */
export interface IMembershipPlan {
  id?: number;
  name: string;
  price: number; // in cents
  currency: Currency;
  features: string[] | null;
  isPopular: boolean;
  isActive: boolean;
  isVisibleOnSite: boolean;
  createdAt?: string;
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
  roleId?: number;
}

export type PaymentMethod = 'cash' | 'zelle' | 'pago_movil' | 'pos' | 'other';

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
  planSnapshotCurrency: Currency;
  
  // Payment Data
  amountPaid: number;
  currencyPaid: Currency;
  exchangeRateApplied?: string;
  
  paymentMethod: PaymentMethod;
  paymentMethodDetails?: string;
  
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
