CREATE TYPE "public"."cms_block_type" AS ENUM('hero', 'services', 'classes_info', 'testimonials', 'gallery', 'contact', 'team_info');--> statement-breakpoint
CREATE TABLE "cms_page_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"block_type" "cms_block_type" NOT NULL,
	"data" jsonb NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cms_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "cms_page_blocks" ADD CONSTRAINT "cms_page_blocks_page_id_cms_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."cms_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_order_idx" ON "cms_page_blocks" USING btree ("page_id","display_order");