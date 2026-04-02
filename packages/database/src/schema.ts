import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  date,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- RBAC: ROLES & PERMISSIONS ---

export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(), // admin, manager, trainer, client, coach, custom
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(), // e.g., 'members:delete'
  description: text('description'),
});

export const rolePermissions = pgTable('role_permissions', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
  permissionId: integer('permission_id').references(() => permissions.id, { onDelete: 'cascade' }).notNull(),
});

// --- BETTER AUTH TABLES ---

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  roleId: integer('role_id').references(() => roles.id),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --- ENUMS ---
export const roleEnum = pgEnum('role', ['admin', 'manager', 'trainer', 'client']);
export const exerciseTypeEnum = pgEnum('exercise_type', ['compound', 'isolated']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'expired', 'cancelled']);
export const currencyEnum = pgEnum('currency', ['USD', 'VES', 'EUR']);
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'zelle', 'pago_movil', 'pos', 'other']);

// --- CORE: USERS & MEMBERS ---

export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  roleId: integer('role_id').references(() => roles.id), // Nueva columna para roles dinámicos (RBAC)
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  documentId: text('document_id'),
  phoneNumber: text('phone_number'),
  birthday: date('birthday'),
  imageUrl: text('image_url'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- GYM MANAGEMENT: MEMBRESÍAS ---

// Planes de Membresía (Ej: Basic, VIP, Platinum) - Usado tanto en CMS como en Facturación
export const membershipPlans = pgTable('membership_plans', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price').notNull(), // Guardado en centavos (ej: $45.00 -> 4500)
  currency: currencyEnum('currency').default('USD').notNull(),
  features: jsonb('features'), // Array: ["Acceso 24/7", "Zonas VIP"]
  isPopular: boolean('is_popular').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(), // Si es false, es un 'Borrador' / Inactivo en CMS
  isVisibleOnSite: boolean('is_visible_on_site').default(true).notNull(), // Solo afecta web pública
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Suscripciones: Relaciona a un Miembro con un Plan que pagó
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }).notNull(),
  planId: integer('plan_id').references(() => membershipPlans.id).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: subscriptionStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- FACTURACIÓN Y PAGOS ---

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }).notNull(),
  subscriptionId: integer('subscription_id').references(() => subscriptions.id),

  // Snapshots para historial histórico invariable
  planSnapshotName: text('plan_snapshot_name').notNull(),
  planSnapshotPrice: integer('plan_snapshot_price').notNull(),
  planSnapshotCurrency: currencyEnum('plan_snapshot_currency').notNull(),

  // Datos del Pago (Lo que realmente entró en caja)
  amountPaid: integer('amount_paid').notNull(),
  currencyPaid: currencyEnum('currency_paid').notNull(),
  exchangeRateApplied: text('exchange_rate_applied'), // Guardamos como texto para ser flexibles o numérico? numeric es mejor

  paymentMethod: paymentMethodEnum('payment_method').notNull(),
  paymentMethodDetails: text('payment_method_details'), // Referencia, banco o texto libre si es 'other'

  paymentDate: timestamp('payment_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- FITNESS APP: TRAINERS, EJERCICIOS Y RUTINAS ---

export const trainerProfiles = pgTable('trainer_profiles', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull().unique(), // ← text, no uuid
  specialities: text('specialities'),
});

export const exercises = pgTable('exercises', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: exerciseTypeEnum('type').notNull(),
  primaryMuscle: text('primary_muscle').notNull(),
  secondaryMuscles: text('secondary_muscles').array(),
  mediaUrl: text('media_url'),
  executionNotes: text('execution_notes'),
  metadata: jsonb('metadata'),
});

// Rutinas Definidas (Plantillas armadas por trainers o default del gym)
export const routineTemplates = pgTable('routine_templates', {
  id: serial('id').primaryKey(),
  trainerId: integer('trainer_id').references(() => trainerProfiles.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
});

export const routineTemplateItems = pgTable('routine_template_items', {
  id: serial('id').primaryKey(),
  routineTemplateId: integer('routine_template_id').references(() => routineTemplates.id).notNull(),
  exerciseId: integer('exercise_id').references(() => exercises.id).notNull(),
  sets: integer('sets').notNull(),
  reps: text('reps').notNull(),
  restSeconds: integer('rest_seconds'),
  orderIndex: integer('order_index').notNull(),
});

export const workoutSessions = pgTable('workout_sessions', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }).notNull(),
  routineTemplateId: integer('routine_template_id').references(() => routineTemplates.id),
  date: timestamp('date').defaultNow().notNull(),
  durationMinutes: integer('duration_minutes'),
  notes: text('notes'),
});

