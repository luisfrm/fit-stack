import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  date,
  uniqueIndex,
  index,
  bigint,
  numeric,
  vector,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { type PlanFeaturesV2, type ReceiptEmitterSnapshot } from '@workspace/shared';

// ── BETTER AUTH CORE TABLES (Must follow Better Auth naming/structure) ──

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').default('user'), // Platform role ('owner' | 'admin' | 'support' | 'user')
  banned: boolean('banned').notNull().default(false), // Better Auth admin plugin: ban status
  banReason: text('ban_reason'), // Better Auth admin plugin: reason for ban
  banExpires: timestamp('ban_expires', { withTimezone: true }), // Better Auth admin plugin: ban expiration
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
  countryCode: text('country_code').notNull(),
  // Timezone is REQUIRED and must be explicitly set upon organization creation
  // (no silent default accidentally assigning 'America/Caracas').
  timezone: text('timezone').notNull(),
  // Primary currency and format: REQUIRED, NOT NULL columns without default.
  // Currency derives from country upon creation (single insert); format comes
  // explicit in the request. Never invented on read.
  primaryCurrency: text('primary_currency').notNull(),
  currencyFormat: text('currency_format').notNull(),
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
  role: text('role').notNull(), // 'owner', 'manager', 'cashier', 'coach', 'member'
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

/**
 * platform_plan: SaaS plan catalog sold by FitStack.
 * Price is stored in CENTS (bigint) to avoid floating-point issues.
 */
