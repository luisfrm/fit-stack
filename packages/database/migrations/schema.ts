import { pgTable, text, timestamp, unique, boolean, foreignKey, bigint, date, integer, uniqueIndex, jsonb, numeric, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const cmsBlockType = pgEnum("cms_block_type", ['hero', 'services', 'classes_info', 'testimonials', 'gallery', 'contact', 'team_info'])
export const exerciseType = pgEnum("exercise_type", ['compound', 'isolated'])
export const frequencyType = pgEnum("frequency_type", ['once', 'weekly'])
export const paymentStatus = pgEnum("payment_status", ['processing', 'validated', 'invalid', 'voided'])
export const subscriptionStatus = pgEnum("subscription_status", ['active', 'expired', 'cancelled'])


export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	role: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true, mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true, mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const member = pgTable("member", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	userId: text("user_id").notNull(),
	role: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "member_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "member_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const cmsClass = pgTable("cms_class", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "cms_class_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	name: text().notNull(),
	description: text(),
	trainerName: text("trainer_name"),
	isVisible: boolean("is_visible").default(true).notNull(),
	startTime: text("start_time").notNull(),
	endTime: text("end_time"),
	frequencyType: frequencyType("frequency_type").default('weekly').notNull(),
	scheduledDate: date("scheduled_date"),
	daysOfWeek: integer("days_of_week").array(),
	capacity: integer(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "cms_class_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const cmsPage = pgTable("cms_page", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "cms_page_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	slug: text().notNull(),
	title: text().notNull(),
	description: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("page_org_slug_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.slug.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "cms_page_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const cmsPageBlock = pgTable("cms_page_block", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "cms_page_block_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	pageId: bigint("page_id", { mode: "number" }).notNull(),
	blockType: cmsBlockType("block_type").notNull(),
	data: jsonb().notNull(),
	isVisible: boolean("is_visible").default(true).notNull(),
	displayOrder: integer("display_order").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("page_order_idx").using("btree", table.pageId.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "cms_page_block_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.pageId],
			foreignColumns: [cmsPage.id],
			name: "cms_page_block_page_id_cms_page_id_fk"
		}).onDelete("cascade"),
]);

export const coachAssignment = pgTable("coach_assignment", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "coach_assignment_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	coachMemberId: bigint("coach_member_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	clientMemberId: bigint("client_member_id", { mode: "number" }).notNull(),
	assignedAt: timestamp("assigned_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "coach_assignment_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.coachMemberId],
			foreignColumns: [gymMember.id],
			name: "coach_assignment_coach_member_id_gym_member_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientMemberId],
			foreignColumns: [gymMember.id],
			name: "coach_assignment_client_member_id_gym_member_id_fk"
		}).onDelete("cascade"),
]);

export const gymMember = pgTable("gym_member", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "gym_member_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	userId: text("user_id"),
	email: text().notNull(),
	firstName: text("first_name").notNull(),
	lastName: text("last_name").notNull(),
	documentId: text("document_id"),
	phoneNumber: text("phone_number"),
	birthday: date(),
	imageUrl: text("image_url"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "gym_member_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "gym_member_user_id_user_id_fk"
		}).onDelete("set null"),
]);

export const exercise = pgTable("exercise", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "exercise_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	name: text().notNull(),
	type: exerciseType().notNull(),
	primaryMuscle: text("primary_muscle").notNull(),
	secondaryMuscles: text("secondary_muscles").array(),
	mediaUrl: text("media_url"),
	executionNotes: text("execution_notes"),
	metadata: jsonb(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "exercise_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const gymSetting = pgTable("gym_setting", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "gym_setting_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	key: text().notNull(),
	value: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("settings_org_key_idx").using("btree", table.organizationId.asc().nullsLast().op("text_ops"), table.key.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "gym_setting_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const invitation = pgTable("invitation", {
	id: text().primaryKey().notNull(),
	organizationId: text("organization_id").notNull(),
	email: text().notNull(),
	role: text(),
	status: text().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	inviterId: text("inviter_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "invitation_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.inviterId],
			foreignColumns: [user.id],
			name: "invitation_inviter_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const membershipPlan = pgTable("membership_plan", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "membership_plan_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	name: text().notNull(),
	price: numeric({ precision: 10, scale:  2 }).notNull(),
	currency: text().default('USD').notNull(),
	features: jsonb(),
	isPopular: boolean("is_popular").default(false).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	isVisibleOnSite: boolean("is_visible_on_site").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "membership_plan_organization_id_organization_id_fk"
		}).onDelete("cascade"),
]);

export const payment = pgTable("payment", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "payment_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	memberId: bigint("member_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	subscriptionId: bigint("subscription_id", { mode: "number" }),
	planSnapshotName: text("plan_snapshot_name").notNull(),
	planSnapshotPrice: numeric("plan_snapshot_price", { precision: 10, scale:  2 }).notNull(),
	planSnapshotCurrency: text("plan_snapshot_currency").notNull(),
	amountPaid: numeric("amount_paid", { precision: 10, scale:  2 }).notNull(),
	currencyPaid: text("currency_paid").notNull(),
	exchangeRateApplied: numeric("exchange_rate_applied", { precision: 10, scale:  4 }),
	status: paymentStatus().default('validated').notNull(),
	paymentMethod: text("payment_method").notNull(),
	paymentMethodDetails: jsonb("payment_method_details"),
	paymentDate: timestamp("payment_date", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "payment_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [gymMember.id],
			name: "payment_member_id_gym_member_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.subscriptionId],
			foreignColumns: [subscription.id],
			name: "payment_subscription_id_subscription_id_fk"
		}),
]);