export const workoutSessionLogs = pgTable('workout_session_logs', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').references(() => workoutSessions.id).notNull(),
  exerciseId: integer('exercise_id').references(() => exercises.id).notNull(),
  setsCompleted: integer('sets_completed').notNull(),
  weightUsed: jsonb('weight_used'),
  repsCompleted: jsonb('reps_completed'),
});

// --- CMS & MARKETING WEBSITE ---

export const coachProfiles = pgTable('coach_profiles', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id, { onDelete: 'cascade' }).notNull().unique(),
  specialities: jsonb('specialities'), // array de strings: ["Fuerza", "Yoga"]
  bio: text('bio'),
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
});

export const coachAssignments = pgTable('coach_assignments', {
  id: serial('id').primaryKey(),
  coachId: integer('coach_id').references(() => members.id, { onDelete: 'cascade' }).notNull(),
  clientId: integer('client_id').references(() => members.id, { onDelete: 'cascade' }).notNull(),
  assignedAt: timestamp('assigned_at').defaultNow().notNull(),
});

export const frequencyTypeEnum = pgEnum('frequency_type', ['once', 'weekly']);

export const cmsClasses = pgTable('cms_classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  trainerName: text('trainer_name'),
  isVisible: boolean('is_visible').default(true).notNull(),

  // Horario estructurado (reemplaza timeInfo)
  startTime: text('start_time').notNull(),     // "HH:MM" — ej: "09:00"
  endTime: text('end_time'),                 // opcional — ej: "10:00"

  // Frecuencia
  frequencyType: frequencyTypeEnum('frequency_type').default('weekly').notNull(),
  scheduledDate: date('scheduled_date'),           // solo cuando frequencyType = 'once'
  daysOfWeek: integer('days_of_week').array(),  // solo cuando frequencyType = 'weekly'
  // [0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb]
  // Capacidad
  capacity: integer('capacity'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- CONFIGURACIÓN GLOBAL ---

export const gymSettings = pgTable('gym_settings', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(), // Ej: 'allow_price_override', 'timezone', etc.
  value: text('value').notNull(),       // Guardamos como string, parseamos según key
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});


export const userRoles = pgTable('user_roles', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  roleId: integer('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
});

export const userPermissions = pgTable('user_permissions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }).notNull(),
  permissionId: integer('permission_id').references(() => permissions.id, { onDelete: 'cascade' }).notNull(),
});

// --- RELATIONS ---

export const userRelations = relations(user, ({ one, many }) => ({
  userRoles: many(userRoles),
  userPermissions: many(userPermissions),
  member: one(members, { fields: [user.memberId], references: [members.id] }),
  role: one(roles, { fields: [user.roleId], references: [roles.id] }),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  user: one(user, { fields: [members.id], references: [user.memberId] }),
  role: one(roles, { fields: [members.roleId], references: [roles.id] }),
  coachProfile: one(coachProfiles, { fields: [members.id], references: [coachProfiles.memberId] }),
  asCoachAssignments: many(coachAssignments, { relationName: 'coach_assignments_coach' }),
  asClientAssignments: many(coachAssignments, { relationName: 'coach_assignments_client' }),
}));

export const coachProfilesRelations = relations(coachProfiles, ({ one }) => ({
  member: one(members, { fields: [coachProfiles.memberId], references: [members.id] }),
}));

export const coachAssignmentsRelations = relations(coachAssignments, ({ one }) => ({
  coach: one(members, { fields: [coachAssignments.coachId], references: [members.id], relationName: 'coach_assignments_coach' }),
  client: one(members, { fields: [coachAssignments.clientId], references: [members.id], relationName: 'coach_assignments_client' }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userPermissions: many(userPermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, { fields: [rolePermissions.permissionId], references: [permissions.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(user, { fields: [userRoles.userId], references: [user.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(user, { fields: [userPermissions.userId], references: [user.id] }),
  permission: one(permissions, { fields: [userPermissions.permissionId], references: [permissions.id] }),
}));

// --- CMS PÁGINAS Y BLOQUES DINÁMICOS ---

export const cmsBlockTypeEnum = pgEnum('cms_block_type', [
  'hero',
  'services',
  'classes_info',
  'testimonials',
  'gallery',
  'contact',
  'team_info'
]);

export const cmsPages = pgTable('cms_pages', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const cmsPageBlocks = pgTable('cms_page_blocks', {
  id: serial('id').primaryKey(),
  pageId: integer('page_id').references(() => cmsPages.id, { onDelete: 'cascade' }).notNull(),
  blockType: cmsBlockTypeEnum('block_type').notNull(),
  data: jsonb('data').notNull(), // Estructura validada por Zod en la App
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  pageOrderIdx: uniqueIndex('page_order_idx').on(table.pageId, table.displayOrder),
}));