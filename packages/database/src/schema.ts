import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  date,
  uniqueIndex,
  bigint,
  numeric,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { GLOBAL_ROLES, ORG_ROLES, type PlanFeatures } from '@workspace/shared';

// ── ENUMS ──
export const exerciseTypeEnum = pgEnum('exercise_type', ['compound', 'isolated']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'expired', 'cancelled']);
export const paymentStatusEnum = pgEnum('payment_status', ['processing', 'validated', 'invalid', 'voided']);
export const frequencyTypeEnum = pgEnum('frequency_type', ['once', 'weekly']);
export const membershipDurationUnitEnum = pgEnum('membership_duration_unit', ['day', 'week', 'month', 'year']);
export const cmsBlockTypeEnum = pgEnum('cms_block_type', [
  'hero',
  'services',
  'classes_info',
  'testimonials',
  'gallery',
  'contact',
  'team_info'
]);

export const globalRoleEnum = pgEnum('global_role', [
  GLOBAL_ROLES.ADMIN,
  GLOBAL_ROLES.USER,
]);

export const orgRoleEnum = pgEnum('org_role', [
  ORG_ROLES.OWNER,
  ORG_ROLES.MANAGER,
  ORG_ROLES.CASHIER,
  ORG_ROLES.COACH,
  ORG_ROLES.MEMBER,
]);

