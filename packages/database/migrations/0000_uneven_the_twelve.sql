CREATE TABLE "access_control_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "access_control_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"member_id" bigint,
	"document_id" text,
	"status" text,
	"access_type" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "biometric_sync_task" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "biometric_sync_task_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"member_id" bigint NOT NULL,
	"type" text DEFAULT 'enroll' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_assignment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coach_assignment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"coach_member_id" bigint NOT NULL,
	"client_member_id" bigint NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_profile" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coach_profile_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"member_id" bigint NOT NULL,
	"specialities" jsonb,
	"bio" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_profile_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "content_block" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_block_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"page_id" bigint NOT NULL,
	"block_type" text NOT NULL,
	"data" jsonb NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_page" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "content_page_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "exercise_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"primary_muscle" text NOT NULL,
	"secondary_muscles" text[],
	"media_url" text,
	"execution_notes" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "gym_class" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gym_class_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trainer_name" text,
	"is_visible" boolean DEFAULT true NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text,
	"frequency_type" text DEFAULT 'weekly' NOT NULL,
	"scheduled_date" date,
	"days_of_week" integer[],
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_member" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gym_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"document_id" text,
	"phone_number" text,
	"birthday" date,
	"image_url" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"biometric_id" text,
	"is_biometric_enrolled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gym_setting" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "gym_setting_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_plan" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "membership_plan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"duration_value" integer DEFAULT 1 NOT NULL,
	"duration_unit" text DEFAULT 'month' NOT NULL,
	"features" jsonb,
	"is_popular" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_visible_on_site" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"slogan" text,
	"metadata" jsonb,
	"country_code" text DEFAULT 'VE' NOT NULL,
	"timezone" text DEFAULT 'America/Caracas' NOT NULL,
	"tax_id" text,
	"legal_name" text,
	"address" text,
	"fiscal_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"member_id" bigint NOT NULL,
	"subscription_id" bigint,
	"plan_snapshot_name" text NOT NULL,
	"plan_snapshot_price" numeric(10, 2) NOT NULL,
	"plan_snapshot_currency" text NOT NULL,
	"amount_paid" numeric(10, 2) NOT NULL,
	"currency_paid" text NOT NULL,
	"exchange_rate_applied" numeric(10, 4),
	"status" text DEFAULT 'validated' NOT NULL,
	"payment_method" text NOT NULL,
	"payment_method_details" jsonb,
	"subtotal" numeric(15, 2),
	"tax_total" numeric(15, 2),
	"tax_details" jsonb,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_plan" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_plan_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"duration_value" integer DEFAULT 1 NOT NULL,
	"duration_unit" text DEFAULT 'month' NOT NULL,
	"features" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_setting_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_setting_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "platform_subscription" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_subscription_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"plan_id" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"is_trial" boolean DEFAULT false NOT NULL,
	"price_override" bigint,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_subscription_payment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "platform_subscription_payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"subscription_id" bigint,
	"organization_id" text NOT NULL,
	"plan_id" bigint NOT NULL,
	"plan_snapshot_name" text NOT NULL,
	"plan_snapshot_price" bigint NOT NULL,
	"plan_snapshot_currency" text NOT NULL,
	"plan_snapshot_duration_value" integer NOT NULL,
	"plan_snapshot_duration_unit" text NOT NULL,
	"amount_paid" bigint NOT NULL,
	"currency_paid" text NOT NULL,
	"exchange_rate_applied" numeric(10, 4),
	"base_amount" bigint,
	"payment_method" text NOT NULL,
	"payment_method_details" jsonb,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routine_template" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routine_template_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"trainer_profile_id" bigint,
	"name" text NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "routine_template_item" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routine_template_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"routine_template_id" bigint NOT NULL,
	"exercise_id" bigint NOT NULL,
	"sets" integer NOT NULL,
	"reps" text NOT NULL,
	"rest_seconds" integer,
	"order_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "subscription_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"member_id" bigint NOT NULL,
	"plan_id" bigint NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workout_session" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workout_session_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" text NOT NULL,
	"member_id" bigint NOT NULL,
	"routine_template_id" bigint,
	"date" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_minutes" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "workout_session_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workout_session_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"session_id" bigint NOT NULL,
	"exercise_id" bigint NOT NULL,
	"sets_completed" integer NOT NULL,
	"weight_used" jsonb,
	"reps_completed" jsonb
);
--> statement-breakpoint
ALTER TABLE "access_control_log" ADD CONSTRAINT "access_control_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_control_log" ADD CONSTRAINT "access_control_log_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_sync_task" ADD CONSTRAINT "biometric_sync_task_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "biometric_sync_task" ADD CONSTRAINT "biometric_sync_task_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_coach_member_id_gym_member_id_fk" FOREIGN KEY ("coach_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_assignment" ADD CONSTRAINT "coach_assignment_client_member_id_gym_member_id_fk" FOREIGN KEY ("client_member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_profile" ADD CONSTRAINT "coach_profile_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block" ADD CONSTRAINT "content_block_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_block" ADD CONSTRAINT "content_block_page_id_content_page_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."content_page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_page" ADD CONSTRAINT "content_page_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise" ADD CONSTRAINT "exercise_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_class" ADD CONSTRAINT "gym_class_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_member" ADD CONSTRAINT "gym_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_member" ADD CONSTRAINT "gym_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_setting" ADD CONSTRAINT "gym_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plan" ADD CONSTRAINT "membership_plan_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription" ADD CONSTRAINT "platform_subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription" ADD CONSTRAINT "platform_subscription_plan_id_platform_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_subscription_id_platform_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."platform_subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_subscription_payment" ADD CONSTRAINT "platform_subscription_payment_plan_id_platform_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_template" ADD CONSTRAINT "routine_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_template" ADD CONSTRAINT "routine_template_trainer_profile_id_coach_profile_id_fk" FOREIGN KEY ("trainer_profile_id") REFERENCES "public"."coach_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_template_item" ADD CONSTRAINT "routine_template_item_routine_template_id_routine_template_id_fk" FOREIGN KEY ("routine_template_id") REFERENCES "public"."routine_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routine_template_item" ADD CONSTRAINT "routine_template_item_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_membership_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_member_id_gym_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."gym_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session" ADD CONSTRAINT "workout_session_routine_template_id_routine_template_id_fk" FOREIGN KEY ("routine_template_id") REFERENCES "public"."routine_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_log" ADD CONSTRAINT "workout_session_log_session_id_workout_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_session_log" ADD CONSTRAINT "workout_session_log_exercise_id_exercise_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_block_page_order_idx" ON "content_block" USING btree ("page_id","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "content_page_org_slug_idx" ON "content_page" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_org_key_idx" ON "gym_setting" USING btree ("organization_id","key");