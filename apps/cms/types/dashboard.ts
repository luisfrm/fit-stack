/* ─────────────────────────────────────────────
   DASHBOARD TYPES
   ───────────────────────────────────────────── */

export type ClassStatus = "live" | "scheduled" | "cancelled";
export type MemberPlan = "vip" | "pro" | "basic";

/**
 * Interface for a class scheduled for today.
 */
export interface IClassToday {
  time: string;
  name: string;
  trainer: string;
  occupancy: number;
  status: ClassStatus;
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

/**
 * Interface for a class in the CMS.
 */
export interface ICmsClass {
  id?: number;
  name: string;
  timeInfo: string;
  description?: string;
  trainerName?: string;
  isVisible: boolean;
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
