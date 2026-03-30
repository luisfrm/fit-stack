/* ─────────────────────────────────────────────
   DASHBOARD TYPES
   ───────────────────────────────────────────── */

export type MemberPlan = "vip" | "pro" | "basic";

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

/**
 * Interface for a recently registered member.
 */
export interface IRecentRegistration {
  name: string;
  time: string;
  plan: MemberPlan;
  avatarUrl?: string;
}

/**
 * Trend direction for KPI cards.
 */
export type TrendDirection = "up" | "down" | "neutral";

/**
 * Valid roles for members.
 */
export type Role = "admin" | "manager" | "trainer" | "client";

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
  role: Role;
  documentId?: string;
  isActive: boolean;
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
 */
export interface ICoach {
  id?: number;
  name: string;
  role: string;
  specialities: string[] | null;
  imageUrl: string | null;
  isVisible: boolean;
  displayOrder: number;
}