export const subscription = pgTable("subscription", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "subscription_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	memberId: bigint("member_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planId: bigint("plan_id", { mode: "number" }).notNull(),
	startDate: timestamp("start_date", { withTimezone: true, mode: 'string' }).notNull(),
	endDate: timestamp("end_date", { withTimezone: true, mode: 'string' }).notNull(),
	status: subscriptionStatus().default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "subscription_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [gymMember.id],
			name: "subscription_member_id_gym_member_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [membershipPlan.id],
			name: "subscription_plan_id_membership_plan_id_fk"
		}),
]);

export const routineTemplate = pgTable("routine_template", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "routine_template_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	trainerProfileId: bigint("trainer_profile_id", { mode: "number" }),
	name: text().notNull(),
	description: text(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "routine_template_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.trainerProfileId],
			foreignColumns: [staffProfile.id],
			name: "routine_template_trainer_profile_id_staff_profile_id_fk"
		}).onDelete("set null"),
]);

export const staffProfile = pgTable("staff_profile", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "staff_profile_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	memberId: bigint("member_id", { mode: "number" }).notNull(),
	specialities: jsonb(),
	bio: text(),
	isVisible: boolean("is_visible").default(true).notNull(),
	displayOrder: integer("display_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "staff_profile_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [gymMember.id],
			name: "staff_profile_member_id_gym_member_id_fk"
		}).onDelete("cascade"),
	unique("staff_profile_member_id_unique").on(table.memberId),
]);

export const routineTemplateItem = pgTable("routine_template_item", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "routine_template_item_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	routineTemplateId: bigint("routine_template_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	exerciseId: bigint("exercise_id", { mode: "number" }).notNull(),
	sets: integer().notNull(),
	reps: text().notNull(),
	restSeconds: integer("rest_seconds"),
	orderIndex: integer("order_index").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.routineTemplateId],
			foreignColumns: [routineTemplate.id],
			name: "routine_template_item_routine_template_id_routine_template_id_f"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [exercise.id],
			name: "routine_template_item_exercise_id_exercise_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	token: text().notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
	activeOrganizationId: text("active_organization_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const workoutSession = pgTable("workout_session", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "workout_session_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	memberId: bigint("member_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	routineTemplateId: bigint("routine_template_id", { mode: "number" }),
	date: timestamp({ withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	durationMinutes: integer("duration_minutes"),
	notes: text(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "workout_session_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.memberId],
			foreignColumns: [gymMember.id],
			name: "workout_session_member_id_gym_member_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.routineTemplateId],
			foreignColumns: [routineTemplate.id],
			name: "workout_session_routine_template_id_routine_template_id_fk"
		}).onDelete("set null"),
]);

export const workoutSessionLog = pgTable("workout_session_log", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "workout_session_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sessionId: bigint("session_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	exerciseId: bigint("exercise_id", { mode: "number" }).notNull(),
	setsCompleted: integer("sets_completed").notNull(),
	weightUsed: jsonb("weight_used"),
	repsCompleted: jsonb("reps_completed"),
}, (table) => [
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [workoutSession.id],
			name: "workout_session_log_session_id_workout_session_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [exercise.id],
			name: "workout_session_log_exercise_id_exercise_id_fk"
		}),
]);

export const platformSetting = pgTable("platform_setting", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "platform_setting_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	key: text().notNull(),
	value: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("platform_setting_key_unique").on(table.key),
]);

export const fitstackPlan = pgTable("fitstack_plan", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "fitstack_plan_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: text().notNull(),
	monthlyPrice: numeric("monthly_price", { precision: 10, scale:  2 }).notNull(),
	features: jsonb(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	suggestedDurationDays: integer("suggested_duration_days"),
	yearlyPrice: numeric("yearly_price", { precision: 10, scale:  2 }),
});

export const organization = pgTable("organization", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	slug: text(),
	logo: text(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("organization_slug_unique").on(table.slug),
]);

export const storeSubscription = pgTable("store_subscription", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "store_subscription_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planId: bigint("plan_id", { mode: "number" }).notNull(),
	status: text().notNull(),
	currentPeriodEnd: timestamp("current_period_end", { withTimezone: true, mode: 'string' }).notNull(),
	startDate: timestamp("start_date", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isTrial: boolean("is_trial").default(false).notNull(),
	priceOverride: numeric("price_override", { precision: 10, scale:  2 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "store_subscription_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [fitstackPlan.id],
			name: "store_subscription_plan_id_fitstack_plan_id_fk"
		}),
]);

export const platformInvoice = pgTable("platform_invoice", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({ name: "platform_invoice_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	organizationId: text("organization_id").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	planId: bigint("plan_id", { mode: "number" }).notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	currency: text().notNull(),
	paymentMethod: text("payment_method").notNull(),
	status: text().notNull(),
	dueDate: timestamp("due_date", { withTimezone: true, mode: 'string' }).notNull(),
	paidAt: timestamp("paid_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.organizationId],
			foreignColumns: [organization.id],
			name: "platform_invoice_organization_id_organization_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.planId],
			foreignColumns: [fitstackPlan.id],
			name: "platform_invoice_plan_id_fitstack_plan_id_fk"
		}),
]);
