import { eq, ilike, and, or, db, count, asc, type SQL } from '@workspace/database/client';
import { gymMember, staffProfile, authMember, user } from '@workspace/database/schema';
import { ORG_ROLES } from '@workspace/shared';
import { type CoachesFilter as ICoachesFilter, type CreateCoachDTO as ICreateCoachDTO, type UpdateCoachDTO as IUpdateCoachDTO } from '@workspace/shared/types';
export type { CoachesFilter, CreateCoachDTO, UpdateCoachDTO } from '@workspace/shared/types';

export const coachesRepository = {
  /**
   * Finds all coaches by joining gymMember with staffProfile and authMember.
   * Filters by authMember.role === ORG_ROLES.COACH.
   */
  async findAll(organizationId: string, filters: ICoachesFilter = {}) {
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
      conditions.push(eq(staffProfile.isVisible, isVisible));
    }

    const whereClause = and(...conditions) as SQL;

    // Join gymMember with staffProfile and authMember
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
        specialities: staffProfile.specialities,
        bio: staffProfile.bio,
        isVisible: staffProfile.isVisible,
        displayOrder: staffProfile.displayOrder,
        role: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMember)
      .leftJoin(staffProfile, eq(gymMember.id, staffProfile.memberId))
      // authMember and user might not exist initially if the user hasn't completed sign up
      .leftJoin(user, eq(gymMember.userId, user.id))
      .innerJoin(authMember, eq(user.id, authMember.userId))
      .where(whereClause)
      .orderBy(asc(staffProfile.displayOrder), asc(gymMember.id))
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
        .leftJoin(staffProfile, eq(gymMember.id, staffProfile.memberId))
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
        specialities: staffProfile.specialities,
        bio: staffProfile.bio,
        isVisible: staffProfile.isVisible,
        displayOrder: staffProfile.displayOrder,
        role: authMember.role,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMember)
      .leftJoin(staffProfile, eq(gymMember.id, staffProfile.memberId))
      .leftJoin(user, eq(gymMember.userId, user.id))
      .innerJoin(authMember, eq(user.id, authMember.userId))
      .where(and(eq(gymMember.id, id), eq(gymMember.organizationId, organizationId), eq(authMember.role, ORG_ROLES.COACH)));

    return result;
  },

  /**
   * Creates a coach by inserting into gymMember and then staffProfile.
   */
  async create(organizationId: string, data: ICreateCoachDTO) {
    return db.transaction(async (tx) => {
      // 1. Create the gymMember
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

      // 2. Create the Coach Profile
      const [profile] = await tx
        .insert(staffProfile)
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
   * Updates a coach by updating both gymMember and staffProfile.
   */
  async update(organizationId: string, id: number, data: IUpdateCoachDTO) {
    return db.transaction(async (tx) => {
      // 1. Update gymMember part
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

      // 2. Update Profile part
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
          .insert(staffProfile)
          .values({
            organizationId,
            memberId: id,
            ...filteredProfileFields,
          })
          .onConflictDoUpdate({
            target: [staffProfile.memberId],
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
