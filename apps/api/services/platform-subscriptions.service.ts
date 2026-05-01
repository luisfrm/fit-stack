import { eq, desc, db } from '@workspace/database/client';
import { storeSubscription, platformInvoice } from '@workspace/database/schema';
import { PlatformSubscriptionStatus } from '@workspace/shared/types';

export const platformSubscriptionsService = {
  /**
   * Determina el estado actual de la suscripción de una organización basado en la fecha de expiración.
   * Flujo de Grace Period:
   * - 0 a 7 días vencida: PAST_DUE (Aviso, acceso total)
   * - 8 a 14 días vencida: READ_ONLY (Solo lectura)
   * - 15+ días vencida: SUSPENDED (Bloqueo total)
   */
  async getOrganizationStatus(organizationId: string): Promise<PlatformSubscriptionStatus> {
    const [subscription] = await db
      .select()
      .from(storeSubscription)
      .where(eq(storeSubscription.organizationId, organizationId))
      .orderBy(desc(storeSubscription.createdAt))
      .limit(1);

    if (!subscription) return 'suspended';
    if (subscription.status === 'cancelled') return 'cancelled';

    const now = new Date();
    const endDate = new Date(subscription.currentPeriodEnd);

    if (now <= endDate) return 'active';

    // Cálculo de días de retraso
    const diffTime = Math.abs(now.getTime() - endDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) return 'past_due';
    if (diffDays <= 14) return 'read_only';

    return 'suspended';
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
    // 1. Crear suscripción
    const [newSub] = await db.insert(storeSubscription).values({
      organizationId: data.organizationId,
      planId: data.planId,
      status: 'active',
      startDate: data.startDate,
      currentPeriodEnd: data.endDate,
      isTrial: data.isTrial,
      priceOverride: data.priceOverride,
    }).returning();

    // 2. Generar Invoice correspondiente
    await db.insert(platformInvoice).values({
      organizationId: data.organizationId,
      planId: data.planId,
      amount: data.isTrial ? "0.00" : (data.priceOverride || "0.00"), // Asumimos 0 si no se provee precio
      currency: data.currency,
      paymentMethod: data.paymentMethod,
      status: data.isTrial ? 'trial' : 'pending',
      dueDate: data.startDate,
      createdAt: new Date(),
    });

    return newSub;
  },

  async getOrganizationInvoices(organizationId: string) {
    return db
      .select()
      .from(platformInvoice)
      .where(eq(platformInvoice.organizationId, organizationId))
      .orderBy(desc(platformInvoice.createdAt));
  }
};
