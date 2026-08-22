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

export type PaginatedOrganizationsResult = IPaginatedResult<IPlatformOrganization>;

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
   * Retrieves an organization by its ID.
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
    return await api<Record<string, unknown>>(`${ORGANIZATIONS_PATH}/${id}/staff`, {
      method: "POST",
      body: { ...data, sendInvite },
    });
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
  async resendStaffInvite(id: string, memberId: number): Promise<{ success: boolean; message?: string }> {
    return await api<{ success: boolean; message?: string }>(
      `${ORGANIZATIONS_PATH}/${id}/staff/${memberId}/resend-invite`,
      { method: "POST" }
    );
  },

  /**
   * Grants AI credits to an organization (manual top-up / tests).
   */
  async grantAiCredits(
    id: string,
    credits: number,
  ): Promise<{ success: boolean; granted: number; monthly: { used: number; limit: number } }> {
    return await api<{ success: boolean; granted: number; monthly: { used: number; limit: number } }>(
      `${ORGANIZATIONS_PATH}/${id}/ai-credits`,
      { method: "POST", body: { credits } },
    );
  },
};
