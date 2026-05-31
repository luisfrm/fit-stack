import { eq, ilike, and, or, db, count, asc, type SQL } from '@workspace/database/client';
import { gymMember, coachProfile, authMember, user } from '@workspace/database/schema';
import { ORG_ROLES } from '@workspace/shared';
import { type TrainersFilter as ITrainersFilter, type CreateTrainerDTO as ICreateTrainerDTO, type UpdateTrainerDTO as IUpdateTrainerDTO } from '@workspace/shared/types';
export type { TrainersFilter, CreateTrainerDTO, UpdateTrainerDTO } from '@workspace/shared/types';

export const trainersRepository = {
  /**
   * Finds all trainers by joining gymMember with coachProfile and authMember.
   * Filters by authMember.role === ORG_ROLES.COACH.
   */
  async findAll(organizationId: string, filters: ITrainersFilter = {}) {
    const { name, isVisible, page = 1, limit = 10, requireTotal = true } = filters;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [
      eq(gymMember.organizationId, organizationId),
      eq(authMember.role, ORG_ROLES.COACH)
    ];

    if (name) {
      conditions.push(
        or(
          ilike(gymMember.firstName, `%${name}%`),
          ilike(gymMember.lastName, `%${name}%`)
        ) as SQL
      );
    }

    if (isVisible !== undefined) {
      conditions.push(eq(coachProfile.isVisible, isVisible));
    }

    const whereClause = and(...conditions) as SQL;

    const rowsQuery = db
      .select({
        id: gymMember.id,
        firstName: gymMember.firstName,
        lastName: gymMember.lastName,
        email: gymMember.email,
        phoneNumber: gymMember.phoneNumber,
        birthday: gymMember.birthday,
        imageUrl: gymMember.imageUrl,
        isActive: gymMember.isActive,
        documentId: gymMember.documentId,
        specialities: coachProfile.specialities,
        bio: coachProfile.bio,
        isVisible: coachProfile.isVisible,
        displayOrder: coachProfile.displayOrder,
        role: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMember)
      .leftJoin(coachProfile, eq(gymMember.id, coachProfile.memberId))
      .leftJoin(user, eq(gymMember.userId, user.id))
      .innerJoin(authMember, eq(user.id, authMember.userId))
      .where(whereClause)
      .orderBy(asc(coachProfile.displayOrder), asc(gymMember.id))
      .limit(limit)
      .offset(offset);

    if (!requireTotal) {
      const rows = await rowsQuery;
      return { data: rows, total: -1, page, limit, totalPages: -1 };
    }

    const [rows, countResult] = await Promise.all([
      rowsQuery,
      db
        .select({ total: count() })
        .from(gymMember)
        .leftJoin(coachProfile, eq(gymMember.id, coachProfile.memberId))
        .leftJoin(user, eq(gymMember.userId, user.id))
        .innerJoin(authMember, eq(user.id, authMember.userId))
        .where(whereClause),
    ]);

    const total = Number(countResult[0]?.total ?? 0);

    return {
      data: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  async findById(organizationId: string, id: number) {
    const [result] = await db
      .select({
        id: gymMember.id,
        firstName: gymMember.firstName,
        lastName: gymMember.lastName,
        email: gymMember.email,
        phoneNumber: gymMember.phoneNumber,
        birthday: gymMember.birthday,
        imageUrl: gymMember.imageUrl,
        isActive: gymMember.isActive,
        documentId: gymMember.documentId,
        specialities: coachProfile.specialities,
        bio: coachProfile.bio,
        isVisible: coachProfile.isVisible,
        displayOrder: coachProfile.displayOrder,
        role: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMember)
      .leftJoin(coachProfile, eq(gymMember.id, coachProfile.memberId))
      .leftJoin(user, eq(gymMember.userId, user.id))
      .innerJoin(authMember, eq(user.id, authMember.userId))
      .where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId), eq(authMember.role, ORG_ROLES.COACH)));

    return result;
  },

  /**
   * Creates a trainer by inserting into gymMember and then coachProfile.
   */
  async create(organizationId: string, data: ICreateTrainerDTO) {
    return db.transaction(async (tx) => {
      const [member] = await tx
        .insert(gymMember)
        .values({
          organizationId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          documentId: data.documentId,
          phoneNumber: data.phoneNumber,
          birthday: data.birthday,
          imageUrl: data.imageUrl,
          isActive: true,
        })
        .returning();

      if (!member) throw new Error("Fallo al crear el miembro entrenador");

      const [profile] = await tx
        .insert(coachProfile)
        .values({
          organizationId,
          memberId: member.id,
          specialities: data.specialities,
          bio: data.bio,
          isVisible: data.isVisible ?? true,
          displayOrder: data.displayOrder ?? 0,
        })
        .returning();

      if (!profile) throw new Error("Fallo al crear el perfil de entrenador");

      return { ...member, ...profile };
    });
  },

  /**
   * Updates a trainer by updating both gymMember and coachProfile.
   */
  async update(organizationId: string, id: number, data: IUpdateTrainerDTO) {
    return db.transaction(async (tx) => {
      const memberFields = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        documentId: data.documentId,
        phoneNumber: data.phoneNumber,
        birthday: data.birthday,
        imageUrl: data.imageUrl,
        isActive: data.isActive,
      };

      const filteredMemberFields = Object.fromEntries(
        Object.entries(memberFields).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(filteredMemberFields).length > 0) {
        await tx
          .update(gymMember)
          .set(filteredMemberFields)
          .where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId)));
      }

      const profileFields = {
        specialities: data.specialities,
        bio: data.bio,
        isVisible: data.isVisible,
        displayOrder: data.displayOrder,
      };

      const filteredProfileFields = Object.fromEntries(
        Object.entries(profileFields).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(filteredProfileFields).length > 0) {
        await tx
          .insert(coachProfile)
          .values({
            organizationId,
            memberId: id,
            ...filteredProfileFields,
          })
          .onConflictDoUpdate({
            target: [coachProfile.memberId],
            set: filteredProfileFields,
          });
      }

      return this.findById(organizationId, id);
    });
  },

  async delete(organizationId: string, id: number) {
    await db.delete(gymMember).where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId)));
  }
};