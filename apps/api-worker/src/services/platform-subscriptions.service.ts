import type { PlatformSubscriptionsRepository, SubscriptionFilters, SubscriptionWithDetails, PaginatedSubscriptions } from '../repositories/platform-subscriptions.repository';
import { PLATFORM_SUBSCRIPTION_STATUSES, type PlatformSubscriptionStatus } from '@workspace/shared/constants';

export function createPlatformSubscriptionsService(platformSubsRepo: PlatformSubscriptionsRepository) {
  return {
    async getAllSubscriptions(filters: SubscriptionFilters = {}): Promise<PaginatedSubscriptions> {
      return platformSubsRepo.findAll(filters);
    },

    async getSubscriptionById(id: number): Promise<SubscriptionWithDetails | null> {
      return platformSubsRepo.findById(id);
    },

    async getSubscriptionsByOrganization(organizationId: string): Promise<SubscriptionWithDetails[]> {
      return platformSubsRepo.findByOrganization(organizationId);
    },

    async cancelSubscription(id: number, reason?: string) {
      return platformSubsRepo.cancel(id, reason);
    },

    async extendSubscription(id: number, newEndDate: Date) {
      return platformSubsRepo.extendPeriod(id, newEndDate);
    },

    async deleteSubscription(id: number) {
      return platformSubsRepo.delete(id);
    },

    async getStats() {
      return platformSubsRepo.getStats();
    },

    async getOrganizationStatus(organizationId: string): Promise<PlatformSubscriptionStatus> {
      const subs = await platformSubsRepo.findByOrganization(organizationId);
      if (subs.length === 0) return PLATFORM_SUBSCRIPTION_STATUSES.SUSPENDED;

      const latest = subs[0]!;
      return latest.computedStatus;
    },

    async createManualSubscription(data: {
      organizationId: string;
      planId: number;
      startDate: Date;
      endDate: Date;
      isTrial: boolean;
      priceOverride?: string;
      paymentMethod: string;
      currency: string;
      amount?: string;
      paymentStatus?: string;
      exchangeRateApplied?: string;
      paymentMethodDetails?: any;
      paymentDate?: Date;
    }) {
      return platformSubsRepo.createManualSubscription(data);
    },

    async getOrganizationInvoices(organizationId: string) {
      return platformSubsRepo.getOrganizationInvoices(organizationId);
    },
  };
}

export type PlatformSubscriptionsService = ReturnType<typeof createPlatformSubscriptionsService>;
