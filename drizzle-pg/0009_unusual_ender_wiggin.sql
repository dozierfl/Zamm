CREATE TABLE "audio_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"audio_asset_id" uuid,
	"storage_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "audio_deletion_storage_key_unique" ON "audio_deletion_jobs" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "audio_deletion_pending_idx" ON "audio_deletion_jobs" USING btree ("last_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "audio_deletion_owner_idx" ON "audio_deletion_jobs" USING btree ("owner_id");
