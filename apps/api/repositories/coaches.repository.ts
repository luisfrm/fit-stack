import { eq, ilike, and, or, db, count, asc, type SQL } from '@workspace/database/client';
import { members, coachProfiles, roles, user } from '@workspace/database/schema';
import { ROLE_IDS } from '@workspace/shared/constants';
import { type CoachesFilter as ICoachesFilter, type CreateCoachDTO as ICreateCoachDTO, type UpdateCoachDTO as IUpdateCoachDTO } from '@workspace/shared/types';
export type { CoachesFilter, CreateCoachDTO, UpdateCoachDTO } from '@workspace/shared/types';

export const coachesRepository = {
  /**
   * Finds all coaches by joining Members with their Coach Profiles.
   * Filters by ROLE_IDS.TRAINER (3).
   */
  async findAll(filters: ICoachesFilter = {}) {
    const { name, isVisible, page = 1, limit = 10, requireTotal = true } = filters;
    const offset = (page - 1) * limit;

    const conditions: SQL[] = [eq(members.roleId, ROLE_IDS.TRAINER)];

    if (name) {
      conditions.push(
        or(
          ilike(members.firstName, `%${name}%`),
          ilike(members.lastName, `%${name}%`)
        ) as SQL
      );
    }

    if (isVisible !== undefined) {
      conditions.push(eq(coachProfiles.isVisible, isVisible));
    }

    const whereClause = and(...conditions) as SQL;

    // Join members with coachProfiles
    const rowsQuery = db
      .select({
        id: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        email: members.email,
        phoneNumber: members.phoneNumber,
        birthday: members.birthday,
        imageUrl: members.imageUrl,
        isActive: members.isActive,
        documentId: members.documentId,
        specialities: coachProfiles.specialities,
        bio: coachProfiles.bio,
        isVisible: coachProfiles.isVisible,
        displayOrder: coachProfiles.displayOrder,
        role: {
          id: roles.id,
          name: roles.name,
        },
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(members)
      .leftJoin(coachProfiles, eq(members.id, coachProfiles.memberId))
      .leftJoin(roles, eq(members.roleId, roles.id))
      .leftJoin(user, eq(members.id, user.memberId))
      .where(whereClause)
      .orderBy(asc(coachProfiles.displayOrder), asc(members.id))
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
        .from(members)
        .leftJoin(coachProfiles, eq(members.id, coachProfiles.memberId))
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

  async findById(id: number) {
    const [result] = await db
      .select({
        id: members.id,
        firstName: members.firstName,
        lastName: members.lastName,
        email: members.email,
        phoneNumber: members.phoneNumber,
        birthday: members.birthday,
        imageUrl: members.imageUrl,
        isActive: members.isActive,
        documentId: members.documentId,
        roleId: members.roleId,
        specialities: coachProfiles.specialities,
        bio: coachProfiles.bio,
        isVisible: coachProfiles.isVisible,
        displayOrder: coachProfiles.displayOrder,
        user: {
          id: user.id,
          email: user.email,
        }
      })
      .from(members)
      .leftJoin(coachProfiles, eq(members.id, coachProfiles.memberId))
      .leftJoin(user, eq(members.id, user.memberId))
      .where(and(eq(members.id, id), eq(members.roleId, ROLE_IDS.TRAINER)));

    return result;
  },

  /**
   * Creates a coach by inserting into Members and then CoachProfiles.
   */
  async create(data: ICreateCoachDTO) {
    return db.transaction(async (tx) => {
      // 1. Create the Member
      const [member] = await tx
        .insert(members)
        .values({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          documentId: data.documentId,
          phoneNumber: data.phoneNumber,
          birthday: data.birthday,
          imageUrl: data.imageUrl,
          roleId: ROLE_IDS.TRAINER,
          isActive: true,
        })
        .returning();

      if (!member) throw new Error("Fallo al crear el miembro");

      // 2. Create the Coach Profile
      const [profile] = await tx
        .insert(coachProfiles)
        .values({
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
   * Updates a coach by updating both Members and CoachProfiles.
   */
  async update(id: number, data: IUpdateCoachDTO) {
    return db.transaction(async (tx) => {
      // 1. Update Member part
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

      // Filter out undefined to avoid overwriting with null unless intended
      const filteredMemberFields = Object.fromEntries(
        Object.entries(memberFields).filter(([_, v]) => v !== undefined)
      );

      if (Object.keys(filteredMemberFields).length > 0) {
        await tx
          .update(members)
          .set(filteredMemberFields)
          .where(eq(members.id, id));
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
        // Upsert profile in case it doesn't exist yet for this member
        await tx
          .insert(coachProfiles)
          .values({
            memberId: id,
            ...filteredProfileFields,
          })
          .onConflictDoUpdate({
            target: [coachProfiles.memberId],
            set: filteredProfileFields,
          });
      }

      return this.findById(id);
    });
  },

  async delete(id: number) {
    // Because of onDelete: 'cascade' on the profile relation, 
    // deleting the member will delete the profile.
    await db.delete(members).where(and(eq(members.id, id), eq(members.roleId, ROLE_IDS.TRAINER)));
  }
};