export const platformPlan = pgTable('platform_plan', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  price: bigint('price', { mode: 'number' }).notNull(), // cents
  currency: text('currency').default('USD').notNull(),
  durationValue: integer('duration_value').default(1).notNull(),
  durationUnit: text('duration_unit').default('month').notNull(),
  features: jsonb('features').$type<PlanFeaturesV2 | null>(), // PlanFeaturesV2 from shared/features
  isActive: boolean('is_active').default(true).notNull(),
  trialDays: integer('trial_days').default(0).notNull(), // 0 = no trial
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * platform_subscription: Organization subscription to a platform_plan.
 * Status is NOT stored; computed in SQL based on currentPeriodEnd and latest payment.
 * We keep `status` as a legacy column (to be removed in a future migration).
 */
export const platformSubscription = pgTable(
  'platform_subscription',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .references(() => organization.id, { onDelete: 'cascade' })
      .notNull(),
    planId: bigint('plan_id', { mode: 'number' })
      .references(() => platformPlan.id)
      .notNull(),
    // legacy column — to drop once migration to computed status is verified
    status: text('status').notNull().default('active'),
    startDate: timestamp('start_date', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    isTrial: boolean('is_trial').default(false).notNull(),
    priceOverride: bigint('price_override', { mode: 'number' }), // cents — commercial override
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ps_organization_id').on(table.organizationId),
    index('idx_ps_plan_id').on(table.planId),
    index('idx_ps_current_period_end').on(table.currentPeriodEnd),
  ]
);

/**
 * platform_subscription_payment: payments associated with a platform_subscription.
 * Stores full commercial snapshot to preserve historical integrity
 * even if plan details change.
 */
export const platformSubscriptionPayment = pgTable(
  'platform_subscription_payment',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),

    // Relations
    subscriptionId: bigint('subscription_id', { mode: 'number' })
      .references(() => platformSubscription.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    planId: bigint('plan_id', { mode: 'number' })
      .references(() => platformPlan.id)
      .notNull(),

    // Commercial snapshot
    planSnapshotName: text('plan_snapshot_name').notNull(),
    planSnapshotPrice: bigint('plan_snapshot_price', { mode: 'number' }).notNull(), // cents
    planSnapshotCurrency: text('plan_snapshot_currency').notNull(),
    planSnapshotDurationValue: integer('plan_snapshot_duration_value').notNull(),
    planSnapshotDurationUnit: text('plan_snapshot_duration_unit').notNull(),
    // Snapshot of plan features at payment time (compare vs current plan)
    featuresSnapshot: jsonb('features_snapshot').$type<PlanFeaturesV2 | null>(),

    // Payment details
    amountPaid: bigint('amount_paid', { mode: 'number' }).notNull(), // cents
    currencyPaid: text('currency_paid').notNull(),
    exchangeRateApplied: numeric('exchange_rate_applied', { precision: 10, scale: 4 }),
    baseAmount: bigint('base_amount', { mode: 'number' }), // cents in base currency

    // Method and metadata
    paymentMethod: text('payment_method').notNull(), // includes 'trial' | 'free' | 'manual' | etc
    paymentMethodDetails: jsonb('payment_method_details'),
    paymentDate: timestamp('payment_date', { withTimezone: true }).notNull().defaultNow(),

    // Statuses
    status: text('status').notNull().default('processing'),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),

    // Correlative receipt (C1). NULL = prior to system (pre_system).
    // Continuous GLOBAL sequence (single issuer: FitStack), without year.
    receiptNumber: text('receipt_number').unique(),
    receiptIssuedAt: timestamp('receipt_issued_at', { withTimezone: true }),
    receiptPdfKey: text('receipt_pdf_key'),
    // PDF with VOIDED stamp (C6+). The original PDF is NO LONGER served when
    // `receipt_voided` is true: the only downloadable document for a voided
    // receipt is this one. NULL = voided without rendering yet
    // (download responds `pending`, never the unstamped original).
    receiptVoidedPdfKey: text('receipt_voided_pdf_key'),
    // Tax breakdown persisted by step 1 (C2). Step 2 never
    // recalculates: it reads them (NULL = legacy/pre-C2). Integer cents.
    subtotal: bigint('subtotal', { mode: 'number' }),
    taxTotal: bigint('tax_total', { mode: 'number' }),
    taxDetails: jsonb('tax_details'),
    // Notification gate (C2, Panel mirror): email enqueued only after PDF.
    receiptNotifiedAt: timestamp('receipt_notified_at', { withTimezone: true }),
    // Payer (C2): only written upon `processing` creation (renewing org session);
    // on validation SET only if IS NULL, never overwritten.
    payerEmail: text('payer_email'),
    payerName: text('payer_name'),
    // VOIDED (C2, Panel mirror): preserves number and PDF, never reused.
    receiptVoided: boolean('receipt_voided').notNull().default(false),
    voidedBy: text('voided_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    // Issuer identity FROZEN upon issue (C1, Panel mirror).
    emitterSnapshot: jsonb('emitter_snapshot').$type<ReceiptEmitterSnapshot | null>(),
    // Issuing actor (C5, Panel mirror).
    issuedBy: text('issued_by'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_psp_subscription_id').on(table.subscriptionId),
    index('idx_psp_payment_date').on(table.paymentDate),
    index('idx_psp_subscription_status').on(table.subscriptionId, table.status),
    // Sweep of pending PDFs (C2): numbered without PDF.
    index('idx_psp_receipt_pending')
      .on(table.receiptIssuedAt)
      .where(sql`${table.receiptNumber} IS NOT NULL AND ${table.receiptPdfKey} IS NULL`),
    // Sweep of pending voided PDFs: voided without stamped PDF.
    index('idx_psp_voided_pending')
      .on(table.voidedAt)
      .where(sql`${table.receiptVoided} AND ${table.receiptVoidedPdfKey} IS NULL`),
  ]
);

// ── PLATFORM RECEIPT SEQUENCE (C1) ──

/**
 * Continuous GLOBAL correlative sequence for issuer FitStack (single legal issuer).
 * Without org or year: a single row per document type ('receipt' | 'invoice').
 * `nextPlatformDocumentNumber` increments this with a single atomic statement
 * (INSERT ... ON CONFLICT DO UPDATE), without interactive transactions.
 * No annual reset by closed architectural decision: while FitStack is not
 * incorporated nor has its own tax regime, a continuous sequence avoids
 * the ambiguity of "FitStack fiscal year".
 */
export const platformDocumentSequence = pgTable('platform_document_sequence', {
  // 'receipt' | 'invoice' (validated by Zod; currently only 'receipt' effective). No pgEnum.
  documentType: text('document_type').primaryKey(),
  // NOTE: `next_number` stores the LAST allocated number, not the next one
  // (same meaning as `organizationDocumentSequence.last_number`). The
  // name is cosmetic; renaming to `last_number` requires a migration and will
  // be batched with the next migration generated for another reason
  // (see vaults/backlog/comprobantes.md).
  nextNumber: integer('next_number').notNull().default(0),
});

// ── AI USAGE (AI chat rate-limit per period) ──
// Source of truth for credits (1 credit = 1K tokens). Monthly reset per subscription cycle (or calendar if no subscription).
// bonusCredits: extra credits granted manually (Grant AI Credits) — one-off per cycle, non-recurring.
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    periodType: text('period_type').notNull(), // 'monthly' (legacy: daily/weekly remain valid)
    periodStart: date('period_start', { mode: 'date' }).notNull(),
    credits: integer('credits').notNull().default(0),
    bonusCredits: integer('bonus_credits').notNull().default(0),
    count: integer('count').notNull().default(0), // @deprecated legacy messages (kept for compatibility)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_ai_usage_org_period').on(
      table.organizationId,
      table.periodType,
      table.periodStart
    ),
  ]
);

