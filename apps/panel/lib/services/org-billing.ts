import { api, type ApiFetchOptions } from "@/lib/api/client";
import type { IPaymentMethodConfig, IPaymentMethodDetails } from "@workspace/shared/types";

/**
 * Org SaaS subscription with plan details (comes from
 * GET /api/organizations/subscription — dates as ISO strings).
 */
export interface OrgSubscriptionInfo {
  id: number;
  organizationId: string;
  planId: number;
  startDate: string;
  currentPeriodEnd: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  status: string;
  latestPaymentStatus: string | null;
  organizationName: string;
  planName: string;
  /** plan price in cents */
  planPrice: number;
  planCurrency: string;
  planDurationValue: number;
  planDurationUnit: "day" | "week" | "month" | "year";
  paymentsCount: number;
}

export interface OrgPaymentMethodsResponse {
  activePaymentMethods: IPaymentMethodConfig[];
  activeCurrencies: string[];
  currencyFormat: string;
}

export interface OrgRenewPayload {
  paymentMethod: string;
  currencyPaid: string;
  paymentMethodDetails?: IPaymentMethodDetails;
  paymentDate?: string;
}

/**
 * Server-only helpers: suscripción SaaS de la org y métodos de pago de
 * plataforma expuestos al panel (renovación autoservicio).
 */
export async function getOrgSubscription(
  options?: ApiFetchOptions,
): Promise<OrgSubscriptionInfo | null> {
  try {
    const data = await api<{ subscription: OrgSubscriptionInfo | null }>(
      "/organizations/subscription",
      options,
    );
    return data.subscription;
  } catch (err) {
    console.error("Error fetching org subscription:", err);
    return null;
  }
}

export async function getOrgPaymentMethods(
  options?: ApiFetchOptions,
): Promise<OrgPaymentMethodsResponse | null> {
  try {
    return await api<OrgPaymentMethodsResponse>("/organizations/payment-methods", options);
  } catch (err) {
    console.error("Error fetching org payment methods:", err);
    return null;
  }
}

/** Client-side mutation: renews subscription (payment stays under review). */
export async function renewOrgSubscription(
  payload: OrgRenewPayload,
): Promise<{ success: true; paymentId: number }> {
  return await api("/organizations/subscription/renew", {
    method: "POST",
    body: payload,
  });
}