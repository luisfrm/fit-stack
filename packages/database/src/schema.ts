import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
} from 'drizzle-orm/pg-core';

// --- BETTER AUTH TABLES ---

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

// --- CORE: USERS & MEMBERS ---

export const members = pgTable('members', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => user.id, { onDelete: 'set null' }), // ← text, no uuid
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  role: roleEnum('role').default('client').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  documentId: text('document_id'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// --- GYM MANAGEMENT: MEMBRESÍAS ---

// Planes de Membresía (Ej: Basic, VIP, Platinum) - Usado tanto en CMS como en Facturación
export const membershipPlans = pgTable('membership_plans', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  price: integer('price').notNull(), // Guardado en centavos (ej: $45.00 -> 4500)
  features: jsonb('features'), // Array: ["Acceso 24/7", "Zonas VIP"]
  isPopular: boolean('is_popular').default(false).notNull(),
  isVisibleOnSite: boolean('is_visible_on_site').default(true).notNull(),
});

// Suscripciones: Relaciona a un Miembro con un Plan que pagó
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  memberId: integer('member_id').references(() => members.id).notNull(),
  planId: integer('plan_id').references(() => membershipPlans.id).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  status: subscriptionStatusEnum('status').default('active').notNull(),
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
  trainerId: integer('trainer_id').references(() => trainerProfiles.id),
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
  memberId: integer('member_id').references(() => members.id).notNull(),
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

export const cmsCoaches = pgTable('cms_coaches', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  specialities: jsonb('specialities'),
  imageUrl: text('image_url'),
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
});

export const cmsClasses = pgTable('cms_classes', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  timeInfo: text('time_info').notNull(),
  description: text('description'),
  trainerName: text('trainer_name'),
  isVisible: boolean('is_visible').default(true).notNull(),
});