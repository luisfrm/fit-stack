CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "ai_knowledge_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_document" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"title" text NOT NULL,
	"source" text DEFAULT 'faq' NOT NULL,
	"content" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_knowledge_chunk" ADD CONSTRAINT "ai_knowledge_chunk_document_id_ai_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."ai_knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_chunk_document" ON "ai_knowledge_chunk" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "idx_ai_chunk_embedding" ON "ai_knowledge_chunk" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_ai_knowledge_doc_org" ON "ai_knowledge_document" USING btree ("organization_id");