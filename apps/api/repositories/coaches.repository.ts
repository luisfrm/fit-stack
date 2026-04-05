import { eq, ilike, and, or, db, count, asc, type SQL } from '@workspace/database/client';
import { gymMembers, coachProfiles, authMember, user } from '@workspace/database/schema';
import { ROLES } from '@workspace/shared/constants';
import { type CoachesFilter as ICoachesFilter, type CreateCoachDTO as ICreateCoachDTO, type UpdateCoachDTO as IUpdateCoachDTO } from '@workspace/shared/types';
export type { CoachesFilter, CreateCoachDTO, UpdateCoachDTO } from '@workspace/shared/types';

export const coachesRepository = {
  /**
   * Finds all coaches by joining gymMembers with coachProfiles and authMember.
   * Filters by authMember.role === ROLES.COACH.
   */
  async findAll(organizationId: string, filters: ICoachesFilter = {}) {
    const { name, isVisible, page = 1, limit = 10, requireTotal = true } = filters;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [
      eq(gymMembers.organizationId, organizationId),
      eq(authMember.role, ROLES.COACH)
    ];

    if (name) {
      conditions.push(
        or(
          ilike(gymMembers.firstName, `%${name}%`),
          ilike(gymMembers.lastName, `%${name}%`)
        ) as SQL
      );
    }

    if (isVisible !== undefined) {
      conditions.push(eq(coachProfiles.isVisible, isVisible));
    }

    const whereClause = and(...conditions) as SQL;

    // Join gymMembers with coachProfiles and authMember
    const rowsQuery = db
      .select({
        id: gymMembers.id,
        firstName: gymMembers.firstName,
        lastName: gymMembers.lastName,
        email: gymMembers.email,
        phoneNumber: gymMembers.phoneNumber,
        birthday: gymMembers.birthday,
        imageUrl: gymMembers.imageUrl,
        isActive: gymMembers.isActive,
        documentId: gymMembers.documentId,
        specialities: coachProfiles.specialities,
        bio: coachProfiles.bio,
        isVisible: coachProfiles.isVisible,
        displayOrder: coachProfiles.displayOrder,
        role: {
          id: authMember.id,
          name: authMember.role,
        },
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMembers)
      .leftJoin(coachProfiles, eq(gymMembers.id, coachProfiles.memberId))
      // authMember and user might not exist initially if the user hasn't completed sign up
      .leftJoin(user, eq(gymMembers.userId, user.id))
      .innerJoin(authMember, eq(user.id, authMember.userId))
      .where(whereClause)
      .orderBy(asc(coachProfiles.displayOrder), asc(gymMembers.id))
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
        .from(gymMembers)
        .leftJoin(coachProfiles, eq(gymMembers.id, coachProfiles.memberId))
        .leftJoin(user, eq(gymMembers.userId, user.id))
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
        id: gymMembers.id,
        firstName: gymMembers.firstName,
        lastName: gymMembers.lastName,
        email: gymMembers.email,
        phoneNumber: gymMembers.phoneNumber,
        birthday: gymMembers.birthday,
        imageUrl: gymMembers.imageUrl,
        isActive: gymMembers.isActive,
        documentId: gymMembers.documentId,
        specialities: coachProfiles.specialities,
        bio: coachProfiles.bio,
        isVisible: coachProfiles.isVisible,
        displayOrder: coachProfiles.displayOrder,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(gymMembers)
      .leftJoin(coachProfiles, eq(gymMembers.id, coachProfiles.memberId))
      .leftJoin(user, eq(gymMembers.userId, user.id))
      .innerJoin(authMember, eq(user.id, authMember.userId))
      .where(and(eq(gymMembers.id, id), eq(gymMembers.organizationId, organizationId), eq(authMember.role, ROLES.COACH)));

    return result;
  },

  /**
   * Creates a coach by inserting into gymMembers and then CoachProfiles.
   */
  async create(organizationId: string, data: ICreateCoachDTO) {
    return db.transaction(async (tx) => {
      // 1. Create the gymMember
      const [member] = await tx
        .insert(gymMembers)
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
        .insert(coachProfiles)
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
   * Updates a coach by updating both gymMembers and coachProfiles.
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
        Object.entries(memberFields).filter(([_, v]) => v !== undefined)
      );

      if (Object.keys(filteredMemberFields).length > 0) {
        await tx
          .update(gymMembers)
          .set(filteredMemberFields)
          .where(and(eq(gymMembers.id, id), eq(gymMembers.organizationId, organizationId)));
      }

      // 2. Update Profile part
      const profileFields = {
        specialities: data.specialities,
        bio: data.bio,
        isVisible: data.isVisible,
        displayOrder: data.displayOrder,
      };

      const filteredProfileFields = Object.fromEntries(
        Object.entries(profileFields).filter(([_, v]) => v !== undefined)
      );

      if (Object.keys(filteredProfileFields).length > 0) {
        await tx
          .insert(coachProfiles)
          .values({
            organizationId,
            memberId: id,
            ...filteredProfileFields,
          })
          .onConflictDoUpdate({
            target: [coachProfiles.memberId],
            set: filteredProfileFields,
          });
      }

      return this.findById(organizationId, id);
    });
  },

  async delete(organizationId: string, id: number) {
    await db.delete(gymMembers).where(and(eq(gymMembers.id, id), eq(gymMembers.organizationId, organizationId)));
  }
};
