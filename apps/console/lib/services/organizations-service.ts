import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  IPlatformOrganization,
  IPlatformSubscription,
  IPaymentMethodDetails,
  IProvisionOwnerDTO,
  IPaginatedResult,
  PaymentStatus,
  IMember,
} from "@workspace/shared/types";

const ORGANIZATIONS_PATH = "/platform/organizations";

export type PaginatedOrganizationsResult =
  IPaginatedResult<IPlatformOrganization>;

export interface OrgAiQuota {
  monthly: { used: number; limit: number };
  remaining: number | null;
  disabled: boolean;
  periodStart: string;
}

export interface OrgGymOverview {
  totalMembers: number;
  activeSubMembers: number;
  portal: { used: number; limit: number; pending: number };
}

export interface AddSubscriptionPayload {
  planId: number;
  startDate?: string;
  isTrial?: boolean;
  priceOverrideCents?: number;
  payment: {
    amountPaidCents: number;
    currencyPaid: string;
    exchangeRateApplied?: string;
    baseAmountCents?: number;
    paymentMethod: string;
    paymentMethodDetails?: IPaymentMethodDetails;
    status: PaymentStatus;
    paymentDate?: string;
  };
}

/**
 * Service to manage platform organizations, provisioning, and platform-level subscriptions.
 */
export const organizationsService = {
  /**
   * Retrieves a paginated list of organizations with optional filter parameters.
   */
  async getAll(
    params?: {
      query?: string;
      page?: number;
      limit?: number;
      includeMemberCount?: boolean;
    },
    options?: ApiFetchOptions,
  ): Promise<PaginatedOrganizationsResult> {
    return await api<PaginatedOrganizationsResult>(ORGANIZATIONS_PATH, {
      query: params,
      ...options,
    });
  },

  /**
   * Reads the AI quota of an organization for the current cycle.
   */
  async getAiUsage(id: string, options?: ApiFetchOptions): Promise<OrgAiQuota> {
    return await api<OrgAiQuota>(
      `${ORGANIZATIONS_PATH}/${id}/ai-usage`,
      options,
    );
  },

  /**
   * Retrieves an organization by its id.
   */
  async getById(
    id: string,
    options?: ApiFetchOptions,
  ): Promise<IPlatformOrganization> {
    return await api<IPlatformOrganization>(
      `${ORGANIZATIONS_PATH}/${id}`,
      options,
    );
  },

  /**
   * Retrieves an organization by its slug (route detail: /organizations/[slug]).
   */
  async getBySlug(
    slug: string,
    params?: { includeMemberCount?: boolean },
    options?: ApiFetchOptions,
  ): Promise<IPlatformOrganization> {
    return await api<IPlatformOrganization>(
      `${ORGANIZATIONS_PATH}/by-slug/${slug}`,
      { query: params, ...options },
    );
  },

  /**
   * Reads the gym adoption + portal seats of an organization (console analytics).
   */
  async getGymOverview(
    id: string,
    options?: ApiFetchOptions,
  ): Promise<OrgGymOverview> {
    return await api<OrgGymOverview>(
      `${ORGANIZATIONS_PATH}/${id}/gym-overview`,
      options,
    );
  },

  /**
   * Live slug availability check. Throws 409 { code: 'SLUG_TAKEN' } if in use.
   */
  async checkSlug(
    slug: string,
    excludeId?: string,
  ): Promise<{ available: boolean }> {
    return await api<{ available: boolean }>(
      `${ORGANIZATIONS_PATH}/check-slug`,
      {
        query: { slug, ...(excludeId ? { excludeId } : {}) },
      },
    );
  },

  /**
   * Creates a new platform organization.
   */
  async create(
    data: Partial<IPlatformOrganization>,
  ): Promise<IPlatformOrganization> {
    return await api<IPlatformOrganization>(ORGANIZATIONS_PATH, {
      method: "POST",
      body: data,
    });
  },

  /**
   * Updates an existing platform organization.
   */
  async update(
    id: string,
    data: Partial<IPlatformOrganization>,
  ): Promise<IPlatformOrganization> {
    return await api<IPlatformOrganization>(`${ORGANIZATIONS_PATH}/${id}`, {
      method: "PATCH",
      body: data,
    });
  },

  /**
   * Adds a new platform subscription to an organization.
   * The payload uses cents (amountPaidCents) and supports trial/free plans.
   */
  async addSubscription(
    id: string,
    data: AddSubscriptionPayload,
  ): Promise<IPlatformSubscription> {
    return await api<IPlatformSubscription>(
      `${ORGANIZATIONS_PATH}/${id}/subscriptions`,
      { method: "POST", body: data },
    );
  },

  /**
   * Allows the current admin user to join an organization context.
   */
  async join(id: string): Promise<void> {
    await api(`${ORGANIZATIONS_PATH}/${id}/join`, { method: "POST" });
  },

  /**
   * Provisions an owner user account for an organization.
   */
  async provisionOwner(
    id: string,
    data: IProvisionOwnerDTO,
    sendInvite: boolean = false,
  ): Promise<Record<string, unknown>> {
    return await api<Record<string, unknown>>(
      `${ORGANIZATIONS_PATH}/${id}/staff`,
      {
        method: "POST",
        body: { ...data, sendInvite },
      },
    );
  },

  /**
   * Fetches the staff members of an organization.
   */
  async getStaff(id: string): Promise<IMember[]> {
    return await api<IMember[]>(`${ORGANIZATIONS_PATH}/${id}/staff`);
  },

  /**
   * Resends an invitation to a staff member of an organization.
   */
  async resendStaffInvite(
    id: string,
    memberId: number,
  ): Promise<{ success: boolean; message?: string }> {
    return await api<{ success: boolean; message?: string }>(
      `${ORGANIZATIONS_PATH}/${id}/staff/${memberId}/resend-invite`,
      { method: "POST" },
    );
  },

  /**
   * Grants AI credits to an organization (manual top-up / bonus del ciclo vigente).
   * El bonus aumenta el límite efectivo (base del plan + bonus) sin tocar el consumo.
   */
  async grantAiCredits(
    id: string,
    credits: number,
  ): Promise<{
    success: boolean;
    granted: number;
    monthly: { used: number; limit: number };
    remaining: number | null;
    periodStart: string;
  }> {
    return await api<{
      success: boolean;
      granted: number;
      monthly: { used: number; limit: number };
      remaining: number | null;
      periodStart: string;
    }>(`${ORGANIZATIONS_PATH}/${id}/ai-credits`, {
      method: "POST",
      body: { credits },
    });
  },
};