// ── AI KNOWLEDGE BASE (RAG: documents + embedded chunks) ──
// organizationId NULL = FitStack platform document (visible to all gyms).
// organizationId set = gym document (only visible to that org).
export const aiKnowledgeDocument = pgTable(
  'ai_knowledge_document',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id'),
    title: text('title').notNull(),
    source: text('source').notNull().default('faq'), // 'faq' | 'policy' | 'settings'
    content: text('content').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_knowledge_doc_org').on(table.organizationId),
  ]
);

export const aiKnowledgeChunk = pgTable(
  'ai_knowledge_chunk',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => aiKnowledgeDocument.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }).notNull(),
    model: text('model').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_ai_chunk_document').on(table.documentId),
    index('idx_ai_chunk_embedding').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops')
    ),
  ]
);

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
  role: text('role').default('member').notNull(),

  // Biometric / Access Control (Optional)
  biometricId: text('biometric_id'),
  isBiometricEnrolled: boolean('is_biometric_enrolled').default(false).notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Coach profile: extends gym_member with additional fitness/cms meta-data.
 * A coach is a gym_member with role 'coach' that optionally has a coach_profile.
 */
export const coachProfile = pgTable('coach_profile', {
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

// ── GYM MANAGEMENT: MEMBERSHIPS & PAYMENTS ──

export const membershipPlan = pgTable('membership_plan', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  price: bigint('price', { mode: 'number' }).notNull(), // cents
  currency: text('currency').default('USD').notNull(),
  durationValue: integer('duration_value').default(1).notNull(),
  durationUnit: text('duration_unit').default('month').notNull(),
  features: jsonb('features'),
  isPopular: boolean('is_popular').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  isVisibleOnSite: boolean('is_visible_on_site').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscription = pgTable(
  'subscription',
  {
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
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    endDateOverrideReason: text('end_date_override_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_subscription_org_member').on(table.organizationId, table.memberId),
  ]
);

export const payment = pgTable(
  'payment',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    memberId: bigint('member_id', { mode: 'number' })
      .references(() => gymMember.id, { onDelete: 'cascade' }).notNull(),
    subscriptionId: bigint('subscription_id', { mode: 'number' })
      .references(() => subscription.id),

    planSnapshotName: text('plan_snapshot_name').notNull(),
    planSnapshotPrice: bigint('plan_snapshot_price', { mode: 'number' }).notNull(), // cents
    planSnapshotCurrency: text('plan_snapshot_currency').notNull(),
    // Plan duration snapshot when recording the payment: the period is
    // calculated on the server using THIS value, so editing the plan later
    // does not rewrite historical payment semantics. NULL = row prior
    // to snapshot (computation falls back to active plan, documented terminal state).
    planSnapshotDurationValue: integer('plan_snapshot_duration_value'),
    planSnapshotDurationUnit: text('plan_snapshot_duration_unit'),

    amountPaid: bigint('amount_paid', { mode: 'number' }).notNull(), // cents
    currencyPaid: text('currency_paid').notNull(),
    exchangeRateApplied: numeric('exchange_rate_applied', { precision: 10, scale: 4 }),

    status: text('status').default('validated').notNull(),
    paymentMethod: text('payment_method').notNull(),
    paymentMethodDetails: jsonb('payment_method_details'),

    // Invoice Breakdown (Optional, cents)
    subtotal: bigint('subtotal', { mode: 'number' }),
    taxTotal: bigint('tax_total', { mode: 'number' }),
    taxDetails: jsonb('tax_details'),

    paymentDate: timestamp('payment_date', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),

    // Correlative receipt (Phase 1). NULL = prior to system (pre_system).
    receiptNumber: text('receipt_number'),
    documentType: text('document_type').notNull().default('receipt'),
    receiptIssuedAt: timestamp('receipt_issued_at', { withTimezone: true }),
    receiptPdfKey: text('receipt_pdf_key'),
    // PDF with VOIDED stamp (C6+). The original is no longer served once
    // `receipt_voided` is true: a voided receipt is only downloaded with
    // its stamp. NULL = voided without rendering yet (download `pending`).
    receiptVoidedPdfKey: text('receipt_voided_pdf_key'),
    // Email notification flag: loss-prevention gate (retries).
    receiptNotifiedAt: timestamp('receipt_notified_at', { withTimezone: true }),
    taxOverrideReason: text('tax_override_reason'),
    receiptVoided: boolean('receipt_voided').notNull().default(false),
    voidedBy: text('voided_by'),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    // Issuer identity FROZEN upon issue (C1). NULL = issue prior
    // to snapshot: composed live (terminal state, never rewritten).
    emitterSnapshot: jsonb('emitter_snapshot').$type<ReceiptEmitterSnapshot | null>(),
    // Issuing actor (C5). NULL = historical issue or reconstructed by
    // sweep (actor is never fabricated).
    issuedBy: text('issued_by'),
  },
  (table) => [
    index('idx_payment_subscription_id').on(table.subscriptionId),
    index('idx_payment_payment_date').on(table.paymentDate),
    index('idx_payment_org_status').on(table.organizationId, table.status),
    // Unique correlative per org (NULLs do not enter the partial index).
    uniqueIndex('idx_payment_org_receipt_number')
      .on(table.organizationId, table.receiptNumber)
      .where(sql`${table.receiptNumber} IS NOT NULL`),
    // Gap report (Phase 5): range by issue date.
    index('idx_payment_org_issued_at')
      .on(table.organizationId, table.receiptIssuedAt),
    // Sweep of pending PDFs (Phase 2): numbered without PDF.
    index('idx_payment_receipt_pending')
      .on(table.receiptIssuedAt)
      .where(sql`${table.receiptNumber} IS NOT NULL AND ${table.receiptPdfKey} IS NULL`),
    // Sweep of pending voided PDFs: voided without stamped PDF.
    index('idx_payment_voided_pending')
      .on(table.voidedAt)
      .where(sql`${table.receiptVoided} AND ${table.receiptVoidedPdfKey} IS NULL`),
  ]
);

// ── RECEIPT SEQUENCES (Phase 1) ──

/**
 * Correlative per organization / document type / year (annual reset
 * per issuer). Each row is the counter of a combination (org, type, year);
 * `nextDocumentNumber` increments it with a single atomic statement
 * (INSERT ... ON CONFLICT DO UPDATE), without interactive transactions.
 * Year is the LOCAL year of the issuer (resolved by caller, never the repo).
 */
export const organizationDocumentSequence = pgTable(
  'organization_document_sequence',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // 'receipt' | 'invoice' (validated by Zod; currently only 'receipt' effective). No pgEnum.
    documentType: text('document_type').notNull(),
    year: integer('year').notNull(),
    lastNumber: integer('last_number').notNull().default(0),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.documentType, table.year],
    }),
  ]
);

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
  type: text('type').notNull(),
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
    .references(() => coachProfile.id, { onDelete: 'set null' }),
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