// ── BETTER AUTH CORE TABLES (Must follow Better Auth naming/structure) ──

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: globalRoleEnum('role').default(GLOBAL_ROLES.USER), // Global role (e.g. 'admin')
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  activeOrganizationId: text('active_organization_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ── ORGANIZATIONS & AUTH MEMBERSHIP (Better Auth Plugin) ──

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  slogan: text('slogan'),
  metadata: jsonb('metadata'),

  // Localization & Fiscal (Optional)
  countryCode: text('country_code').default('VE').notNull(),
  taxId: text('tax_id'),
  legalName: text('legal_name'),
  address: text('address'),
  fiscalConfig: jsonb('fiscal_config'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authMember = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  role: orgRoleEnum('role').notNull(), // 'manager', 'cashier', 'coach', 'member'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  inviterId: text('inviter_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

// ── B2B PLATFORM BILLING ──

export const fitstackPlan = pgTable('fitstack_plan', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  durationValue: integer('duration_value').default(1).notNull(),
  durationUnit: membershipDurationUnitEnum('duration_unit').default('month').notNull(),
  features: jsonb('features').$type<PlanFeatures | null>(), // PlanFeatures interface from shared/types.ts
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const storeSubscription = pgTable('store_subscription', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .references(() => organization.id, { onDelete: 'cascade' })
    .notNull(),
  planId: bigint('plan_id', { mode: 'number' })
    .references(() => fitstackPlan.id)
    .notNull(),
  status: text('status').notNull(), // active, past_due, read_only, suspended, canceled
  startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  isTrial: boolean('is_trial').default(false).notNull(),
  priceOverride: numeric('price_override', { precision: 10, scale: 2 }), // For commercial exceptions
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const platformInvoice = pgTable('platform_invoice', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  planId: bigint('plan_id', { mode: 'number' })
    .references(() => fitstackPlan.id)
    .notNull(),
  
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  paymentMethod: text('payment_method').notNull(),
  status: text('status').notNull(), // paid, pending, trial, void
  
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── GYM DOMAIN: LOCAL MEMBERS & STAFF ──

/**
 * gym_member represents the local profile of a customer in a gym.
 * It is linked to a global 'user' for app access, but can exist without it.
 */
export const gymMember = pgTable('gym_member', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .references(() => user.id, { onDelete: 'set null' }),
  email: text('email').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  documentId: text('document_id'),
  phoneNumber: text('phone_number'),
  birthday: date('birthday'),
  imageUrl: text('image_url'),
  address: text('address'),
  isActive: boolean('is_active').default(true).notNull(),
  role: orgRoleEnum('role').default(ORG_ROLES.MEMBER).notNull(),

  // Biometric / Access Control (Optional)
  biometricId: text('biometric_id'), 
  isBiometricEnrolled: boolean('is_biometric_enrolled').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Unified staff profile for Trainers and Coaches.
 * Connects a gym_member with additional fitness/cms meta-data.
 */
export const staffProfile = pgTable('staff_profile', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  memberId: bigint('member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  
  // Professional Data
  specialities: jsonb('specialities'), // array of strings
  bio: text('bio'),
  
  // CMS/App Visibility
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').default(0).notNull(),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── GYM MANAGEMENT: MEMBRESÍAS & PAGOS ──

export const membershipPlan = pgTable('membership_plan', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').default('USD').notNull(),
  durationValue: integer('duration_value').default(1).notNull(),
  durationUnit: membershipDurationUnitEnum('duration_unit').default('month').notNull(),
  features: jsonb('features').$type<string[] | null>(),
  isPopular: boolean('is_popular').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isVisibleOnSite: boolean('is_visible_on_site').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscription = pgTable('subscription', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  memberId: bigint('member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' }).notNull(),
  planId: bigint('plan_id', { mode: 'number' })
    .references(() => membershipPlan.id).notNull(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  status: subscriptionStatusEnum('status').default('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const payment = pgTable('payment', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  memberId: bigint('member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' }).notNull(),
  subscriptionId: bigint('subscription_id', { mode: 'number' })
    .references(() => subscription.id),

  planSnapshotName: text('plan_snapshot_name').notNull(),
  planSnapshotPrice: numeric('plan_snapshot_price', { precision: 10, scale: 2 }).notNull(),
  planSnapshotCurrency: text('plan_snapshot_currency').notNull(),

  amountPaid: numeric('amount_paid', { precision: 10, scale: 2 }).notNull(),
  currencyPaid: text('currency_paid').notNull(),
  exchangeRateApplied: numeric('exchange_rate_applied', { precision: 10, scale: 4 }),

  status: paymentStatusEnum('status').default('validated').notNull(),
  paymentMethod: text('payment_method').notNull(),
  paymentMethodDetails: jsonb('payment_method_details'),

  // Invoice Breakdown (Optional)
  subtotal: numeric('subtotal', { precision: 15, scale: 2 }),
  taxTotal: numeric('tax_total', { precision: 15, scale: 2 }),
  taxDetails: jsonb('tax_details'),

  paymentDate: timestamp('payment_date', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── ACCESS CONTROL: BIOMETRIC LOGS & SYNC ──

/**
 * Audit log of every access attempt (granted, denied, error).
 */
export const accessControlLog = pgTable('access_control_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  memberId: bigint('member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'set null' }),
  
  documentId: text('document_id'), // Scanned ID from the device
  status: text('status'), // 'granted', 'denied', 'error'
  accessType: text('access_type'), // 'face', 'fingerprint', 'card'
  
  metadata: jsonb('metadata'), // Original payload or error from device
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Queue of tasks for the local "Bridge" App to sync members to devices.
 */
export const biometricSyncTask = pgTable('biometric_sync_task', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  memberId: bigint('member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' })
    .notNull(),
  
  type: text('type').default('enroll').notNull(), // 'enroll', 'delete'
  status: text('status').default('pending').notNull(), // 'pending', 'syncing', 'completed', 'error'
  lastError: text('last_error'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── FITNESS APP: ROUTINES & EXERCISES ──

export const exercise = pgTable('exercise', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: exerciseTypeEnum('type').notNull(),
  primaryMuscle: text('primary_muscle').notNull(),
  secondaryMuscles: text('secondary_muscles').array(),
  mediaUrl: text('media_url'),
  executionNotes: text('execution_notes'),
  metadata: jsonb('metadata'),
});

export const routineTemplate = pgTable('routine_template', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  trainerProfileId: bigint('trainer_profile_id', { mode: 'number' })
    .references(() => staffProfile.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
});

export const routineTemplateItem = pgTable('routine_template_item', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  routineTemplateId: bigint('routine_template_id', { mode: 'number' })
    .references(() => routineTemplate.id, { onDelete: 'cascade' }).notNull(),
  exerciseId: bigint('exercise_id', { mode: 'number' })
    .references(() => exercise.id, { onDelete: 'cascade' }).notNull(),
  sets: integer('sets').notNull(),
  reps: text('reps').notNull(),
  restSeconds: integer('rest_seconds'),
  orderIndex: integer('order_index').notNull(),
});

export const workoutSession = pgTable('workout_session', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  memberId: bigint('member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' }).notNull(),
  routineTemplateId: bigint('routine_template_id', { mode: 'number' })
    .references(() => routineTemplate.id, { onDelete: 'set null' }),
  date: timestamp('date', { withTimezone: true }).defaultNow().notNull(),
  durationMinutes: integer('duration_minutes'),
  notes: text('notes'),
});

export const workoutSessionLog = pgTable('workout_session_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  sessionId: bigint('session_id', { mode: 'number' })
    .references(() => workoutSession.id, { onDelete: 'cascade' }).notNull(),
  exerciseId: bigint('exercise_id', { mode: 'number' })
    .references(() => exercise.id).notNull(),
  setsCompleted: integer('sets_completed').notNull(),
  weightUsed: jsonb('weight_used'),
  repsCompleted: jsonb('reps_completed'),
});

// ── CMS & WEB ASSETS ──

export const coachAssignment = pgTable('coach_assignment', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  coachMemberId: bigint('coach_member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' }).notNull(), // A coach is a staff member
  clientMemberId: bigint('client_member_id', { mode: 'number' })
    .references(() => gymMember.id, { onDelete: 'cascade' }).notNull(), // A client is also a gymMember
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
});

export const cmsClass = pgTable('cms_class', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  trainerName: text('trainer_name'),
  isVisible: boolean('is_visible').default(true).notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time'),
  frequencyType: frequencyTypeEnum('frequency_type').default('weekly').notNull(),
  scheduledDate: date('scheduled_date'),
  daysOfWeek: integer('days_of_week').array(),
  capacity: integer('capacity'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const platformSetting = pgTable('platform_setting', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const gymSetting = pgTable('gym_setting', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('settings_org_key_idx').on(table.organizationId, table.key),
]);

export const cmsPage = pgTable('cms_page', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('page_org_slug_idx').on(table.organizationId, table.slug),
]);

export const cmsPageBlock = pgTable('cms_page_block', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  pageId: bigint('page_id', { mode: 'number' })
    .references(() => cmsPage.id, { onDelete: 'cascade' }).notNull(),
  blockType: cmsBlockTypeEnum('block_type').notNull(),
  data: jsonb('data').notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('page_order_idx').on(table.pageId, table.displayOrder),
]);

// ── RELATIONS ──

export const userRelations = relations(user, ({ many }) => ({
  memberships: many(authMember),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(authMember),
  gymMembers: many(gymMember),
  membershipPlans: many(membershipPlan),
}));

export const authMemberRelations = relations(authMember, ({ one }) => ({
  user: one(user, { fields: [authMember.userId], references: [user.id] }),
  organization: one(organization, { fields: [authMember.organizationId], references: [organization.id] }),
}));

export const gymMemberRelations = relations(gymMember, ({ one, many }) => ({
  organization: one(organization, { fields: [gymMember.organizationId], references: [organization.id] }),
  staffProfile: one(staffProfile, { fields: [gymMember.id], references: [staffProfile.memberId] }),
  asCoachAssignments: many(coachAssignment, { relationName: 'coach_assignments_coach' }),
  asClientAssignments: many(coachAssignment, { relationName: 'coach_assignments_client' }),
  accessLogs: many(accessControlLog),
  syncTasks: many(biometricSyncTask),
}));

export const accessControlLogRelations = relations(accessControlLog, ({ one }) => ({
  organization: one(organization, { fields: [accessControlLog.organizationId], references: [organization.id] }),
  member: one(gymMember, { fields: [accessControlLog.memberId], references: [gymMember.id] }),
}));

export const biometricSyncTaskRelations = relations(biometricSyncTask, ({ one }) => ({
  organization: one(organization, { fields: [biometricSyncTask.organizationId], references: [organization.id] }),
  member: one(gymMember, { fields: [biometricSyncTask.memberId], references: [gymMember.id] }),
}));