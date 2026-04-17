import { db, eq, and, sql, desc, isNull } from '@workspace/database/client';
import { 
  accessControlLog, 
  biometricSyncTask, 
  gymMember, 
  subscription 
} from '@workspace/database/schema';

export const accessControlRepository = {
  /**
   * Verifies if a member has access based on their document ID and active subscription.
   */
  async verifyAccess(organizationId: string, documentId: string) {
    const now = new Date();

    // 1. Find member by documentId and organization
    const member = await db.query.gymMember.findFirst({
      where: and(
        eq(gymMember.documentId, documentId),
        eq(gymMember.organizationId, organizationId)
      ),
    });

    if (!member) {
      return { allowed: false, message: 'Miembro no encontrado', memberId: null };
    }

    if (!member.isActive) {
      return { allowed: false, message: 'Miembro inactivo', memberId: member.id, name: `${member.firstName} ${member.lastName}` };
    }

    // 2. Check for active subscription
    const activeSubscription = await db.query.subscription.findFirst({
      where: and(
        eq(subscription.memberId, member.id),
        eq(subscription.organizationId, organizationId),
        isNull(subscription.cancelledAt),
        sql`${subscription.endDate} >= ${now}`
      ),
      orderBy: desc(subscription.endDate),
    });

    if (!activeSubscription) {
      return { 
        allowed: false, 
        message: 'Sin suscripción activa', 
        memberId: member.id, 
        name: `${member.firstName} ${member.lastName}` 
      };
    }

    return { 
      allowed: true, 
      message: 'Acceso concedido', 
      memberId: member.id, 
      name: `${member.firstName} ${member.lastName}`,
      expirationDate: activeSubscription.endDate
    };
  },

  /**
   * Records an access attempt.
   */
  async createLog(data: {
    organizationId: string;
    memberId: number | null;
    documentId: string;
    status: 'granted' | 'denied' | 'error';
    accessType?: 'face' | 'fingerprint' | 'card';
    metadata?: any;
  }) {
    const [log] = await db.insert(accessControlLog).values({
      organizationId: data.organizationId,
      memberId: data.memberId,
      documentId: data.documentId,
      status: data.status,
      accessType: data.accessType ?? 'face',
      metadata: data.metadata,
    }).returning();
    return log;
  },

  /**
   * Gets pending synchronization tasks for the local "Bridge" app.
   */
  async getPendingSyncTasks(organizationId: string) {
    return db
      .select({
        taskId: biometricSyncTask.id,
        type: biometricSyncTask.type,
        memberId: gymMember.id,
        firstName: gymMember.firstName,
        lastName: gymMember.lastName,
        documentId: gymMember.documentId,
        imageUrl: gymMember.imageUrl,
      })
      .from(biometricSyncTask)
      .innerJoin(gymMember, eq(biometricSyncTask.memberId, gymMember.id))
      .where(and(
        eq(biometricSyncTask.organizationId, organizationId),
        eq(biometricSyncTask.status, 'pending')
      ))
      .orderBy(biometricSyncTask.createdAt);
  },

  /**
   * Marks a sync task as completed or failed.
   */
  async updateTaskStatus(taskId: number, status: 'completed' | 'error', error?: string) {
    const [task] = await db
      .update(biometricSyncTask)
      .set({ 
        status, 
        lastError: error,
        updatedAt: new Date() 
      })
      .where(eq(biometricSyncTask.id, taskId))
      .returning();
    
    // If successfully synced, update the member flag
    if (status === 'completed' && task) {
      await db
        .update(gymMember)
        .set({ isBiometricEnrolled: true })
        .where(eq(gymMember.id, task.memberId));
    }

    return task;
  },

  /**
   * Creates a new synchronization task.
   */
  async createSyncTask(organizationId: string, memberId: number, type: 'enroll' | 'delete' = 'enroll') {
    const [task] = await db.insert(biometricSyncTask).values({
      organizationId,
      memberId,
      type,
      status: 'pending',
    }).returning();
    return task;
  }
};