export const gymClass = pgTable('gym_class', {
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
  frequencyType: text('frequency_type').default('weekly').notNull(),
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

export const contentPage = pgTable('content_page', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('content_page_org_slug_idx').on(table.organizationId, table.slug),
]);

export const contentBlock = pgTable('content_block', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  pageId: bigint('page_id', { mode: 'number' })
    .references(() => contentPage.id, { onDelete: 'cascade' }).notNull(),
  blockType: text('block_type').notNull(),
  data: jsonb('data').notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  displayOrder: integer('display_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('content_block_page_order_idx').on(table.pageId, table.displayOrder),
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
  coachProfile: one(coachProfile, { fields: [gymMember.id], references: [coachProfile.memberId] }),
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

export const coachProfileRelations = relations(coachProfile, ({ one }) => ({
  organization: one(organization, { fields: [coachProfile.organizationId], references: [organization.id] }),
  member: one(gymMember, { fields: [coachProfile.memberId], references: [gymMember.id] }),
}));

export const membershipPlanRelations = relations(membershipPlan, ({ one, many }) => ({
  organization: one(organization, { fields: [membershipPlan.organizationId], references: [organization.id] }),
  subscriptions: many(subscription),
}));

export const subscriptionRelations = relations(subscription, ({ one, many }) => ({
  organization: one(organization, { fields: [subscription.organizationId], references: [organization.id] }),
  member: one(gymMember, { fields: [subscription.memberId], references: [gymMember.id] }),
  plan: one(membershipPlan, { fields: [subscription.planId], references: [membershipPlan.id] }),
  payments: many(payment),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  organization: one(organization, { fields: [payment.organizationId], references: [organization.id] }),
  member: one(gymMember, { fields: [payment.memberId], references: [gymMember.id] }),
  subscription: one(subscription, { fields: [payment.subscriptionId], references: [subscription.id] }),
}));

export const platformPlanRelations = relations(platformPlan, ({ many }) => ({
  subscriptions: many(platformSubscription),
  payments: many(platformSubscriptionPayment),
}));

export const platformSubscriptionRelations = relations(platformSubscription, ({ one, many }) => ({
  organization: one(organization, {
    fields: [platformSubscription.organizationId],
    references: [organization.id],
  }),
  plan: one(platformPlan, {
    fields: [platformSubscription.planId],
    references: [platformPlan.id],
  }),
  payments: many(platformSubscriptionPayment),
}));

export const platformSubscriptionPaymentRelations = relations(
  platformSubscriptionPayment,
  ({ one }) => ({
    organization: one(organization, {
      fields: [platformSubscriptionPayment.organizationId],
      references: [organization.id],
    }),
    plan: one(platformPlan, {
      fields: [platformSubscriptionPayment.planId],
      references: [platformPlan.id],
    }),
    subscription: one(platformSubscription, {
      fields: [platformSubscriptionPayment.subscriptionId],
      references: [platformSubscription.id],
    }),
  })
);

export const gymClassRelations = relations(gymClass, ({ one }) => ({
  organization: one(organization, {
    fields: [gymClass.organizationId],
    references: [organization.id],
  }),
}));

export const contentPageRelations = relations(contentPage, ({ one, many }) => ({
  organization: one(organization, {
    fields: [contentPage.organizationId],
    references: [organization.id],
  }),
  blocks: many(contentBlock),
}));

export const contentBlockRelations = relations(contentBlock, ({ one }) => ({
  organization: one(organization, {
    fields: [contentBlock.organizationId],
    references: [organization.id],
  }),
  page: one(contentPage, {
    fields: [contentBlock.pageId],
    references: [contentPage.id],
  }),
}));