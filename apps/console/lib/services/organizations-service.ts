import { api, type ApiFetchOptions } from "@/lib/api/client";
import type {
  IPlatformOrganization,
  IPlatformSubscription,
  IPaymentMethodDetail,
  IProvisionOwnerDTO,
  IPaginatedResult,
} from "@workspace/shared/types";

const ORGANIZATIONS_PATH = "/platform/organizations";

export type PaginatedOrganizationsResult = IPaginatedResult<IPlatformOrganization>;

export interface AddSubscriptionPayload {
  planId: number;
  startDate: string;
  endDate: string;
  isTrial: boolean;
  priceOverride?: string;
  payment?: {
    amountPaid: number;
    currencyPaid: string;
    exchangeRateApplied?: string;
    paymentMethod: string;
    paymentMethodDetails?: IPaymentMethodDetail[] | Record<string, unknown>;
    status?: string;
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
};

