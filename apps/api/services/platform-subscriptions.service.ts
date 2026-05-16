import { platformSubscriptionsRepository, type SubscriptionFilters, type SubscriptionWithDetails, type PaginatedSubscriptions } from '../repositories/platform-subscriptions.repository';
import { PLATFORM_SUBSCRIPTION_STATUSES, type PlatformSubscriptionStatus } from '@workspace/shared/constants';

export const platformSubscriptionsService = {
  async getAllSubscriptions(filters: SubscriptionFilters = {}): Promise<PaginatedSubscriptions> {
    return platformSubscriptionsRepository.findAll(filters);
  },

  async getSubscriptionById(id: number): Promise<SubscriptionWithDetails | null> {
    return platformSubscriptionsRepository.findById(id);
  },

  async getSubscriptionsByOrganization(organizationId: string): Promise<SubscriptionWithDetails[]> {
    return platformSubscriptionsRepository.findByOrganization(organizationId);
  },

  async cancelSubscription(id: number, reason?: string) {
    return platformSubscriptionsRepository.cancel(id, reason);
  },

  async extendSubscription(id: number, newEndDate: Date) {
    return platformSubscriptionsRepository.extendPeriod(id, newEndDate);
  },

  async deleteSubscription(id: number) {
    return platformSubscriptionsRepository.delete(id);
  },

  async getStats() {
    return platformSubscriptionsRepository.getStats();
  },

  /**
   * Determina el estado actual de la suscripción de una organización basado en la fecha de expiración.
   * Flujo de Grace Period:
   * - 0 a 7 días vencida: PAST_DUE (Aviso, acceso total)
   * - 8 a 14 días vencida: READ_ONLY (Solo lectura)
   * - 15+ días vencida: SUSPENDED (Bloqueo total)
   */
  async getOrganizationStatus(organizationId: string): Promise<PlatformSubscriptionStatus> {
    const subs = await platformSubscriptionsRepository.findByOrganization(organizationId);
    if (subs.length === 0) return PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;

    const latest = subs[0]!;
    return latest.computedStatus;
  },

  /**
   * Crea una nueva suscripción manual con overrides opcionales.
   * Genera automáticamente un invoice de $0 si es un Trial.
   */
  async createManualSubscription(data: {
    organizationId: string;
    planId: number;
    startDate: Date;
    endDate: Date;
    isTrial: boolean;
    priceOverride?: string;
    paymentMethod: string;
    currency: string;
  }) {
    return platformSubscriptionsRepository.createManualSubscription(data);
  },

  async getOrganizationInvoices(organizationId: string) {
    return platformSubscriptionsRepository.getOrganizationInvoices(organizationId);
  },
};